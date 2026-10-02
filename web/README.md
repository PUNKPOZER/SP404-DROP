# SP404 DROP (web)

A single self-contained HTML page — no install, no build, no server. Everything
runs client-side (decoding, resampling, re-encoding, waveform analysis, zipping)
and nothing is ever uploaded anywhere.

Open the app and you get three choices: **CONVERT**, **CHOP / LOOP** or **SAMPLES**.

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

- **Waveform** — loads full-width (it's sized to fill the frame, not a sliver on
  a mostly-empty one), click to seek. Zoom with the **−/+** buttons or by
  scrolling/pinching over the waveform itself; it zooms around wherever your
  cursor is, and scrolls when zoomed in.
- **Auto Chop** — three modes, picked with the Transient / Equal / Manual tiles:
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
- Markers can always be fine-tuned afterward, in any mode: drag a marker's tab to
  move it, double-click a tab to delete it.
- **Snap to zero crossing** (the `0⋮` toggle, on by default) nudges a marker to
  the nearest zero crossing so cuts don't click or pop.
- Each region between two markers is a numbered sample (`01`, `02`, …). Tap one
  to select it — the buttons below act on whichever sample is selected:
  - **Play Sample** previews just that region; it turns into **Stop** while
    playing so you can cut it off, rather than only being able to restart it.
  - **Loop** loops the selected region; drag its start/end markers while it's
    playing to dial in a clean loop point by ear.
- **Export Sample NN** saves just the selected sample as one WAV file.
  **Export All (N)** saves every sample as a ZIP, named `sample_01.wav`,
  `sample_02.wav`, … in order — the button labels spell out exactly what each
  one is about to do. Exports are rendered fresh from the source audio at
  16-bit/48kHz — no normalization or other processing.

## SAMPLES / FIND SOURCE

A sample-discovery module inspired by the workflow of sites like WhoSampled. It
does **not** scrape or use any such site's data, and it ships with **no sample
data at all**. Results come only from data providers that have been
licence-checked (see [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md))
and from data you add yourself. If nothing is known it says
`NO SAMPLE INFORMATION FOUND` — nothing is ever guessed.

- **Known samples (SAMPLES screen)** — drop a track; it is fingerprinted on your
  device, the fingerprint is offered to every provider, and any recording that
  matches is shown with the sample relationships the provider holds for it
  (source artist/track/year, sampled section, type, timestamp, confidence,
  provenance, reference link). Matching uses the audio, never the filename.
- **Find Source (Chop screen)** — select a sample and press **Find Source** to
  compare that region against the recordings in the local database. It needs
  about 2 seconds or more, only reports a match with enough evidence, and shows
  a LOW / MEDIUM / HIGH label plus the raw evidence (aligned hits, share of the
  region). It is experimental and finds near-verbatim reuse; pitched, stretched
  or heavily processed samples usually will not match.
- **Local database** — stores fingerprints (hashes + times) and metadata only,
  never audio, in your browser (IndexedDB). Add a track you have the right to
  fingerprint with **+ Add this track**, record what it samples with
  **+ Add known sample**, and move data between browsers with Import / Export
  JSON (format `sp404drop-sampledb` v1).

### Architecture

```
audio -> fingerprint engine -> SampleProvider(s) -> results
```

Everything lives in the `SampleFinder` module in `index.html`, in four layers:
fingerprint engine, the `SampleProvider` interface (documented in the code),
providers, and UI. Providers: `LocalSampleDatabaseProvider` (working),
`LicensedAPIProvider` (placeholder, unconfigured, no network access). To add a
data source, write a provider object and call
`SampleFinder.registerProvider(...)`; the rest of the app is untouched. Review
its licence and add it to `THIRD_PARTY_NOTICES.md` first.

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
