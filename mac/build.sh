#!/bin/bash
# Builds "SP404 DROP.app" (Apple Silicon by default) into mac/dist/.
#   ./build.sh            -> arm64
#   ./build.sh x64        -> Intel
#   ./build.sh universal  -> both in one app
set -euo pipefail
cd "$(dirname "$0")"
ARCH="${1:-arm64}"
[ -d node_modules ] || npm install
cp ../web/index.html app/index.html
cp ../web/icon.svg app/icon.svg
ICON_ARGS=()
if [ -f icon.icns ]; then ICON_ARGS=(--icon=icon.icns); fi
npx @electron/packager app "SP404 DROP" --platform=darwin --arch="$ARCH" --out=dist --overwrite \
  --app-bundle-id=com.sp404drop.app --app-copyright="MIT" "${ICON_ARGS[@]}"
echo "Built into dist/ ($ARCH)"
