# SP SYSTEM canonical schema — findings from DROP Phase 1a

Spec snapshot: `sp-system-spec/` (see `SPEC_VERSION`, `SPEC_HASH`). **No schema was changed.** DROP adapts to the schemas;
every item below is a proposal for a *future* revision, and each is rated by what it means for DROP Phase 1a.

Severity: **BLOCKER** = Phase 1a cannot be built correctly without a schema change · **IMPORTANT** = works today only through a
workaround/convention that other apps must also follow · **MINOR** = ambiguity or polish · **FUTURE** = needed by a later phase.

**Result: 0 BLOCKERS.** 6 IMPORTANT, 11 MINOR, 7 FUTURE. Phase 1a is fully implemented with the workarounds listed.

| # | Title | Severity | Schema |
|---|---|---|---|
| S1 | No chop type for "equal" splitting | IMPORTANT | chops |
| S2 | Chops are free regions, DROP edits a partition | IMPORTANT | chops |
| S3 | Whole-track slice | MINOR | chops |
| S4 | Pad → sample only (no pad → chop) | FUTURE | pads |
| S5 | `chop.type` "loop"/"beat" vs `loops.json` | IMPORTANT | chops, loops |
| S6 | `chop.source` meaningless without a portable source | MINOR | chops, loops |
| S7 | Loops cannot point back at a candidate | FUTURE | loops, analysis |
| S8 | Spec prose vs schema `required` for loops | MINOR | loops |
| S9 | `manifest.source` has no per-mode conditionals | MINOR | manifest |
| S10 | `sha256` pattern accepts 32–64 hex chars | MINOR | common |
| S11 | `beatOffsetSeconds` meaning (first beat vs downbeat) | IMPORTANT | manifest, analysis |
| S12 | `revision` is optional | IMPORTANT | manifest |
| S13 | `relPath` weaker than the prose security rules | MINOR | common |
| S14 | Sample has no link to the chop *range* it was rendered from | IMPORTANT | samples |
| S15 | requirements → sample category mapping is prose-only | FUTURE | requirements, samples |
| S16 | No size/entry caps in the schema | MINOR | manifest |
| S17 | Mixed time formats (seconds vs epoch ms vs ISO) | MINOR | progress, common |
| S18 | `bitDepth: 32` does not say int vs float | MINOR | samples |
| S19 | Spec's `.bak` order contains a "path missing" window | IMPORTANT | spec §Atomic save |
| S20 | `__proto__` etc. "dropped" vs "preserve everything" | MINOR | spec §Security |
| S21 | Schema hygiene: `extensions`, `anyOf`, `format`, typos | MINOR | manifest, loops |
| S22 | Relative `$id` / `$ref` resolution | FUTURE | all |
| S23 | Id high-water-mark convention is not specified | FUTURE | all |
| S24 | *(new)* Allow-list of directories vs "preserve unknown entries" | MINOR | spec §Package layout |

Each entry: **Scenario** (what happens in practice) · **1a** (can Phase 1a work around it, and how) · **Proposal** (future schema change) · **Compat** (backward compatibility of the proposal).

---

## S1 — No chop type for "equal" splitting · IMPORTANT · `chops.schema.json`
- **Scenario:** DROP's Equal mode (N equal slices) has no value in `chop.type` (`manual|transient|beat|loop|analysis-suggestion`).
- **1a:** yes. Stored as `type:"manual"` plus extra property `method:"equal"` (additional properties are allowed in v1). The reader never depends on `method`.
- **Proposal:** add `"method"` (free string, documented values `equal|grid|…`) as a declared optional property, or add `"equal"` to the enum.
- **Compat:** additive; v1 readers already ignore `method`. Adding an enum value would make old validators reject new files — prefer the `method` property.

