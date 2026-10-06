<p align="center"><img src="icon.svg" width="96" height="96" alt="SP404 DROP"></p>

# SP404 DROP

Web app: https://punkpozer.github.io/SP404-DROP/web/index.html

A small tool that sits between your music library and a Roland SP-404 (SX / MKII / A).
It does two things, and stays out of your way otherwise:

- **CONVERT** — batch-fix any folder of samples to the 16-bit / 48kHz PCM WAV the
  SP-404 actually wants, so nothing fails to load or plays back garbled.
- **CHOP / LOOP** — load one track, see a big waveform, auto-detect transients or
  split it into equal parts, drag markers by hand, find a loop, and export numbered
  samples (`sample_01.wav`, `sample_02.wav`, …) ready to drag onto the sampler.

It is not a DAW and isn't trying to become one — just a fast utility for the one
chore that comes up over and over when prepping sample packs for this machine.

## What's here

- **[`web/`](web/)** — the app itself: a small static page (`index.html` + CSS/JS/assets
  next to it, no dependencies), runs entirely in the browser, nothing uploaded anywhere. Open
  [`web/index.html`](web/index.html) directly, or host it with GitHub Pages. See
  [`web/README.md`](web/README.md).
- **[`mac/`](mac/)** — the native macOS app. Download the `.dmg` from
  [Releases](https://github.com/PUNKPOZER/SP404-DROP/releases), or build it yourself
  (`./build.sh`, `./make-dmg.sh`). See [`mac/README.md`](mac/README.md).
- **[`cli/`](cli/)** — the original Python command-line scripts this project started
  from: batch WAV conversion, renaming, metadata prepending, and sorting samples into
  category folders (kicks, snares, etc). See [`cli/README.md`](cli/README.md).

## Why both?

The CLI scripts are handy if you already live in a terminal and want to script this
into a bigger pipeline. SP404 DROP (the web app) is for everyone else, and it's
where the Chop/Loop workflow lives — drop in a track, chop it, export, done.

## License

MIT — see [`LICENSE`](LICENSE). Third-party notices: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Unofficial project, not affiliated with or endorsed by Roland.
