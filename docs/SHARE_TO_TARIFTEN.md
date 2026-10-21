# Paylaş → Tariften

Instagram, TikTok, YouTube veya tarayıcıda **Paylaş**'a basınca listede
**Tariften'e Aktar** çıkar. Seçilince Tariften açılır, bağlantı **Tarif Aktar**
ekranına hazır gelir. Analiz, kullanıcı "Bağlantıdan tarif oluştur"a basınca
başlar; paylaşmak tek başına ücretli işlem başlatmaz.

| | Production | DEV (`APP_VARIANT=development`) |
|---|---|---|
| Paylaşım menüsündeki ad | Tariften'e Aktar | DEV Tariften'e Aktar |
| Uzantı bundle ID | `com.tariften.app.share-extension` | `com.tariften.app.dev.share-extension` |
| App Group | `group.com.tariften.app` | `group.com.tariften.app.dev` |
| Android | `text/*` paylaşım filtresi | aynı |

Akış: iOS uzantısı bağlantıyı App Group'a yazar ve `tariften://dataUrl=…`
ile uygulamayı açar → `app/+native-intent.tsx` bunu `/share` ekranına çevirir →
`app/share.tsx` bağlantıyı okuyup `/recipe/aktar?url=…` açar. Android'de paylaşım
doğrudan uygulamaya gelir; `ShareIntentWatcher` `/share`'e yönlendirir.

TikTok kısa bağlantıları (`vm.tiktok.com`, `vt.tiktok.com`) cihazda açılır,
yalnızca son adres okunur. Instagram `?igsh=`, YouTube `?si=` gibi izleme
parametreleri atılır.

## Bu bir native değişikliktir

Metro ile JS yenilenir ama paylaşım uzantısı, yeni ikon ve açılış ekranı
**yeni bir native derleme** ister.

### iOS Simulator

```bash
cd "/Users/selimaltinkaynak/Desktop/edit/Projeler/Tariften.com/tariften-mobile"
npm ci
npm run ios:sim:rebuild
```

`ios:sim:rebuild` eski `ios/` klasörünü **silmez**; `ios.backup-<tarih>`
adıyla taşır ve yenisini üretir. Sonra her zamanki gibi:

```bash
npm run ios:sim        # 1. terminal
npm run ios:sim:open   # 2. terminal
```

Simülatörde Instagram/TikTok yok. Denemek için Safari'de bir TikTok/Reels/
YouTube adresi aç → Paylaş → (gerekirse "Diğer") → **DEV Tariften'e Aktar**.

### Fiziksel iPhone (Xcode)

`ios/*.xcworkspace` → **iki hedefte de** (TariftenDEV ve DEVTarifteneAktar)
Signing & Capabilities → Team seç. App Group yetkisi ücretli Apple Developer
hesabı ister. Sonra ▶ Run.

### EAS (TestFlight / App Store)

`npx eas-cli@latest build --profile production --platform ios`
İlk derlemede EAS, uzantı için ikinci bir bundle ID ve App Group ile
provisioning profili oluşturmayı sorar; onayla. Derlemeyi kullanıcı başlatır.
