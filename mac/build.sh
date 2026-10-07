#!/bin/bash
# Builds "SP404 DROP.app" (Apple Silicon by default) into mac/dist/.
#   ./build.sh            -> arm64
#   ./build.sh x64        -> Intel
#   ./build.sh universal  -> both in one app
set -euo pipefail
cd "$(dirname "$0")"
ARCH="${1:-arm64}"
[ -d node_modules ] || npm install
# the web app is index.html + sp-system.css + drop.css + sp-core.js + assets/ — copy all of it next to main.js
cp ../web/index.html ../web/sp-system.css ../web/drop.css ../web/sp-core.js ../web/icon.svg app/
# .spsystem interchange modules (index.html, spsystem-fs.js, open-in-learn.js)
cp ../web/sp-schemas.js ../web/sp-validate.js ../web/sp-package.js ../web/sp-project.js ../web/sp-bridge.js app/
rm -rf app/assets && cp -R ../web/assets app/assets
ICON_ARGS=(--extend-info=Info.extra.plist)
if [ -f icon.icns ]; then ICON_ARGS+=(--icon=icon.icns); fi
npx @electron/packager app "SP404 DROP" --platform=darwin --arch="$ARCH" --out=dist --overwrite \
  --app-bundle-id=com.sp404drop.app --app-copyright="MIT" "${ICON_ARGS[@]}"
echo "Built into dist/ ($ARCH)"
