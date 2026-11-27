#!/bin/bash
# 建置 macOS 版：dist-mac/資料助秘文件office彙整.app 與 dist-mac/ZMSOffice-<版本>-mac.dmg
# 用法（在 Mac 上）：bash tools/build_macos.sh   （要簽章＋公證時，從 tools/mac_in_terminal.sh 在終端機視窗執行）
# 需要：.venv（pywebview==6.2.1 pymysql certifi pyinstaller python-docx openpyxl python-pptx anthropic pillow）、
#       packaging/mariadb-mac、vendor/（編輯器元件，由 Windows 的 build/vendor 同步過來，或 tools/fetch_vendor.py）
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH=/usr/local/bin:/opt/homebrew/bin:$PATH
PY=.venv/bin/python
export SSL_CERT_FILE="$($PY -c 'import certifi; print(certifi.where())')"
VER=$($PY -c "import zo; print(zo.APP_VERSION)")
NAME="資料助秘文件office彙整"
APPID="ZMSOffice"
BUNDLE_ID="com.achir.zmsoffice"
echo "== 版本 $VER"

[ -x packaging/mariadb-mac/bin/mariadbd ] || { echo "缺少 packaging/mariadb-mac（可從 zms-family-album 複製）"; exit 1; }
[ -f vendor/onlyoffice/web-apps/apps/api/documents/api.js ] || { echo "缺少 vendor/onlyoffice"; exit 1; }
[ -f vendor/drawio/index.html ] || { echo "缺少 vendor/drawio"; exit 1; }

rm -rf build-mac dist-mac build/pyi-mac build/pyi-mac-mcp
mkdir -p build-mac dist-mac

SET=build-mac/icon.iconset; mkdir -p "$SET"
for s in 16 32 128 256 512; do
  sips -z $s $s web/assets/icon.png --out "$SET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) web/assets/icon.png --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$SET" -o build-mac/icon.icns

COMMON=(--hidden-import pymysql --hidden-import certifi --hidden-import docx --hidden-import openpyxl --hidden-import pptx
        --hidden-import lxml --hidden-import anthropic --collect-all docx --collect-all pptx --collect-all anthropic
        --collect-submodules zo --exclude-module tkinter --exclude-module test --exclude-module opencc
        --exclude-module edge_tts --exclude-module playwright)

echo "== PyInstaller（主程式）"
$PY -m PyInstaller main.py --noconfirm --clean --onedir --windowed --name "$APPID" \
  --icon build-mac/icon.icns --distpath dist-mac --workpath build/pyi-mac \
  --osx-bundle-identifier "$BUNDLE_ID" --add-data web:web --collect-all webview "${COMMON[@]}"

echo "== PyInstaller（MCP 伺服器）"
$PY -m PyInstaller packaging/mcp_main.py --noconfirm --clean --onedir --console --name ZMSOfficeMCP \
  --distpath build-mac/mcp-dist --workpath build/pyi-mac-mcp \
  --add-data web/assets/blank:web/assets/blank "${COMMON[@]}" --exclude-module webview

APP=dist-mac/$APPID.app
[ -d "$APP" ] || { echo "找不到 $APP"; ls dist-mac; exit 1; }
rm -f "$APP/Contents/Resources/web/assets/voice/manifest.json" "$APP/Contents/Resources/web/t_editor.html" 2>/dev/null || true

echo "== 內附 MariaDB、編輯器元件、MCP"
cp -R packaging/mariadb-mac "$APP/Contents/Resources/mariadb"
ditto vendor "$APP/Contents/Resources/vendor"
find "$APP/Contents/Resources/vendor" -name "*.map" -delete
for x in js/diagramly js/integrate.min.js js/onedrive connect onedrive3.html teams.html monday-app-association.json service-worker.js clear.html; do
  rm -rf "$APP/Contents/Resources/vendor/drawio/$x"
done
ditto build-mac/mcp-dist/ZMSOfficeMCP "$APP/Contents/Resources/mcp"

