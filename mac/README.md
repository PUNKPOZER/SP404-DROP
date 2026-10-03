# SP404 DROP for Mac

A native `.app` for Apple Silicon (or Intel / universal) — an Electron shell
around [`../web/index.html`](../web/index.html), so it is the exact same app,
just not in a browser. Besides the window it adds:

- Its own window and dock icon, and its own saved settings.

## Install (the easy way)

Download `SP404-DROP-<version>-universal.dmg` from the
[Releases page](https://github.com/PUNKPOZER/SP404-DROP/releases), open it and
drag **SP404 DROP** onto **Applications**. It runs on both Apple Silicon and
Intel Macs.

The app is **not notarized by Apple** (that needs a paid Developer ID), so macOS
warns the first time. Right-click the app in Applications → **Open** → **Open**.
If macOS only offers "Done", go to System Settings → Privacy & Security and
click **Open Anyway**. You only do this once.

## Build and run

Needs Node.js. From this folder:

```bash
./build.sh
open "dist/SP404 DROP-darwin-arm64/SP404 DROP.app"
```

`./build.sh x64` builds for Intel, `./build.sh universal` for both. Drag the
resulting `SP404 DROP.app` into `/Applications` if you like.

The app is **not code-signed or notarized**. If you build it yourself, macOS
opens it normally. If you send the built app to someone else, they may need to
right-click → Open the first time.

`./make-dmg.sh` builds the installer (`dist/SP404-DROP-<version>-universal.dmg`;
`./make-dmg.sh arm64` for a smaller Apple-Silicon-only one). It ad-hoc signs the
app, which makes it launch consistently but is not a Developer ID signature.

`dist/`, `node_modules/` and the copied `app/index.html` are build output and
are git-ignored; `build.sh` re-copies `web/index.html` every time, so rebuild
after changing the web app.
