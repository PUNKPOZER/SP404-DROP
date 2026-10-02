# SP404 DROP for Mac

A native `.app` for Apple Silicon (or Intel / universal) — an Electron shell
around [`../web/index.html`](../web/index.html), so it is the exact same app,
just not in a browser. Besides the window it adds:

- Its own window and dock icon, and its own saved settings.

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

`dist/`, `node_modules/` and the copied `app/index.html` are build output and
are git-ignored; `build.sh` re-copies `web/index.html` every time, so rebuild
after changing the web app.
