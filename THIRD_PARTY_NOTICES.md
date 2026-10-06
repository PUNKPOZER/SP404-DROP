# Third-party notices

SP404 DROP is MIT licensed (see [`LICENSE`](LICENSE)). This file records the
external pieces it uses.

## Web app (`web/index.html`)

No third-party code or libraries. Audio decoding, resampling, WAV encoding and
ZIP writing are done with browser built-ins (Web Audio API) and small
hand-written code in the file.

| Item | Licence | Note |
|---|---|---|
| *(no fonts bundled or fetched)* | — | Typography uses the system's installed fonts (see `DESIGN_SYSTEM.md` §2). Silkscreen / Pixelify Sans / Google Fonts were removed in the SP SYSTEM redesign; the app makes **no** network requests. |
| `design-reference/brand-logo.svg` (cow-on-a-chair mark) | Supplied by the project owner | Brand asset; the production copy `web/assets/brand-logo.svg` omits its ® glyph. |

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
