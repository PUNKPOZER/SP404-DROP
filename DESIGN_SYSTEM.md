# SP SYSTEM — design system (as implemented in SP404 DROP)

Working name of the visual language shared by **SP404 DROP** and **SP-404 LEARN**. It is an internal name: no repository, package id,
project format or release name uses it. This document describes what is **actually in the code** of DROP at the time of writing.

* Tokens + shared components: [`web/sp-system.css`](web/sp-system.css) (product-neutral; LEARN can consume the same file)
* DROP layout on top of them: [`web/drop.css`](web/drop.css)
* Icons + brand symbol: [`web/assets/`](web/assets/) → inlined into `web/index.html` by `npm run sync-assets`
* Concept in one line: **precision hardware UI + playful printed vector graphics.** The interface is calm and structured (paper, ink,
  thin rules, rectangles); colour is an accent that always has a job.

---

## 1. Palette

| Token | Hex | Role |
|---|---|---|
| `--sp-paper` | `#F2F1EC` | page background, "device" surface |
| `--sp-ink` | `#191918` | text, borders, waveform, inverted (active) states |
| `--sp-red` | `#FF2A1A` | **Signal Red** — primary action, selection, active pad, error status. DROP's dominant accent |
| `--sp-blue` | `#1265F5` | **Electric Blue** — keyboard focus, playing pad outline, viewport box, progress, *busy* status. LEARN's primary navigation accent |
| `--sp-green` | `#718A35` | **Moss Green** — success/ok status only |

Derived neutrals (hierarchy only, never decoration): `--sp-white #FBFAF7` (waveform field, inputs), `--sp-paper-2 #E8E6DE` (recessed
panels), `--sp-paper-3 #DAD7CB` (hover/pressed), `--sp-rule #C4C1B4` (hairlines, minor grid), `--sp-ink-2 #4A4944` (secondary text),
`--sp-ink-3 #66645D` (tertiary text), `--sp-red-ink #B8140A` and `--sp-green-ink #566A27` (the accents darkened **only** for use as text).

Measured contrast (WCAG ratio): ink/paper 15.6 · ink-2/paper 8.0 · ink-3/paper 5.2 · **ink on red 4.7** · red-ink/paper 5.9 · green-ink/paper 5.3 ·
paper on blue 4.4 (use ≥ 12 px bold) · pure red or blue **as text on paper is not allowed** (3.3 / 4.4). On red surfaces text is always ink.

**Rules.** Most of the screen stays paper + ink. Do not make every button red: red = *the* primary action of a view, a selected
slice/pad, an error. Blue/green appear only when they communicate a secondary state. State is never colour-only: selection also inverts,
changes weight or adds an outline; errors carry an icon and text. No gradients, glass, glow, heavy shadows (a test enforces "no gradients").

## 2. Typography

| Role | Token | Stack | Used for |
|---|---|---|---|
| Display / hardware | `--sp-font-display` | DIN Condensed → Avenir Next Condensed → Bahnschrift → Arial Narrow → Helvetica Neue → Arial | headings, BPM and numeric readouts, pad numbers, hero title |
| UI / information | `--sp-font-ui` | system sans (SF Pro / Segoe UI / Inter / Helvetica Neue) | controls, paragraphs, metadata |
| Technical | `--sp-font-mono` | ui-monospace / SF Mono / Menlo / Consolas | timecodes, file names, log lines, ruler |

No web fonts are loaded (the previous Google Fonts dependency was removed → the app is fully offline). **No pixel font** is used.
Sizes: `--sp-text-2xs 10` · `xs 11` · `sm 12` · `md 14` · `lg 16` · `xl 22` · `2xl 32` · `display clamp(34px,7vw,64px)`; caps tracking `.06em`.
Display text is uppercase via `.sp-display` or component rules.

## 3. Spacing, radius, borders, sizes

* Spacing (4 px base): `--sp-space-1…7` = 4 · 8 · 12 · 16 · 24 · 32 · 48.
* Radius (restrained — it is a tool, not a card deck): `--sp-radius-1 2px` · `-2 4px` · `-3 6px`; `--sp-radius-pill` only for meters/switches.
* Borders: `--sp-border-w 2px` (controls, panels) · `-thin 1px` (rules) · `-heavy 3px` (header rule, dashed drop zones). Colour: `--sp-border` = ink.
* Control height `--sp-control-h 40px` (small `32px`), minimum target `--sp-hit 40px`.
* Pads: `--sp-pad-gap 8px`, preferred size `--sp-pad-size 72px` (the grid shrinks to its container), radius `--sp-pad-radius`.

