# SP404 STOOL (web)

A single self-contained HTML page — no install, no build, no server. Everything
runs client-side (decoding, resampling, re-encoding, waveform analysis, zipping)
and nothing is ever uploaded anywhere.

Open the app and you get two choices: **CONVERT** or **CHOP / LOOP**.

## CONVERT

Batch-fixes a folder of samples to **16-bit / 48kHz PCM WAV**, the format the
SP-404 wants. Files that are already in that format are left untouched (no
re-encoding, no re-compression, no loudness changes).

- Drop in individual files or a whole folder (subfolders included).
- Each file is checked: already 16-bit/48kHz PCM WAV? Kept as-is. Anything else
  (44.1kHz WAVs, MP3, AIFF, FLAC, OGG, …) gets decoded and re-encoded, same
  channel count as the source.
- Analysis starts automatically the moment you drop files — no extra click.
- Live status tiles at the top show tracks found / converted OK / already fine /
  failed, with a per-file log underneath.
- Everything gets packed into a ZIP (plus a `CONVERSION_REPORT.txt`) and offered
  as a download, preserving folder structure.
- Files that fail to decode (corrupted, or a codec the browser doesn't support)
  are skipped and reported, not silently dropped.

## CHOP / LOOP

Load one track at a time and slice it into numbered samples:

- **Waveform** — loads full-width, click to seek, zoom in/out, scroll when zoomed.
- **Auto Chop** — three modes:
  - **Transient** — detects attacks/onsets in the signal and drops a marker at
    each one. A **Sensitivity** slider controls how many cut points you get.
  - **Equal** — splits the track into 4 / 8 / 16 / 32 equal parts.
  - **Manual** — toggle **M**, then click the waveform to drop markers yourself.
- Markers can always be fine-tuned afterward, in any mode: drag a marker's tab to
  move it, double-click to delete it, or add more.
- **Snap to zero crossing** (on by default, toggle in the toolbar) nudges a
  marker to the nearest zero crossing so cuts don't click or pop.
- Each region between two markers is a numbered sample (`01`, `02`, …). Click one
  to select it, **Play Sample** previews just that region.
- **Loop** a selected region and drag its start/end while it's playing to dial in
  a clean loop point by ear.
- **Export Selected** downloads the current sample as `sample_NN.wav`.
  **Export All** downloads every sample as a ZIP, named `sample_01.wav`,
  `sample_02.wav`, … in order. Exports are rendered fresh from the source audio at
  16-bit/48kHz — no normalization or other processing.

## Using it

Just open [`index.html`](index.html) in a modern desktop browser (Chrome, Edge, or
another Chromium-based browser gives you full folder drag-and-drop on the CONVERT
screen; Firefox and Safari work too, but folder drops fall back to a flat file
list there — use the file picker instead if you need to select many files at once).

You can also host it for free with **GitHub Pages**:

1. Push this repo to GitHub.
2. Repo Settings → Pages → Deploy from a branch → pick `main` and the `/web` folder
   (or `/root` if you move `index.html` there) → Save.
3. GitHub gives you a `https://<user>.github.io/<repo>/` URL you can bookmark or share.

## Notes

- Very large libraries (many thousands of files, or many GB) may be slow and
  memory-heavy on the CONVERT screen, since everything is held in memory before
  zipping — this is a browser tool, not a batch server job.
- No build step, no dependencies. It's one HTML file with inline CSS/JS, the Web
  Audio API for decoding/resampling/playback, and a tiny hand-written ZIP writer
  (uncompressed/STORE — samples don't compress well anyway, and it keeps the whole
  thing dependency-free).
