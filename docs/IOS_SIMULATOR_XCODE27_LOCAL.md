# Tariften Mobile — Xcode 27'de tamamen yerel iOS Simulator testi

Mac'te Xcode 27 ile `Simulator.app` yerine `DeviceHub.app` geliyor.
Expo SDK 55'in sabitlenmiş CLI'si `expo start --ios` veya
`expo run:ios` sırasında artık var olmayan uygulamayı arayabilir.
`Could not determine id of Simulator app` **Tariften JS derleme hatası değildir**.

Tariften'in production Bundle ID'si `com.tariften.app`, geliştirme
kimliği ise `com.tariften.app.dev`. Aşağıdaki komutlar yalnızca DEV
uygulamasını derler; EAS, App Store, TestFlight veya ücretli servis kullanılmaz.

## İlk kurulum (bir kez)

Mac terminalinde:

```bash
cd "/Users/selimaltinkaynak/Desktop/edit/Projeler/Tariften.com/tariften-mobile"
npm ci
xcode-select -p
xcrun simctl list devices available
# Xcode 27 Device Hub:
open "/Applications/Xcode.app/Contents/Applications/DeviceHub.app"
# İstersen aşağıdaki test cihazını başlat (zaten Booted ise atla):
xcrun simctl boot "79BD1436-3ED2-4562-997F-E1FDCE3B93C8"
xcrun simctl bootstatus "79BD1436-3ED2-4562-997F-E1FDCE3B93C8" -b
npm run ios:sim:install
```

`ios:sim:install` açık bir iPhone simülatörünü seçer, gerekirse
`APP_VARIANT=development npx expo prebuild --platform ios --no-install`
ile **yerel** iOS projesi üretir, CocoaPods kurar, `xcodebuild` ile
iOS Simulator Debug uygulamasını derler, `simctl install` ile cihaza
yükler ve `com.tariften.app.dev` uygulamasını başlatır.

Kullanıcıda **ilk kez** `pod` komutu eksikse önce CocoaPods kurulmalıdır.
Native bağımlılıklar veya Xcode 27 uyumluluğu yüzünden derleme başarısız
olursa **ilk gerçek Xcode build error** okunmalı; bu araç başka Expo SDK
sürümü indirmez, node_modules dosyalarını patch'lemez.

## Gündelik geliştirme

Birinci terminal:

```bash
cd "/Users/selimaltinkaynak/Desktop/edit/Projeler/Tariften.com/tariften-mobile"
npm run ios:sim
```

İkinci terminal (Metro hazır olduktan sonra):

```bash
cd "/Users/selimaltinkaynak/Desktop/edit/Projeler/Tariften.com/tariften-mobile"
npm run ios:sim:open
```

`ios:sim:open` yüklü `tariften-dev://` uygulamasını
`http://127.0.0.1:8081` adresindeki Metro'ya bağlar.

Kurulumu doğrulamak için:

```bash
xcrun simctl list devices booted
xcrun simctl get_app_container booted com.tariften.app.dev app
```

## Sorun giderme

- `No devices are booted`: Önce `xcrun simctl boot <UDID>`.
- `Can't determine id of Simulator app`: Eski `--ios` launcher'ını
  kullanıyorsun; yeni `ios:sim` scriptini `main` branch'inden çek.
- `OSStatus -10814`: DEV uygulaması kurulu olmayabilir veya URL scheme
  eşleşmiyor. `ios:sim:install` ve `get_app_container` kontrolü yap.
- `pod: command not found`: Yerel CocoaPods kurulumunu yap.
- `xcodebuild` başarısız: İlk Xcode hatasını paylaş; sırf bu yüzden
  Xcode'u silme, `ios/` klasörünü silme veya SDK'yı yükseltme.
- `ios/` mevcutsa ama DEV Bundle ID içermiyorsa betik DURUR.
  Önce native değişikliklerini manuel yedekle; betik klasör silmez.
- Fiziksel iPhone için `localhost` uygun değildir; buradaki yol
  **yalnızca iOS Simulator** içindir.