## 4. Motion, z-index, focus

* Motion is hardware-like: `--sp-dur-fast 70ms`, `--sp-dur 130ms`, `--sp-ease cubic-bezier(.2,0,0,1)`; used only for state changes (hover/press/selection),
  never decorative. `prefers-reduced-motion: reduce` collapses every transition/animation.
* z-index: `--sp-z-base 1` · `sticky 10` · `overlay 20` · `toast 30`.
* Focus: every interactive element shows a **3 px Electric-Blue outline with 2 px offset** on `:focus-visible` (token `--sp-focus`).

## 5. Components (class names are the contract)

| Component | Classes / markup | States |
|---|---|---|
| Button | `.sp-btn` (+ `.primary` red, `.solid` ink, `.sm`, `.icon`, `.block`) | hover, active (1 px press), `:disabled` (38 % opacity), `.on` / `aria-pressed="true"` (inverted) |
| Tile / segmented option | `.sp-tile` (mode selectors, quick actions, split/loop-length options) | `.active` / `aria-pressed="true"` inverted |
| Panel | `.sp-panel`, `.sp-panel.plain`, `.sp-rule`, `.sp-label` | — |
| Drop zone | `.sp-drop` (dashed 3 px) | `.drag-over` (red, solid) |
| Stat tile | `.sp-stat` (`.num` display, `.lbl`) | `.alert` (red) |
| Meter | `.sp-meter` of 26 `<i>` segments (`role="progressbar"`) | `i.on` (blue = progress) |
| **Pad grid** | `.sp-pad-grid` > 16 × `button.sp-pad` (`.p` pad id, `.n` number, `.m` meta) | `aria-pressed` (selected = red), `.playing` (blue inset outline), `:disabled` (dashed, empty) |
| Form | `.sp-input` (display numerals), `input.sp-range` (square thumb) | — |
| Alert / status | `.sp-alert` + `.error` (red edge, `role="alert"`) · `.ok` (green) · `.busy` (blue) | — |
| Icon | `<svg class="sp-icon [fill|sm|lg]"><use href="#i-…"/></svg>` | colour = `currentColor` |
| Knob | `makeKnob()` in `index.html` — SVG body (white, ink stroke), **red needle**, value + name; bounded or endless | drag, wheel, arrow keys, double-click reset, `role="slider"` |
| Header | `.sp-header` > `.sp-brand` (cow mark + `SP404 DROP` + `FOR SP-404MKII`), `.sp-nav`, `.lang` | `.on` + `aria-current="page"` on the active nav button |

### Pad grid contract (shared with LEARN)
One canonical 4×4 CSS grid. Physical order, **pad 1 bottom-left, pad 16 top-right**: rows are `13 14 15 16 / 9 10 11 12 / 5 6 7 8 / 1 2 3 4`
(`SPCore.PAD_ROWS`). DROP maps **slice *i* → bank ⌊i/16⌋, pad (i mod 16)+1**; banks are lettered A, B, C… with a pager, and no slice is ever lost
(`SPCore.padOf / sliceAt / bankCount`, unit-tested). The pad view is a preview/control layer over the slices — it does not talk to the sampler.

### Waveform colour contract
Canvas drawing cannot use CSS directly, so `index.html` reads the tokens once into `COL` (`getComputedStyle`) and draws only with them:
waveform = ink on `--sp-white`; ruler = ink on `--sp-paper-2`; markers = ink (hover → red tab); **selected slice = red band with an ink waveform cut-out**;
playhead = ink with a paper halo (reads on white, red and grid alike); beat grid = rule colour (bars `--sp-ink-3`); overview viewport box = blue.
A test fails if a stray hex colour appears in `index.html`.

## 6. Icons

Source of truth: [`web/assets/icons.svg`](web/assets/icons.svg) — 24 × 24 grid, 2 px stroke, square caps, `currentColor`. Symbols: play, pause, stop, loop,
plus, minus, marker, snap, download, convert, chop, fit, height, chevrons, folder, alert, check. After editing run `npm run sync-assets`, which inlines the
sprite (and the brand symbol `#sp-brand`) into `index.html` between the `sp:sprite` markers (`<use href="file.svg#id">` does not work under `file://` /
Electron). A test verifies the sprite is in sync. Icon-only buttons must have `aria-label` (tested). Unicode glyphs are not used as icons.

## 7. Logo (master brand mark)