PL="$APP/Contents/Info.plist"
pb() { /usr/libexec/PlistBuddy -c "$1" "$PL" 2>/dev/null || true; }
pb "Delete :CFBundleDisplayName"; pb "Add :CFBundleDisplayName string $NAME"
pb "Set :CFBundleName $NAME"
pb "Set :CFBundleShortVersionString $VER"; pb "Set :CFBundleVersion $VER"
pb "Delete :LSMinimumSystemVersion"; pb "Add :LSMinimumSystemVersion string 12.0"
pb "Delete :LSApplicationCategoryType"; pb "Add :LSApplicationCategoryType string public.app-category.productivity"
pb "Delete :NSHumanReadableCopyright"; pb "Add :NSHumanReadableCopyright string 開發：吳玉柱 先生 與 Claude AI Opus 5.5"
pb "Delete :NSAppleEventsUsageDescription"; pb "Add :NSAppleEventsUsageDescription string 在桌面建立本程式的替身"
pb "Delete :NSHighResolutionCapable"; pb "Add :NSHighResolutionCapable bool true"
# 「打開檔案」清單（Finder 右鍵 → 打開檔案的應用程式）：只當「檢視者」，不搶預設程式
pb "Delete :CFBundleDocumentTypes"
pb "Add :CFBundleDocumentTypes array"
pb "Add :CFBundleDocumentTypes:0 dict"
pb "Add :CFBundleDocumentTypes:0:CFBundleTypeName string Office 文件"
pb "Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Editor"
pb "Add :CFBundleDocumentTypes:0:LSHandlerRank string Alternate"
pb "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions array"
i=0
for e in docx doc docm dotx odt rtf txt epub xlsx xls xlsm ods csv pptx ppt pptm ppsx odp pdf drawio vsdx; do
  pb "Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:$i string $e"; i=$((i+1))
done

FINAL="dist-mac/$NAME.app"
rm -rf "$FINAL"; mv "$APP" "$FINAL"
SIGN_KC="$HOME/Library/Keychains/zms-signing.keychain-db"
if [ -f "$SIGN_KC" ] && [ -f "$HOME/Developer/zms-signing/kc.pass" ]; then
  security unlock-keychain -p "$(cat "$HOME/Developer/zms-signing/kc.pass")" "$SIGN_KC"
fi
IDENT=$(security find-identity -v -p codesigning | grep -o '"Developer ID Application: [^"]*"' | head -1 | tr -d '"' || true)
if [ -n "$IDENT" ]; then
  echo "== 簽章（${IDENT}）"
  ENT=packaging/mac-entitlements.plist
  find "$FINAL/Contents" -type f \( -name "*.dylib" -o -name "*.so" \) -print0 |
    xargs -0 -I{} codesign --force --timestamp --options runtime -s "$IDENT" "{}"
  find "$FINAL/Contents/Resources" "$FINAL/Contents/Frameworks" -type f -perm +111 ! -name "*.dylib" ! -name "*.so" -print0 |
    while IFS= read -r -d '' f; do
      if file -b "$f" | grep -q Mach-O; then codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$IDENT" "$f"; fi
    done
  codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$IDENT" "$FINAL/Contents/MacOS/$APPID"
  codesign --force --timestamp --options runtime --entitlements "$ENT" -s "$IDENT" "$FINAL"
else
  echo "== 簽章（ad-hoc；找不到 Developer ID 憑證）"
  codesign --force --deep -s - "$FINAL"
fi
codesign --verify --deep --strict "$FINAL" && echo "簽章 OK"

NOTARY="${NOTARY_PROFILE:-zms-notary}"
notarize() {
  xcrun notarytool submit "$1" --keychain-profile "$NOTARY" --wait --timeout 120m | tee build-mac/notary.txt
  grep -q "status: Accepted" build-mac/notary.txt || {
    ID=$(grep -m1 "  id:" build-mac/notary.txt | awk '{print $2}')
    [ -n "$ID" ] && xcrun notarytool log "$ID" --keychain-profile "$NOTARY" || true
    echo "公證失敗"; exit 1; }
}
CAN_NOTARIZE=""
if [ -n "$IDENT" ] && [ -z "${SKIP_NOTARY:-}" ] && xcrun notarytool history --keychain-profile "$NOTARY" >/dev/null 2>&1; then CAN_NOTARIZE=1; fi

echo "== DMG"
STAGE=build-mac/dmg; rm -rf "$STAGE"; mkdir -p "$STAGE"
ditto "$FINAL" "$STAGE/$NAME.app"
ln -s /Applications "$STAGE/應用程式"
SIZE_MB=$(( $(du -sm "$STAGE" | cut -f1) + 120 ))
DMG="dist-mac/$APPID-$VER-mac.dmg"
rm -f "$DMG"
for i in 1 2 3; do
  hdiutil create -volname "$NAME $VER" -srcfolder "$STAGE" -ov -format UDZO -size ${SIZE_MB}m "$DMG" && break
  echo "hdiutil 重試 $i"; sleep 5
done
if [ -n "$IDENT" ]; then codesign --force --timestamp -s "$IDENT" "$DMG"; fi
if [ -n "$CAN_NOTARIZE" ]; then
  echo "== 公證 DMG（包含裡面的 App）"
  notarize "$DMG"
  xcrun stapler staple "$DMG"
  spctl -a -vv -t install "$DMG" 2>&1 | head -3
fi
shasum -a 256 "$DMG"
du -h "$DMG"
echo "BUILD_DONE"
