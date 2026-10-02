# SP404 DROP (web)

A single self-contained HTML page — no install, no build, no server. Everything
runs client-side (decoding, resampling, re-encoding, waveform analysis, zipping).
Audio is never uploaded; the only network use is fonts and the optional
artist/title lookup on the SAMPLES screen.

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
does **not** scrape or use any such site's data. Results come only from
licence-checked sources (see [`../THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md))
and from data you add yourself. If nothing is known it says
`NO SAMPLE INFORMATION FOUND` — nothing is ever guessed.

- **Known samples (SAMPLES screen)** — drop a track. The artist and title are
  read from its tags (MP3 ID3, FLAC, M4A) or guessed from the filename
  (`Artist - Title.mp3`); both boxes are editable, then press **Search**. The
  lookup asks [MusicBrainz](https://musicbrainz.org) (open CC0 data) for that
  recording and lists what it samples and what samples it, with a link to each
  entry. Your local database is searched too, by audio fingerprint.
  - Identification is by **text, not audio**, so it is only as right as the tags
    or names; the match score is shown. An empty result means *not listed in
    MusicBrainz*, not *not sampled* — coverage depends on what the community has
    entered.
  - The **Online lookup** checkbox turns this off. When on, only the artist and
    title text is sent to MusicBrainz — never audio.
- **Found inside this track** — the part that works for obscure tracks. Use
  **Index a folder of reference tracks** to fingerprint records you suspect were
  sampled (e.g. the source artist's albums). Every track you drop on SAMPLES is
  then scanned against that library *by sound*, and a hit says where in your
  track it sits and where in the source it comes from. Fingerprints only are
  stored, never audio. Keep the library to a few hundred tracks (memory) — it is
  for suspects, not your whole collection.
  - **Sped-up / slowed-down / pitched samples** (turntable, tape or pitch-knob
    style, where pitch and tempo move together) are found too: the track is
    re-analysed at speeds from 0.8x to 1.25x (about ±4 semitones, 0.2% steps) and
    the result says how much it was sped up and the pitch change. It takes a few
    seconds per minute of music; the checkbox under the library turns it off.
    It uses a second, low-frequency fingerprint stored with each recording, so
    recordings indexed before this existed need to be re-indexed.
  - Still missed: samples time-stretched *without* a pitch change, chopped
    shorter than a second or two, or buried deep under other sounds.
- **Recognised by audio (AudD, optional)** — the closest thing to a WhoSampled-style
  lookup that does not need your own reference tracks. It cuts the track into
  ~12-second clips and asks [AudD](https://audd.io) (a Shazam-like recognition
  service) which released recording is playing in each, then lists recordings
  other than the track itself with where they were heard. It **uploads audio**
  (only after you press the button and confirm) and needs your own paid AudD
  token. Services like this are built for whole songs, so chopped, pitched or
  buried samples are often not recognised; an empty result is not proof.
- **Genius (optional)** — paste your own Genius API token to also pull
  community-entered samples/interpolations from Genius. Off until a token is
  set; Genius's API terms have not been reviewed for this project and are your
  responsibility. In a plain browser Genius may be blocked by CORS; the Mac app
  ([`../mac/`](../mac/)) handles it.
- **Find Source (Chop screen)** — select a sample and press **Find Source** to
  compare that region against the recordings in the local database by audio
  fingerprint. It needs about 2 seconds or more, only reports a match with
  enough evidence, and shows a LOW / MEDIUM / HIGH label plus the raw evidence.
  Experimental: it finds near-verbatim reuse; pitched, stretched or heavily
  processed samples usually will not match. Because it compares against *your*
  database, add some recordings first.
- **Local database** — stores fingerprints (hashes + times) and metadata only,
  never audio, in your browser (IndexedDB). **+ Add this track** (you confirm
  you have the right to fingerprint it), **+ Add known sample** to record what
  it samples, and Import / Export JSON (format `sp404drop-sampledb` v1) to move
  data between browsers.

### Language

The **EN / RU** switch in the top-right corner translates the whole app. It
defaults to your browser language and remembers your choice.

### Architecture

```
audio / tags -> SampleProvider(s) -> results
```

Everything lives in the `SampleFinder` module in `index.html`: fingerprint
engine, the `SampleProvider` interface (documented in the code), providers, and
UI. Providers: `LocalSampleDatabaseProvider` (audio fingerprints) and
`MusicBrainzProvider` and `GeniusProvider` (online, opt-in). To add a data source, write a provider
object and call `SampleFinder.registerProvider(...)`; the rest of the app is
untouched. Review its licence and add it to `THIRD_PARTY_NOTICES.md` first.

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
