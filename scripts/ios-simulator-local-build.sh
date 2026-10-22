#!/usr/bin/env bash
# Local iOS development build for Xcode 27, which has DeviceHub.app instead
# of Simulator.app. Do not invoke the SDK 55 Expo CLI's simulator launcher.
# No EAS/TestFlight/cloud build, signing, or production bundle ID involved.
set -euo pipefail

cd "$(dirname "$0")/.."
export APP_VARIANT=development
export LANG="${LANG:-en_US.UTF-8}"
export LC_ALL="${LC_ALL:-en_US.UTF-8}"

for tool in xcrun xcodebuild node pod; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "Eksik araç: $tool. Xcode, Node ve CocoaPods kurulumunu kontrol et." >&2
    exit 1
  fi
done

DEVDIR="$(xcode-select -p)"
if [[ "$DEVDIR" != */Xcode.app/Contents/Developer ]]; then
  echo "Tam Xcode seçili değil: $DEVDIR" >&2
  echo 'Gerekirse: sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer' >&2
  exit 1
fi

# The user has already booted an iPhone. Choose the running device only; do
# not silently boot, erase, reset, or migrate a different simulator.
DEVICE_ID="$(xcrun simctl list devices booted -j | node -e '
const fs=require("fs");
const groups=JSON.parse(fs.readFileSync(0,"utf8")).devices;
const devices=Object.values(groups).flat().filter(d=>d.state==="Booted" && d.udid && !d.isUnavailable);
const iphone=devices.find(d=>/^iPhone/.test(d.name));
process.stdout.write((iphone||devices[0]||{}).udid||"");
')"
if [[ -z "$DEVICE_ID" ]]; then
  echo 'Açık iPhone simülatörü bulunamadı. Önce: xcrun simctl list devices available' >&2
  echo 'Sonra istediğin UDID ile: xcrun simctl boot "<UDID>"' >&2
  exit 1
fi
echo "Açık simülatör: $DEVICE_ID"

# Never delete an existing native iOS directory: it may contain uncommitted
# local Xcode edits or an older production-native prebuild. To pick up new
# native config (share extension, icons, splash) `npm run ios:sim:rebuild`
# MOVES the old folder to ios.backup-<time> and generates a fresh one.
if [[ -d ios && "${TARIFTEN_REGENERATE_IOS:-0}" == "1" ]]; then
  BACKUP="ios.backup-$(date +%Y%m%d-%H%M%S)"
  mv ios "$BACKUP"
  echo "Eski ios/ klasörü taşındı (silinmedi): $BACKUP"
fi
if [[ -d ios ]]; then
  if ! grep -R -q 'com.tariften.app.dev' ios/*.xcodeproj/project.pbxproj 2>/dev/null; then
    echo 'ios/ mevcut ama Tariften DEV bundle ID ile oluşturulmamış olabilir.' >&2
    echo 'Yerel native değişikliklerini yedeklemeden ios/ klasörünü silme.' >&2
    exit 1
  fi
  echo 'Var olan ios/ DEV projesi korunuyor.'
  if ! ls -d ios/*Aktar >/dev/null 2>&1; then
    echo 'Not: Bu ios/ klasöründe "Tariften'"'"'e Aktar" paylaşım uzantısı yok.' >&2
    echo 'Yeni ikon, açılış ekranı ve Paylaş → Tariften için bir kez: npm run ios:sim:rebuild' >&2
  fi
else
  echo 'Expo prebuild: yalnızca yerel iOS DEV projesi üretiliyor...'
  npx expo prebuild --platform ios --no-install
fi

if [[ ! -d ios ]]; then echo 'Expo ios/ projesini üretemedi.' >&2; exit 1; fi

# CocoaPods generates the Xcode workspace and native dependencies.
echo 'CocoaPods bağımlılıkları kuruluyor...'
(cd ios && pod install)

# Xcode 27 requires iOS 15+ for every generated Pods target. Some older
# transitive pods (e.g. SDWebImage) still set 9.0; fix generated Pods only.
node "$PWD/scripts/ios-xcode27-pods-min-target.cjs" "$PWD/ios/Pods/Pods.xcodeproj"

WORKSPACE="$(find ios -maxdepth 1 -name '*.xcworkspace' -type d -print -quit)"
if [[ -z "$WORKSPACE" ]]; then
  echo 'CocoaPods .xcworkspace dosyasını oluşturamadı.' >&2
  exit 1
fi

SCHEME="$(xcodebuild -list -json -workspace "$WORKSPACE" | node -e '
const fs=require("fs");const o=JSON.parse(fs.readFileSync(0,"utf8"));
const all=o.workspace?.schemes||o.project?.schemes||[];
// Xcode exposes Pods-TariftenDEV schemes too: they are NOT app schemes.
const apps=all.filter(s=>!/^Pods[-_]/i.test(s) && !/^React-/i.test(s));
const preferred=apps.find(s=>/^TariftenDEV$/i.test(s))
  ||apps.find(s=>/^Tariften$/i.test(s))
  ||apps.find(s=>/^Tariften/i.test(s));
process.stdout.write(preferred||"");
')"
if [[ -z "$SCHEME" ]]; then
  echo 'Tariften uygulama Xcode scheme bulunamadı. Pods şemasıyla build yapılamaz.' >&2; exit 1
fi

DERIVED="$PWD/.expo/ios-local-build"
mkdir -p "$DERIVED"
echo "iOS simülatör için yerel derleme: $SCHEME"
# Ad-hoc "Sign to Run Locally" embeds the App Group entitlement the share
# extension needs to hand links to the app; no Apple team is required for the
# simulator. If that fails, build unsigned (everything except sharing works).
if ! xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" \
  -configuration Debug -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build; then
  echo 'İmzalı simülatör derlemesi olmadı; imzasız deneniyor (Paylaş → Tariften simülatörde veri alamayabilir).' >&2
  xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" \
    -configuration Debug -sdk iphonesimulator \
    -destination "platform=iOS Simulator,id=$DEVICE_ID" \
    -derivedDataPath "$DERIVED" \
    CODE_SIGNING_ALLOWED=NO build
fi

# The generated native bundle must match the isolated development identifier.
PRODUCTS="$DERIVED/Build/Products/Debug-iphonesimulator"
APP_PATH=""
while IFS= read -r candidate; do
  PLIST="$candidate/Info.plist"
  [[ -f "$PLIST" ]] || continue
  BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST" 2>/dev/null || true)"
  if [[ "$BUNDLE_ID" == 'com.tariften.app.dev' ]]; then
    APP_PATH="$candidate"
    break
  fi
done < <(find "$PRODUCTS" -maxdepth 1 -type d -name '*.app' -print)
if [[ -z "$APP_PATH" ]]; then
  echo 'Tariften DEV .app bulunamadı; production uygulamasını kurmayacağız.' >&2
  exit 1
fi

echo "Tariften DEV simülatöre kuruluyor: $APP_PATH"
xcrun simctl install "$DEVICE_ID" "$APP_PATH"
xcrun simctl launch "$DEVICE_ID" com.tariften.app.dev

echo
echo 'Tariften DEV simülatöre yerel olarak kuruldu.'
echo 'İkinci terminalde: npm run ios:sim'
echo 'Metro hazır olunca: npm run ios:sim:open'
