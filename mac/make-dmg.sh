#!/bin/bash
# Builds a drag-to-install disk image: dist/SP404-DROP-<version>-<arch>.dmg
#   ./make-dmg.sh             -> universal (Apple Silicon + Intel), the default
#   ./make-dmg.sh arm64       -> Apple Silicon only (smaller)
set -euo pipefail
cd "$(dirname "$0")"
ARCH="${1:-universal}"
VERSION="$(node -p "require('./app/package.json').version")"
./build.sh "$ARCH"
APP="$(ls -d dist/*-darwin-"$ARCH"/"SP404 DROP.app")"
# Work in a temp folder: folders synced by iCloud (Desktop/Documents) keep
# re-adding Finder attributes that make codesign fail.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
ditto --norsrc --noextattr --noqtn "$APP" "$STAGE/SP404 DROP.app"
xattr -cr "$STAGE/SP404 DROP.app"
# Ad-hoc sign the whole bundle so it is internally consistent (required for
# arm64 to launch). This is NOT a Developer ID signature or notarization.
codesign --force --deep --sign - "$STAGE/SP404 DROP.app"
codesign --verify --deep --strict "$STAGE/SP404 DROP.app"
ln -s /Applications "$STAGE/Applications"
cat > "$STAGE/READ ME FIRST.txt" <<'TXT'
SP404 DROP — install
1. Drag "SP404 DROP" onto the Applications folder.
2. First launch: this app is not signed with an Apple Developer ID, so macOS
   will warn about it. Right-click (or Control-click) the app in Applications,
   choose Open, then Open again. If macOS only offers "Done": open
   System Settings > Privacy & Security, scroll down and click "Open Anyway".
   You only have to do this once.

SP404 DROP — установка
1. Перетащи "SP404 DROP" в папку Applications.
2. Первый запуск: приложение не подписано сертификатом Apple Developer, поэтому
   macOS предупредит. Нажми на приложении правой кнопкой (или Control-клик) в
   Программах, выбери "Открыть", затем ещё раз "Открыть". Если macOS предлагает
   только "Готово": Системные настройки > Конфиденциальность и безопасность,
   прокрути вниз и нажми "Всё равно открыть". Это нужно сделать один раз.
TXT
OUT="dist/SP404-DROP-$VERSION-$ARCH.dmg"
rm -f "$OUT"
hdiutil create -volname "SP404 DROP" -srcfolder "$STAGE" -ov -format UDZO -fs HFS+ "$OUT" >/dev/null
echo "Built: $OUT ($(du -h "$OUT" | cut -f1))"
