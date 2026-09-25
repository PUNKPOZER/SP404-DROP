# SP-404 Sample Toolkit — CLI scripts

Python command-line scripts for prepping sample packs. Each one does a deep,
recursive scan of a directory you point it at — **keep a backup before running
any of them**, since they rename/overwrite files in place.

Requires Python 3 and [`ffmpeg-python`](https://pypi.org/project/ffmpeg-python/)
(plus the `ffmpeg` binary itself) for `convertor.py`:

```
pip install ffmpeg-python
```

## Scripts

- **`convertor.py <dir>`** — converts every `.wav` in `<dir>` (recursively) to
  16-bit / 48kHz PCM, the format the SP-404 wants. Files already in that format
  are left untouched.

  ```
  python3 convertor.py /path/to/samples
  ```

- **`nameFixer.py <dir>`** — strips common sample-pack-provider prefixes
  (Cymatics, ADSR, etc — edit the `wordsToRemove` list at the top of the file
  to customize) out of filenames.

  ```
  python3 nameFixer.py /path/to/samples
  ```

- **`metadataPrepender.py <dir>`** — detects BPM/key info already in a filename
  (e.g. `Cool Loop 120 Am.wav`) and moves it to the front (`120-Am-Cool Loop.wav`),
  so it's visible on the SP-404's screen even when a long filename gets cut off.

  ```
  python3 metadataPrepender.py /path/to/samples
  ```

- **`collator.py <dir>`** — sorts one-shots into category folders (kicks, snares,
  claps, etc — edit the `categories` list at the top to customize) under
  `<dir>/0. one-shots/`, based on filename keywords. Simple heuristic, no ML.

  ```
  python3 collator.py /path/to/samples
  ```

Each script asks for confirmation before touching anything.

## If you just want a quick, no-install converter

See [`../web/`](../web/) for a browser-based version of `convertor.py` with a
drag-and-drop UI — no Python or ffmpeg required.
