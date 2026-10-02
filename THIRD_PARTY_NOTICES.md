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

**Datasets approved: none.** SP404 DROP bundles no sample database, no
fingerprints and no recordings.

**APIs approved: none.** `LicensedAPIProvider` is an unconfigured placeholder
that makes no network requests.

## Existing (non-Sample-Finder) assets

| Item | Licence | Note |
|---|---|---|
| Silkscreen, Pixelify Sans (Google Fonts, loaded at runtime from `fonts.googleapis.com`) | SIL Open Font License 1.1 | The only network request the app makes. |

## Explicitly not used

- **WhoSampled** — product/workflow inspiration only. No scraping, no
  unofficial scraper APIs, no copied data.
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
