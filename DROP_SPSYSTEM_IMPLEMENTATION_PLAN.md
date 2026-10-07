# DROP_SPSYSTEM_IMPLEMENTATION_PLAN — SP404 DROP adopts the canonical SP SYSTEM spec

**Status: plan only. No production code, no schema and no test was changed or added while writing this file.** Implementation starts only after the owner
confirms this plan (see §1 for the decisions that need an answer).

## 0. What was read, and from where

| Input | Location (read-only) |
|---|---|
| The 10 canonical schemas: `common`, `manifest`, `samples`, `chops`, `pads`, `loops`, `analysis`, `recipe`, `requirements`, `progress` | `sp404-learn/sp-system-spec/schemas/` |
| Normative text (container, versioning, merge, unknown data, validation levels, atomic save, security, workflows, round-trip test, migration, phases) | `sp404-learn/SP_SYSTEM_INTERCHANGE.md` (draft v1; referenced by the spec's own README as the normative document) |
| Examples (`drop-basic`, `learn-analysis`, `complete-project`), `migrations/README.md`, `validate_examples.py` | `sp404-learn/sp-system-spec/` (validator **not run**: `jsonschema` is not installed on this machine) |
| DROP: `PROJECT_AUDIT.md` (written before the redesign — still valid for audio/DSP, stale for UI), `web/index.html`, `web/sp-core.js`, `web/test/*`, `mac/*`, `DESIGN_SYSTEM.md` | this repo, branch `design/sp-system` @ `3b23b1d` |

Ground rules honoured by this plan: schemas are **not edited or forked**; DROP adapts to the spec; `.spsystem` is a separate *interchange* artefact —
DROP's runtime state may stay private, only the serialisation must match the schemas; LEARN-owned data is never rewritten.

---

## 1. Decisions needed from the owner (recommended answers in bold)

| # | Question | Why it matters | Recommendation |
|---|---|---|---|
| D1 | **DROP has no pad-assignment editor today** (pads are the implicit mapping *slice i → bank ⌊i/16⌋, pad i mod 16 + 1*). The round-trip scenario says "DROP changes Pad 4". | `pads.json` is an explicit list; something must edit it. | Phase 1 builds the *data layer* (`setPad(bank,pad,sampleId)`) and tests it; the UI for it is a later phase together with "SAVE SP SYSTEM PROJECT". |
| D2 | DROP's slices are a **contiguous partition** of the track (defined by markers); the spec's chops are **arbitrary regions** (LEARN suggestions can be 31.0–35.0 with gaps). | A partition editor cannot represent or edit arbitrary regions. | Make `chops[]` DROP's persistent model. Marker mode stays as a *producer* of a partition. On load: if chops form a partition → rebuild markers; otherwise load them as a read-only region list until the UI phase (documented limitation, never discarded). |
| D3 | With zero markers the "whole track" is slice 1. Is that a chop? | Decides whether an untouched track writes one chop. | **No: write chops only when ≥ 1 marker exists** (what Export All would produce as separate files). |
| D4 | `chops.type` has no value for DROP's **Equal** mode. | Provenance would be lost or mislabelled. | **Map Equal → `manual` and keep `"method":"equal"` in an extra field** (schemas allow extra fields); report finding S1 and let the spec owner decide on an `equal` value. |
| D5 | Where does the canonical spec physically live? Today only in the LEARN repo. | DROP needs the schemas at test/build time. | **Vendor a byte-identical copy into `spec/sp-system/` + a recorded hash, with `scripts/sync-spec.js --check`**; long-term: a third shared repo or submodule. |
| D6 | Default **source mode** for a DROP project. | `portable` = large file; `lightweight` needs an absolute path, which a sandboxed Electron renderer cannot see. | **`portable` by default; `none` for Convert packs; `lightweight` later** (needs a preload — see §4.4). |
| D7 | Do saved packages contain rendered `samples/*.wav`? | Pads reference `sampleId` only, so a mapping cannot exist without samples. | **Yes: "Save SP SYSTEM project" renders every chop (same 16-bit/48 kHz path as Export) into `samples/`.** |
| D8 | Chop ids must be stable, never renumbered, never reused (spec §5). | DROP's marker ids are session numbers. | Persist an id **high-water mark** in `extensions["x-sp404-drop"]` (§6.4). |
| D9 | Phase 1 scope: **no UI, no IPC, no change to `index.html`.** | Keeps the working app untouched until the format is proven. | Confirm. |

---

## 2. What the spec requires of DROP (summary)

* **DROP owns** `audio/source.*`, `samples/*`, `project/{samples,chops,pads,loops}.json`; **shares** `manifest.json`; **never rewrites** `analysis/track.json`, `learn/*` and unknown entries (copied through unchanged, spec §11/§13).
* Writes only owned entries; edits parsed JSON in place so unknown fields survive; never "serialise the whole project from the in-memory model" (§11).
* `manifest.id` (UUID v4) created once; `revision + 1` on every successful save; `modifiedAt/By/ByVersion` set; filename ≠ identity (§12, §17).
* Atomic save: re-check revision/fingerprint → write temp beside the file → validate → fsync → atomic replace, keep one `.bak` (§15).
* `.spsystem` is untrusted: path-traversal, zip-bomb, duplicate/case-colliding names, symlinks, executables, size/entry caps (§21).
* Validation levels VALID / VALID WITH WARNINGS / UNSUPPORTED VERSION / CORRUPTED; optional modules never block opening (§14).
* LEARN candidates are **SUGGESTED**, never chops until accepted; acceptance creates a chop with `fromCandidateId` (§5, §12, §22.2) — **UI deferred**, but the reader must already expose candidates.

---

## 3. Current DROP state → canonical schema mapping

Terminology: *Chop* module = `Chop` closure in `web/index.html`; *Convert* module = `Convert` closure.

### 3.1 `manifest.json`
| Schema field | DROP today | Plan |
|---|---|---|
| `format`, `formatVersion` | — | constants `"sp-system"`, `1` |
| `id` | none (no projects) | `crypto.randomUUID()` once; preserved on every later save; "Save a copy" → new id + `extensions.derivedFrom` |
| `createdBy/Version/At` | — | `sp404-drop`, app version (`mac/app/package.json` = 1.1.0; also hard-coded as `v1.1.0` in `index.html` — **single source of the version is needed**), now |
| `modifiedAt/By/ByVersion`, `revision` | — | written on every save; `revision` starts at 1 on creation (schema leaves it optional — finding S12) |
| `title` | `state.fileName` | cleaned track name; last-writer-wins |
| `source.title`, `originalFilename` | `state.fileName` | direct |
| `source.durationSeconds` | `audioBuffer.duration` | direct |
| `source.sampleRate` | `audioBuffer.sampleRate` is the **AudioContext rate, not the file's** (audit finding) | WAV: read from the header; other formats: **omit** rather than write a wrong value |
| `source.channels` | `audioBuffer.numberOfChannels` (preserved by decode) | direct |
| `source.mode/audio/sha256` | File object is discarded after decode | keep the original `File`/bytes for portable mode; SHA-256 via WebCrypto (browser) / Node `crypto` (Electron main, tests); store **full 64 hex** |
| `source.externalSource` | — | lightweight mode only, later (needs absolute path; §4.4) |
| `tempo.bpm` | `state.grid.bpm` (0 = unset) | write only when > 0 |
| `tempo.beatOffsetSeconds` | `state.grid.offset` — from `detectTempo` this is a **beat phase**, not necessarily a bar's first beat; after "Beat 1 = playhead" it is the user's downbeat | write it; add `extensions["x-sp404-drop"].beatOffsetIsDownbeat` (false when it came from detection) — finding S11 |
| `tempo.origin` | `grid.detected` boolean only | add `grid.origin: 'detected' \| 'user'` in runtime state: `Detect` → detected; BPM field, ÷2, ×2, "Beat 1 = playhead" → user (`setBy: sp404-drop`, `setAt`) |
| `tempo.confidence` | not produced | `null` |
| `meter.beatsPerBar` | fixed 4 | 4 |
| `modules` | — | DROP updates only its own four entries (`path`, `schemaVersion`, `owner: sp404-drop`); keeps all others |
| `extensions["x-sp404-drop"]` | — | DROP-private: id high-water mark, retired ids, per-chop `method`, last export preset, UI hints. Only DROP touches this key |

### 3.2 `project/chops.json`
| Schema field | DROP today | Plan |
|---|---|---|
| `chops[]` | `state.markers[{id:int,time}]` → `segments()` (derived `{start,end,index}`); slice identity = index | each slice → one chop (D3). Time in **seconds on the source timeline** — already DROP's unit. Zero-crossing-snapped times are stored as they are |
| `id` (stable string) | numeric marker ids, renumbered by index in the UI | `chop-NN` ids assigned via the stable-id allocator (§6.4): a slice keeps the id of its *left boundary*; splitting keeps the left id and mints a new right id; merging keeps the left id and **retires** the right id forever |
| `name` | none (display `sample 03`) | `<track>_NN` (the export base name) — user rename is a later UI feature |
| `type` | modes Transient / Beats / Equal / Manual | transient→`transient`, beats→`beat`, manual→`manual`, **equal→`manual` + `method:"equal"`** (D4). Mixed edits (e.g. auto-chop then a hand-placed marker) → the type of the producer that created that boundary |
| `source`, `sourceSha256` | — | `audio/source.<ext>` (portable) / omitted (none, lightweight — finding S6) |
| `fromCandidateId` | — | set when a LEARN candidate is accepted (UI later) |
| `confidence` | not produced (transient has strength internally) | `null` |
| `createdBy/At` | — | `sp404-drop`, now |

### 3.3 `project/samples.json` (+ `samples/*.wav`)
| Schema field | DROP today | Plan |
|---|---|---|
| a sample | Export renders WAV on demand (`renderSegmentTo48k` + `encodeWav16`), nothing is kept | "Save project" renders every chop into `samples/<SPCore.sampleFileName>` — **same code path as Export**, so bytes are identical to an Export |
| `id` | — | `sample-NN` (stable allocator) |
| `file`, `name` | `SPCore.sampleFileName(...)` | `samples/My_Loop_01.wav` (name cleaned, ≤ 24 chars; collisions get a suffix) |
| `sourceChopId` | — | the chop id |
| `durationSeconds`, `sampleRate`, `bitDepth`, `channels` | computed during render | 48000 / 16 / source channel count |
| `category` | none — classification is optional | omitted (= `unknown`) |
| `sha256` | — | SHA-256 of the WAV bytes (advisory, enables stale detection) |
| staleness of a sample vs its chop | not modelled | add `x-sp404-drop: { renderedFrom: {startSeconds,endSeconds,sourceSha256} }` so a moved chop is detected (finding S14) |
| **Convert** results | `{status, bytes, outPath, note}` in memory; no duration kept | a Convert batch can become a *samples-only pack* (`source.mode = "none"`): duration from the WAV header, sha256 of the bytes |

### 3.4 `project/pads.json`
| Schema field | DROP today | Plan |
|---|---|---|
| `assignments[]` `{bank,pad,sampleId}` | implicit: `SPCore.padOf(i)` → bank letter A… + pad 1–16, **numbering identical to the spec** (1 = bottom-left, 16 = top-right; `SPCore.PAD_ROWS`) | persist an explicit list. Default = the current implicit mapping (slice *i* → its sample). `setPad()` data-layer API (D1). Empty pad: omitted or `sampleId:null`. A pad can reference only an existing sample (dangling id ⇒ warning, empty pad) |
| `label` | — | optional |

### 3.5 `project/loops.json`
| Schema field | DROP today | Plan |
|---|---|---|
| loops | **no persistent loop concept**: `Loop` button auditions the selected slice; Beats mode *Make Loops* creates **slices** at beat/bar boundaries | for slices created by Make Loops write a loop record as well: `{id, source, startSeconds, endSeconds, bars = grid.div / beatsPerBar, bpm = grid.bpm}` and the matching chop (`type:"beat"`) — **overlap of `chops.type: loop|beat` and `loops.json` is finding S5** |
| `loopability` | — | omitted |

### 3.6 Everything LEARN-owned
`analysis/track.json`, `learn/recipe.json`, `learn/progress.json`, `learn/requirements.json` and every unknown entry: **opaque**, copied through byte-for-byte (§7). DROP only *reads* `analysis/track.json → chopCandidates/loopCandidates` and `learn/requirements.json → needs` (read-only views for the later UI).

### 3.7 DROP runtime state that stays private
`state.view/viewCfg` (zoom, gain, follow), `selected`, `bank`, `bankPinned`, Session list, Home pending files, knob values, language: **not serialised** into schema files (UI-only). Anything worth restoring (mode, sensitivity, equal parts, snap) goes in `extensions["x-sp404-drop"]`, never in `project/*.json`.

---

## 4. Architecture

### 4.1 Layering (all new code dependency-free, UMD like `sp-core.js`, runnable in the browser, Electron and Node tests)

```
 index.html (UI)                                  — Phase 1: untouched
        │  (later) SPProject.fromChopState / applyToChopState
 ┌──────▼─────────────────────────────────────────────────────────────┐
 │ sp-project.js   PROJECT MODEL: state↔schema mapping, stable ids,   │
 │                 owned-file edits, tempo rules, candidates view     │
 ├────────────────────────────────────────────────────────────────────┤
 │ sp-package.js   PACKAGE: ZIP reader/writer, security guards,       │
 │                 copy-through of raw entries, validation levels,    │
 │                 save planning (merge/rebase), error codes          │
 ├────────────────────────────────────────────────────────────────────┤
 │ sp-validate.js  minimal JSON-Schema (2020-12 subset) validator     │
 │                 + semantic rules                                   │
 ├────────────────────────────────────────────────────────────────────┤
 │ spec/sp-system/schemas/*.json   vendored, byte-identical, hashed   │
 └──────┬─────────────────────────────────────────────────────────────┘
        │ injected capabilities: inflateRaw/deflateRaw, sha256, randomUUID, now(), fs
 ┌──────▼────────────┐   ┌─────────────────────────────┐
 │ Node (tests, and  │   │ Browser: DecompressionStream │
 │ Electron MAIN):   │   │ ('deflate-raw'), WebCrypto,  │
 │ zlib, crypto, fs  │   │ download-only save           │
 └───────────────────┘   └─────────────────────────────┘
```
Rule: **the core is pure** (bytes in, bytes/results out). File-system access lives in one small adapter (`mac/app/spsystem-fs.js`, Node only) so the atomic-save logic is testable without Electron.

### 4.2 Files

**New**
| File | Purpose |
|---|---|
| `web/sp-package.js` | ZIP reader + writer (stored/deflate, UTF-8 flag, DOS time), raw copy-through entries, §21 guards, validation levels, `planSave()` |
| `web/sp-project.js` | project model, mapping to/from schema JSON, stable-id allocator, tempo/origin rules, chop↔marker conversion, candidate/requirement read views |
| `web/sp-validate.js` | JSON-Schema subset validator (`$ref`/`$defs`, `type`, `enum`, `const`, `pattern`, `minimum/maximum/exclusiveMinimum`, `min/maxLength`, `required`, `properties`, `items`, `additionalProperties`, `allOf`, `anyOf`, `date-time` format) + semantic rules (§9) |
| `spec/sp-system/schemas/*.json` + `spec/sp-system/SPEC_SOURCE.md` | **verbatim** vendored schemas; SPEC_SOURCE records the source repo, commit/date and SHA-256 of each file |
| `scripts/sync-spec.js` | copy from a given path and rewrite SPEC_SOURCE; `--check` fails if a vendored file differs from the recorded hash (nobody edits them in DROP) |
| `mac/app/spsystem-fs.js` | Node-only adapter: `readPackage(path)`, `savePackage(path, plan)` = temp-write → validate → fsync → atomic replace → `.bak`, recovery scan, advisory lock. **Not wired to the renderer in Phase 1** |
| `web/test/spsystem/*.test.js`, `web/test/spsystem/fixtures/*` | tests (§13); fixtures are generated by a script from synthetic audio — no copyrighted material |
| `scripts/build-fixtures.js` | builds the §23 round-trip and negative fixtures deterministically |

**Changed (Phase 1)**
`package.json` (test script), `mac/build.sh` (copy the new `web/*.js` and `spec/` next to `main.js` — they are needed only once wired), `.gitignore`, docs (`README.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md` — no new third-party code), `DESIGN_SYSTEM.md` untouched.
**Not changed in Phase 1:** `web/index.html`, `web/sp-core.js` (MiniZip stays as is for Convert/Export), `mac/app/main.js`, the DSP, UI, i18n.

**Changed later (Phase 2+, UI gate):** `index.html` (Save/Open actions, pad editor, SUGGESTED rendering, "Open in LEARN"), `main.js` + a new preload (file dialogs/IPC), packaging (`CFBundleDocumentTypes`/UTI for `.spsystem`, URL scheme).

### 4.3 Why a new ZIP module instead of extending `MiniZip`
`MiniZip` (in `sp-core.js`) is store-only, writes general-purpose flag `0` (UTF-8 names are written but **not flagged**; spec §2 requires bit 11), writes DOS time `0` (entries show as `00-00-1980`), and cannot copy a raw entry. Exports must stay byte-stable, so `MiniZip` is left alone; `sp-package.js` has its own writer (flag 0x0800, real DOS time, optional deflate, raw pass-through). A follow-up may switch Export to the new writer after tests prove equivalence.

### 4.4 Runtime constraints that shape the design
* **Browser:** no in-place write, no rename → *Save* = produce bytes and **download** a new `.spsystem`; no `.bak`/atomicity guarantees (spec §15 acknowledges). `DecompressionStream('deflate-raw')` is available in Chromium/Electron (Safari/Firefox support is recent — feature-detect, otherwise report "cannot open compressed packages in this browser").
* **Electron:** the renderer is sandboxed with no preload and no IPC today (a deliberate security posture). Atomic save and "lightweight source" (absolute path via `webUtils.getPathForFile`) need a **minimal preload + main-process IPC** with dialog-granted paths only (the renderer can never name an arbitrary path). That is a security-relevant change → Phase 2, with its own review.
* **Memory:** a decoded source and a held `ArrayBuffer` limit practical sizes (~2 GiB per buffer). DROP enforces lower practical caps than the spec's 4 GiB and reports "too large for DROP" instead of crashing (finding S16).
* **Hashing:** WebCrypto `digest` is not incremental → SHA-256 of a huge source in the renderer holds it in memory; in Electron hash in the main process with streaming `crypto`.

---

## 5. Reader architecture (`SPPackage.read(bytes, opts)`)

1. **Container parse** (never trusting offsets): locate the End-of-Central-Directory (scan back ≤ 64 KiB + comment), reject ZIP64 markers/multi-disk/encryption (flag bit 0, 6), read the central directory, cross-check each local header (name, sizes, method), support methods 0 and 8 only, data descriptors (flag bit 3) resolved from the central directory.
2. **Entry vetting** before any decompression (§8 Security): names, counts, sizes, ratios, symlinks, extensions.
3. **Entry model:** `{ name, rawBytes (compressed, as stored), method, crc32, compressedSize, uncompressedSize, dosTime, dosDate, flags, versionMadeBy, externalAttrs, extra }` + lazy `data()` (bounded inflate: output may never exceed the declared size; CRC verified).
4. **Manifest first:** parse `manifest.json` (size/depth caps) and validate against `manifest.schema.json`; missing/invalid ⇒ **CORRUPTED**.
5. **Modules:** for each known path, parse + validate against its schema. Known-but-invalid *optional* module ⇒ warning, module kept opaque (raw bytes preserved). Newer `schemaVersion`/`analysisVersion` than supported ⇒ opaque + warning; a DROP-required module (`chops/samples/pads/loops`) newer than supported ⇒ **UNSUPPORTED VERSION** (read-only, never rewritten).
6. **Reference checks** (semantic): every `source.audio`, `samples[].file`, `chops[].source` resolves to a present entry; pad→sample ids exist; chop ids / sample ids / loop ids unique; `(bank,pad)` unique; `endSeconds > startSeconds`; content sniff (`RIFF…WAVE`, FLAC, AIFF) for audio entries.
7. **Result:** `{ level, issues[] (code, severity, path, message), manifest, modules{known|opaque}, entries[], fingerprint:{revision, manifestSha256, size, mtime?}, candidates[], requirements }`. The reader never throws for "optional module problems"; only CORRUPTED/limit violations refuse.

## 6. Writer architecture (`SPPackage.write(plan)`)

### 6.1 Plan, not "serialise the model"
`planSave(loaded, edits)` produces an ordered entry list:
* **Owned entries** (`project/samples|chops|pads|loops.json`, `samples/*`, `audio/source.*`, and DROP's own manifest fields) are regenerated from the edited parsed JSON.
* **Every other entry is copied through as a raw entry** (same name bytes, method, CRC, DOS time, flags except bit 3, extra field, external attrs; compressed bytes copied verbatim) → decompressed content is byte-identical by construction.
* `manifest.json` is *edited in place* on the parsed object: `revision+1`, `modifiedAt/By/ByVersion`, `source`/`tempo`/`meter` per §3.1, own `modules` entries, own `extensions["x-sp404-drop"]` key; everything else untouched.

### 6.2 JSON editing rules (unknown-field preservation)
Parse once → keep the parsed object tree → apply edits by **id** (update known fields on the existing object; add; remove) → serialise. Unknown properties on chops/samples/pads/loops/manifest survive. DROP-owned JSON is re-serialised (formatting may change, key order is kept as inserted); LEARN-owned and unknown files are **never** re-serialised.

### 6.3 Writer details
UTF-8 flag (bit 11) on all new entries; DOS time from `now()`; method `deflate` for JSON, `store` for audio; entry order: `manifest.json` first; no data descriptors; sizes/CRC known up front; classic ZIP only (a package that would need ZIP64 ⇒ error `E_TOO_LARGE`).

### 6.4 Stable ids
`SPProject` keeps an allocator: `nextChop`, `nextSample`, `nextLoop` high-water counters stored in `extensions["x-sp404-drop"].ids` plus a `retired[]` list; ids come from `^[a-z0-9][a-z0-9._-]{0,63}$`. On load, counters are raised to the max numeric suffix actually present (so a package edited elsewhere cannot cause reuse). Unit-tested for split, merge, delete, undo, reload.

### 6.5 Chop ↔ marker conversion
`chopsFromMarkers(markers, duration, methods)` / `markersFromChops(chops)`: a partition (sorted, contiguous within 1 ms, covers 0…duration) ⇒ markers; anything else ⇒ imported as **regions** (kept verbatim, shown read-only until the UI phase, preserved on save). The `Chop` closure will later expose `getProjectState()/loadProjectState()`; Phase 1 only specifies it.

## 7. Preservation strategy (what must never change)

| Data | Rule | Proof (test) |
|---|---|---|
| `analysis/track.json`, `learn/*` | not parsed for edit; raw entry copied | entry CRC/sha equal before/after |
| Unknown files (`x-future/notes.bin`, README, others) | raw copy incl. name/mtime/method | same |
| Unknown JSON fields in DROP-owned files and manifest | edited in place | deep-equal on untouched properties |
| `manifest.id`, `createdBy/At`, `format*` | immutable | assertions |
| Other apps' `modules`/`extensions` keys | untouched | deep-equal |
| A module with a newer version | opaque, not rewritten, file stays byte-identical | fixture with `schemaVersion: 9` |
| `__proto__`/`constructor`/`prototype` keys | **dropped** while parsing owned JSON (spec §21) — the only intentional alteration of unknown data; logged as a warning | test |

## 8. Atomic save, conflicts, recovery

**Node/Electron (`spsystem-fs.js`)** — spec §15 made concrete:
1. At load: record `{revision, manifestSha256, size, mtimeMs}`.
2. At save: re-read the file. If revision/hash differ ⇒ **conflict**: compute which entries changed on disk vs the loaded snapshot. If disk changed only entries DROP does not own (LEARN saved meanwhile) ⇒ **rebase automatically**: reload the disk package and re-apply DROP's edits on top. If disk changed an entry DROP also edited ⇒ **stop with `E_CONFLICT`** (the UI will ask; Phase 1 returns both versions, never overwrites).
3. Write `<name>.spsystem.tmp-<random>` **in the same directory** (same filesystem).
4. **Validate the temp file** by reading it with the same reader: level must not be worse than the original's, every previously present module still present, SHA-256 of every copied-through entry equals the original, `revision` = old + 1.
5. `fsync(tmp)`, copy the current file to `<name>.spsystem.bak.tmp` then `rename` it to `.bak` (single generation), then `rename(tmp → current)` (atomic replace). *Order chosen so the main file is never absent* (spec §15 step 5 is ambiguous here — finding S19).
6. Delete temp; best-effort advisory lock file `<name>.spsystem.lock` (exclusive-create, stale after 60 s) — advisory only; step 2 is the real protection.
**Recovery on open:** a `*.tmp-*` with the same id and higher revision that validates ⇒ offer "Recover unsaved changes" (never automatic); corrupted main + valid `.bak` ⇒ offer the backup.
**Browser:** produce bytes, trigger a download with a new name; the UI states that no in-place save/backup exists.

## 9. Validation

* **Schema layer:** `sp-validate.js` validates against the *vendored* schemas (resolved by `$id`/relative `$ref`). It implements exactly the keywords the 10 schemas use (no remote refs, no `format` beyond `date-time`). **Cross-check test:** the same fixtures are validated with a reference validator (Python `jsonschema` or Node `ajv` as a *dev-only* tool, run when available) and results must agree; the app itself stays dependency-free.
* **Semantic layer** (not expressible in the schemas — spec says so in prose): uniqueness of ids and `(bank,pad)`; `end > start`; times within `durationSeconds` (warning); referenced entries exist; `source.mode` ⇄ `audio`/`externalSource` consistency (finding S9); sample `sha256` matches bytes (when present); entry sniffing; `analysis.audioSha256` vs `source.sha256` by shorter prefix → *stale analysis* warning (never an error).
* **Levels** exactly as spec §14. **Error/warning codes** (stable strings, English + RU message keys): `E_NOT_ZIP`, `E_NO_MANIFEST`, `E_MANIFEST_INVALID`, `E_PATH_UNSAFE`, `E_DUP_NAME`, `E_CASE_COLLISION`, `E_SYMLINK`, `E_FORBIDDEN_TYPE`, `E_SNIFF_MISMATCH`, `E_TOO_MANY_ENTRIES`, `E_TOO_LARGE`, `E_RATIO`, `E_SIZE_MISMATCH`, `E_CRC`, `E_ZIP64`, `E_ENCRYPTED`, `E_CONFLICT`, `E_UNSUPPORTED_VERSION`; warnings `W_MODULE_INVALID`, `W_MODULE_NEWER`, `W_DANGLING_REF`, `W_MISSING_FILE`, `W_STALE_ANALYSIS`, `W_SOURCE_MOVED`, `W_UNKNOWN_FILE`, `W_PROTO_KEY_DROPPED`.

## 10. Security (packages are untrusted — spec §21)

Implemented in the reader *before* decompression or JSON parsing: reject `..` segments, absolute paths, drive letters, backslashes, NUL/control chars, `./` tricks, names > 240, **> 2 000 entries**, duplicate and case-folded duplicate names, symlink entries (unix mode bits in `externalAttrs`), size caps (JSON 64 MiB; audio per DROP's practical cap, ≤ 4 GiB), declared-vs-actual size, **compression ratio > ~200:1**, total-uncompressed cap, encrypted/ZIP64/multi-disk. Allow-list by role and extension; deny executable types and Mach-O/ELF/PE/shebang headers; sniff `RIFF…WAVE`/`fLaC`/`FORM…AIFF`. **Bounded inflate** (output hard-capped at the declared size → a lying header cannot expand without limit). Nothing from the archive is executed or evaluated; README shown as plain text; JSON depth/size limits, numeric clamping (e.g. `bpm` 20–400, `startSeconds ≥ 0`), string caps, prototype-pollution keys dropped. Manifest/JSON paths are only ever used as **archive lookups**, never as file-system paths; `externalSource.path` is only stat-ed/hashed on user action. In Electron the renderer never supplies a path: dialogs run in the main process.

## 11. Error handling and UX contract (for the later UI; reader/writer return structured results now)

* CORRUPTED ⇒ refuse, show the code + one-line reason, offer `.bak`/temp recovery. UNSUPPORTED VERSION ⇒ open read-only, never write. VALID WITH WARNINGS ⇒ open, one line per warning ("Analysis data uses a newer version. Samples and pad mapping can still be opened.").
* A failed save leaves the original untouched and reports the stage (`write`, `validate`, `replace`).
* **DROP never depends on LEARN:** "Save SP SYSTEM project" works without LEARN installed; "Open in LEARN" failures (not installed, not found) are explained, never fatal.
* All user-facing strings get EN/RU entries (the existing RU-coverage test will fail otherwise).

## 12. Migration considerations

* DROP has **no persisted project data today** → nothing to migrate. Existing exports (WAV/ZIP) are unaffected and unchanged.
* Reader rule from the spec: unknown higher version ⇒ preserve, don't rewrite; writer writes the lowest version that represents the data (all modules v1).
* Future migrations: pure functions on parsed JSON under `migrations/`, run in memory, persisted only on the next atomic save with `.bak` (spec §24). DROP will vendor the spec's migration fixtures when they exist.
* `.sp404learn` (LEARN-private) is not touched or read.
* App version string must come from one place before it is written into `createdByVersion/modifiedByVersion`.

## 13. Tests (Node built-in runner, no dependencies; extends `web/test`)

1. **ZIP unit tests:** read what `unzip`/Python wrote and what `sp-package` wrote (cross-tool: `unzip -t`, Python `zipfile`); UTF-8 names (Cyrillic); data descriptors; method 0/8; trailing comment; truncated/garbage input.
2. **Security fixtures (negative, each must be CORRUPTED with the right code):** zip-slip (`../x`, `a/../../x`), absolute, `C:\`, backslash, NUL, case-collision, duplicate names, symlink entry, executable extension, `.wav` that is not RIFF, > 2 000 entries, size mismatch, CRC mismatch, ratio bomb (declared small, inflates large — bounded inflate must abort), ZIP64, encrypted flag, oversized JSON, deeply nested JSON, `__proto__` key.
3. **Schema validation:** every spec example (`drop-basic`, `learn-analysis`, `complete-project`) validates; hand-made invalid variants fail with the expected paths; cross-check against the reference validator when present.
4. **Preservation:** package with LEARN files + unknown file + unknown JSON fields + `analysisVersion: 9` + `modules` entries of other apps → DROP edit → every untouched entry's decompressed bytes identical (CRC + SHA), unknown JSON fields deep-equal, other apps' `modules/extensions` intact, newer-version module byte-identical.
5. **Identity & revision:** `id` unchanged across N saves; revision strictly +1; "Save a copy" → new id + `derivedFrom`.
6. **Stable ids:** split/merge/delete/undo/reload never renumber or reuse; counters rise to the max present.
7. **Mapping:** marker state ⇄ chops (partition detection, non-partition → regions), tempo `origin` rules, equal→manual+method, loops from Make Loops, pad default mapping = `SPCore.padOf`, `setPad`.
8. **Atomic save:** inject a failure (a) after temp write, (b) after validate, (c) before rename ⇒ original byte-identical and still VALID, temp recoverable; successful save leaves exactly one `.bak`; concurrent-change detection (disk revision changed): auto-rebase when only LEARN files changed, `E_CONFLICT` when a DROP-owned file changed.
9. **§23 ROUND-TRIP (mandatory):** generated fixture, each step on the previous step's output:
   1. DROP creates a project (uuid U; synthetic source WAV; 16 samples; chops; loops; pads A1–A16; `x-sp404-drop`).
   2. *Simulated LEARN* (test helper that uses the same raw-copy rules) adds `analysis/track.json` (tempo raw + userOverride, genre, candidates), `learn/recipe.json`, `learn/progress.json`.
   3. DROP opens it, **changes pad 4**, also carries an unknown file `x-future/notes.bin` and an unknown JSON field, saves.
   4. Simulated LEARN opens again.
   **Assertions:** `manifest.id == U`; `revision` strictly increasing; pad A4 = new sample, all other pads unchanged; `analysis/track.json` and `learn/*` byte-identical to step 2; all `userOverride`/`raw` values intact; unknown file/fields intact; every `samples[].file` exists and hashes match; validation level VALID at every load.
10. **Regression of the existing app** (unchanged `index.html` ⇒ the existing 15 tests + the manual/CDP flows: Convert, all Chop modes, gestures, audition/loop, WAV/ZIP export, EN/RU, packaged `.app`).

## 14. Regression risks and mitigations

| Risk | Mitigation |
|---|---|
| Touching `index.html`/DSP breaks Convert/Chop | **Phase 1 does not touch them**; integration is a separate, reviewed phase behind the proven data layer |
| New files not shipped in the Mac build | `build.sh` copy list + a test that every `web/*.js` referenced by `index.html` exists in `mac/app` after the copy step |
| Slice ↔ chop model mismatch (D2) loses LEARN regions | non-partition chops are kept verbatim as regions and preserved on save |
| Id churn corrupts references between files | allocator + invariants + tests (§6.4, §13.6) |
| Re-serialising owned JSON changes unknown data | in-place editing on parsed trees; unknown fields deep-equal tests |
| Sample files drift from chops | `renderedFrom` + sha256 stale detection; re-render on save when stale |
| Raw copy-through mis-handles data descriptors/extra fields | tests with archives written by `zip`, Python and Java-style descriptors; always rewrite local headers from central-directory values |
| Memory/time for large sources | caps + streaming hash in main process; browser cap with clear message |
| Spec still a draft — it may change under us | vendored copy + recorded hash + `sync-spec --check`; no field renames in DROP; findings (§15) raised before code depends on them |
| Security regression from adding IPC (Phase 2) | separate review; dialog-granted paths only; no new network access |

## 15. Findings in the canonical schemas / spec (NOT changed — proposals for the owner)

Severity: **A** blocks or distorts DROP's mapping · **B** ambiguity to settle before freezing v1 · **C** minor.

| # | Sev | Finding | Proposal |
|---|---|---|---|
| S1 | A | `chops.type` has no value for DROP's **Equal** mode (`manual\|transient\|beat\|loop\|analysis-suggestion`). | add `equal`, or document "Equal ⇒ `manual`" and standardise a `method` extra field |
| S2 | A | **Chops are arbitrary regions; DROP edits a contiguous partition** (D2). The spec does not say whether chops may overlap or leave gaps. | state it explicitly (allowed) so every app handles regions |
| S3 | B | Is the implicit "whole track" slice a chop? Unspecified. | say "no chop is implied" |
| S4 | A | **Pads can only reference `sampleId`**, never a chop; a pad mapping cannot exist before samples are rendered. | acceptable if confirmed (D7); otherwise allow `chopId` |
| S5 | B | `chops.type: loop`/`beat` **and** `loops.json` both describe loops; no rule says which is canonical or whether a loop is also a chop. | define the relation (e.g. loops are chops with extra bar/bpm data, or are listed in both and linked by id) |
| S6 | B | `chops[].source`/`loops[].source` are archive `relPath`s — meaningless for `lightweight`/`none` sources. | allow `source` to be omitted/`null` and say so |
| S7 | B | **`loops.json` has no link to `loopCandidates`** (chops have `fromCandidateId`/`acceptedChopId`; loops have neither), so accepted loop candidates cannot be reconciled. | add `fromCandidateId` (loops) and `acceptedLoopId` (candidates) |
| S8 | C | Prose lists loops as `{…, bars, bpm, confidence…}` but the schema requires only `id,startSeconds,endSeconds`; `bars`/`bpm` optional. | align prose and schema |
| S9 | B | `manifest.source`: no conditional requirements (portable ⇒ `audio`(+sha256); lightweight ⇒ `externalSource`). | add `if/then` |
| S10 | B | `sha256` pattern accepts any 32–64 hex chars (e.g. 40 = SHA-1 length); prose means 32 *or* 64. | `^([0-9a-f]{32}\|[0-9a-f]{64})$` |
| S11 | B | `manifest.tempo.beatOffsetSeconds` is "a bar's first beat", but a detector gives a beat *phase*; no field says whether it is a downbeat. | optional `offsetIsDownbeat` or document that it is "a beat" |
| S12 | B | `manifest.revision` is optional in the schema, yet the conformance test needs it (1→4) and §15 depends on it. | make it required (initial 1) or define "absent = 0" |
| S13 | C | `relPath` is weaker than §21: allows `a//b`, trailing `/`, DEL/C1/bidi-override characters, names whose UTF-8 length exceeds 240 bytes; no `samples/` prefix/`.wav` rule for `samples[].file`. | tighten pattern or add semantic rules to the spec |
| S14 | B | No field links a rendered sample to the chop range it was rendered from → stale samples after a chop edit are undetectable. | recommend `renderedFrom{start,end,sourceSha256}` in an extension field (DROP will use `x-sp404-drop`) |
| S15 | B | Requirement types (`drum-chop`, `break-chop`, `vocal-chop`, `any`…) vs `sampleCategory` (`drum`, `loop`, `vocal`…): the mapping is prose-only (§22.5). | publish a machine-readable table versioned with `requirementsVersion` |
| S16 | B | Size caps (4 GiB, ZIP64 "not needed below 4 GB") are unreachable in a browser/Electron renderer (~2 GiB per buffer) and the 4 GiB limit equals the ZIP32 maximum. | add per-app practical caps and a defined "too large for this app" outcome |
| S17 | C | Mixed time formats: `progress.lessonsDone` uses epoch **ms** numbers; everything else ISO strings. | note it, or add ISO equivalents |
| S18 | C | `samples.bitDepth: 32` is ambiguous (int vs float); no `sampleFormat`. | optional `encoding` |
| S19 | B | §15 step 5 ("replace … keep the previous file as `.bak`") can be read as rename-then-rename, which leaves a window with no main file. | specify copy-to-`.bak` then atomic replace |
| S20 | C | §21 says drop `__proto__`/`constructor` keys; §13 says unknown fields are preserved. Intentional exception, but unstated. | state the exception |
| S21 | C | `manifest.extensions` and `modules` have no schema for key naming (`x-…` is only a convention); `loops.loopability` uses `anyOf` with a single branch; `format: date-time` is annotation-only unless enforced; every object allows unknown properties (typos pass). | note in the spec; DROP's validator enforces `date-time` |
| S22 | C | `$id`s are relative (`sp-system/…`) and `$ref`s are relative to them: any validator needs the schemas pre-registered by `$id`. | document the resolution rule |
| S23 | C | Chop id "never reused after deletion" needs persisted state, but no standard place exists. | standardise a high-water-mark convention in `extensions` (DROP's §6.4 proposal) |

None of these blocks Phase 1 *except* S1/S2/S4 (D2/D4/D7), whose proposed handling is listed in §1 and can be implemented without changing any schema.

## 16. Phases and gates (DROP side; maps to spec §25 phase 3)

| Step | Content | Gate |
|---|---|---|
| **1a** | vendored spec + `sync-spec --check`; `sp-validate.js`; `sp-package.js` reader/writer + security; negative fixtures | negative suite green; spec examples validate |
| **1b** | `sp-project.js` (mapping, ids, tempo, chops⇄markers); `spsystem-fs.js` atomic save; preservation + atomic + §23 round-trip tests | **round-trip + atomic tests green in Node** |
| **1c** | design-only: `Chop.getProjectState/loadProjectState` contract, IPC/preload threat model, file association | owner review |
| 2 | Electron preload/IPC; *Save/Open SP SYSTEM project* UI; pad editor | works from the packaged `.app` |
| 3 | SUGGESTED rendering/accept/dismiss; requirements progress strip; Open in LEARN / Return to LEARN | interchange stable only after the round-trip passes in both apps |

## 17. Explicitly not doing now

No UI, no menu items, no `index.html` change, no IPC/preload, no URL scheme, no library folder, no change to Convert/Chop/DSP/export/i18n, no new dependency in the app, no edit of the canonical schemas, no framework migration.

**Stopping here. Waiting for confirmation of §1 (D1–D9) and any decision on the findings in §15.**
