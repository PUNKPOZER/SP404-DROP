# Changelog

## Unreleased — SP SYSTEM redesign

- **`.spsystem` interchange foundation (Phase 1a, no UI yet):** vendored canonical spec snapshot (`sp-system-spec/`, `SPEC_HASH`),
  schema validator, hardened package reader/writer (path/symlink/executable/zip-bomb/size checks, raw copy-through of
  LEARN-owned and unknown data), project model (stable ids, chops/samples/pads/loops serialisation, revision + conflict state),
  atomic Node save adapter, round-trip fixtures. Findings for the spec owner: `SP_SYSTEM_SCHEMA_ISSUES.md`.

- **App shell matched to the SP SYSTEM reference board:** dark top strip, ink sidebar (Drop / Convert / Chop-Loop, language, About) with a red active tab,
  heavy grotesk titles, a fixed *Output* panel with the red CONVERT button, tiles, and a real "This session" file list; About screen.
- **New visual language (SP SYSTEM):** paper + ink with Signal Red / Electric Blue /
  Moss Green accents, system condensed + sans + mono type, thin rules, restrained
  radii, hardware-like motion. Tokens in `web/sp-system.css`; documented in
  `DESIGN_SYSTEM.md`.
- **New brand:** the cow-on-a-chair mark replaces the old logo (production copy
  without the ® glyph); new DROP app icon (red field, paper mark) at 16–1024 px.
- **New Home:** one big "Drop audio files here" area with a real pending-files
  state, Chop / Loop and Convert actions, no fake recents.
- **4×4 pad preview** of the slices with banks of 16; pad = select + audition.
- **Export:** explicit busy / success / error status with progress; files are named
  after the source (`<track>_NN.wav`, `SP404-DROP-<track>.zip`).
- Convert and Chop restyled (waveform stays dominant); SVG icon sprite instead of
  Unicode glyphs; keyboard focus ring, labelled icon buttons, reduced-motion support,
  responsive layout. A drop that misses a drop zone no longer opens the file.
- Fonts are no longer loaded from Google (fully offline). The Mac build now copies the
  CSS/JS/assets next to `main.js`.
- Dev: `npm test` runs unit + static checks (`web/test`); `npm run sync-assets`
  syncs the icon sprite; `node scripts/make-icons.js` regenerates the icons.
- Unchanged: all DSP (transient/beat detection, zero-crossing snap), the marker/slice
  model, keyboard shortcuts, WAV/ZIP byte format, EN/RU switching.

## 1.1.0

- **Chop / Loop waveform rebuilt.** Continuous zoom from the whole track down to
  single samples, drag-to-scroll, wheel/pinch zoom, a time ruler, an overview
  strip, ZOOM / SCRUB / HEIGHT knobs, Fit / Follow / taller view, keyboard
  shortcuts, and marker drag that scrolls at the edges.
- **Beats mode.** Tempo and beat detection, a beat grid, and *Make Loops* every
  1 beat / 2 beats / 1–4 bars.
- **Tap a sample to hear it**, tap again to stop. *Zoom to sample* is an
  always-on toggle that frames each sample you pick.
- **Load another track** button in Chop.
- **English / Russian** language switch.
- **Mac app**: build a native `SP404 DROP.app` with `mac/build.sh`.
- The experimental Samples (sample-lookup) screen was removed again.

## 1.0.0

- Convert (batch to 16-bit / 48 kHz WAV) and Chop / Loop (transient / equal /
  manual chopping, loop preview, export).
