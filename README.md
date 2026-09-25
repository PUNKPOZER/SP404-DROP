# SP-404 Sample Toolkit

Small tools for getting sample packs ready for the Roland SP-404 (and SP-404SX / MK2 / A).

The SP-404 is picky about its WAV files — it wants 16-bit / 48kHz PCM, and silently
fails to load or plays back garbled audio if you feed it something else. These tools
fix that, plus a few other chores that come up when prepping downloaded sample packs.

## What's here

- **[`web/`](web/)** — a drag-and-drop WAV converter that runs entirely in the browser.
  No install, no upload: point it at a folder of samples, get back a ZIP of
  16-bit/48kHz WAVs. Open [`web/index.html`](web/index.html) directly, or host it
  with GitHub Pages. See [`web/README.md`](web/README.md).
- **[`cli/`](cli/)** — the original Python command-line scripts this project started
  from: batch WAV conversion, renaming, metadata prepending, and sorting samples into
  category folders (kicks, snares, etc). See [`cli/README.md`](cli/README.md).

## Why both?

The CLI scripts are handy if you already live in a terminal and want to script this
into a bigger pipeline. The web converter is for everyone else — drop in a folder,
download a ZIP, done.

## License

MIT — see [`LICENSE`](LICENSE).

Unofficial project, not affiliated with or endorsed by Roland.
