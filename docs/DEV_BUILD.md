# Tariften DEV — production uygulamasından ayrı iOS test kurulumu

Bu yapı, App Store'daki `Tariften` uygulamasının üzerine yükleme yapmadan
mikrofonla sabit Türkçe pişirme komutlarının native testlerini yapabilmek içindir.

| | Production | `APP_VARIANT=development` |
|---|---|---|
| İsim | Tariften | Tariften DEV |
| Bundle ID | `com.tariften.app` | `com.tariften.app.dev` |
| Link scheme | `tariften` | `tariften-dev` |

**Önemli:** `expo start --dev-client` sadece Metro sunucusunu başlatır.
Geliştirme istemcisini cihaza yüklemez. Gerçek Tariften uygulaması geliştirme
istemcisi değildir. Expo Go'da `expo-speech-recognition` native modülü yoktur.

## Ön koşul — eksik paket

Önce `expo-dev-client` paketini **SDK 55 uyumlu sürümle** projeye eklemeliyiz:

```bash
npx expo install expo-dev-client
```

Bu, `package.json` ve `package-lock.json` dosyalarını değiştirir.
Otomatik `npm audit fix --force` veya toplu paket yükseltmesi uygulama.
Bu paket değişiklikleri ayrıca CI'dan geçirilip Git'e kaydedilmeli; aksi hâlde
`npm ci` sonrası kurulum kaybolur ve EAS cloud build başarısız olabilir.

## Build & install (Apple hesabı / cihaz imzalama gerektirir)

Dev paketleri ve kilit dosyası Git'e kaydedildikten sonra:

```bash
npx eas-cli@latest build --profile development --platform ios
```

Bu profil `eas.json` üzerinden `APP_VARIANT=development` ayarlar.
EAS iç dağıtım bağlantısından `Tariften DEV` uygulamasını iPhone'a yükle;
Apple geliştirme üyeliği ve cihaz UDID/provisioning profili istenebilir.
Build işlemi kullanıcı tarafından başlatılır; otomatik ücretli build yapılmaz.

## Metro ve sesli komut testi

```bash
APP_VARIANT=development npx expo config --type public --json
APP_VARIANT=development npx expo start --dev-client --clear
```

**QR'ı ancak `Tariften DEV` yüklendikten sonra tara.** Metro terminalinde
`tariften://` görüyorsan bu doğru varyant değildir; `APP_VARIANT` ayarı
uygulanmamış demektir.

İlk açılışta mikrofon ve iOS konuşma tanıma izinlerini kabul et.
'Sonraki', 'Önceki', 'Oku' ve '5 dakika başlat' komutlarını **fiziksel iPhone'da**
test et. Simülatör, native ekran ve oynatma testleri için yararlı olsa da
mikrofon kalitesi/izinleri bakımından fiziksel cihazın yerini tutmaz.

Yerelde önceden oluşturulmuş `ios/` klasörü üretim kimliğiyle oluşmuş
olabilir; `git clean`, `git reset --hard`, `prebuild --clean`
komutlarını mevcut dosyaları incelemeden çalıştırma. Özellikle
`.idea/caches/deviceStreaming.xml` ve `package.json` yerel değişikliklerini koru.
