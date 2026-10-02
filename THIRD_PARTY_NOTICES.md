# Third-party notices

SP404 DROP is MIT licensed (see [`LICENSE`](LICENSE)). This file records the
external pieces it uses.

## Web app (`web/index.html`)

No third-party code or libraries. Audio decoding, resampling, WAV encoding and
ZIP writing are done with browser built-ins (Web Audio API) and small
hand-written code in the file.

| Item | Licence | Note |
|---|---|---|
| Silkscreen, Pixelify Sans (Google Fonts, loaded at runtime from `fonts.googleapis.com`) | SIL Open Font License 1.1 | The only network request the app makes. |

## Mac app (`mac/`)

| Item | Licence | Note |
|---|---|---|
| Electron | MIT | Not stored in the repo; installed by `npm install` when building. The built app also contains Chromium and its third-party licences (shipped inside the app as `LICENSES.chromium.html`). |
| @electron/packager (build tool) | BSD-2-Clause | Build-time only. |

## History

An experimental "Samples" screen (sample lookup via MusicBrainz / Genius / AudD
and fingerprint matching) was removed in favour of keeping the app focused on
Convert and Chop / Loop. It is still in the git history (commits `04dab54`
through `926fe10`) if it is ever revived; the data sources it used were never
approved beyond MusicBrainz's CC0 data, and AudD/Genius were optional and
unreviewed.
