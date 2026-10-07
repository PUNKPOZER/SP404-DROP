# SP SYSTEM — `.spsystem` interchange protocol (draft v1)

**Status: specification for review. Nothing here is implemented in SP404 DROP or SP-404 LEARN, and no production code was changed.**
Machine-readable parts: [`sp-system-spec/`](sp-system-spec/) (JSON Schemas, three example packages, a validator). This document replaces the earlier folder-plus-`.spsystem.json` proposal (never implemented, so nothing to migrate).

Contents: 1 Model · 2 Container · 3 Versioning · 4 Manifest · 5 Chops · 6 Pads · 7 Samples · 8 Loops · 9 Analysis · 10 Recipe & lesson files · 11 Ownership · 12 Merge rules · 13 Unknown data · 14 Validation levels · 15 Atomic saving · 16 Source audio modes · 17 Project IDs · 18 Hashes · 19 Library · 20 URL handoff · 21 Security · 22 Workflows (DROP→LEARN, LEARN→DROP, RETURN, LEARN THIS PACK, LESSON→DROP) · 23 Round-trip test · 24 Migration · 25 Phases · 26 SP CORE (future) · 27 Open questions & risks

---

## 1. Model and non-goals

Two separate apps in one ecosystem, **SP SYSTEM**:

| | SP404 DROP | SP-404 LEARN |
|---|---|---|
| Job | IMPORT → CONVERT → CHOP → LOOP → PAD MAPPING → EXPORT | ANALYZE → UNDERSTAND → TEACH → PRACTICE → SP RECIPE |
| Today | one dependency-free HTML app (`web/index.html`) run in a browser or in an Electron shell; has its own WAV encoder and a **ZIP writer (no ZIP reader yet)** | Tauri 2 + React/TS + Python sidecar; own `.sp404learn` project (full app state) |

Rules: the apps stay separate; **neither imports the other's code**; both implement this document. No cloud, no account, no server, no mandatory internet. No shared audio engine now — **data format first**. `.sp404learn` is **not** replaced: it keeps LEARN's private state (waveform peaks, pattern edits, kit, tutorial position); `.spsystem` is the *interchange* subset (LEARN stores the project `id` in its own file to link the two).

## 2. Container

* A **ZIP** archive with the extension **`.spsystem`** (MIME suggestion `application/x-sp-system+zip`). Standard ZIP (no ZIP64 needed below 4 GB), UTF-8 names (general-purpose flag bit 11), `deflate` or `store`; audio may be `store`d.
* Required entry: **`manifest.json`** at the root. Everything else is optional — **partial projects are normal**.
* Layout (all paths relative, forward slashes):

```
manifest.json                required
audio/source.<ext>           portable mode only (wav | flac | aiff | mp3 | m4a)
samples/<name>.wav           rendered samples (SP-404MKII-ready: PCM 16-bit, 48 kHz recommended)
project/chops.json           DROP-owned
project/pads.json            DROP-owned
project/loops.json           DROP-owned
project/samples.json         DROP-owned (describes samples/)
analysis/track.json          LEARN-owned   (TrackUnderstanding)
learn/recipe.json            LEARN-owned
learn/progress.json          LEARN-owned
learn/requirements.json      LEARN-owned   (lesson → DROP request)
README.txt                   optional, free text
```

* Any other entry is **unknown** and handled by §13. Entry names are case-sensitive; two names that differ only by case are a corrupt package.

## 3. Versioning

* `manifest.formatVersion` (integer, starts at **1**) versions the *container and manifest*. Also `"format": "sp-system"`.
* Every module has its **own** integer: `schemaVersion` (chops/pads/samples/loops), `analysisVersion`, `recipeVersion`, `progressVersion`, `requirementsVersion`. Nothing is inferred from the application version.
* `createdBy`, `createdByVersion`, `modifiedBy`, `modifiedByVersion` are informational (diagnostics, "last edited in DROP 1.2.0").
* Changes that only **add optional fields** do not bump the version. A bump means an older reader could misread (renamed/removed/reinterpreted field). See §24.

## 4. Manifest (`manifest.json`)

Small and always parseable by every SP SYSTEM app — it contains only what DROP can reliably produce.