## S2 — Chops are free regions, DROP edits a partition · IMPORTANT · `chops.schema.json`
- **Scenario:** `chops[]` allows gaps, overlap, nesting, any order, any length; DROP's chop editor works with markers = a contiguous partition of the track. A LEARN-accepted candidate set (e.g. 3 loose regions) is not a partition.
- **1a:** yes. Chops are the canonical model. Imported sets that are not a partition → **LIMITED EDITING** (`Project.isLimited`, `syncChopsFromMarkers` returns `E_LIMITED_EDITING`); the data is displayed, kept and saved byte-faithfully, never normalised.
- **Proposal:** none for the schema; document in the spec that chops are regions and apps may offer limited editing. Optionally an informational `partition: true` flag.
- **Compat:** none needed.

## S3 — Whole-track slice · MINOR · `chops.schema.json`
- **Scenario:** with no markers DROP has one segment = the whole track. It is saved as one chop (0 … duration), which looks like a user "confirmed" chop although the user chopped nothing.
- **1a:** yes (saved as a chop, `type:"manual"`). A project that only has this one chop is indistinguishable from a user choice.
- **Proposal:** allow an empty `chops[]` to mean "uncut" and let apps skip the implicit whole-track slice, or define a `type:"whole"`.
- **Compat:** additive.

## S4 — Pad → sample only · FUTURE · `pads.schema.json`
- **Scenario:** a pad points to `sampleId`; there is no `chopId`. Chain is PAD → sampleId → sample → `sourceChopId` → chop.
- **1a:** yes — kept exactly like that; DROP never writes a pad→chop link and always renders a sample for a padded chop.
- **Proposal:** optional `chopId` for apps that assign unrendered chops.
- **Compat:** additive.

## S5 — `chop.type` "loop"/"beat" vs `loops.json` · IMPORTANT · `chops.schema.json`, `loops.schema.json`
- **Scenario:** two ways to say "loop": `chop.type:"loop"` and an entry in `loops.json`. `chop.type` is documented as origin/method (beat/transient/manual) but `loop` is a behaviour. DROP's beat-aligned loop proposals have a bar count; chops have none.
- **1a:** yes. DROP writes `chop.type` = origin (`manual|transient|beat`) and **never `"loop"`**; `loops.json` carries explicit loop regions. A foreign `type:"loop"` chop is preserved and not treated as a `loops.json` entry.
- **Proposal:** deprecate `type:"loop"` (keep readable); say `loops.json` is the only place loop behaviour lives.
- **Compat:** only documentation; old files stay valid.

## S6 — `chop.source` meaningless without a portable source · MINOR · `chops`, `loops`
- **Scenario:** `source` is a package-relative path; for `lightweight`/`none` projects there is no such file.
- **1a:** yes — omitted unless `manifest.source.mode == "portable"`.
- **Proposal:** document that `source` is optional and only valid for portable; `sourceSha256` identifies the audio otherwise.
- **Compat:** none.

## S7 — Loops cannot point back at a candidate · FUTURE · `loops.schema.json`
- **Scenario:** a `chop` has `fromCandidateId`; a loop accepted from `loopCandidates` cannot say which one.
- **1a:** yes. DROP invents no link: candidate ids/data are preserved as they are; `acceptCandidate` works for chop candidates only.
- **Proposal:** add `fromCandidateId` to loops.
- **Compat:** additive.

## S8 — Spec prose vs schema `required` for loops · MINOR · `loops.schema.json`
- **Scenario:** prose describes loops as having `bars`/`bpm`; the schema only requires `id`, `startSeconds`, `endSeconds`.
- **1a:** yes — DROP writes `bars`/`bpm` when known, accepts files without.
- **Proposal:** make prose say "optional". **Compat:** none.

## S9 — `manifest.source` has no per-mode conditionals · MINOR · `manifest.schema.json`
- **Scenario:** `mode:"portable"` without `audio`, or `lightweight` without `externalSource`, validates.
- **1a:** yes — validator is schema-only; the reader adds semantic warnings (`W_MISSING_FILE`, `W_SOURCE_MOVED`).
- **Proposal:** `if/then` per mode (2020-12). **Compat:** tightens validation: existing malformed files would become invalid — ship as warning first.

