# SP-404 WAV Converter (web)

A single self-contained HTML page that converts audio samples to the format the
Roland SP-404 wants: **16-bit / 48kHz PCM WAV**. Everything runs client-side —
decoding, resampling, re-encoding and zipping all happen in your browser. Nothing
is uploaded anywhere.

## Using it

Just open [`index.html`](index.html) in a modern desktop browser (Chrome, Edge, or
another Chromium-based browser gives you full folder drag-and-drop; Firefox and
Safari work too, but folder drops fall back to a flat file list — use the file
picker instead if you need to select many files at once).

You can also host it for free with **GitHub Pages**:

1. Push this repo to GitHub.
2. Repo Settings → Pages → Deploy from a branch → pick `main` and the `/web` folder
   (or `/root` if you move `index.html` there) → Save.
3. GitHub gives you a `https://<user>.github.io/<repo>/` URL you can bookmark or share.

## What it does

- Drop in individual files or a whole folder (subfolders included).
- Each file is checked: already 16-bit/48kHz PCM WAV? It's kept as-is. Anything
  else (44.1kHz WAVs, MP3, AIFF, FLAC, OGG, …) gets decoded and re-encoded to
  16-bit/48kHz WAV, same channel count as the source.
- A progress meter and a live log show what's happening file by file, and a
  summary at the end: how many were converted, how many were already fine, and
  how many failed (with a reason) — mirroring the folder structure you dropped in.
- Everything gets packed into a ZIP (plus a `CONVERSION_REPORT.txt` with the
  full log) and offered as a download.

## Notes

- Files that fail to decode (corrupted, or a codec the browser doesn't support)
  are skipped and reported, not silently dropped.
- Very large libraries (many thousands of files, or many GB) may be slow and
  memory-heavy, since everything is held in memory before zipping — this is a
  browser tool, not a batch server job.
- No build step, no dependencies. It's one HTML file with inline CSS/JS and a
  tiny hand-written ZIP writer (uncompressed/STORE — samples don't compress well
  anyway, and it keeps the whole thing dependency-free).
