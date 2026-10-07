# DESIGN_IMPLEMENTATION_PLAN — SP404 DROP × SP SYSTEM

Scope: restyle and restructure **SP404 DROP** (web app + Electron Mac shell) into the first product of the **SP SYSTEM** design language,
without touching DSP behaviour. SP-404 LEARN is out of scope for this task (it will consume the same tokens/components later).

Source of truth: `PROJECT_AUDIT.md` (read in full; compared with the current tree at `2aa1a48`: `web/index.html` 2,498 lines, `mac/`, `cli/`).
Branch: `design/sp-system` (from `main`). Nothing is merged with the LEARN repo.

## 0. Inputs and one deviation to flag
- `/design-reference/` was **not present** in the repository or on the disk. The owner pointed to `~/Downloads/LOGO.svg` (947×1072 single path,
  `fill="#F4F4F4"`) as the cow-on-chair brand symbol. It is copied **byte-for-byte** to `design-reference/brand-logo.svg`; its path data is never edited.
  Recolouring happens only through the `fill` attribute (`currentColor`) at the point of use.
- No other reference files were supplied; the visual direction is taken from the written brief.

## 1. Files to change / create

**Create**
| File | Purpose |
|---|---|
| `design-reference/brand-logo.svg` | Verbatim brand symbol (source of truth) |
| `web/sp-system.css` | SP SYSTEM tokens (`--sp-*`) + shared component styles (buttons, tiles, pads, panels, drop zones, meter, focus) |
| `web/sp-core.js` | Pure, DOM-free helpers extracted **verbatim** from `index.html`: `encodeWav16`, `crc32`, `MiniZip`; plus new pure helpers (export names, pad/bank mapping) — UMD so the browser and Node tests share one file |
| `web/assets/brand-logo.svg` | Runtime copy of the brand symbol (`fill="currentColor"` only) |
| `web/assets/icons.svg` | SVG sprite (`<symbol>`s) replacing Unicode glyph icons |
| `web/icon.svg` | New DROP favicon/app-icon source (Signal Red field + Paper cow, path reused unchanged) |
| `scripts/sync-assets.js` | Injects the sprite + brand symbol into `index.html` between markers (needed because `<use href="file.svg#id">` fails under `file://`/Electron) |
| `scripts/make-icons.py` | Rasterises the brand path to PNGs (16…1024 px) and builds `mac/icon.icns` with `iconutil` (numpy only) |
| `web/test/*.test.js`, root `package.json` | Node built-in test runner (`node --test`) — no dependencies |
| `DESIGN_SYSTEM.md` | Documentation of the result (final step) |

**Change**
| File | Change |
|---|---|
| `web/index.html` | Remove Google Fonts + old running-person logo; link `sp-system.css`/`sp-core.js`; new responsive shell (header with cow logo, "FOR SP-404MKII", EN/RU); Home drop area + quick actions; restyled Convert/Chop; 4×4 slice pad preview; SVG icons; ARIA/keyboard fixes; canvas colours read from tokens; explicit export errors/progress; source-aware export names; EN/RU strings for every new string; `prefers-reduced-motion` |
| `mac/build.sh` | Copy `web/*` assets (css/js/assets/icon) instead of only `index.html`+`icon.svg` |
| `mac/app/main.js` | Window size/background colour only (paper) |
| `mac/icon.icns` | Regenerated DROP icon |
| `.gitignore` | Ignore copied web assets in `mac/app/` |
| `README.md`, `web/README.md`, `CHANGELOG.md`, `THIRD_PARTY_NOTICES.md` | Document new files, offline fonts (no Google Fonts), tests, filenames |

## 2. Components to create (CSS + tiny JS, no framework)
`.sp-btn` family (restyled `.pill`, `.icon-btn`), `.sp-tile` (mode/action tile), `.sp-pad` + `.sp-pad-grid` (4×4, CSS Grid, 1 = bottom-left),
`.sp-bank` pager, `.sp-panel`, `.sp-drop`, `.sp-meter`, `.sp-stat`, `.sp-field`, `Icon`/brand symbol via `<use>`, status/alert banner (`role="alert"`).
Existing class names used by JS (`.pill`, `.icon-btn`, `.mode-tile`, `.part-chip`, `.sample-chip`, `.marker-handle`, …) keep working; they are re-skinned,
not renamed, wherever JS queries them.

## 3. Components / systems to preserve (behaviour must not change)
Viewport waveform renderer (`view`, `setView`, `zoomAround`, `columnRange`, `tracePath`, overview, ruler, gestures, knobs), transient/equal/manual/beats chopping,
`detectTempo`, `findZeroCrossing`, marker model (`markers → segments()`), audition/loop (`selectSample`, `playSegment`, `startLoop`), keyboard shortcuts,
Convert pipeline (WAV sniff, decode → 16/48, ZIP, report), `makeKnob`, EN/RU mechanism (English text = key), Mac packaging scripts.