| Field | Req. | Meaning |
|---|---|---|
| `format`, `formatVersion` | ✔ | `"sp-system"`, integer ≥ 1 |
| `id` | ✔ | project UUID (§17) |
| `createdBy`, `createdAt` | ✔ | app id (`sp404-drop`, `sp404-learn`, …) and ISO time |
| `createdByVersion`, `modifiedAt/By/ByVersion` | | diagnostics |
| `revision` | | integer, +1 on every successful save by any app (§15) |
| `title` | | display name |
| `source` | | `{ title, originalFilename, durationSeconds, sampleRate, channels, mode: portable | lightweight | none, audio, sha256, externalSource{path,hash,sizeBytes,lastSeenAt} }` — §16 |
| `tempo` | | **working tempo**: `{ bpm, confidence?, beatOffsetSeconds?, origin: detected | user | imported, setBy, setAt }`. `beatOffsetSeconds` = time of a bar's first beat (= LEARN's `grid.origin`) |
| `meter` | | `{ beatsPerBar, confidence? }` |
| `modules` | | informational index `{ name: { path, schemaVersion, owner, sha256? } }` |
| `extensions` | | namespaced vendor data (`"x-sp404-drop": {…}`), preserved by everyone |

No field is required that DROP cannot produce (no key, genre, structure here). `confidence` is always `null`-able and never compared across producers.

## 5. Chops (`project/chops.json`)

```json
{ "schemaVersion": 1, "chops": [
  { "id": "chop-01", "name": "Break 1", "source": "audio/source.wav",
    "startSeconds": 12.482, "endSeconds": 13.741, "type": "manual", "confidence": null } ] }
```

* **Seconds on the source timeline**, never only sample indices (sample rates differ between source and rendered samples). Apps may add `startSample` etc. as extra fields; readers must use seconds.
* `type`: `manual | transient | beat | loop | analysis-suggestion`. `analysis-suggestion` means *a person accepted a LEARN suggestion* (`fromCandidateId` points at it).
* **`chops.json` contains only confirmed chops.** Suggestions live in `analysis/track.json → chopCandidates` and are never mixed in (§22.2) — this is what keeps SUGGESTED visually and structurally distinct from USER CHOP.
* IDs (`^[a-z0-9][a-z0-9._-]{0,63}$`) are **stable**: never renumbered on reorder, never reused after deletion. `sourceSha256` optional (which audio the times refer to).

## 6. Pads (`project/pads.json`)

```json
{ "schemaVersion": 1, "assignments": [ { "bank": "A", "pad": 1, "sampleId": "sample-01" }, { "bank": "A", "pad": 6, "sampleId": null } ] }
```

Flat list; any number of banks (`^[A-Z0-9]{1,4}$` — the schema does not hard-code A–J); `pad` 1..16 in the **SP-404MKII physical order, 1 = bottom-left … 16 = top-right** (the layout LEARN already uses); empty pad = omitted or `sampleId: null`; one `(bank, pad)` at most once; `sampleId` must exist in `samples.json` (a dangling id is a warning, the pad is shown empty). Optional `label`.

## 7. Samples (`project/samples.json`)