## S10 — `sha256` pattern accepts 32–64 hex chars · MINOR · `common.schema.json`
- **Scenario:** 32 chars is LEARN's truncated cache key; DROP writes 64. Comparisons must use the shorter prefix.
- **1a:** yes — DROP writes 64, compares by shorter prefix (stale-analysis check).
- **Proposal:** name the 32-char form (`sha256-128`) or add `hashAlgo`. **Compat:** additive.

## S11 — `beatOffsetSeconds` meaning · IMPORTANT · `manifest`, `analysis`
- **Scenario:** DROP's grid `offset` is where beat 1 of the *grid* sits; LEARN's may mean first detected beat or first downbeat. A bar-based loop proposal differs by up to 3 beats.
- **1a:** partly — DROP writes its own grid offset to `tempo.beatOffsetSeconds` with `origin`/`setBy`, and never overwrites a `user`/`imported` tempo with a detected one.
- **Proposal:** define as "time of a downbeat (beat 1 of a bar)" and add `beatsPerBar` pairing (already in `meter`). **Compat:** semantic clarification only.

## S12 — `revision` is optional · IMPORTANT · `manifest.schema.json`
- **Scenario:** external tools omit it, so conflict detection cannot rely on it.
- **1a:** yes. Every package DROP writes has `revision` (in memory 0, **first save writes 1**, then +1 per successful save). Packages without it open as revision 0 and are normalised on the first DROP save. Conflict detection additionally compares a central-directory fingerprint.
- **Interpretation to confirm:** "initial 0" is read as the in-memory baseline; the first file on disk carries 1 (matches spec §23 sequence 1→4).
- **Proposal:** keep optional in v1; require in formatVersion 2. **Compat:** version-gated.

## S13 — `relPath` weaker than the prose · MINOR · `common.schema.json`
- **Scenario:** the pattern forbids `..`, absolute, drive, backslash; prose §21 adds case-collision, NFC, symlink, entry cap, executable types.
- **1a:** yes — the reader enforces the prose rules on top of the schema (`E_CASE_COLLISION`, `E_SYMLINK`, `E_FORBIDDEN_TYPE`, …).
- **Proposal:** none for the schema; move the rules to a normative "security profile". **Compat:** none.

## S14 — Sample has no link to the chop range it was rendered from · IMPORTANT · `samples.schema.json`
- **Scenario:** `sourceChopId` links sample→chop, but if the chop's start/end later changes the sample file is silently out of date; DROP cannot know whether to re-render.
- **1a:** yes. DROP records `x-sp404-drop.renderedFrom {startSeconds,endSeconds[,key]}` on the sample (additional property) and re-renders only when it differs or the file is missing.
- **Proposal:** declare `renderedFrom {startSeconds,endSeconds,sourceSha256}` on samples. **Compat:** additive.

## S15 — requirements → category mapping is prose-only · FUTURE · `requirements`, `samples`
- **Scenario:** `needs[].type` uses `drum-chop|vocal-chop|…`, `sample.category` uses `drum|vocal|…`; the mapping lives only in prose.
- **1a:** n/a (DROP does not show requirement progress yet). **Proposal:** ship the mapping table as `$defs`. **Compat:** additive.

## S16 — No size/entry caps in the schema · MINOR · `manifest` / spec
- **Scenario:** the schema cannot express limits; DROP needs them to stay safe.
- **1a:** yes — implementation limits, separate from the spec: package ≤ 1 GiB, entry ≤ 1 GiB, total ≤ 2 GiB uncompressed, ≤ 2000 entries, JSON ≤ 64 MiB, names ≤ 240 bytes, ratio > 200:1 above 1 MiB rejected, plus an adapter memory heuristic (an entry larger than ~60 % of free RAM is refused before reading). Over a limit → `E_TOO_LARGE`, message **"PROJECT TOO LARGE FOR THIS VERSION OF DROP"**, no crash. Real limits live in `SPPackage.DEFAULT_LIMITS`.
- **Proposal:** a recommended-minimum-support table in the spec (readers must support ≥ N). **Compat:** none.

