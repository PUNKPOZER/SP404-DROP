# Third-party notices

SP404 DROP is MIT licensed (see [`LICENSE`](LICENSE)). This file records every
external dependency, dataset and API the app uses, and the licence check each
one passed. **Nothing may be added to the Sample Finder (SAMPLES screen, FIND
SOURCE) without an entry here first.**

## Approved: Sample Finder

| Item | Type | Licence / terms | Status |
|---|---|---|---|
| Fingerprint engine (`SampleFinder` in `web/index.html`) | Own code | MIT (this repo) | Approved. Written from scratch; no third-party code. |
| Radix-2 FFT, Hann window | Own code | MIT (this repo) | Approved. Textbook algorithm, own implementation. |
| IndexedDB, Web Audio API | Browser built-ins | n/a | Approved. |
| Electron (Mac app shell, `mac/`) | MIT | Approved. Not bundled in the repo; installed by `npm install` when building. The built app also contains Chromium and its third-party licences (shipped inside the app as `LICENSES.chromium.html`). | Approved. |
| @electron/packager (build tool, `mac/`) | BSD-2-Clause | Approved. Build-time only. | Approved. |

**Datasets approved: none.** SP404 DROP bundles no sample database, no
fingerprints and no recordings.

**APIs approved:**

| API | Data licence | Terms / caveats | Status |
|---|---|---|---|
| MusicBrainz web service (`musicbrainz.org/ws/2`), used by `MusicBrainzProvider` | Core data is **CC0** (public domain) | Opt-in toggle (default on, can be turned off). Sends only artist + title text, never audio. Public API is limited to ~1 request/second (enforced in code). Browsers cannot set a custom User-Agent, which MusicBrainz asks API clients to send. Heavy or commercial use of the hosted API may need a MetaBrainz commercial plan — review before commercial distribution. | Approved for the current free/MIT distribution. |

| Genius API (`api.genius.com`), used by `GeniusProvider` | Community-entered; Genius's own terms apply | **Not approved.** Their API terms could not be reviewed for this project. Shipped *off*: it does nothing until a user pastes their **own** API token, and that user is responsible for following Genius's terms. Official API only, no scraping. Review (especially commercial use and caching) before any commercial distribution. | Optional, user's own risk. |

Only the CC0 core relationship data (`samples material` recording relations)
is read. MusicBrainz's supplementary data (CC BY-NC-SA) is not used.

## Existing (non-Sample-Finder) assets

| Item | Licence | Note |
|---|---|---|
| Silkscreen, Pixelify Sans (Google Fonts, loaded at runtime from `fonts.googleapis.com`) | SIL Open Font License 1.1 | The only network request the app makes. |

## Explicitly not used

- **WhoSampled** — product/workflow inspiration only. No scraping, no
  unofficial scraper APIs, no copied data.
- **AcoustID / Chromaprint** audio identification — the hosted service is free
  for non-commercial use only, so it is not used. Identification is by
  artist/title text instead.
- Any scraped sample database, or dataset of unclear provenance.
- Research-only or non-commercial datasets/libraries (they would block
  commercial distribution).
- Copyrighted audio datasets without explicit redistribution rights.

## Open items for review before commercial distribution

- The fingerprinting approach (spectral-peak pair hashing) is a published
  technique and is implemented independently here, but no patent review has
  been done. Have this checked before shipping commercially.
- Users add their own recordings' fingerprints and relationship facts to the
  local database. The app stores fingerprints (hashes + times) and metadata
  only, never audio, and asks users to confirm they have the right to
  fingerprint each recording. Data a user imports is their responsibility; it
  is shown with the provenance it was imported with.

## Checklist for a new provider, dataset or dependency

1. Identify the licence/terms in writing (not "it's on GitHub").
2. Confirm it allows redistribution **and** commercial use of SP404 DROP.
3. Confirm provenance (how the data was collected; no scraping).
4. Add a row above, then implement it as a `SampleProvider` and set its
   `license` field to match.