`{ id, file, name, sourceChopId|null, durationSeconds, sampleRate, bitDepth, channels, category?, sha256? }`. `category ∈ drum kick snare hat perc bass vocal melodic texture loop unknown`; **classification is never required** (omitted = `unknown`). `sourceChopId` links back to the chop; a sample may exist without a chop (imported one-shot). Samples are **PCM WAV**; 16-bit/48 kHz is what the SP-404MKII loads directly (LEARN's existing exports use that).

## 8. Loops (`project/loops.json`)

`{ id, name?, source, startSeconds, endSeconds, bars, bpm, confidence, loopability? }` — an explicit region with its bar count and tempo. `loopability` (0..1, how seamlessly it repeats) is reserved for a future analysis step and optional now.

## 9. Analysis (`analysis/track.json`) — TrackUnderstanding

LEARN-owned; **DROP may ignore it completely but must preserve it** (§13). Kept out of the manifest so the basic format never depends on analysis maturity.

```json
{ "analysisVersion": 1, "producedBy": {"app":"sp404-learn","version":"0.4.0"}, "audioSha256": "…",
  "tempo":   { "raw": {"bpm":174.2,"confidence":0.74}, "userOverride": {"bpm":172} },
  "meter": {}, "key": {}, "genre": {}, "groove": {}, "drums": {}, "bass": {}, "structure": {}, "phrases": {}, "vocals": {},
  "chopCandidates": [ … ], "loopCandidates": [ … ] }
```

* Every inferred property is `{ raw, userOverride }` (+ confidence inside `raw`). **`raw` is never overwritten by a user correction.** Readers use `userOverride ?? raw`. (This generalises what LEARN already does with `genre` / `genre_user` and `corrections.bpm.{raw,user}`.)
* `audioSha256` names the audio the analysis describes; if the source audio changes the analysis is kept but flagged **stale**, not deleted.
* Mapping from LEARN's current `TrackAnalysis`: `grid.bpm/origin/confidence → tempo.raw`; `genre → genre.raw`, `genre_user → genre.userOverride`; `corrections.bpm → tempo.raw / userOverride`; `sections → structure.raw.sections`; `events → drums.raw`; `bass → bass.raw`; `characteristics → groove.raw` (experimental).
* `chopCandidates[]`: `{ id, kind: drum-break | vocal | melodic-loop | texture | bass | other, label, startSeconds, endSeconds, confidence, reason?, state: suggested | accepted | dismissed, acceptedChopId? }`. `loopCandidates[]` likewise (+ `bars`, `loopability`).

## 10. Recipe and lesson files (`learn/*`)

* `recipe.json` — the educational plan: `{ recipeVersion, kind: track | pack, title, genre, generatedFrom, steps[{ id, title, why, items[{type: lesson|trick|fx|exercise|reference, id}], pads[{bank,pad,sampleId}] }] }`. It **references library content by id** (the library ships with LEARN; it is not copied into the package) and, for packs, by `sampleId`.
* `progress.json` — lesson completion and practice stats for this project (LEARN-private; DROP preserves it).
* `requirements.json` — LEARN asks DROP for material: `{ lesson, needs[{ type: drum-chop | break-chop | kick | snare | hat | perc | bass | vocal-chop | melodic | texture | loop | any, count, note? }] }` (§22.5).

## 11. Ownership (file level)

| Path | Owner (may write) | Others |
|---|---|---|
| `samples/*`, `project/samples.json`, `project/chops.json`, `project/loops.json`, `project/pads.json`, `audio/source.*` | **DROP** | LEARN may **read**; LEARN writes them only to *create* a package or at the user's explicit request and then with DROP's rules (§12) |
| `analysis/track.json`, `learn/*` | **LEARN** | DROP reads/ignores, **preserves byte-for-byte** |
| `manifest.json` | shared | field rules below |
| everything else | nobody | copied through unchanged (§13) |

Neither app may "save the whole package from its own in-memory model": it rewrites **only the files it owns** and copies every other entry through unchanged.

## 12. Merge rules

**Manifest fields:** `id`, `createdBy`, `createdAt`, `format*` never change after creation. `modifiedAt/By/ByVersion` and `revision` are written by every saver. `title`: last writer wins. `source`: DROP owns it (conversion metadata); LEARN may add `externalSource.lastSeenAt` and relinked paths (§16). `modules`: each app updates its own entries, keeps the others'. `extensions["x-…"]`: only the named vendor touches its key.

**Tempo (the one shared judgement).** `manifest.tempo` is the *working* value.
* A user changing BPM in DROP writes `manifest.tempo = { bpm, origin: "user", setBy: "sp404-drop", setAt }`.
* LEARN, on opening, compares `manifest.tempo` with its effective analysis tempo (`userOverride ?? raw`). If the manifest tempo has `origin: user` and is newer than LEARN's last write, LEARN stores it as `analysis.tempo.userOverride` — **it never touches `raw`**. A user changing BPM in LEARN updates `userOverride` **and** `manifest.tempo` (origin `user`, `setBy: sp404-learn`).
* If both changed since the last common revision with different values: **most recent `setAt` wins and the loser is kept** (LEARN keeps it in `userOverride.history[]`, DROP in `extensions`); the user is told, not silently overridden.

**Stale analysis:** when DROP replaces `audio/source.*` (hash changes), it leaves `analysis/` untouched; LEARN detects `audioSha256 ≠ source.sha256`, marks the analysis stale and offers re-analysis — it does not delete lessons, user corrections or progress.

**Chops vs candidates:** LEARN never edits `chops.json`; accepting a candidate is done by DROP (creates the chop, sets `fromCandidateId`) — and DROP then records `state: accepted` **only if** it can write `analysis/track.json`; otherwise LEARN reconciles on open (a chop with `fromCandidateId` ⇒ candidate accepted). Reconciliation is idempotent.

**Concurrent edits:** see §15 (revision check + three-way file-level merge).

## 13. Unknown data

* **Unknown files** (not in §2, or an owned-by-other file whose version is unknown) are copied from the old archive to the new one **byte-for-byte**, including their entry names, timestamps and compression method. Never dropped because they cannot be parsed.
* **Unknown JSON fields** inside a file the app owns are preserved: apps edit parsed JSON in place (not "deserialise into a typed struct → serialise"), or carry an `unknown` bag through. Key order is not significant.
* A module with a **newer schema version** than the app knows is treated as opaque: preserved, not edited, reported as a warning (§14).
* DROP opening a package with `analysis/track.json` `analysisVersion: 3` it cannot parse keeps it untouched.

## 14. Validation levels

| Level | When | App behaviour |
|---|---|---|
| **VALID** | manifest valid; all present modules known and valid; every referenced file exists | open normally |
| **VALID WITH WARNINGS** | optional module unknown/newer/invalid, dangling reference, missing optional file, stale analysis, source file moved (lightweight) | open; show a one-line reason per warning; **optional modules never block opening**; unknown modules preserved read-only |
| **UNSUPPORTED VERSION** | `formatVersion` higher than the app supports, or a *required-for-this-app* module (e.g. DROP needs `chops`/`samples` it cannot read) is newer | open read-only if at all; never rewrite; explain "created by <app> <version>" |
| **CORRUPTED** | not a ZIP; no/invalid `manifest.json`; path-traversal or forbidden entry (§21); duplicate/case-colliding names; size/ratio limits exceeded | refuse; offer recovery from `.bak`/`.tmp` (§15) |

Example: *VALID WITH WARNINGS — "Analysis data uses a newer version. Samples and pad mapping can still be opened."* A rejected optional module must never reject the project.

## 15. Atomic saving and recovery

Save = **write a new package beside the old one, validate it, then swap**; never modify in place.

1. Read the current file's `manifest.revision` and a content fingerprint (size + mtime, plus SHA-256 of `manifest.json`) at **load** time.
2. On save, re-read the file on disk. If revision/fingerprint differ from load time → another app (or window) saved in between: **do not overwrite**; load that version, re-apply this app's owned files on top (file-level three-way merge, §12), and continue — or ask the user when the same owned file changed on both sides.
3. Write `<name>.spsystem.tmp-<random>` **in the same directory** (same filesystem ⇒ rename is atomic). Copy through all entries this app does not own; write owned entries; set `revision + 1`, `modifiedAt/By`.
4. **Validate the temp file**: re-open it as ZIP, run §14 checks, compare hashes of copied-through entries with the originals, check that every module present before is still present.
5. `fsync` the temp file, then atomically replace (`rename(2)` on macOS/Linux; `ReplaceFileW`/`MoveFileEx(REPLACE_EXISTING)` on Windows). Keep the previous file once as `<name>.spsystem.bak` (single generation) unless the user disabled it.
6. Remove the temp file. Advisory lock `<name>.spsystem.lock` (created with exclusive-create, contains app + pid + time, stale after 60 s without refresh) reduces simultaneous saves but is **not relied on**: step 2 is the real protection.

**Recovery on open:** stray `*.tmp-*` next to a package with the same project `id` and a higher `revision` that validates → offer "Recover unsaved changes" (never auto-replace); an invalid temp is deleted only after the user confirms or on the next successful save. If the main file is CORRUPTED and `.bak` validates → offer the backup. A crash can therefore lose at most the changes since the last completed swap, never the project.
*DROP in a plain browser:* cannot rename in place; it can only **download** a new `.spsystem` (Chromium's File System Access API could allow in-place saves — to be verified); the Electron build can use `fs`. The URL handoff (§20) is Electron/desktop-only.

## 16. Source audio modes

* **PORTABLE** — `audio/source.<ext>` inside the package; `source.mode = "portable"`, `source.audio`, `source.sha256`. Self-contained, large.
* **LIGHTWEIGHT** — audio referenced: `source.mode = "lightweight"`, `externalSource: { path, hash, sizeBytes, lastSeenAt }`. Samples/chops still travel; the original stays where the user keeps it.
* **NONE** — a samples-only pack (e.g. a Footwork kit).

Lightweight resolution order: (1) `externalSource.path` exists **and** size matches **and** hash matches (hash only if size matches; for big files compare size + first/last MiB first, full hash only on demand); (2) search the recorded folder and the SP SYSTEM Library by filename + size, confirm by hash; (3) **relink dialog** ("Source moved — locate it"); a file with a different hash is offered as "different version — use anyway (analysis becomes stale)". While unresolved the project opens VALID WITH WARNINGS; everything that needs only samples keeps working. Switching portable ⇄ lightweight is an explicit user action ("Embed source audio" / "Remove embedded copy") performed by the owner of `source` (DROP).

## 17. Project IDs

`manifest.id` is a **UUID v4 created once** and never changed (a "Save a copy" gets a **new** id and `derivedFrom: <old id>` in `extensions`). Apps identify "the same project" by id, not filename: the Library and the URL handoff use it; renaming or moving the file does not change identity. `.sp404learn` stores `spSystemId` to link its private state. Two different files with the same id are treated as copies of one project (the one with the higher `revision` is offered as current).

## 18. Hashes

SHA-256, lower-case hex. **LEARN's existing content hash is the first 32 hex chars of SHA-256 of the file bytes** (`decode.file_hash`), so a 32-char prefix is accepted everywhere and compared by the shorter length; new writers should store the full 64.
Uses: source identity (`source.sha256`, `externalSource.hash`), analysis cache reuse (LEARN: `audioSha256` = cache key, so a package from DROP whose source LEARN already analysed costs nothing), change detection (`samples[].sha256`, optional `modules[].sha256`), stale-analysis detection. Rules: hash a file once per session and cache it by (path, size, mtime); never rehash big sources on every save; hashes are advisory — a missing hash is never an error.

## 19. Local SP SYSTEM library (design only)

```
~/Music/SP SYSTEM/
  Projects/   My Jungle Track.spsystem
  Packs/      Footwork Kit.spsystem
  Exports/    (rendered sample folders / zips for the SP-404 SD card)
```

Optional convenience: both apps may offer "Save to library" and list compatible packages there (read manifest only, never the audio) by `id`, `title`, `modifiedAt`. Users can always open a `.spsystem` from anywhere (file dialog, drag-and-drop, OS file association later). The library path is a setting; nothing breaks if it does not exist. No index database: a directory scan of manifests is enough at this scale.

## 20. URL handoff (design; mechanism to be verified)

Schemes: **`spdrop://`** and **`splearn://`**. Examples:

```
splearn://open?id=6f1c2b9e-3a44-4d0a-9b1e-2c7d5a8f0e11&path=%2FUsers%2Fmitya%2FMusic%2FSP%20SYSTEM%2FProjects%2FJungle%20%E2%80%94%20break.spsystem
spdrop://open?id=<uuid>&path=<percent-encoded absolute path>&intent=prepare
splearn://open?id=<uuid>&path=…&intent=return
```

* The URL carries **no project data** — only an action (`open`), an `intent` (`open | prepare | return`) and an identifier: `id` (preferred; resolved through the library/recent list) and/or `path`.
* Encoding: UTF-8, percent-encoded (spaces `%20`, Unicode), paths normalised to NFC; parameter and total length capped (e.g. 2 KiB); unknown parameters ignored; unknown `intent` ⇒ plain open.
* **The URL is untrusted input.** It can only cause "open this project (read-only) and show it"; no write, delete, export or script action is ever triggered by a URL. The receiving app shows the project and its normal confirmation UI. If `path` is outside the library, a one-time "Open this file?" prompt shows the full path. If `id` and the file at `path` disagree, trust the file's manifest and warn.
* Failure behaviour: **target app not installed** → the OS reports no handler: the calling app shows "SP-404 LEARN is not installed — your project was saved at <path>" and keeps *Save SP SYSTEM project* working (DROP must never depend on LEARN). **Project missing** → "Project not found", with relink / open-file buttons. **App already running** → the running instance receives the event and focuses (single-instance).
* Mechanism **not yet verified**: Tauri 2 has a deep-link plugin and Electron has `app.setAsDefaultProtocolClient`, macOS registers schemes through `CFBundleURLTypes` in the app bundle's Info.plist (so it only works from an installed/packaged app, not `tauri dev`), Windows through registry keys. Phase 4 starts with a spike on a real packaged build. A fallback that needs no URL scheme: launch the other app with the file as an argument / "open with" (`open -a "SP-404 LEARN" file.spsystem` on macOS), which works the same through file association.

## 21. Security (packages are untrusted)

* **Never extract blindly.** Read entries by name from the archive; if extraction to disk is needed, extract to an app-owned temp directory using a **sanitised** name, never the archive's path.
* **Reject the whole package (CORRUPTED)** on: entry name with `..` segment, absolute path, drive letter, backslash, NUL/control characters, `./` prefix tricks, symlink entries, duplicate or case-colliding names, names over 240 chars, more than **2 000 entries**, any entry over a size cap (default **4 GiB**, `source`/samples; **64 MiB** for JSON), declared-vs-actual size mismatch, a **compression ratio above ~200:1** (zip-bomb guard), or total uncompressed size above a configurable cap.
* **Allow-list by extension and by role:** JSON files only at the paths in §2 (or under a vendor-namespaced folder `x-<vendor>/`); audio `wav flac aiff aif mp3 m4a` in `audio/` and `samples/`; `README.txt/.md`. **Reject** executable payloads: `.app .exe .dll .dylib .so .sh .command .bat .ps1 .js .py .jar .dmg .pkg .scpt` and anything with the executable bit or a Mach-O/ELF/PE/shebang header. Content sniffing: a `.wav` must start with `RIFF…WAVE` (or the matching FLAC/AIFF header).
* **Manifest/JSON paths are not trusted either:** every `source.audio`, `samples[].file`, `chops[].source` must pass the same relative-path check **and resolve to an entry actually present in the archive**; never open a path from JSON on the filesystem. `externalSource.path` is the one external reference: it is only *stat-ed and hashed* when the user opens the project, never executed, and a mismatch just triggers the relink dialog.
* JSON hardening: parse with depth/size limits, numbers clamped (`startSeconds ≥ 0`, `bpm` 20–400 etc.), strings length-capped, no prototype-pollution (`__proto__`, `constructor` keys dropped in JS), unknown fields kept but never evaluated.
* Nothing is executed or evaluated from a package; HTML/Markdown in README is shown as plain text.
* Privacy: packages may contain track titles/filenames/audio — never uploaded; "Share" is the user's own act. Lightweight packages store a local absolute path (reveals the user name) — the UI says so on export and offers "strip paths".

## 22. Workflows

### 22.1 DROP → LEARN (OPEN IN LEARN →)
DROP converts, detects BPM, chops, loops and assigns pads, then **Export for SP-404** (unchanged) and **Open in LEARN →**: DROP writes/updates `MyTrack.spsystem` (manifest, source or externalSource, `project/*`, `samples/*`) atomically (§15) and asks the OS to open it in LEARN (§20). If LEARN is not installed, **Save SP SYSTEM project** still works and DROP shows where the file is. LEARN imports without repeating work:

| DROP supplied | LEARN does |
|---|---|
| source + `sha256` | uses `sha256` as its cache key — reuses a cached analysis if it exists |
| `tempo` | seeds the grid (still editable, ÷2/×2 offered); skips tempo detection only when `confidence` ≥ its own threshold **and** the user chose that; the engine's `raw` tempo is still computed and kept separate |
| `chops`, `loops` | shown as the user's chops (confirmed, distinct colour) |
| `samples`, `pads` | shown as the pad bank in Track Lab / available to LEARN THIS PACK |

LEARN then runs the deeper analysis and writes `analysis/track.json` + `learn/*` (never touching DROP-owned files).

### 22.2 LEARN → DROP (PREPARE IN DROP →)
LEARN finds GOOD MATERIAL (drum break, vocal, melodic loop, texture, bass) and lists it with time ranges (`DRUM BREAK 00:31 → 00:35`). **Prepare in DROP →** writes `chopCandidates`/`loopCandidates` with `state: suggested` into `analysis/track.json` (and creates the package, source/externalSource and manifest, if it does not exist yet), then opens it in DROP. DROP draws candidates on the waveform **as SUGGESTED** (dashed outline, different colour, label "suggested · 72 %", no pad, no export) and user chops as USER CHOP (solid). Only an explicit **Accept** turns a candidate into a chop (§5/§12); **Dismiss** sets `state: dismissed`. A user decides what becomes a sample. LEARN stays fully usable without DROP.

### 22.3 RETURN TO LEARN
DROP's **Return to Learn →** saves (atomic, owned files only) and opens the same project by `id`. LEARN reloads the package, sees new/changed samples, chops and pad mapping, and **keeps** `analysis`, `learn/*` (lessons/recipe/progress), genre, structure and every `userOverride`; stale-analysis rules (§12) apply if the source changed. DROP never deletes `analysis/` or `learn/`.

### 22.4 LEARN THIS PACK
LEARN opens a package that has `samples` + `pads` (+ `tempo`) and no/partial analysis — e.g. 16 samples, 168 BPM, bank A — and builds `learn/recipe.json` with `kind: "pack"`. It uses the user's samples and pad mapping only (**no copyrighted reference audio**; sample categories come from `samples[].category` or a light, optional LEARN classifier whose result is stored as a suggestion, not written over DROP's data):

1. **Audition your pads** — walk the bank pad by pad, name/classify each (stored in LEARN's `recipe`, optionally offered back to DROP as `category`).
2. **Build a basic pattern** — TR-REC with the pack's kick/snare/hat on their real pad numbers, at the pack's BPM.
3. **Add variation** — fills/ghost notes with the pack's remaining drum pads.
4. **Use your vocal chops** — place vocal/melodic pads against the pattern.
5. **Add FX** — suggested bus/MFX from the library, matched to the pack's character and (if known) genre.
6. **Perform it** — a Practice Mode exercise built from the pack's pad numbers; arrangement/mute-group moves.

### 22.5 LESSON → DROP (future)
A lesson (e.g. *Jungle · 04 · Chop a break*) states **YOU NEED: 8 break chops, 1 bass, 1 texture** → **Prepare samples in DROP →** writes `learn/requirements.json` (`needs[]`) into a package (creating it from the lesson with `source.mode: none` if needed) and opens DROP. DROP shows a progress strip ("break chops 5 / 8 · bass 0 / 1") computed by counting `samples[].category` (or chops by `type`); it **never edits** `requirements.json`. When satisfied: **Return to Learn →** (§22.3). Requirement types map to categories (`drum-chop`/`break-chop` → `drum` or `loop`; `vocal-chop` → `vocal`, …); the mapping table lives in the spec and is versioned with `requirementsVersion`.

## 23. Mandatory round-trip test (conformance fixture)

A shared, language-neutral fixture (`sp-system-spec/fixtures/roundtrip/` — to be created in Phase 1/6) plus a runner in **each** repo. Steps, each operating on the *previous step's output file*:

| # | Actor | Action |
|---|---|---|
| 1 | DROP | create project: manifest (uuid U), source, 16 samples, chops, loops, pads A1..A16, `extensions["x-sp404-drop"]` |
| 2 | LEARN | open; write `analysis/track.json` (tempo raw + **user override**, genre raw + user override, candidates), `learn/recipe.json`, `learn/progress.json` (lesson done) |
| 3 | DROP | reopen; **ignores** analysis; changes **pad 4** (A4 → another sample); also contains one **unknown file** (`x-future/notes.bin`) and an `analysisVersion`-9 style extra field |
| 4 | LEARN | open again |

Expected after step 4 (assertions): `manifest.id == U`; `analysis/track.json`, `learn/*` **byte-identical to step 2** (DROP never rewrote them); all `userOverride` values present, every `raw` unchanged; **A4 shows the new sample**, all other pads unchanged; every `samples[].file` exists and (where `sha256` is set) hashes match; unknown file and unknown JSON fields from step 1/3 still present; `revision` strictly increasing 1→4; validation level at each load is VALID (or VALID WITH WARNINGS only where the fixture intends); atomic-write test: kill the writer between temp-write and rename ⇒ original still valid, temp recoverable. Extra negative fixtures: zip-slip entry, case-collision, ratio bomb, newer `analysisVersion`, missing source (lightweight), moved source (relink). The interchange is **not considered stable until this passes in both apps** and the schemas validate every fixture.

## 24. Migration strategy

* Independent integer versions (§3). Reader rule: *unknown higher version ⇒ preserve, don't rewrite*. Writer rule: *write the lowest version that can represent the data* (keeps old readers working).
* `migrations/vN-to-vN+1.md` + before/after fixtures; migrations are pure functions on parsed JSON and never delete unknown fields; run in memory on open; persisted only on the next explicit save through the atomic path (previous file kept as `.bak`).
* Deprecation: a field may be removed only in a `formatVersion` bump, and readers keep supporting the previous version. Additive optional fields never need a bump (schemas allow unknown properties).
* A newer package opened by an older app: VALID WITH WARNINGS or UNSUPPORTED VERSION (§14) — never silent data loss.

## 25. Implementation phases (each ends with a review gate)

1. **Finalize `.spsystem` v1 spec and schemas** (this task; then review). Add `fixtures/`, error-code list, conformance README. *Gate: owner approves the ownership/merge rules and the pad/bank numbering against Roland's manual.*
2. **Package reader/writer in LEARN** (Python sidecar: zipfile with the §21 guards, atomic save, validation levels, unknown-file pass-through; TS types from the schemas). Import-only UI first ("Open .spsystem"), then export. *Gate: negative-fixture suite green.*
3. **Package reader/writer in DROP** (dependency-free JS: ZIP **reader** needed — `DecompressionStream('deflate-raw')` or a small inflate; existing ZIP writer reused; browser = download, Electron = atomic `fs`). *Gate: same fixtures green in Node tests.*
4. **DROP → OPEN IN LEARN** (+ file association/URL spike on packaged builds, §20). *Gate: works from the .dmg builds, not dev mode.*
5. **LEARN → PREPARE IN DROP** (candidates drawn as SUGGESTED; accept/dismiss).
6. **Round-trip tests** DROP → LEARN → DROP → LEARN (§23), both repos, in CI. *Interchange declared stable only here.*
7. **Local SP SYSTEM Library** (`~/Music/SP SYSTEM/`).
8. **LEARN THIS PACK** (§22.4).
9. **LESSON → PREPARE IN DROP** (§22.5, `requirements.json`).
10. **Evaluate SP CORE** extraction (§26) — only for code that is demonstrably duplicated by then.

## 26. Shared core (future; do not extract now)

`SP CORE` could become: **PROJECT CORE** (schemas, package reader/writer, migrations, validators, hashing) · **DEVICE CORE** (pad/bank model, SP terminology, the 16-pad layout) · **DESIGN CORE** (tokens, logo, icons — both repos already track the same SP SYSTEM board) · **AUDIO CORE** (only genuinely shared algorithms, e.g. transient/tempo, if the two implementations converge). Because the apps use different runtimes (plain JS in Electron/browser vs. TS + Python), the *specification and fixtures* are the shared artefact until then; a shared library would need a language both can load (a small Rust/WASM reader is one option — evaluate in Phase 10).

## 27. Open questions and risks

1. **Pad/bank numbering** (1 = bottom-left, banks A–J) is inherited from LEARN's code; check against Roland's reference manual and, if possible, a real unit before v1 is frozen.
2. **URL scheme / file association** on packaged macOS builds (Tauri deep-link, Electron `setAsDefaultProtocolClient`): unverified; Windows not considered yet.
3. **DROP in a plain browser** cannot do atomic in-place saves or launch LEARN; the spec degrades to "download + open manually".
4. **ZIP64 / very large packages** (portable mode with long sources): keep sources lightweight by default for > ~500 MB; ZIP64 support in DROP's hand-written writer unknown.
5. **Tempo ownership** rule (§12) is a judgement call; a UI that shows both values may be needed.
6. **Candidate acceptance writes to a LEARN-owned file** (`state: accepted`) — chosen for convenience; the reconciliation fallback (§12) makes it safe, but we could instead derive acceptance only from `fromCandidateId`.
7. Whether LEARN should eventually save *natively* as `.spsystem` (replacing `.sp404learn`) — deferred to Phase 10.
8. Licence/IP: packages may embed copyrighted audio; the spec stores no reference audio for lessons, and sharing is the user's decision.
9. Everything in this document is untested design; the examples validate against the draft schemas (`python3 sp-system-spec/validate_examples.py`) but no app reads or writes `.spsystem` yet.
