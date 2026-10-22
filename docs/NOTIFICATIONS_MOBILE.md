# Bildirimler (mobil) — "Tarifin hazır" push + uygulama içi kutu

Core sözleşmesi: `tariften-core/docs/NOTIFICATIONS.md` (Core 1.0.51). Bu belge mobil
tarafı ve **senin yapman gereken native / EAS adımlarını** anlatır.

> **Native değişiklik.** `expo-notifications` yeni bir native modül ekler. JS değişikliği
> tek başına yetmez: iOS simülatör DEV build'i ve EAS production build'i **yeniden
> derlenmelidir**. Eski bir build yeni JS ile açılırsa uygulama çökmez: anlık bildirim
> kapalı kalır, profildeki anahtar "Bu sürümde anlık bildirim yok" der, bildirim kutusu
> (Core'dan okunan liste) yine çalışır.

---

## 1. Ne yapıldı

| Parça | Dosya |
|---|---|
| Saf kurallar (yönlendirme, izin anı, token durum makinesi, Türkçe göreli zaman) | `lib/notifications-core.ts` |
| Core uçları (`/me/push-tokens`, `/me/notifications`, `/me/notifications/read`) | `lib/notifications-api.ts` |
| Cihaz tarafı (izin, Expo push token, device_id, Android kanalı, çıkışta DELETE) | `lib/notifications.ts` |
| Dinleyiciler, dokununca yönlendirme, ön plan banner'ı, izin açıklama ekranı | `components/notifications/*` |
| Bildirim kutusu ekranı | `app/notifications.tsx` (`app/_layout.tsx`'te kayıtlı) |
| Keşfet başlığında zil + okunmamış rozeti | `app/(tabs)/_layout.tsx` |
| Profil → Bildirimler (kutu + "Tarifim hazır olunca haber ver" anahtarı) | `app/(tabs)/profile.tsx` |
| `?job=` ile aktarım işini sürdürme, "Yeniden dene" | `app/recipe/import.tsx` |
| Çıkışta token silme | `context/AuthContext.tsx` |
| Testler | `scripts/check-notifications.test.cjs` (CI: `mobile-ci.yml`) |

### İzin anı — uygulama açılışında ASLA sorulmaz

Açılışta ve oturum açılınca izin yalnızca **okunur**. İzin zaten verilmişse Expo token
Core'a yeniden gönderilir (`updated_at` tazelenir). İşletim sistemi izin penceresi
sadece iki yerden açılır:

1. **Video aktarımı başladığı an.** Core yeni (ücretli) video analizini kabul ettiği
   anda alttan kısa bir açıklama ekranı çıkar: *"Tarifin hazır olunca haber verelim mi?"*
   "Haber ver" → işletim sistemi izni. "Şimdi değil" → 30 gün bu ekran tekrar çıkmaz.
   İzin zaten verilmişse, kesin olarak reddedilmişse ya da üye profilden kapattıysa
   ekran hiç çıkmaz. Önceden başlamış bir işi sürdürmek veya yayımlanmış tarife
   yönlenmek bu ekranı tetiklemez.
2. **Profil → Bildirimler → "Tarifim hazır olunca haber ver" anahtarı.** İzin
   istenebiliyorsa doğrudan işletim sistemi penceresi; artık istenemiyorsa
   (iOS'ta bir kez reddedildi) "Ayarları aç" yönlendirmesi. Kapatınca token Core'dan silinir.

### Giriş noktası

Zil, **Keşfet başlığında** arama ile avatar arasında, yalnızca giriş yapmış üyelere
görünür; okunmamış varsa küçük kırmızı rozet (`9+`'a kadar). 6. sekme eklenmedi.
Profil zaten gizli bir sekme (avatarla açılıyor). Zil orada olsaydı iki dokunuş uzakta
kalır, rozet de görünmezdi. Keşfet açılış ekranı; "tarifin hazır" haberi geri
döndüğünde burada görünür. Profilde de "Bildirim kutusu" satırı var.

### Dokununca

| `data.type` | Açılan ekran |
|---|---|
| `recipe_ready` | `/recipe/<recipe_slug>` |
| `recipe_review` | `/recipe/aktar?job=<job_id>`. İş ücretsiz durum ucuyla okunur, inceleme formu açılır |
| `recipe_failed` | `/recipe/aktar?job=<job_id>`. Hata mesajı gösterilir; `retryable` ise ana düğme **Yeniden dene** olur |
| bilinmeyen / eksik | Core'un `url`'i yalnızca bu iki rotadan biriyse, yoksa `/notifications` |

Soğuk başlatma `getLastNotificationResponseAsync` ile yakalanır. Yönlendirme,
navigasyon ve kayıtlı oturum hazır olunca yapılır. Dokunulan bildirim
`POST /me/notifications/read {"ids":[notification_id]}` ile okundu yapılır.

### Ön planda gelen bildirim

Sistem banner'ı veya sesi yok. Üstte sakin bir kart çıkar, 6 sn sonra kaybolur.
Dokununca aynı yönlendirme olur. Bildirim, Bildirim Merkezi'nde yine kalır.

### Token yaşam döngüsü

- `device_id`: kuruluma özel rastgele UUID, SecureStore'da (`tariften_push_device_id`).
- Kayıt: açılışta / oturum açınca / token değişince (`addPushTokenListener`) zorunlu;
  uygulama ön plana gelince en fazla 6 saatte bir.
- **Çıkış:** JWT hâlâ geçerliyken `DELETE /me/push-tokens` (en fazla 4 sn, çıkışı bekletmez).
- Hesap değişirse Core token'ı yeni hesaba taşır. Ayrıca yeni hesapla zorunlu kayıt yapılır.

---

## 2. Senin yapman gerekenler (native / EAS)

### 2.1 iOS — APNs anahtarı (EAS credentials)

```bash
eas credentials -p ios
# → production → Push Notifications: Manage your Apple Push Notifications Key
# → "Set up a new key" (EAS Apple hesabında .p8 oluşturur) ya da mevcut .p8'i yükle
```

- Anahtar Apple hesabı düzeyindedir. Aynı `.p8` hem `com.tariften.app` hem
  `com.tariften.app.dev` için kullanılabilir. DEV'i EAS ile derliyorsan
  `development` profili için de aynı anahtarı bağla.
- Push Notifications yeteneğini (capability) EAS build sırasında App ID'ye kendisi ekler.
  `aps-environment` entitlement'ını eklenti yazar. Varsayılan `development`'tır.
  App Store / ad hoc dışa aktarımında Xcode bunu profildeki değerle (`production`)
  değiştirir. Ek ayar gerekmez.
- Core tarafında Expo "enhanced push security" açarsan Expo erişim anahtarını
  `wp-config.php` → `TARIFTEN_EXPO_ACCESS_TOKEN` olarak ekle (Core belgesi §3).

### 2.2 Android — Firebase + FCM V1 servis hesabı

1. Firebase Console → proje (yoksa oluştur) → **Android uygulaması ekle**:
   `com.tariften.app` (DEV için ayrıca `com.tariften.app.dev`).
2. `google-services.json` indir, depo köküne koy (iki paket de aynı dosyada olabilir) ve
   `app.json` → `expo.android` içine ekle:
   ```json
   "googleServicesFile": "./google-services.json"
   ```
   Dosyayı commit etmek istemiyorsan EAS dosya ortam değişkeni kullan
   (`eas env:create --name GOOGLE_SERVICES_JSON --type file ...`) ve
   `googleServicesFile` değerini buna göre ayarla.
   **Bu dosya eklenene kadar Android'de Expo token alınamaz.** Uygulama çökmez,
   yalnızca push kaydı yapılmaz. Bildirim kutusu çalışır.
3. **FCM V1 servis hesabı anahtarı** (gizli, depoya girmez):
   Firebase Console → Project settings → Service accounts → *Generate new private key*.
   ```bash
   eas credentials -p android
   # → production → Google Service Account
   # → "Manage your Google Service Account Key for Push Notifications (FCM V1)" → JSON'u yükle
   ```
4. Bildirim ikonu: `assets/notification-icon.png` (96×96, beyaz + şeffaf), renk `#db4c3f`,
   FCM varsayılan kanalı `default` ("Tarif bildirimleri"). Kanal uygulamada izin
   istenmeden hemen önce oluşturulur. Android 13+ izin penceresi ancak kanal varken çıkar.

### 2.3 Yeniden derleme

iOS simülatör (DEV, yerel):
```bash
npm ci
npm run ios:sim:rebuild   # eski ios/ klasörünü ios.backup-<zaman> olarak taşır, yenisini üretir
npm run ios:sim           # Metro (DEV)
```

EAS:
```bash
eas build -p ios --profile production
eas build -p android --profile production
eas build -p ios --profile development   # DEV client'ı EAS'ta kullanıyorsan
eas submit -p ios --profile production
```

Doğrulama (bu pakette çalıştırıldı):
```bash
npx expo config --type introspect                          # plugins: expo-notifications, aps-environment
APP_VARIANT=development npx expo config --type introspect  # DEV: aynı eklenti + com.tariften.app.dev
```

### 2.4 Elle test

- **Simülatörde tıklama akışı** (APNs olmadan). `payload.apns` dosyası:
  ```json
  {
    "aps": { "alert": { "title": "Tarifin hazır: Deneme", "body": "Aktardığın tarif yayımlandı." }, "sound": "default" },
    "body": { "notification_id": 1, "type": "recipe_ready", "recipe_slug": "menemen", "job_id": 1, "url": "/recipe/menemen" }
  }
  ```
  ```bash
  xcrun simctl push booted com.tariften.app.dev payload.apns
  ```
  `type` değerini `recipe_review` / `recipe_failed` ve `job_id`'yi gerçek bir iş kimliği
  yaparak aktarım ekranını dene. Uygulama kapalıyken gönder ve dokun: soğuk başlatma.
- **Gerçek uçtan uca:** fiziksel cihazda giriş yap → Instagram/TikTok/YouTube videosu
  aktar → "Haber ver" → uygulamayı kapat → iş bitince gelen bildirime dokun.
- Expo push aracı (https://expo.dev/notifications) ile token'a doğrudan da gönderebilirsin.

---

## 3. Bağımlılık ve güvenlik

- `expo-notifications@~55.0.27` (SDK 55 `bundledNativeModules` sürümü). Yeni geçişli
  bağımlılık yalnızca `badgin` (`expo-application`, `expo-constants`, `@expo/image-utils`
  zaten vardı). `expo-device` eklenmedi.
  Simülatör / token hatası `try/catch` ile ele alınıyor.
- `npm audit --omit=dev`: **değişmedi**. 22 yüksek / 8 orta, kritik 0. Yeni GHSA kimliği yok.
  `check-audit-regressions` taban çizgisi güncellenmedi.
- Push içeriğinde yalnızca başlık, kısa metin, iş kimliği ve slug vardır. Token ve JWT
  loglanmaz.