## S17 — Mixed time formats · MINOR · `progress`, `common`
- **Scenario:** seconds (floats), epoch milliseconds (`progress.lessonsDone`), ISO strings.
- **1a:** yes — DROP never reads progress. **Proposal:** name units in keys. **Compat:** additive.

## S18 — `bitDepth: 32` int vs float · MINOR · `samples.schema.json`
- **Scenario:** 32 is both PCM32 and IEEE float.
- **1a:** yes — DROP writes 16-bit PCM only; `wavInfo` reports `float` separately but the schema field is the bit count.
- **Proposal:** optional `sampleFormat: "pcm"|"float"`. **Compat:** additive.

## S19 — Spec's `.bak` order has a "path missing" window · IMPORTANT · spec §Atomic save
- **Scenario:** "rename original → `.bak`, then rename temp → original" leaves no file at the canonical path between the two steps (crash ⇒ project "missing").
- **1a:** yes (and required by D9). DROP **copies** original → `.bak.tmp` → `.bak`, then `rename(temp → original)`; the original is never renamed away. Strategy per platform is documented in `mac/app/spsystem-fs.js`. Tested with failure injection at every step plus a poller proving the path is never missing.
- **Proposal:** change the spec wording to this order. **Compat:** none (internal to writers).

## S20 — `__proto__`/`constructor`/`prototype` "dropped" vs "preserve everything" · MINOR · spec §Security
- **Scenario:** the spec says to drop those keys; a preserve-everything policy says never lose data. `JSON.parse` does not pollute prototypes, only unsafe merges do.
- **1a:** yes — keys are removed **with a warning** (`W_PROTO_KEY_DROPPED`) only from files DROP rewrites (manifest, DROP modules); LEARN-owned and unknown files are copied raw and never merged.
- **Proposal:** replace "drop" by "never merge untrusted JSON into objects". **Compat:** none.

## S21 — Schema hygiene · MINOR · `manifest`, `loops`
- `manifest.extensions` is `type:object` with no `propertyNames` pattern (`x-…`); `loops.loopability` uses a one-branch `anyOf`; `format: date-time` is an annotation in 2020-12 unless enabled; a few typos in descriptions.
- **1a:** yes — DROP's validator treats `date-time` as an assertion (stricter), `anyOf` works. **Proposal:** `propertyNames` pattern, replace `anyOf` by `$ref`. **Compat:** `propertyNames` could reject odd existing keys — warn first.

## S22 — Relative `$id` / `$ref` resolution · FUTURE · all schemas
- **Scenario:** `$id: "sp-system/x.schema.json"` is not an absolute URI; resolvers differ.
- **1a:** yes — DROP resolves `$ref`s by file name from an embedded bundle (`web/sp-schemas.js`). **Proposal:** absolute `$id` (e.g. `https://…/sp-system/1/…`). **Compat:** none for data.

## S23 — Id high-water-mark convention · FUTURE · all
- **Scenario:** "never reused after deletion" is stated, but without a place to store the counter another app can reuse `chop-04` after DROP deleted it.
- **1a:** yes — counters in `manifest.extensions["x-sp404-drop"].ids` plus the max numeric suffix present, never lower. Other apps are not bound.
- **Proposal:** a standard `ids` high-water map in the manifest (or UUID ids). **Compat:** additive.

## S24 — *(new)* Allow-list of directories vs "preserve unknown entries" · MINOR · spec §Package layout
- **Scenario:** the layout lists known directories; the merge rules say preserve everything else. A reader cannot tell a future-compatible file from junk.
- **1a:** yes — executables/scripts are hard-rejected; everything else unknown is preserved byte-for-byte and reported as `W_UNKNOWN_FILE` (warning, never error).
- **Proposal:** reserve `x-<vendor>/` for private data and say other unknown paths are allowed-but-warned. **Compat:** none.

---

## Other deviations from the canonical spec
None in data or schemas. Implementation-level notes: DROP's reader additionally rejects ZIP64/encrypted/multi-disk archives (the spec does not need them), refuses to overwrite on conflict instead of merging (spec asks for detection only), and treats `date-time` as an assertion.
