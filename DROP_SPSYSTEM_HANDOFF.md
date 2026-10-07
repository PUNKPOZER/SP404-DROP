# DROP ↔ LEARN `.spsystem` — implementation handoff

For the LEARN developer running the first real cross-app test. This is not a spec; the canonical spec is `sp-system-spec/`.
DROP side: branch `feat/spsystem-interchange`. UI: the Chop / Loop screen has an "Open in LEARN" button (saves `~/Documents/SP404 DROP/Projects/<track>.spsystem`, then `open -a "SP-404 LEARN" <file>`; the library itself is unchanged).

## Spec identity
- `SPEC_HASH`: `83f2954447d164842e9c0ade28253a0b9898997484b261a629de2275fe6d0225` (`sp-system-spec/SPEC_HASH`, source `sp404-learn @ a582be3`).
- Supported `formatVersion`: **1**. Higher → DROP reports UNSUPPORTED_VERSION and does not open it. A DROP-owned module with a newer `schemaVersion` → same; a newer LEARN-owned module → warning, preserved untouched.
- Schemas are used unmodified; DROP adapts to them.

## Layout DROP reads/writes
```
manifest.json
audio/source.<ext>              portable source only
samples/<sampleId>.wav          rendered 16-bit PCM, 48 kHz in DROP's pipeline
project/{chops,samples,pads,loops}.json
analysis/track.json             LEARN
learn/{recipe,progress,requirements}.json   LEARN
<anything else>                 preserved
```
Entry names: UTF-8, `/` separators. Module paths are taken from `manifest.modules[x].path` if present, else the defaults above.

## Ownership
- **DROP owns:** `project/*.json`, `samples/*`, `audio/source.*` (written on creation), manifest `tempo` (rules below), `modules` entries for its four modules, `extensions["x-sp404-drop"]` (id counters, grid, `renderedFrom` on samples).
- **DROP preserves, never edits:** `analysis/track.json`, `learn/*`, every unknown file and unknown JSON field. Unchanged entries are copied raw (name, mtime, method, CRC, compressed bytes). DROP only rewrites modules it modified.
- DROP never writes into `analysis/`. Accepting a candidate creates a *chop* (`type:"analysis-suggestion"`, `fromCandidateId`); the candidate in `analysis/track.json` is left as is.