## 4. Migration order (each step ends with tests + a manual smoke check; commit per step)
1. **Safety net**: `sp-core.js` extracted verbatim → Node tests (WAV bytes, CRC32, ZIP validity via `unzip -t`) → index.html uses it. *No visual change.*
2. **Tokens**: `sp-system.css` with palette/spacing/radius/type/control/pad/motion/z-index/focus tokens; remove web-font dependency; map old variables to tokens.
3. **Assets**: copy brand logo; icon sprite; `scripts/sync-assets.js`; replace Unicode glyphs and the old logo.
4. **Shell + Home**: new responsive layout, header, Home drop area with CONVERT / CHOP-LOOP actions (real pending-file state, no fake recents).
5. **Convert** restyle + explicit error states.
6. **Chop** restyle (waveform dominant; mode tiles; contextual panels; transport; export) + canvas colours from tokens.
7. **4×4 pad preview** over existing segments with banks of 16; keyboard-reachable.
8. **Quality fixes** (export errors/progress, source-aware filenames, focus/keyboard, responsive, reduced motion).
9. **Icons + packaging**: DROP icon assets, `mac/build.sh`/`main.js`, build an arm64 `.app`.
10. **Docs**: `DESIGN_SYSTEM.md`, README/CHANGELOG/notices.
11. **Verification** against the acceptance list (browser smoke tests of Convert, every Chop mode, audition/loop, WAV/ZIP export, EN/RU, pads).

## 5. Risks
| Risk | Mitigation |
|---|---|
| Re-skinning breaks selectors the JS relies on | Keep class/ID names; change CSS only; smoke-test every control |
| Extracting `encodeWav16`/`MiniZip` changes bytes | Extract verbatim; golden-byte tests before and after |
| Canvas drawing colours drift from CSS tokens | Single `COL` object filled from `getComputedStyle` at start/theme change |
| RU strings missing for new UI | Every new string added to `RU`; a test asserts that all `data-i18n`-less static strings exist in `RU` |
| Brand SVG distorted | Used only via `viewBox`/CSS size, never edited; `cmp` check against `design-reference/brand-logo.svg` in tests |
| Icon unreadable at 16 px | Dedicated padding/crop treatment (scale only), PNGs inspected at all sizes |
| Missing fonts on other OSes (display face) | Stack with system condensed faces + sane fallbacks; layout tolerant to width differences |
| Electron build needs network/cache | Electron zip is already cached locally; if the build fails it is reported, not hidden |
| Single-file → multi-file hosting | GitHub Pages and Electron both serve relative files; `build.sh` copies them |

## 6. Rollback
All work lives on `design/sp-system` in small commits (one per migration step). Rollback = `git revert <commit>` for one step, or abandon the branch;
`main` and the released `v1.1.0` DMG are untouched. Old `index.html` remains in git history. The extraction step keeps the old inline functions
until the tests pass, then removes them in the same commit.

## 7. Explicitly NOT changed
DSP/analysis algorithms and thresholds; WAV/ZIP byte format; marker/segment model; keyboard shortcut set; EN/RU mechanism and persisted key;
Convert pipeline logic; CLI scripts; Electron security settings (sandbox, contextIsolation, no preload); release versioning scheme; repo structure
(no merge with SP-404 LEARN, no framework migration, no Web Workers, no Demucs/stems, no course system, no new audio features).
A framework migration is documented as a **future phase** only (see `DESIGN_SYSTEM.md`).


## 8. Status log (updated at the end of implementation)
Implemented as planned, in order: safety net (`sp-core.js` + Node tests) → tokens → assets/sprite → shell + Home → Convert → Chop → pad preview → quality
fixes → icons + packaging → docs → verification. Differences from the plan above:
* **® glyph.** The owner decided to remove it from product UI. `design-reference/brand-logo.svg` stays byte-identical to the supplied file; the production mark
  `web/assets/brand-logo.svg` is that file **minus its four trailing ® sub-paths** (cow/chair path data unchanged — a test compares them). The earlier line
  "its path data is never edited" applies to the master file.
* **Icon rasteriser.** `scripts/make-icons.js` (Node + Chrome headless + `sips`/`iconutil`) replaced the planned numpy script.
* **i18n test.** Implemented as a static check of static strings and `tr()` keys against the `RU` dictionary rather than a runtime test.
* Not done (explicitly out of scope): framework migration, Web Workers, LEARN implementation, SP-404 device diagram component.
