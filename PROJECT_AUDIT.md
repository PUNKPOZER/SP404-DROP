# PROJECT AUDIT — SP404 DROP

Audit of the repository **exactly as it exists** at commit `2aa1a48` (branch `main`, tag `v1.1.0`, working tree clean when the audit began).
Method: the source was read directly (`web/index.html` end to end, `cli/*.py`, `mac/*`), then spot-checked with `grep`/`wc`/`cmp`. README files were used only to compare their claims against the code. Line references (`web/index.html:NNN`) refer to this commit.
Nothing in the repository was modified or installed for this audit; this file is the only addition.

Status labels used throughout: **IMPLEMENTED**, **PARTIAL**, **MOCK**, **NOT IMPLEMENTED**.

---

## 0. TL;DR

* The product is a **small, offline sample-prep utility** for the Roland SP-404 family. Two tools: **Convert** (batch → 16-bit / 48 kHz PCM WAV, ZIP out) and **Chop / Loop** (load one track, slice into numbered samples by transients / equal parts / manual markers / beat grid, audition, export WAV or ZIP).
* The whole web application is **one hand-written file**: `web/index.html` (136 KB, ~2,500 lines: ~430 CSS, ~225 HTML, ~1,830 JS). **No dependencies, no build step, no framework, no tests, no CI.**
* A **Mac app** is the same HTML in an Electron shell (`mac/`), distributed as an ad-hoc-signed, un-notarized universal `.dmg` on GitHub Releases. A set of **Python CLI scripts** (`cli/`) predates the web app and is not connected to it.
* There is **no persistent project model**, no sample library, no device model of the SP-404MKII (pads, banks, projects), no key detection, no stems, no normalization, no tutorials/learning content. State lives in closures and is lost on reload; the only persisted value is the UI language.
* The strongest assets: a working **viewport waveform renderer**, **transient + tempo detection**, a **consistent pixel/hardware visual language**, dependency-free **WAV encoder + ZIP writer**, and a reproducible **Mac packaging path**.
* The biggest risks for the planned ecosystem: **monolithic single file**, **no separation between audio engine / UI / state**, **no data model or file format**, **no tests**, and a few **audio-quality shortcuts** (decode at the AudioContext rate, no dither, left-channel-only analysis).

---

## 1. PRODUCT OVERVIEW

### Current purpose
"A small tool that sits between your music library and a Roland SP-404 (SX / MKII / A)" (`README.md`). It removes two chores: getting audio into the format the sampler wants, and cutting a track into numbered samples/loops. It explicitly "is not a DAW".

### Current user workflow
1. Open the web page or the Mac app → Home screen with two tiles.
2. **Convert**: drop files/folders → each is analysed and converted automatically → download one ZIP (`SP404-converted.zip`, with `CONVERSION_REPORT.txt`).
3. **Chop / Loop**: drop one track → choose a chop mode (Transient / Equal / Manual / Beats) → tap samples to audition → export one sample (`sample_NN.wav`) or all (`SP404-DROP-samples.zip`).
4. Copy the files to the sampler's SD card by hand (outside the app).

### Existing implemented features
| Area | Feature | Status |
|---|---|---|
| Convert | Multi-file and folder (recursive, Chromium) drop; extension filter; skip hidden/`._` files | IMPLEMENTED |
| Convert | Detect already-16-bit/48 kHz PCM WAV and keep bytes untouched | IMPLEMENTED (`.wav` extension + RIFF `fmt ` sniff only) |
| Convert | Decode anything the browser can decode → 48 kHz → 16-bit PCM WAV; channel count preserved | IMPLEMENTED (relies on Web Audio `decodeAudioData` behaviour) |
| Convert | Progress meter, stat tiles (tracks/good/as-is/err), per-file log, ZIP + text report | IMPLEMENTED |
| Chop | Waveform viewport: continuous zoom, drag-scroll, wheel/pinch, ruler, overview strip, ZOOM/SCRUB/HEIGHT knobs, Fit / Zoom-to-sample / Follow / height cycle | IMPLEMENTED |
| Chop | Transient auto-chop with live sensitivity slider | IMPLEMENTED |
| Chop | Equal split (4/8/16/32), manual markers, draggable/deletable markers, zero-crossing snap | IMPLEMENTED |
| Chop | **Beats** mode: BPM + beat-phase detection, grid, ÷2/×2, "Beat 1 = playhead", Make Loops by 1/2 beats, 1/2/4 bars | IMPLEMENTED (heuristic) |
| Chop | Tap a sample to audition (second tap stops), Play Sample, Loop (sample-accurate `AudioBufferSourceNode` loop), transport play | IMPLEMENTED |
| Chop | Keyboard shortcuts (Space, M, Del, ←/→, +/−, 0, S, `,` `.`, Enter, L) | IMPLEMENTED |
| Chop | Export selected / export all as 16-bit 48 kHz WAV | IMPLEMENTED |
| Shell | EN/RU language switch (persisted in `localStorage`) | IMPLEMENTED |
| Shell | Mac app (Electron), universal DMG installer | IMPLEMENTED |
| CLI | Folder-wide convert / rename / BPM-key prefixing / category sorting | IMPLEMENTED (separate, see §2) |

### Partially implemented features
* **SP-404MKII compatibility** — PARTIAL: only the *file format* target (16-bit/48 kHz PCM WAV). No device profile, naming rules, pad/bank mapping, or SD-card layout (see §5).
* **"Find a loop"** (root README tagline) — PARTIAL: Beats mode makes grid-aligned loops; there is no loop-point *search* (e.g. seamlessness scoring) and loop points are not written into exported files.
* **Beat/tempo detection** — PARTIAL in robustness: single global tempo, first 90 s only, 60–200 BPM, known half/double-tempo errors (UI offers ÷2/×2).
* **i18n** — PARTIAL: Convert log lines already rendered do not re-translate on language change; Home/Convert static text is translated once at start-up by a text-node scan.

### Placeholder / mock features
* None found. No mock data, fake endpoints, or stubbed UI.