* **Master file:** [`design-reference/brand-logo.svg`](design-reference/brand-logo.svg) — the supplied cow-on-a-chair vector. **Never edit it.**
  It contains eight sub-paths: the cow + chair (4) and a registered-mark glyph ® (4 trailing sub-paths, bounding box x 73–199, y 450–571).
* **Production mark:** [`web/assets/brand-logo.svg`](web/assets/brand-logo.svg) — the same file **minus the ® sub-paths**, `fill="currentColor"`.
  The cow/chair path data is byte-identical to the master (a test compares them). No ® appears anywhere in product UI.
* Do not redraw, re-proportion, outline, tilt or replace it (no running-person logo, no other mascot). Scale uniformly only.
* Use: header (36 × 41 px, ink), Home hero (64 × 72 px, ink), app icon (paper on red). Monochrome only (`currentColor`: ink on paper,
  paper on red/ink). Keep clear space ≥ ¼ of the mark's height; minimum size 16 px tall in the header context.
* Wording is neutral: **"FOR SP-404MKII"**. The ecosystem is independent — no Roland logo in product chrome; the footer states
  "Unofficial · not affiliated with Roland".

## 8. App icons

* **SP404 DROP:** Signal Red squircle (824 px in a 1024 canvas, radius 185) + Paper cow-chair mark, mark height 60 % of the shape
  (70 % at ≤ 64 px, 80 % at ≤ 32 px — *spacing only, geometry untouched*).
* **SP-404 LEARN (specification, not built here):** Ink background + Signal Red mark; Paper mark allowed if clearly more legible at 16–32 px.
  Same squircle, same mark ratios → the two icons read as one family.
* Generation: `node scripts/make-icons.js` renders 16/32/64/128/256/512/1024 px PNGs (Chrome headless + `sips`), builds `mac/icon.icns` with
  `iconutil`, writes `web/icon.svg` (also copied to the repo root `icon.svg`) and `build/icons/contact-sheet.html` for size review (`build/` is git-ignored).
  Review at 16, 32, 64, 128, 256, 512 px: the cow is clearly legible from 32 px; at 16 px it is a recognisable red tile with a light silhouette.
* `mac/build.sh` passes `mac/icon.icns` to `@electron/packager`, so packaged builds use it.

## 9. Genre illustration system (for SP-404 LEARN; no genre art in DROP)

One genre → one idea → one SVG. Real, editable vector files committed to the repo; **no photography, no stock, no raster, no AI images, no
gradients, no filters, no base64**. Clean `viewBox`, `currentColor`/token fills, readable at small card size, **no decorative objects around the symbol**.
Two sanctioned languages that must read as one family (same weight, palette, canvas, level of simplification):
* **A — naïve silhouette:** one filled, slightly imperfect organic shape, minimal/no internal detail.
* **B — technical line graphic:** simple strokes, grid, signal lines, geometry; no labels or numbers.

Initial concepts: Footwork/Juke → moving legs/sneakers (Red) · Jungle → one palm tree (Green) · UK Garage → simplified Big Ben (Blue) ·
Hip-hop → one graffiti piece (Ink or Red) · House → one house (Red) · Techno → factory silhouette (Ink) · Breakbeat → broken vinyl (Red/Blue) ·
Ambient → spatial/sound-field line diagram (Blue, optional Green). Extra existing courses get equally simple single-idea symbols.

## 10. Accessibility checklist (enforced where testable)

Real `<button>`s for everything clickable (mode tiles, chips, pads); visible blue focus ring; icon-only controls labelled; pads have descriptive
`aria-label`s ("Slice 3, pad A3, 2.00 seconds"); status regions (`role="status"`/`"alert"`); no colour-only meaning; targets ≥ 32–40 px; reduced-motion honoured;
English/Russian strings for every static and dynamic string (a test fails on a missing RU entry).

## 11. Using SP SYSTEM in another app

Link `sp-system.css` (tokens + components) and build the product layout in its own file (`drop.css` is the example). Do not fork the tokens; if a
token must change, change it here and in the other app together. SP-404 LEARN's categorical colours (drum voices, sections, stems) must be mapped onto
paper/ink + red/blue/green plus shape, pattern, label or letter codes — not new hues. The pad grid and (planned) device diagram are the shared visual bridge.

## 12. What this document does *not* cover (future)

A framework migration (React/TypeScript for DROP), a published token package, JSON token export, dark theme, the SP-404 device diagram component, and
the LEARN implementation are **future phases**; nothing here pretends they exist.
