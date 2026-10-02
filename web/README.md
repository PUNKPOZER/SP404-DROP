# SP404 DROP (web)

A single self-contained HTML page — no install, no build, no server. Everything
runs client-side (decoding, resampling, re-encoding, waveform analysis, zipping).
Nothing is ever uploaded; the only network use is loading the fonts.

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

- **Waveform** — a viewport onto the track with a time ruler, the beat grid and
  numbered samples drawn on it. Move around any way you like:
  - **drag** the waveform to scroll; **click** to seek (or to drop a marker in
    add-marker mode); **scroll wheel / pinch** zooms around the cursor, and
    sideways scrolling or Shift+wheel pans;
  - the **overview strip** under it shows the whole track — drag the box to jump
    anywhere;
  - three **knobs**: **ZOOM** (continuous, from the whole track down to individual
    samples), **SCRUB** (an endless jog wheel — turn it to travel along the
    track) and **HEIGHT** (waveform gain, so quiet audio is readable). Drag them,
    scroll over them, or focus and use the arrow keys; double-click resets;
  - **Fit** shows the whole track, **Zoom to sample** frames the selected
    sample, **Follow** keeps the playhead in view while playing, **↕ Height**
    makes the waveform taller;
  - dragging a marker near the edge scrolls the view so it can be carried far.
- **Keys** — Space play, M marker at the playhead, Del remove the nearest
  marker, ← → scroll, + − zoom, 0 fit, S zoom to sample, `,` `.` previous/next
  sample (plays it), Enter play sample, L loop.
- **Auto Chop** — four modes, picked with the Transient / Equal / Manual / Beats tiles:
  - **Transient** — detects attacks/onsets in the signal and drops a marker at
    each one. The **Sensitivity** slider controls how many cut points you get —
    drag it after a first Auto Chop and the markers update live, so you can see
    the effect immediately instead of guessing and re-clicking.
  - **Equal** — splits the track into 4 / 8 / 16 / 32 equal parts.
  - **Manual** — click anywhere on the waveform to drop a marker there. Picking
    this tab turns on add-a-marker-by-clicking automatically, no extra toggle
    to find first (the dashed border and crosshair cursor confirm it's on). A
    **+M** button in the toolbar offers the same add-on-click behavior as a
    quick override while in Transient/Equal, e.g. to hand-place one extra point
    after an auto-chop.
  - **Beats** — the auto-loop mode. It detects the tempo (BPM) and where the
    beats fall, draws a beat grid over the waveform, and **Make Loops** drops
    markers on it every 1 beat / 2 beats / 1 bar / 2 bars / 4 bars. Detection can
    land on half or double the real tempo (common with fast music): use **÷2** /
    **×2**, type the BPM, or set **Beat 1 = playhead** on a downbeat to line the
    grid up by hand.
- Markers can always be fine-tuned afterward, in any mode: drag a marker's tab to
  move it, double-click a tab to delete it.
- **Snap to zero crossing** (the `0⋮` toggle, on by default) nudges a marker to
  the nearest zero crossing so cuts don't click or pop.
- **Load another track** replaces the loaded one at any time.
- Each region between two markers is a numbered sample (`01`, `02`, …). **Tap
  one and it plays straight away; tap it again to stop.** Tapping another while
  one is playing switches to it. The waveform follows: with **Zoom to sample**
  on (the default — it is a toggle), every sample you pick is zoomed to fill the
  view; turn it off to keep your own zoom (the sample is still scrolled into
  view). The buttons below act on whichever sample is selected:
  - **Play Sample** previews just that region; it turns into **Stop** while
    playing so you can cut it off, rather than only being able to restart it.
  - **Loop** loops the selected region; drag its start/end markers while it's
    playing to dial in a clean loop point by ear.
- **Export Sample NN** saves just the selected sample as one WAV file.
  **Export All (N)** saves every sample as a ZIP, named `sample_01.wav`,
  `sample_02.wav`, … in order — the button labels spell out exactly what each
  one is about to do. Exports are rendered fresh from the source audio at
  16-bit/48kHz — no normalization or other processing.

## Language

The **EN / RU** switch in the top-right corner translates the whole app. It
defaults to your browser language and remembers your choice.

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