### Features that appear abandoned or unfinished
* An experimental **Samples** screen (MusicBrainz / Genius / AudD lookup, fingerprint library, varispeed search) was built and then **removed** (history: `04dab54`…`926fe10` added, `76d9b96` removed). Its traces remain only in git history and in a "History" paragraph of `THIRD_PARTY_NOTICES.md`.
* **Tutorials / learning content**: none in this repository (`grep` for "tutorial"/"footwork" finds nothing). A genre-tutorial request was started in the last session but **never implemented**. (A separate GitHub repo named `PUNKPOZER/sp404-learn` exists on the owner's account; it was **not inspected** — out of scope.)
* Dead leftovers (see §12): `Chop.reset`, `PX_PER_SEC_MIN`, a `window.claude` download hook.

---

## 2. TECHNOLOGY STACK

| Layer | Technology | Where |
|---|---|---|
| Languages | **JavaScript (ES5 style: `var`, IIFEs, no modules/classes)**, HTML5, CSS3; Python 3 (CLI); Bash (build scripts); JSON | `web/index.html`, `cli/*.py`, `mac/*.sh` |
| Frameworks | **None** (no React/Vue/etc.) | — |
| Runtime | Browser (Chromium recommended) **or** Electron 44.x (Node/Chromium bundled) | `mac/package.json` |
| UI framework | **None**; hand-rolled CSS component classes + imperative DOM | `web/index.html:12-439` |
| Audio libraries | **Web Audio API only** (`AudioContext`, `OfflineAudioContext`, `decodeAudioData`, `AudioBufferSourceNode`) | `web/index.html` |
| DSP / audio processing | Hand-written: peak min/max, RMS-flux onset detection, autocorrelation tempo, zero-crossing search, WAV encoder, browser-native resampler | `web/index.html` |
| ML/AI libraries | **None** | — |
| External APIs | **None at runtime**, except **Google Fonts** CSS/font files (`fonts.googleapis.com`, `fonts.gstatic.com`) | `web/index.html:9-11` |
| Databases / storage | **None** (only `localStorage['sp404drop.lang']`) | `web/index.html:797,845` |
| Build system | Web: **none**. Mac: `@electron/packager` via `mac/build.sh`; DMG via `hdiutil` in `mac/make-dmg.sh` | `mac/` |
| Package managers | **npm**, only inside `mac/` (devDependencies `electron ^44.5.1`, `@electron/packager ^20.3.0`; lockfile committed). pip for CLI (`ffmpeg-python`, undocumented version) | `mac/package.json`, `cli/README.md` |
| Platform-specific | Mac packaging is **macOS-only** (`hdiutil`, `codesign`, `xattr`, `ditto`). `webkitGetAsEntry` folder drop is Chromium/Safari-only. CLI `convertor.py` needs the `ffmpeg` binary | — |
| Fonts | **Silkscreen**, **Pixelify Sans** (SIL OFL) loaded from Google Fonts, system-ui fallback | `web/index.html:11,21-22` |

There is no root `package.json`, no linter/formatter config, no test runner, no CI (`.github/` absent).

---

## 3. PROJECT ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────────────┐
│ UI (static HTML + CSS in web/index.html)                                  │
│  Home ─ Convert ─ Chop/Loop · EN/RU switch · knobs · canvases             │
└───────────────▲──────────────────────────────────────────┬───────────────┘
                │ DOM events / direct DOM mutation          │ tr()/I18N
┌───────────────┴──────────────────────────────────────────▼───────────────┐
│ Application logic (IIFE modules in the same <script>)                     │
│  Navigation · I18N · ConvertModule · Chop (state, view, markers, modes,   │
│  playback, export)                                                         │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ function calls on AudioBuffer / typed arrays
┌───────────────▼───────────────────────────────────────────────────────────┐
│ Audio / analysis "services" (plain functions, not separate modules)       │
│  decodeAudioData · computePeaks · autoChopTransient · detectTempo ·       │
│  findZeroCrossing · encodeWav16 · MiniZip/crc32 · OfflineAudioContext SRC │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ Blob / <a download>
┌───────────────▼───────────────────────────────────────────────────────────┐
│ Storage: none persistent. In-memory objects only. localStorage (language).│
│ Output = downloaded files (WAV / ZIP).                                    │
└───────────────┬───────────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────────────────────────────────────────────────────┐
│ External services: Google Fonts (only). Electron shell adds nothing.      │
└───────────────────────────────────────────────────────────────────────────┘
```

### How data moves
* **Convert**: `File` → `arrayBuffer()` → (WAV sniff → keep) **or** `OfflineAudioContext(1,1,48000).decodeAudioData()` → `encodeWav16()` → `Uint8Array` pushed into `MiniZip` (all in RAM) → `Blob` → download. Files are processed **sequentially**.
* **Chop**: `File` → `arrayBuffer()` → shared realtime `AudioContext.decodeAudioData()` → `state.audioBuffer` (float32, in RAM) → `computePeaks()` (min/max per 512 samples, mono mix) → viewport renderer draws visible columns from peaks or raw samples. Markers (`{id,time}`) define contiguous *segments* (`segments()`), which drive selection, audition, and export. Export re-renders each segment via `OfflineAudioContext(…,48000)` → `encodeWav16()` → single WAV or ZIP.
* There is **no service layer or event bus**: UI handlers call logic directly and logic mutates the DOM directly.

---

## 4. FILE STRUCTURE (architecturally important files only)

| Path | Responsibility |
|---|---|
| `web/index.html` | **The application.** CSS (`:12-439`), markup for 3 screens (`:441-666`), then one `<script>` (`:667-2495`) holding: I18N + RU dictionary (`:671-855`), navigation (`:857-875`), shared helpers incl. `encodeWav16`, `MiniZip`, `downloadFile` (`:877-1003`), `ConvertModule` (`:1008-1231`), `Chop` module (`:1236-2492`). |
| `web/icon.svg`, `icon.svg` (root) | App logo/favicon (identical files; also copied to `mac/app/`). |
| `web/README.md`, `README.md`, `mac/README.md`, `cli/README.md` | User docs. |
| `mac/app/main.js` | Electron main process: one `BrowserWindow` (760×960, sandbox, contextIsolation, no preload), loads `index.html`, opens links externally, blocks drag-navigation. 32 lines. |
| `mac/app/package.json` | Electron app manifest (name, `productName`, version `1.1.0`). |
| `mac/build.sh` | Copies `web/index.html` + `icon.svg` into `mac/app/`, runs `@electron/packager` (arm64 / x64 / universal). |
| `mac/make-dmg.sh` | Builds app → copies to a temp dir (iCloud-safe) → `xattr -cr` → ad-hoc `codesign` → DMG with `/Applications` link and a bilingual "READ ME FIRST.txt". |
| `mac/icon.icns` | App icon (generated from the SVG). |
| `cli/convertor.py` | Recursive `.wav` → 16-bit/48 kHz via `ffmpeg-python`, **overwrites originals**. |
| `cli/nameFixer.py` | Removes provider words from filenames (hard-coded list). |
| `cli/metadataPrepender.py` | Moves BPM/key already in a filename to the front (`120-Am-Name.wav`). |
| `cli/collator.py` | Copies one-shots into category folders by filename keyword. |
| `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md`, `LICENSE` | Release notes; third-party/licence notes; MIT text (copyright line names the original CLI author, "PreetKamal Singh Minhas", 2023). |
| *(git-ignored, local only)* `mac/dist/` (835 MB), `mac/node_modules/` (19 MB), `mac/app/index.html`, `mac/app/icon.svg` | Build outputs/copies. `mac/app/index.html` is currently byte-identical to `web/index.html` (`cmp`). |

---

## 5. AUDIO PIPELINE

| Stage | Status | What the code actually does |
|---|---|---|
| **Audio import** | IMPLEMENTED | Convert: file picker + drag-drop of files **and folders** (`webkitGetAsEntry`, recursive, `traverseEntry` `:1146`), filter `EXT_RE` = wav/mp3/aif/aiff/flac/ogg/oga/m4a/wma/au (`:880`). Chop: single file via input/drop (first file only). |
| **Decoding** | IMPLEMENTED | Browser `decodeAudioData` only. Supported formats = whatever the host Chromium decodes. No fallback decoder (e.g. no ffmpeg.wasm); undecodable files are reported as failed (Convert) or shown as "Could not load" (Chop). |
| **WAV conversion** | IMPLEMENTED | `encodeWav16()` (`:902`): RIFF/`fmt `/`data`, PCM 16-bit little-endian, interleaved, channel count and rate taken from the AudioBuffer. Clamp to ±1, scale `×32768`/`×32767`, **no dither**, no rounding (DataView truncation). No `smpl`/`cue`/metadata chunks. |
| **Sample-rate conversion** | IMPLEMENTED (implicit) | No resampler of its own. Convert: `OfflineAudioContext(1,1,48000)` makes the browser resample during decode. Chop export: `OfflineAudioContext(channels, len, 48000)` renders the already-decoded buffer. **Caveat:** Chop decodes with a default `new AudioContext()` (hardware rate, commonly 44.1 or 48 kHz), so a file can be resampled **twice** (file → context rate → 48 kHz). The "Hz" shown in the Chop header is the context rate, not necessarily the file's. |
| **BPM detection** | IMPLEMENTED (heuristic) | `detectTempo()` (`:2320`): log-RMS envelope (frame 1024, hop 512, mono mix), positive flux minus half the mean, autocorrelation over lags for 60–200 BPM on the **first 90 s**, log-Gaussian prior centred on 120 BPM (σ = 0.9 oct), small bonus for the double-lag, parabolic refinement; beat phase = comb offset (0.25-frame steps) with max onset energy. Assumes one constant tempo; octave (½/×2) errors expected. Runs synchronously on the main thread. |
| **Key detection** | **NOT IMPLEMENTED** | No pitch/chroma analysis anywhere. (`cli/metadataPrepender.py` only *parses a key already written in a filename*.) |
| **Waveform generation** | IMPLEMENTED | `computePeaks()` (`:1359`): min/max per 512-sample chunk of the mono mix, once per load. `drawWave()` uses chunk peaks when ≥512 samples/pixel, otherwise scans raw samples (`columnRange`). Separate cached overview (`drawOverview`). Optional display gain (1–12×). HiDPI-aware (`dpr` ≤ 2). |
| **Transient detection** | IMPLEMENTED | `autoChopTransient()` (`:1893`): RMS per 1024/512 frame on **channel 0 only**, 4-frame trailing mean, positive difference, adaptive threshold `mean + k·std` with `k = 3.2 − 3.0·sensitivity/100`, local-max peak picking, 120 ms minimum spacing, strongest-first, **capped at 63 markers**, optional zero-crossing snap. Sensitivity slider re-chops live (120 ms debounce) after the first run. |
| **Slicing / chopping** | IMPLEMENTED | Four modes sharing one marker list: Transient, Equal (4/8/16/32; `autoChopEqual`), Manual (click), Beats (`makeBeatLoops`, ≤500 markers). A "sample" is the contiguous region between adjacent markers (first starts at 0, last ends at file end); no gaps, no trimming, no fades. |
| **Zero-crossing snap** | IMPLEMENTED | `findZeroCrossing()` (`:1781`): nearest sign change within ±15 ms on **channel 0 only** (a stereo cut may not be a zero crossing on the right channel). |
| **Stems** | **NOT IMPLEMENTED** | No source separation of any kind. |
| **Looping** | PARTIAL | Audition loop is sample-accurate (`src.loop/loopStart/loopEnd`). Beat-grid loop lengths. **Loop points are not exported** (no `smpl` chunk), and no seamless-loop search/crossfade. |
| **Normalization** | **NOT IMPLEMENTED** | Explicitly none ("no normalization" in README and code). No peak/LUFS tools, no gain, no fades, no trim of silence. |
| **Export** | IMPLEMENTED | Single: `sample_NN.wav`. All: `SP404-DROP-samples.zip` of `sample_NN.wav`. Convert: `SP404-converted.zip` + `CONVERSION_REPORT.txt`, original folder structure preserved. ZIP is a custom **store-only** writer (no compression). Downloads via `<a download>`. **Export names do not include the source track name.** No `.catch` on the export promise chain (failures are silent). |
| **SP-404MKII compatibility** | PARTIAL | Only the assumption (stated in README, not verified in code) that the sampler wants 16-bit / 48 kHz PCM WAV. No MKII-specific knowledge: no device/pad/bank/project model, no filename-length handling in the web app, no folder/SD-card layout, no pattern/BPM metadata. The **CLI** `metadataPrepender.py` handles the "long filenames are cut on the sampler screen" concern by putting BPM/key first — the web app has no equivalent. |

---

## 6. USER INTERFACE

### Application shell
Single page, centred "device" card (`.device`, max 640 px wide, dark page background, rounded cream card). Three `<section class="screen">` blocks toggled by `showScreen()` (`:865`); only one is `.active`. Top-right `EN | RU` switch is absolutely positioned inside the card. Leaving Chop calls `Chop.stopAll()`.

### Navigation
Home tiles → Convert / Chop; `←` back button (`data-nav="home"`) on both. No router, no URL state, no history. Keyboard shortcuts exist only on the Chop screen.

### Screens
See §17.

### Reusable components (CSS classes + JS factories)
| Component | Class / factory | Notes |
|---|---|---|
| Pill button | `.pill`, `.pill.solid`, `.pill.on`, `.pill.mini` | 22 pill-class buttons across the app; "on" = inverted toggle |
| Icon button | `.icon-btn`, `.zoom-group` | Unicode/text glyphs, not an icon set |
| Back button | `.back-btn` | |
| Navigation tile | `.nav-tile` (+ inline SVG icon) | Home only |
| Stat tile | `.stat-tile`, `.stat-tile.hot` | Convert counters |
| Segmented meter | `.meter i` (26 segments) | Convert progress |
| Drop zones | `.drop`, `.chop-drop`, `.drag-over` | dashed border |
| Mode tile / chip | `.mode-tile`, `.part-chip`, `.sample-chip` | inverted = active |
| Panel | `.mode-panel`, `.view-panel`, `.home-info` | |
| Rotary knob | `makeKnob()` (`:2200`) | SVG, pointer-drag/wheel/keys, bounded or endless, double-click reset, ARIA `slider` |
| Waveform | `.wave-frame` > `.wave-stage` (2 canvases + DOM marker handles) + `.wave-overview` canvas | see below |
| Marker handle | `.marker-handle` | DOM element with `clip-path` triangle; width adapts to marker spacing |
| Sliders | native `input[type=range]` styled | Sensitivity |
| Language switch | `.lang` | |

**Modals:** none. No `alert/confirm/prompt`, no dialogs, no toasts.

### Waveform components
Two stacked `<canvas>`es (static wave + ruler; overlay with grid, selection cut-out, marker lines, sample numbers, playhead) plus DOM marker handles, plus a separate overview canvas. Viewport model: `view = {start, pps}` (`:1389`), drawing only visible columns. Interactions: drag = scroll, click = seek / add marker, wheel/pinch = zoom, Shift/horizontal wheel = pan, overview drag, three knobs, auto-scroll when dragging a marker near the edge, playhead follow.

### Pad components
**None.** There is no pad grid, bank, or pad-assignment UI anywhere.

### Typography
`--font-ui` / `--font-lcd` are the same stack: `'Silkscreen','Pixelify Sans',system-ui,sans-serif` (pixel fonts, mostly uppercase via `text-transform`). Forty-one `font-size` declarations, all raw px (frequent: 11, 10, 10.5, 9.5, 14, 16, 20). No type scale tokens. Cyrillic falls back to Pixelify Sans (Silkscreen has no Cyrillic).

### Colours
Seven CSS custom properties in `:root` (`:13-25`): `--page #131311`, `--card #f0efe8`, `--card-2 #e4e2d6`, `--ink #0c0c0a`, `--ink-soft #55524a`, `--ink-faint #8b8778`, `--white #f6f5ef`. Strictly monochrome "ink on cream" with inversion for active states. **Hard-coded duplicates in JS** for canvas drawing (`#0c0c0a` ×14, `#f0efe8` ×5, `#c9c7ba` ×3, `#e4e2d6`, `#55524a`, `#f6f5ef`, `#8b8778`, one `rgba(12,12,10,.14)`), and a few CSS-only colours (`#cfcdc3`, `#fff`, `#c9c7ba`) outside the token set. Dark-mode/theming: none (`color-scheme: dark` is declared but there is a single fixed theme).

### Spacing, radius, borders
No spacing tokens; literal px values (gaps 6/8/10/12/14, paddings 9–20). Recurrent language: 2–3 px solid ink borders, radius 8 (small) / 10–12 (panels) / 16 (tiles) / 22 (device) / 999 (pills), dashed borders for drop zones and topbar rule. One media query (`max-width:420px`).

### Animations
**None** — no `transition`, `animation`, or `@keyframes`. Only a `translateY(1px)` on `:active`. Canvas playhead moves via `requestAnimationFrame`.

### Icons
Inline SVG for the logo (a single ~19 KB path on `:450`) and the two Home tile icons; Unicode glyphs elsewhere (▶ ❚❚ ■ ↻ ← ⇩ ▾ ↕ + − 0⋮). Separate `icon.svg` for favicon/app icon.

### Does a design system exist?
**Informally, yes — as a visual language; formally, no.** The look is consistent (see §20), but it exists only as CSS in one file: 7 colour tokens, no spacing/type/radius tokens, no component documentation, no shared stylesheet, no JS component API except `makeKnob`.

---

## 7. DATA MODEL

There is **no persisted data model** and **no project/sample metadata format.** Everything is runtime state.

**Convert (`ConvertModule`)**
```js
queue entry  = { file: File, relPath: "Folder/Sub/name.mp3" }
result       = { status: 'converted'|'skipped'|'failed', bytes: Uint8Array|null, outPath: string, note: string }
counts       = { total, converted, skipped, failed }
```
ZIP output = `outPath` entries (extension swapped to `.wav` when converted) + `CONVERSION_REPORT.txt`.

**Chop (`state`, `:1285`)**
```js
state = {
  audioBuffer: AudioBuffer, fileName, peaksMin: Float32Array, peaksMax: Float32Array,
  grid:   { bpm, offset /*s*/, div /*beats per loop*/, show, detected },
  markers:[ { id, time /*s*/ } ], nextMarkerId,
  mode: 'transient'|'equal'|'manual'|'beats', sensitivity /*0-100*/, equalParts,
  snap, markMode, selected /*segment index*/, cursorTime,
  playKind: null|'transport'|'sample'|'loop',  playing, loopPlaying, samplePlaying, // last three duplicate playKind
  playStartCtx, playStartOffset, transientChopped, draggingId
}
view    = { start /*s*/, pps /*px per s*/ }
viewCfg = { height, gain, follow, zoomSel }
segment = { start, end, index }                       // derived by segments(); never stored
```
There is no sample object, no source-track metadata (BPM/key are not attached to anything), no loop-point/root-note/pad assignment, no IDs that survive a reload.

**Other persisted data:** `localStorage['sp404drop.lang'] = 'en' | 'ru'`.

---

## 8. STATE MANAGEMENT

* Plain closure variables per module (`state`, `view`, `viewCfg`, `queue`, `zipBlobCache`, `processing`, `currentSource`, `rafId`…) — **no store, no reactivity, no immutability.**
* The DOM is both view and (partly) state: e.g. `hidden` attributes, `.active/.on` classes, `chip.dataset`. Re-render is manual (`renderSamples()`, `redrawAll()`, `drawOverlay()`, `rebuildHandles()` — the last removes and recreates the on-screen marker DOM nodes, and re-sorts all markers, on every full redraw).
* Cross-module coupling is minimal and explicit: `showScreen` → `Chop.stopAll()`; both modules read the global `tr`/`I18N`; Chop registers `I18N.onChange`. Convert does **not** re-render on language change.
* Redundant state: `loopPlaying`/`samplePlaying`/`playing` mirror `playKind`.
* No undo/redo; marker edits are destructive; reloading the page discards everything.

---

## 9. FILE STORAGE

| What | Where |
|---|---|
| User audio | Read via the File API; never copied or stored by the app. |
| Projects | **Do not exist.** |
| Samples | Only as downloads the user chooses to make (`<a download>`): browser → the browser's download location; Electron → default Chromium download handling (not customised in `main.js`). |
| Settings | `localStorage` key `sp404drop.lang` (browser profile, or Electron's default user-data directory for the Mac app). |
| Temporary files | None created by the web/Mac app (all in memory). CLI `convertor.py` writes a temp file in the OS temp dir and `shutil.move`s it over the original. |
| Build artifacts | `mac/dist/` (835 MB locally, ignored), `mac/node_modules/`, copied `mac/app/index.html`. |
| Network use | Google Fonts at load. The Mac app therefore also needs internet to get the pixel fonts; offline it falls back to `system-ui`. |

---

## 10. EXTERNAL DEPENDENCIES

| Dependency | Purpose | Actively used | Replaceable | Licence / limits |
|---|---|---|---|---|
| Web Audio API | decode, resample (via OfflineAudioContext), playback | Yes — core | Replacing it (own decoder/SRC) would be large | Browser built-in; format support and resampler quality are browser-defined; mono/stereo only in practice |
| Canvas 2D | waveform | Yes | Yes (WebGL/OffscreenCanvas) | — |
| Google Fonts: Silkscreen, Pixelify Sans | brand typography | Yes | Yes — can be bundled | SIL OFL 1.1 (both); runtime network fetch (privacy/offline concern) |
| Electron `^44.5.1` | Mac app shell | Yes (Mac only) | Yes (Tauri, native WKWebView) | MIT; ships Chromium + third-party licences; arm64 app 288 MB, universal app 508 MB, universal DMG 239 MB |
| `@electron/packager ^20.3.0` | packaging | Yes (build time) | Yes (electron-builder) | BSD-2-Clause |
| macOS tools `hdiutil`, `codesign`, `ditto`, `xattr` | DMG + ad-hoc signing | Yes (`make-dmg.sh`) | — | macOS-only; ad-hoc signing ≠ Developer ID; **not notarized**, Gatekeeper warns on first run |
| `ffmpeg-python` + `ffmpeg` binary | CLI `convertor.py` | Yes (CLI only) | Yes | ffmpeg is LGPL/GPL depending on build — relevant only if redistributed |
| *(none)* ML / audio / UI / state libraries | — | — | — | — |

Licensing notes: web app has **no third-party code** (`THIRD_PARTY_NOTICES.md`). `LICENSE` is MIT with the copyright line of the **original CLI author** (2023); the earliest local commit already contains `cli/` ("…alongside existing CLI tools"), so the CLI predates the web app and its upstream provenance is not documented in the README. Copyright for the web/Mac code is not separately stated.

---

## 11. PERFORMANCE

Observed in code (not profiled):

| Concern | Assessment |
|---|---|
| **Large audio files** | Whole file is decoded to float32 and kept: ≈ 10.6 MB per minute for 44.1 kHz stereo (10 min ≈ 212 MB), plus the compressed source `ArrayBuffer` during decode. No streaming, no downsampled copy. Convert decodes one file at a time but **keeps every output in RAM** until the ZIP is built (`MiniZip` also builds the whole ZIP in memory). |
| **ZIP limits** | Writer uses 32-bit sizes and 16-bit entry count (no ZIP64): >4 GB archives or >65,535 files will be corrupt. |
| **Waveform rendering** | Good: drawing cost is proportional to canvas width, not track length; peaks precomputed once; raw-sample scan only below 512 samples/pixel. `redrawAll()` also **removes/recreates the visible marker DOM handles** (and sorts all markers to size them) and redraws the overview on every pan/zoom event — fine for tens of markers, wasteful for hundreds (Beats mode allows up to 500). Overview peaks are cached (`ovCache`). |
| **Playhead animation** | `drawOverlay()` + `drawOverview()` every animation frame while playing; whole overlay canvas is cleared and redrawn (grid, selection cut-out re-traced). Acceptable now; scales poorly with complexity. |
| **Audio analysis** | Peaks, transient detection, tempo detection all run **synchronously on the main thread** (no Web Worker). Linear in samples; ~tens of ms/min of audio, so long files (10+ min) can block the UI for a noticeable moment. |
| **Export** | One `OfflineAudioContext` per sample, **sequential**, no progress UI; Export All on many samples looks frozen. All WAVs are held in memory until ZIP is generated. |
| **Stems** | N/A (not implemented). |
| **Memory** | Stereo → mono mix is not stored (computed on the fly), peaks are small (1/512 of length ×2). Largest consumers: decoded buffer, Convert's output array, ZIP blob. |
| **UI blocking** | Synchronous analysis, `encodeWav16` loops (per-sample `DataView.setInt16`), CRC32 over all bytes, ZIP assembly — all main-thread. Playback uses the audio thread, so audio itself is not affected. |

---

## 12. CURRENT PROBLEMS

`grep` for `TODO|FIXME|HACK|XXX|mock|stub` finds **no markers** in source (only the word "placeholder" in i18n code/attributes). Problems below were found by reading.

**Dead / leftover code**
* `Chop.reset()` (`:1318`) is exported but never called.
* `PX_PER_SEC_MIN` (`:1281`) declared, never used (leftover from the pre-viewport waveform).
* `state.loopPlaying`, `state.samplePlaying`, `state.playing` duplicate `playKind`.
* `restartPlaybackFrom()` is a one-line alias of `playFrom()`.
* `downloadFile()` first tries `window.claude.use('downloads')` (`:987-996`) — a hook from a different sandbox environment, irrelevant to browser/Electron; harmless fallback exists.
* `.dots` CSS class (`:54`) appears unused.

**Correctness / quality shortcuts**
* Chop decodes at the AudioContext rate → possible **double resampling**; displayed "Hz" may not be the file's rate.
* Transient detection and zero-crossing use **left channel only**; waveform and tempo use a mono mix → inconsistent for hard-panned material.
* Export has **no error handling** and no progress feedback; Export names ignore the source track name; 16-bit output has **no dither**.
* Dropping several files into Chop silently loads only the first.
* Transient mode is capped at 63 markers; Beats mode at 500; Equal at 32 — arbitrary and undocumented in the UI.
* Tempo detection analyses only the first 90 s and assumes constant tempo (documented only in code comments/README).
* `.wav` skip-check accepts only PCM 16-bit/48 kHz; `WAVE_FORMAT_EXTENSIBLE` files (audioFormat `0xFFFE`) are re-encoded even if equivalent.
* i18n: English strings are the keys; static text is registered once by a DOM scan at start-up; strings assembled with HTML concatenation (`renderIdleOrSummary`) are translated at call time only.
* Accessibility: 18 `aria-*` attributes, one `role`; no visible focus style beyond knobs; canvas has no text alternative.

**CLI (`cli/`)**
* All four scripts run at import time (no `main()`/`__main__` guard), use bare `except:` (`convertor.py`), assume `streams[0]` is the audio stream, **overwrite originals**, and use only the *basename* for the temp file (collisions across subfolders).
* `metadataPrepender.suggestName`: if a key is found but no BPM digits are, `name.replace(bpm, '')` is called with `None` → **`TypeError`** (confirmed by reading; not run).
* `collator.py` matches substrings ("tom" ↔ "custom", "hat" ↔ "that"), **copies** (not moves) so duplicates accumulate.
* `nameFixer.py` default `wordsToRemove` includes generic words ("HipHop", "BoomBap", "VIP").
* No tests; no requirements file/version pin for `ffmpeg-python`.

**Repository hygiene**
* No automated tests, linter, or CI; all verification so far was manual or ad-hoc scripts kept outside the repo.
* `mac/app/index.html` is a **generated copy** of `web/index.html` (ignored by git); stale copies are possible if someone builds without `build.sh`.
* History contains an unrelated-history merge (`f56880f`) and two consecutive waveform-rework commits (`5f0c87c`, `bb04f12`) plus the added-then-removed Samples feature.
* `README.md` tagline mentions "find a loop"; the app finds grid loops, not seamless loop points.

---

## 13. TECHNICAL DEBT (ranked)

**CRITICAL** (blocks the planned ecosystem integration)
1. **Monolithic single file with no module boundaries.** Audio analysis, rendering, state and DOM are interleaved inside one ~1,250-line `Chop` closure; nothing can be imported by another app without copy-paste.
2. **No data model / project format / persistence.** Nothing to share with another application (samples, loop points, BPM/key, source references, pad assignments).
3. **No automated tests** for DSP or export (WAV/ZIP correctness is only manually verified).

**HIGH**
4. Audio-quality shortcuts: double resampling via context-rate decode, no dither, left-channel-only analysis, no loop-point/metadata chunks.
5. Main-thread analysis and export; whole-file and whole-output in RAM; ZIP without ZIP64/streaming.
6. Web app depends on Google Fonts at runtime (Mac app too).
7. Mac distribution is un-notarized (first-run friction, no auto-update).

**MEDIUM**
8. Imperative DOM/state with duplicated flags; `rebuildHandles()` recreates DOM each redraw.
9. Design tokens incomplete and duplicated in JS (colours), no spacing/type tokens.
10. i18n approach (English-as-key, one-time scan, partial dynamic coverage); RU dictionary inline in the app file.
11. Export UX gaps (names, errors, progress, per-pad naming).
12. CLI scripts are scripts-at-import with a known crash and risky in-place edits.

**LOW**
13. Dead code listed in §12; `window.claude` hook.
14. ES5 style (`var`, no modules) — consistent but dated.
15. Accessibility gaps; single breakpoint.
16. Generated `mac/app/index.html` copy workflow.

---

## 14. WHAT SHOULD NOT BE REWRITTEN

These work, are tested by use, and are small enough to keep as-is (move/wrap later, do not re-implement):

* **`encodeWav16`, `crc32`, `MiniZip`** (`:902-985`): dependency-free, correct for current needs, ZIPs open normally.
* **Viewport waveform renderer** (`view`, `setView`, `zoomAround`, `columnRange`, `tracePath`, ruler, overview, gesture handling): recently rebuilt and performing well; the *coordinate model* (`start`, `pps`) is a good contract.
* **Transient detector** and **tempo/beat detector** (`:1893`, `:2320`): produce usable results, cheap, no dependencies; improve incrementally, don't replace with a heavier library prematurely.
* **Marker/segment model** (`markers[] → segments()`) and the **sample audition/loop logic** (`selectSample`, `playSegment`, `startLoop`): simple and matches the product's mental model.
* **Zero-crossing snapper** (extend to multichannel rather than replace).
* **`makeKnob`**: self-contained, accessible, reusable.
* **The visual language** (ink/cream pixel hardware look, inversion for state, dashed drop zones): consistent and recognisable — extract, don't redesign.
* **Offline-first, no-server architecture** and zero-dependency web app: a feature for this audience.
* **Mac packaging path** (`build.sh`, `make-dmg.sh`, security-conscious `main.js`): works and is reproducible.
* **Convert pipeline's behaviour** (skip already-correct WAV bytes untouched, folder structure preserved, report included).

---

## 15. WHAT SHOULD BE REFACTORED (not now)

* Split `web/index.html` into modules (audio/DSP, view/waveform, state, UI components, i18n, platform) while keeping a single-file build output.
* Separate **pure DSP** from DOM: `autoChopTransient` currently both detects and mutates `state.markers`/DOM; `detectTempo`/`makeBeatLoops` read `state` directly.
* Replace duplicated play-state flags with the single `playKind`.
* Introduce an explicit **sample/project object** and a serialisable schema before adding persistence.
* Decode strategy: decode at native rate (or via an `OfflineAudioContext` with the target rate) to avoid double resampling; handle channels consistently in analysis.
* Move analysis/export to **Web Workers** (or chunked/yielding loops) and stream ZIP creation.
* Make marker handles incremental (update positions instead of rebuilding DOM).
* Centralise **design tokens** (colours used by canvas, spacing, type scale, radii) and generate both CSS variables and JS constants from one source.
* i18n: key-based catalogue, loaded separately, dynamic re-render for every module.
* CLI: convert scripts to functions with `main()` guards, fix the `None.replace` crash, back up or write to a separate output folder.
* Remove `window.claude` branch, dead constants, redundant state.
* Bundle fonts locally (web + Mac) for offline use.

---

## 16. REUSABLE COMPONENTS (candidates for a shared SP404 ecosystem)

| Candidate | Where | Readiness |
|---|---|---|
| **Design tokens** (7 colours, fonts, radii/border conventions) | `:root`, CSS | Easy to extract; needs spacing/type tokens added |
| **Pixel UI kit** (pill, tile, chip, panel, stat tile, meter, drop zone, topbar) | CSS classes | Reusable CSS, no JS dependency |
| **Knob** | `makeKnob` (`:2200`) | Near-ready (depends only on `tr` for labels) |
| **Waveform viewport + overview + ruler** | Chop view code (`:1383-1620`) | Needs decoupling from `state`/`els` |
| **Audio analysis**: `detectTempo`, `autoChopTransient`, `findZeroCrossing`, `computePeaks` | Chop | Pure-ish; need `state` removed from signatures |
| **WAV/ZIP utilities** | `encodeWav16`, `MiniZip`, `crc32`, `downloadFile` | Ready (add ZIP64/streaming, `smpl` chunk later) |
| **Beat-grid math** (`drawGrid`, `makeBeatLoops`) | Chop | Easy to extract |
| **I18N helper** (`tr`, plural rules for RU) | `:671-855` | Reusable; catalogue should move out |
| **Mac packaging scripts** | `mac/` | Reusable for any single-HTML app |
| **Pad grid** | — | **Does not exist** |
| **SP-404 device definitions** | — | **Does not exist** |
| **Sample/project metadata & format** | — | **Does not exist** |
| **Key detection** | — | **Does not exist** |
| **Normalization / export presets** | — | **Does not exist** |

---

## 17. SCREEN INVENTORY

| Screen | ID / location | Purpose |
|---|---|---|
| **Home** | `#screenHome` (`:446`) | Logo, wordmark, tag "Sample Prep · SP-404MKII", two nav tiles (Convert, Chop / Loop), privacy/flow note, footer with version `v1.1.0`. |
| **Convert** | `#screenConvert` (`:486`) | Drop files/folders; live stats, segmented progress meter, per-file log, summary line, Clear, Download ZIP. |
| **Chop / Loop – empty** | `#chopDrop` (`:536`) | Drop one track. |
| **Chop / Loop – workspace** | `#chopWorkspace` | "Load another track"; toolbar (play, zoom −/+, +M, snap, filename); waveform; overview; knob panel (ZOOM/SCRUB/HEIGHT + Fit/Zoom to sample/Follow/Height); hints + key legend; mode row (Transient/Equal/Manual/Beats) with its panel; samples count + chip row; Play Sample / Loop; Export Selected / Export All. |
| Overlay | EN/RU switch (`#langSwitch`) | Language toggle on every screen. |

No settings, library, project, tutorial, help or about screens exist.

---

## 18. USER FLOW (current, actual)

**Primary: prepare a loop for the sampler**
1. Launch Mac app (or open the web page) → Home.
2. Tap **Chop / Loop** → drop a track (decoded in the browser; header shows duration · channels · rate).
3. Pick **Beats** (tempo auto-detected on entry; fix with ÷2/×2 or "Beat 1 = playhead"), choose loop length, press **Make Loops** — or **Transient** → **Auto Chop**, adjust **Sensitivity**; or **Equal**/**Manual**.
4. Tap sample chips: each plays immediately and the waveform zooms to it (tap again to stop); fine-tune markers (drag tabs, snap on).
5. **Export Sample NN** (one WAV) or **Export All (N)** (ZIP).
6. Manually copy the files to the sampler's SD card.

**Secondary: convert a folder** — Home → **Convert** → drop folder → wait for meter → **Download ZIP** → copy to SD card.

There is no step that talks to the device, saves a project, or names samples after the source.

---

## 19. BUILD & RUN

**Web (no build):** open `web/index.html` in a modern Chromium-based browser (Chrome/Edge best; Firefox/Safari work but folder-drop is limited). Internet is needed only for fonts. Hosted via GitHub Pages at `https://punkpozer.github.io/SP404-DROP/web/index.html` (link in `README.md`).

**Mac app:** requires macOS, Node.js + npm (Node 24 was used here), Xcode command-line tools for `codesign`/`hdiutil`.
```bash
cd mac
./build.sh            # arm64 (default); also: x64 | universal   → mac/dist/
./make-dmg.sh         # universal DMG (default) → mac/dist/SP404-DROP-<version>-universal.dmg
```
`build.sh` runs `npm install` if `node_modules` is missing, copies `web/index.html` + `icon.svg`, then `@electron/packager` with `--app-bundle-id=com.sp404drop.app` and `icon.icns`. `make-dmg.sh` signs ad-hoc (not a Developer ID), builds the DMG in a temp dir (iCloud-synced folders re-add Finder attributes that break `codesign`), and ships a bilingual first-run note. Release asset on GitHub: `v1.1.0` → `SP404-DROP-1.1.0-universal.dmg` (239 MB).

**CLI:** Python 3, `pip install ffmpeg-python`, `ffmpeg` on PATH (only `convertor.py`); `python3 cli/<script>.py <directory>` (each asks `y/n`, edits files in place).

**Tests / CI / lint:** none.

---

## 20. REPOSITORY HEALTH (1–10)

| Dimension | Score | Why |
|---|---|---|
| **Architecture** | **4** | Pragmatic for a utility (no deps, offline, clear module intents), but everything lives in one file with direct DOM coupling; no layers a second app could consume; no data model. |
| **Code quality** | **6** | Readable, commented where decisions are non-obvious, consistent style, DSP is compact and correct on tests used. Held back by long functions, redundant state, dead code, no tests, a latent CLI crash. |
| **UI consistency** | **8** | Strong, coherent hardware-inspired language (tokens, inversion for state, dashed drop zones, pixel type). Lost points for hard-coded colour duplicates, no spacing/type tokens, unicode-glyph icons. |
| **Performance** | **6** | Waveform rendering scales well; analysis/export/ZIP are synchronous, in-memory, and unprofiled — fine for typical samples, risky for 10-minute+ tracks or large folders. |
| **Maintainability** | **4** | One 2,500-line file, no tests/CI, no module system; changes are safe only because the author knows the file. Docs and changelog are good. |
| **Feature completeness** | **5** | The two core jobs (convert, chop/loop) work well. Missing relative to an SP-404MKII ecosystem: key detection, normalization, loop-point metadata, device/pad/project model, persistence, naming/export presets, tutorials. |

---

## 21. RECOMMENDED NEXT STEPS (not implemented; preserve working behaviour)

1. **Freeze current behaviour with regression tests** before touching code: a Node/headless test harness for `encodeWav16`, `MiniZip` (verify archives with a real unzip), `detectTempo`, `autoChopTransient`, `findZeroCrossing`, plus a smoke script that loads a synthetic WAV and runs each Chop mode. (No production change.)
2. **Define the shared contracts on paper first**: a versioned JSON **sample/project schema** (source file reference, BPM, key, markers/loop points, export settings) and the module boundaries (`audio-core`, `waveform-view`, `ui-kit`, `device-sp404`). Decide what the ecosystem actually shares before moving anything.
3. **Extract design tokens** (colours, fonts, radii, borders, spacing, type scale) into one source consumed by CSS and by the canvas code; keep the visual result identical.
4. **Fix the small correctness issues without redesign**: export error handling + progress, source-name-aware export filenames, remove dead code, decode-rate/double-resampling decision, multichannel zero-crossing/transient analysis, CLI `None.replace` crash.
5. **Separate pure DSP from UI** by extracting `detectTempo`, `autoChopTransient`, `findZeroCrossing`, `computePeaks`, `encodeWav16`, `MiniZip` into plain functions that take buffers and return data (still concatenated into the single-file build).
6. **Move heavy work off the main thread** (Web Worker for analysis + export; streaming ZIP, ZIP64) — after step 1 gives a safety net.
7. **Verify SP-404MKII requirements against the official manual** (supported formats/bit depths/sample rates, filename limits, folder layout, loop/metadata handling) and encode them as a **device definition** (`device-sp404mk2.json`) rather than constants scattered in code; then add export presets that use it.
8. **Add the missing audio features the ecosystem will want, one at a time**: key detection, optional normalization/fades, loop-point (`smpl`) metadata in exports — each behind its own module and tests.
9. **Introduce persistence** (IndexedDB or File System Access) using the schema from step 2; add basic project save/load and recent files; keep the current "drop and go" flow as the default.
10. **Release engineering**: CI that runs the tests and builds the DMG; bundle the fonts locally (offline Mac app); plan Developer-ID signing + notarization; keep `THIRD_PARTY_NOTICES.md` and `CHANGELOG.md` updated per release.

---

## Appendix A — Verification of this audit against the current implementation

Performed after writing; each claim class was re-checked against the code, not the README:

* **Counts:** `web/index.html` = 2,498 lines / 135,996 bytes; `<style>` ends `:439`, `<script>` `:667-2495`; 112 entries in the RU dictionary; 22 `pill`-class elements; no `transition`/`animation`/`@keyframes`; no `alert/confirm/prompt`; one `@media`; `localStorage` used only for `sp404drop.lang`; no `fetch`/`XMLHttpRequest`/`Worker`.
* **Feature absence checks:** `grep` for tutorial/footwork, key detection, stems, normalization, pad/bank/project structures → none in source.
* **Dead code claims:** `Chop.reset` has no call sites (`grep "Chop\.\(reset\|stopAll\)"` → only `stopAll`); `PX_PER_SEC_MIN` appears once (declaration, `:1281`); `.dots` appears once (its CSS rule, `:54`, no element uses it).
* **Build claims:** `mac/build.sh`, `mac/make-dmg.sh`, `mac/package.json` read in full; `mac/app/index.html` compared byte-for-byte with `web/index.html` (identical); release asset size confirmed earlier via `gh release view` (239 MB).
* **Not verified / stated as assumptions:** exact SP-404MKII format support (taken from the project's own README), browser codec coverage (AIFF/WMA etc.), Electron's default download/user-data locations, behaviour of `decodeAudioData` channel preservation (spec-based), and the CLI crash (read, not executed). No performance profiling was done.
