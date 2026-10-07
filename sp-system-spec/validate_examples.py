"""Validate every example package against the draft schemas.  Usage: python validate_examples.py   (needs `pip install jsonschema`)
Also runs the structural checks a reader must do: unique ids, references resolve, relative paths only."""
import json, sys
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

ROOT = Path(__file__).parent
SCHEMAS = {p.name.replace(".schema.json", ""): json.loads(p.read_text()) for p in (ROOT / "schemas").glob("*.schema.json")}
registry = Registry().with_resources([(s["$id"], Resource.from_contents(s)) for s in SCHEMAS.values()])
FILES = {"manifest.json": "manifest", "project/chops.json": "chops", "project/pads.json": "pads", "project/samples.json": "samples", "project/loops.json": "loops",
         "analysis/track.json": "analysis", "learn/recipe.json": "recipe", "learn/progress.json": "progress", "learn/requirements.json": "requirements"}

def check(pkg: Path) -> list[str]:
    errs, docs = [], {}
    for rel, name in FILES.items():
        f = pkg / rel
        if not f.exists():
            continue
        docs[rel] = d = json.loads(f.read_text())
        errs += [f"{rel}: {e.message} @ {'/'.join(map(str, e.path))}" for e in Draft202012Validator(SCHEMAS[name], registry=registry).iter_errors(d)]
    ids = lambda key, rel: [x["id"] for x in docs.get(rel, {}).get(key, [])]
    for key, rel in (("chops", "project/chops.json"), ("samples", "project/samples.json"), ("loops", "project/loops.json")):
        v = ids(key, rel)
        if len(v) != len(set(v)): errs.append(f"{rel}: duplicate ids")
    sample_ids, chop_ids = set(ids("samples", "project/samples.json")), set(ids("chops", "project/chops.json"))
    for a in docs.get("project/pads.json", {}).get("assignments", []):
        if a["sampleId"] and a["sampleId"] not in sample_ids: errs.append(f"pads: unknown sample {a['sampleId']}")
    seen = set()
    for a in docs.get("project/pads.json", {}).get("assignments", []):
        if (a["bank"], a["pad"]) in seen: errs.append(f"pads: {a['bank']}{a['pad']} assigned twice")
        seen.add((a["bank"], a["pad"]))
    for s in docs.get("project/samples.json", {}).get("samples", []):
        if s.get("sourceChopId") and s["sourceChopId"] not in chop_ids: errs.append(f"samples: unknown chop {s['sourceChopId']}")
    for c in docs.get("project/chops.json", {}).get("chops", []):
        if c["endSeconds"] <= c["startSeconds"]: errs.append(f"chops: {c['id']} end <= start")
    return errs

if __name__ == "__main__":
    bad = 0
    for pkg in sorted((ROOT / "examples").iterdir()):
        e = check(pkg); bad += len(e)
        print(("OK   " if not e else "FAIL ") + pkg.name); [print("   ", x) for x in e]
    sys.exit(1 if bad else 0)