## Semantics
- **UUID:** `manifest.id` is created once and never changes on Save or Save As. Only "Save a copy" generates a new one.
- **Revision:** a new project is 0 in memory; the first saved file has `revision: 1`; every successful save by any app is +1. A file without `revision` opens as 0 and gets `1` on DROP's first save. LEARN should increment on every save and write `modifiedBy/At`.
- **Source modes:** `portable` (default; `audio/source.*` inside, `source.audio` + `sha256`), `lightweight` (`source.externalSource{path,hash}`, no audio entry), `none` (samples only). Reader/writer support all three. `chop.source` / `loop.source` are written only for `portable`.
- **Tempo:** DROP writes `tempo{bpm,beatOffsetSeconds,origin,setBy,setAt}`. It will not overwrite a tempo with `origin` `user` or `imported` with a detected one; a user edit in DROP wins.
- **Chops** are independent regions (gaps/overlap/any order allowed). DROP's editor works on a contiguous partition; if a package's chops are not one, DROP shows them **read-only/limited** and keeps them unchanged — it never normalises them.
- **DROP mode → chop.type:** manual→`manual`, transient→`transient`, beat→`beat`, Equal→`manual` + extra `method:"equal"`. DROP never writes `type:"loop"`; loops live in `loops.json`.
- **Pads:** explicit `project/pads.json` (`A1` = pad 1 bottom-left; DROP's automatic layout is serialized on first save). Chain: pad → `sampleId` → sample → `sourceChopId` → chop. Saved mapping wins; only unassigned samples are auto-placed in free slots.
- **Ids:** `chop-NN`, `sample-NN`, `loop-NN`, never reused (high-water counters in the DROP extension; LEARN should not reuse them either).

## Validation behaviour
Result levels: `VALID`, `VALID_WITH_WARNINGS`, `UNSUPPORTED_VERSION`, `CORRUPTED`.
- CORRUPTED: not a ZIP, no/invalid `manifest.json`, unsafe path (absolute, drive, `\`, `.`/`..`, control chars, >240 bytes), symlink, executable/script extension or executable magic, duplicate or case/Unicode-colliding names, bad CRC/size, ratio >200:1 on entries >1 MiB, over a limit, audio content not matching its extension.
- Warnings (data kept): invalid/unparseable DROP module (kept read-only, written back byte-identical), newer LEARN module, dangling references, missing files, stale analysis (`audioSha256` ≠ `source.sha256`, compared by shorter prefix), unknown files, duplicate ids/pads. `date-time` is validated strictly.
- DROP refuses to save data that fails its own schema.

## Limits (DROP implementation limits, **not** SP SYSTEM format limits)
Package ≤ 1 GiB, entry ≤ 1 GiB, total uncompressed ≤ 2 GiB, ≤ 2000 entries, JSON ≤ 64 MiB, names ≤ 240 bytes, plus a free-memory check in the Node adapter. Exceeded → "PROJECT TOO LARGE FOR THIS VERSION OF DROP" (`E_TOO_LARGE`). Defaults: `SPPackage.DEFAULT_LIMITS`.

## Unsupported ZIP features
ZIP64, encryption, multi-disk, compression other than store/deflate → rejected with a clear unsupported-project error. DROP writes classic ZIP, UTF-8 flag (bit 11) for non-ASCII names, store for audio, deflate for JSON.

## Atomic save and conflicts
Same-directory temp (`.<name>.<rand>.tmp`) → fsync → validate (opens, same id, expected revision, copied entries identical) → copy current to `<name>.bak` (copy, not rename) → `rename(temp → file)` → fsync dir. The project path is never missing; any failure leaves the original untouched. Advisory lock `<name>.lock` (stale after 10 min or dead pid). Windows: same rename with retries on EPERM/EBUSY.
**Conflict:** before saving, DROP re-reads the file; if revision, project id, or central-directory fingerprint differ from what it opened, it returns `{ok:false, conflict:true, reason, disk, base}` and writes nothing. No automatic merge. LEARN should do the same check.

## Unknown-entry preservation
Unknown files, unknown fields in manifest and in DROP's own JSON, and all LEARN-owned files survive a DROP save. Unsafe entries (see CORRUPTED list) are rejected, not preserved. Unknown but safe files give `W_UNKNOWN_FILE` (warning). Only `__proto__`/`constructor`/`prototype` keys are dropped, from files DROP rewrites, with `W_PROTO_KEY_DROPPED`.

## Fixtures (`web/test/fixtures/spsystem/`)
- `drop-created.spsystem` — as DROP writes it: revision 1, 3 chops, 3 samples, explicit pads A1–A3, portable source.
- `after-learn-and-drop.spsystem` — same project after simulated LEARN (analysis, recipe, progress, requirements, `x-future/notes.bin`, `x-learn-note` in manifest) and a DROP edit of pad A4; revision 3. Project id `6f1c2b9e-3a44-4d0a-9b1e-2c7d5a8f0e11`.

## Expected round trip (the cross-app test)
1. DROP creates → LEARN opens `drop-created.spsystem`: VALID.
2. LEARN adds `analysis/track.json`, `learn/*`, bumps revision (1→2), preserves everything else raw.
3. DROP opens it: VALID_WITH_WARNINGS (unknown file), sets pad A4 → `sample-03`, saves: revision 3.
4. LEARN reopens and must see: same `manifest.id`; revision 3; `modifiedBy: sp404-drop`; pad A4 = `sample-03`; its own files and unknown entries byte-identical; samples and `audio/source.wav` CRCs unchanged; no errors.
Reference implementation of step 2 (what LEARN must do): `simulateLearn` in `web/test/spsystem/helpers.js`.

## Commands
```bash
npm test                      # 100 tests incl. spec examples, security, atomic save, round trip
node --test web/test/spsystem/roundtrip.test.js
node scripts/sync-spec.js --check     # SPEC_HASH of the vendored spec
node scripts/gen-schemas.js --check   # web/sp-schemas.js matches the snapshot
npm run build-fixtures                # regenerate the two fixtures
```
API entry points: `web/sp-package.js` (`open`, `assemble`), `web/sp-project.js` (`create`, `fromOpen`, `prepareSave`), `mac/app/spsystem-fs.js` (`open`, `saveFile`, `recover`, `extractToDir`). Known spec findings: `SP_SYSTEM_SCHEMA_ISSUES.md` (S1–S24, 0 blockers).
