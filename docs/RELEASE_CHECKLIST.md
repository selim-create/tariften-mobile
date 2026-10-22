# Tariften — Mağaza yayın kontrol listesi (TestFlight + Google Play)

Bu belge, Tariften'i **ilk kez** TestFlight'a ve Google Play iç test kanalına
çıkarmak için senin yapman gereken adımları sırayla anlatır. Depoda yapılabilen
her şey hazır (eas.json profilleri, paylaşım uzantısı, izin metinleri, CI
kontrolleri). Hesap, imza, ödeme ve mağaza formları **yalnızca senin**
yapabileceğin işler. Bu belgedeki hiçbir adım otomatik çalışmaz. Build ve
submit komutlarını sen başlatırsın.

> Durum (2026-10-22): Expo SDK 55, React Native 0.83, `eas.json`
> `appVersionSource: remote` + `autoIncrement`. `expo-updates` **yok**, bu yüzden
> profillerde `channel` yok. OTA güncelleme istersen bu ayrı bir karar ve paket.

---

## 0. Birleştirme sırası (build almadan önce)

1. **iOS 16 / universal links PR'ı** (mobile): `expo-build-properties` ile iOS
   deployment target **16.0**, `ios.associatedDomains` (`applinks:tariften.com`),
   Android `intentFilters`. Bu PR birleşmeden production build alma (bkz. §9).
2. **Web AASA PR'ı** (tariften-web): `https://tariften.com/.well-known/apple-app-site-association`
   dosyası, web ortam değişkeni **`APPLE_TEAM_ID`** ile üretilir. Vercel'de
   `APPLE_TEAM_ID=<10 karakterlik Team ID>` tanımla, sonra deploy et.
3. Bu PR (güvenlik + EAS hazırlığı).

Sonra Mac'te:

```bash
cd "/Users/selimaltinkaynak/Desktop/edit/Projeler/Tariften.com/tariften-mobile"
git pull --ff-only origin main
npm ci
npx tsc --noEmit
npx expo config --type introspect | grep -E "bundleIdentifier|application-groups|associated" -A2
npm install -g eas-cli   # bir kez; aşağıdaki "eas …" komutları için (eas.json: cli >= 16)
eas login
```

## 1. Kimlikler (değiştirme)

| Ne | Değer | Mağazaya çıkar mı? |
| --- | --- | --- |
| iOS uygulama | `com.tariften.app` | Evet |
| iOS paylaşım uzantısı ("Tariften'e Aktar") | `com.tariften.app.share-extension` (hedef adı `TarifteneAktar`) | Evet, uygulamanın içinde |
| App Group (uygulama + uzantı) | `group.com.tariften.app` | Evet |
| Android paket | `com.tariften.app` | Evet |
| DEV varyantı | `com.tariften.app.dev`, `group.com.tariften.app.dev`, şema `tariften-dev` | **Hayır.** Yalnızca `eas build --profile development` / yerel simülatör |
| EAS proje | `775efa67-ee9e-45a1-8c43-0afec950d009` | — |

`production` ve `preview` profilleri `APP_VARIANT` tanımlamaz, yani her zaman
`com.tariften.app` üretir. `scripts/check-release-prep.test.cjs` bunu CI'da denetler.

## 2. Apple Developer hesabı

1. Apple Developer Program üyeliği aktif olmalı (yıllık ücret). **Team ID**'yi
   not al: developer.apple.com → Membership details (10 karakter, ör. `AB12CD34EF`).
2. Team ID'yi üç yere yaz:
   - `eas.json` → `submit.production.ios.appleTeamId` (`TODO_APPLE_TEAM_ID` yerine).
     İstersen satırı silip `EXPO_APPLE_TEAM_ID` ortam değişkeni kullan; EAS
     yalnızca alan yoksa ortam değişkenine bakar.
   - Vercel (web) → `APPLE_TEAM_ID` (AASA dosyası için).
3. **Capabilities.** EAS ilk build'de App ID'leri oluşturur ve yetenekleri
   entitlements dosyasından eşitler. Yine de developer.apple.com → Identifiers'da kontrol et:
   - `com.tariften.app`: **Sign In with Apple**, **Push Notifications**,
     **App Groups** (`group.com.tariften.app`), **Associated Domains**
     (iOS 16/universal links PR'ından sonra).
   - `com.tariften.app.share-extension`: yalnızca **App Groups** (`group.com.tariften.app`).
   - Associated Domains, web'de AASA dosyası yayında değilse çalışmaz (uygulama
     açılır ama bağlantılar Safari'de kalır). Kontrol:
     ```bash
     curl -sSI https://tariften.com/.well-known/apple-app-site-association
     curl -sS  https://tariften.com/.well-known/apple-app-site-association
     ```
     Beklenen: `200`, `content-type: application/json`, yönlendirme yok,
     `appIDs` içinde `<TEAM_ID>.com.tariften.app`.

## 3. App Store Connect uygulama kaydı

1. appstoreconnect.apple.com → Apps → **+ New App**
   - Platform: iOS, Name: `Tariften` (alınmışsa ör. `Tariften: Tarif ve Mutfak`)
   - Primary language: **Turkish**
   - Bundle ID: `com.tariften.app`
   - SKU: ör. `tariften-ios-001`
   - User access: Full access
2. App Information → **Apple ID** (yalnızca rakam, ör. `6712345678`) →
   `eas.json` → `submit.production.ios.ascAppId` (`TODO_ASC_APP_ID` yerine).
3. App Information: Category **Food & Drink** (ikincil: Lifestyle), Content
   Rights: üçüncü taraf içerik (kullanıcı tarifleri ve sosyal video kaynakları) var.
4. Age Rating anketi: kullanıcı üretimi içerik (yorum, tarif) var, şiddet/kumar yok.
5. Pricing: Free. Uygulama içi satın alma yok.
6. URL'ler: Privacy Policy `https://tariften.com/privacy`, Support
   `https://tariften.com/contact`, Marketing `https://tariften.com`.

## 4. iOS imza ve push (`eas credentials`)

```bash
eas credentials -p ios
```

- **production** → Distribution Certificate: EAS'ın oluşturmasına izin ver.
- Provisioning profile: **iki hedef** için ayrı profil (uygulama + `TarifteneAktar`).
  `expo-share-intent` eklentisi uzantıyı `extra.eas.build.experimental.ios.appExtensions`
  içine otomatik ekler (`expo config --type introspect` ile görülebilir), EAS bu
  yüzden ikinci profili sorar. Onayla.
- **Push Notifications key (.p8)**: "Set up a new key" ya da mevcut .p8'i yükle.
  Ayrıntı: `docs/NOTIFICATIONS_MOBILE.md` §2.1. Core tarafındaki
  `TARIFTEN_EXPO_ACCESS_TOKEN` ayarı da orada.
- `aps-environment` entitlements'ta `development` görünür. Bu normal: App Store
  imzası dağıtım profilinden `production` değerini alır.

## 5. iOS build → TestFlight

```bash
eas build -p ios --profile production
```

- Build numarasını EAS tutar (`appVersionSource: remote`, `autoIncrement`).
  Kontrol: `eas build:version:get -p ios`. Pazarlama sürümü
  `app.json` → `version` (`1.1.0`). Yeni sürümde bunu elle artır.
- `ITSAppUsesNonExemptEncryption: false` tanımlı, yani şifreleme beyanı sorulmaz.
- Build loglarında **Xcode sürümünü** not et (bkz. §9).

Gönder:

```bash
eas submit -p ios --profile production --latest
```

- `ascAppId`/`appleTeamId` hâlâ `TODO_...` ise submit doğrulamada bilerek durur.
- Etkileşimsiz (CI) gönderim için App Store Connect API anahtarı: Users and
  Access → Integrations → App Store Connect API → anahtar oluştur (.p8, depoya
  koyma). Ortam değişkenleri: `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`,
  `EXPO_ASC_ISSUER_ID`. Ya da `eas credentials` ile anahtarı EAS'a yükle.

TestFlight:

1. App Store Connect → TestFlight → **Internal Testing → +** → grup: `Tariften Ekip`.
2. Kendini ve ekibi ekle (App Store Connect kullanıcısı olmalı, en fazla 100 kişi,
   Beta App Review gerekmez). Dış test grubu Beta App Review ister.
3. "Test Details": bu sürümde ne test edilecek (aşağıdaki duman testi).

**Duman testi (fiziksel iPhone, TestFlight build'i):**

- [ ] E-posta ile giriş, **Sign in with Apple**, çıkış, şifre sıfırlama
- [ ] Safari / Instagram / TikTok / YouTube → Paylaş → **Tariften'e Aktar** → uygulama
      açılır, bağlantı **Tarif Aktar** ekranında hazır gelir (paylaşmak ücretli
      analiz başlatmaz)
- [ ] Push izni ilk açılışta **sorulmaz**, yalnızca açıklama ekranından sonra
      sorulur. Bir aktarım bitince bildirim gelir, dokununca tarife gider.
- [ ] `https://tariften.com/recipe/<slug>` bağlantısı (Notlar'dan) uygulamada açılır
      (universal links PR + AASA sonrası)
- [ ] Pişirme rehberi: mikrofon + konuşma tanıma izni, "sonraki/önceki/oku"
- [ ] Kamera / galeri: profil fotoğrafı, tarif fotoğrafı
- [ ] Mutfak profili: alerji adımı **onay kutusu olmadan kaydetmez**
- [ ] Profil → **Hesabımı Sil** (test hesabıyla)

## 6. Google Play

### 6.1 Play Console uygulama kaydı

1. play.google.com/console → **Create app**: ad `Tariften`, varsayılan dil
   **Türkçe (tr-TR)**, App, Free. Geliştirici beyanlarını onayla.
2. **Play App Signing** açık kalsın (varsayılan). Uygulama imzalama anahtarını
   Google tutar. EAS'ın ilk Android build'de oluşturduğu keystore **upload key** olur.
   ```bash
   eas credentials -p android   # production → keystore'u EAS oluştursun / yedeğini indir
   ```
   Keystore yedeğini parola yöneticisinde sakla.
3. Android App Links (universal links PR'ı `autoVerify` kullanıyorsa): Play
   Console → Test and release → App integrity → **App signing key SHA-256**
   değerini web'deki `/.well-known/assetlinks.json` dosyasına ekle (web tarafı).

### 6.2 İlk build ve ilk yükleme (manuel)

```bash
eas build -p android --profile production   # .aab üretir
```

Google Play API, hiç sürüm yüklenmemiş bir uygulamaya ilk paketi **kabul etmez**.
**İlk AAB'yi elle yükle:** EAS build sayfasından `.aab`'yi indir → Play
Console → Test and release → Testing → **Internal testing** → Create new release
→ yükle → kaydet.

### 6.3 Sonraki yüklemeler (`eas submit`)

1. Google Cloud Console → bir proje → IAM → **Service account** oluştur → JSON key indir.
2. Play Console → Users and permissions → servis hesabı e-postasını davet et
   (Releases: "Release to testing tracks" yetkisi yeterli).
3. JSON'u depo köküne `secrets/google-play-service-account.json` olarak koy
   (`/secrets/` .gitignore'da). Başka bir yerdeyse:
   `export GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH=/tam/yol/key.json`.
   Anahtarı EAS'a yüklemeyi tercih edersen (`eas credentials -p android` →
   Google Service Account), `eas.json`'daki `serviceAccountKeyPath` satırını sil.
4. ```bash
   eas submit -p android --profile production --latest
   ```
   `track: internal`, `releaseStatus: draft`. Uygulama Play'de hâlâ "taslak"
   durumundayken Google yalnızca taslak sürüm kabul eder. Sürüm Play Console'da
   "Review release" → "Start rollout" ile yayınlanır. İlk production yayınından
   sonra istersen `releaseStatus`'u `completed` yap.

### 6.4 İç test kanalı

Internal testing → Testers → e-posta listesi oluştur (en fazla 100) → katılım
bağlantısını ekiple paylaş. Duman testi §5'teki ile aynı (Android'de paylaşım
menüsünde **Tariften** görünür, `text/*`).

**Android push için eksik:** `google-services.json` henüz yok. Eklenene kadar
Android'de push token alınmaz (uygulama çökmez). Bkz. `docs/NOTIFICATIONS_MOBILE.md` §2.2.

## 7. Gizlilik

### 7.1 iOS privacy manifest (`PrivacyInfo.xcprivacy`)

- Expo SDK 55'te `ios.privacyManifests` tanımlı değilse Expo kendi dosyasını
  yazmaz. Ama `pod install` sırasında React Native'in toplama betiği
  (`privacy_file_aggregation_enabled`, varsayılan açık) **uygulama hedefi için**
  `ios/Tariften/PrivacyInfo.xcprivacy` üretir: RN çekirdeği (FileTimestamp
  C617.1, UserDefaults CA92.1, SystemBootTime 35F9.1) ve pod'ların kendi
  manifestleri (expo-file-system: FileTimestamp 0A2A.1/3B52.1, DiskSpace
  E174.1/85F4.1; expo-application: C617.1; expo-constants ve expo-notifications:
  CA92.1). `NSPrivacyTracking` = false.
- Paylaşım uzantısı App Group'ta `UserDefaults` kullanır. `expo-share-intent`
  uzantı klasörüne kendi `PrivacyInfo.xcprivacy` dosyasını yazar (UserDefaults CA92.1).
- Uygulama kodumuz "required reason" API'lerini doğrudan çağırmıyor. Takip /
  reklam SDK'sı yok. Firebase Analytics kaldırıldı.
- İstersen ileride `app.json` → `ios.privacyManifests.NSPrivacyCollectedDataTypes`
  ile toplanan veri türlerini manifeste de yaz. App Store'daki "App Privacy"
  beyanı (aşağıda) zorunlu ve asıl kaynak.
- TestFlight yüklemesinden sonra Apple'dan **ITMS-91053** e-postası gelirse
  hangi dosya ve hangi API olduğunu bu belgeye ekle, `ios.privacyManifests` ile kapat.

### 7.2 App Store "App Privacy" taslağı

Tracking: **Hayır.** Üçüncü taraf reklam/analitik yok.

| Apple kategorisi | Ne | Kullanıcıya bağlı | Amaç |
| --- | --- | --- | --- |
| Contact Info → Email Address | Hesap e-postası (bülten aboneliği de aynı adres) | Evet | App Functionality |
| Contact Info → Name | Ad soyad (`fullname`), Apple ile girişte verilen ad | Evet | App Functionality |
| Health & Fitness → Health | Alerji / tepki bilgisi. **Yalnızca açık rıza ile** gönderilir, rıza geri alınabilir | Evet | App Functionality (tarif uyarıları) |
| User Content → Photos or Videos | Profil fotoğrafı, tarif fotoğrafları, Dolap/fiş fotoğrafı (AI analizi için) | Evet | App Functionality |
| User Content → Other User Content | Tarifler, yorumlar, puanlar, favoriler/pişirdiklerim, Dolap, Bu Hafta, alışveriş listesi, menüler, aktarılan sosyal video bağlantıları, mutfak profili (diyet, sevmedikleri, ekipman, kişi sayısı) | Evet | App Functionality |
| Identifiers → User ID | Hesap kimliği | Evet | App Functionality |
| Identifiers → Device ID | Push için rastgele `device_id` (SecureStore) + Expo push token | Evet | App Functionality |

Toplanmayanlar: konum, kişiler, ödeme, tarama geçmişi, teşhis (crash SDK yok),
kullanım verisi / analitik. Ses: konuşma tanıma cihazdaki işletim sistemi
servisiyle yapılır. Ses ve transkript Tariften sunucusuna gönderilmez.
**Kontrol et:** Core arama sorgularını kalıcı olarak saklıyorsa "Search
History" ekle. AI sağlayıcıları (tarif/fotoğraf analizi) bizim adımıza işlem
yapan servis sağlayıcılarıdır, bu "tracking" sayılmaz.

### 7.3 Google Play "Data safety" taslağı

- Veri aktarımda şifreli: **Evet** (`https://api.tariften.com`).
- Kullanıcı silme isteyebilir: **Evet** → uygulama içi + web.
- Üçüncü taraflarla paylaşım: **Hayır** (servis sağlayıcı işleme paylaşım sayılmaz).

| Play kategorisi | Toplanır | Zorunlu mu | Amaç |
| --- | --- | --- | --- |
| Personal info → Name, Email address, User IDs | Evet | Zorunlu (hesap) | Account management, App functionality |
| Health and fitness → Health info (alerjiler) | Evet | İsteğe bağlı, rıza ile | App functionality, Personalization |
| Photos and videos → Photos | Evet | İsteğe bağlı | App functionality |
| App activity → Other user-generated content | Evet | İsteğe bağlı | App functionality |
| Device or other IDs | Evet (push token, device_id) | İsteğe bağlı | App functionality (bildirim) |
| Audio | Hayır (cihazda işlenir, sunucuya gitmez) | — | — |

Ayrıca: App content → **Ads: Hayır**, Target audience: 13+ (çocuk hedefli değil),
Content rating (IARC): kullanıcılar içerik paylaşabilir. Alerji verisi için
Play "Health apps" beyanı sorarsa: tıbbi uygulama değil, beslenme/tarif kişiselleştirmesi.

### 7.4 Hesap silme

- Uygulama içi: **Profil** sekmesi → ayarlar listesi → **Hesabımı Sil** → onay
  (`POST /tariften/v1/auth/delete-account`).
- Web (Google Play'in istediği bağlantı): **https://tariften.com/delete-account**
- ⚠️ Web sayfası "Profili Düzenle → en altta Hesabımı Sil → `HESABIMI SIL`
  yaz" diyor. Uygulamada buton Profil sekmesinde ve onay bir uyarı penceresi.
  Mağaza incelemesinden önce web metnini uygulamayla eşitle.
- Sign in with Apple ile açılmış hesap silinirken Core'un Apple token'ını
  iptal ettiğini (Apple REST `revoke`) doğrula. App Review 5.1.1(v) bunu ister.

## 8. Mağaza görselleri ve metinler

**App Store**

| Varlık | Ölçü |
| --- | --- |
| Uygulama ikonu | 1024×1024 PNG, saydamlık yok (`assets/icon.png` kaynağından) |
| iPhone 6.9" ekran görüntüsü (zorunlu) | 1320×2868 veya 1290×2796 dikey, 1–10 adet |
| iPhone 6.5" (isteğe bağlı) | 1284×2778 veya 1242×2688 |
| **iPad 13"** (zorunlu, çünkü `supportsTablet: true`) | 2064×2752 veya 2048×2732 |
| App Preview videosu (isteğe bağlı) | 886×1920, 15–30 sn |
| Ad / Alt başlık | ≤30 / ≤30 karakter |
| Promotional text / Açıklama / Anahtar kelimeler | ≤170 / ≤4000 / ≤100 karakter |

iPad görüntüsü hazırlamak istemezsen bu bir ürün kararı:
`ios.supportsTablet: false` (ayrı küçük PR, iPad'de büyütülmüş iPhone uygulaması olarak çalışır).

**Google Play**

| Varlık | Ölçü |
| --- | --- |
| Uygulama ikonu | 512×512 PNG (32-bit), ≤1 MB |
| Feature graphic | 1024×500 JPG/PNG, saydamlık yok |
| Telefon ekran görüntüleri | 2–8 adet, 9:16, kısa kenar ≥1080 px önerilir (ör. 1080×1920) |
| 7"/10" tablet görüntüleri | İsteğe bağlı (tablet önerileri için gerekli) |
| Kısa / tam açıklama | ≤80 / ≤4000 karakter |

**Ekran görüntüsü listesi (önerilen sıra)**

1. Keşfet: tarif akışı ve arama
2. Tarif detayı: kişi sayısı, malzemeler, alerji bandı
3. **Paylaş → Tariften'e Aktar** (Instagram/TikTok bağlantısından tarif)
4. Pişirme rehberi: büyük adım metni, sesli komut, sayaç
5. Mutfak profili: diyet ve alerjiler (rıza adımı)
6. Bu Hafta + Alışveriş listesi
7. Dolap: eldekilerle tarif önerisi
8. Mutfak Rehberi makalesi

## 9. iOS 16 minimum ve Xcode 27 notu

- Minimum iOS sürümü **16.0**'a çıkıyor (paralel PR, `expo-build-properties`).
  iOS 15 cihazlar App Store'da uygulamayı göremez. App Store Connect'te ayrıca bir ayar yok.
- Neden: Xcode 27'nin iOS 27 SDK'sı `UIAction.subtitle`'ı iOS 16+ olarak
  işaretliyor. Expo Router 55'in `LinkPreviewNativeActionView.swift` dosyası iOS
  15.1 hedefinde derlenmiyor. Xcode 27 ayrıca çok eski (iOS 9/10) deployment
  target'lı Pod hedeflerini reddediyor. Yerel simülatörde bunu
  `scripts/ios-xcode27-pods-min-target.cjs` çözüyor. Bu betik **EAS'ta çalışmaz**.
- EAS build görüntüsü Xcode 27 kullanıyorsa iOS 16 PR'ı birleşmeden production
  build başarısız olabilir. Build logundaki Xcode sürümüne bak. Apple'ın güncel
  "minimum SDK" şartını App Store Connect duyurularından kontrol et. Gerekirse
  `eas.json` → `build.production.ios.image` ile görüntü sabitlenebilir (ayrı karar).

## 10. App Review notları (taslak)

App Store Connect → App Review Information:

- **Demo hesap** (zorunlu, özelliklerin çoğu giriş ister): Core'da ayrı bir
  test kullanıcısı aç, ör. `appreview@tariften.com` + güçlü parola. Hesapta
  birkaç kayıtlı tarif, Dolap ve Bu Hafta verisi olsun. AI kotası yeterli olsun.
  Alerji rızası **verilmemiş** olsun (inceleme rıza akışını görsün).
- Not metni (İngilizce gönder):

  > Tariften is a Turkish recipe app. Sign in with the demo account above or
  > with Sign in with Apple. To import a recipe from a social video, open a
  > recipe video link in Safari, tap Share → "Tariften'e Aktar"; the app opens
  > the import screen and only starts the analysis after the user taps the
  > button. The microphone and speech recognition are used only in the cooking
  > guide for hands-free commands ("sonraki" = next, "önceki" = previous,
  > "oku" = read). Allergy information is health data and is only saved after
  > explicit consent on the Kitchen Profile screen. AI features have free daily
  > quotas; there are no in-app purchases. Account deletion: Profile tab →
  > "Hesabımı Sil". User-generated recipes and comments are moderated before
  > publication.

## 11. İnceleme riskleri (göndermeden önce karar ver)

- **Kullanıcı içeriği (Guideline 1.2):** yorum ve tarifler yayın öncesi moderasyondan
  geçiyor, ama uygulamada **"içeriği bildir"** ve **"kullanıcıyı engelle"** yok.
  Apple bunları isteyebilir. Web'de `/content-report` var, mobile eklemek ayrı paket.
- **"Premium · Yakında"** etiketleri (`components/QuotaCard.tsx`): satın alma
  yok ama "yakında" vaadi 2.1/2.3 itirazına yol açabilir. Mağaza build'inde gizlemeyi düşün.
- **iPad ekran görüntüleri** (`supportsTablet: true`): bkz. §8.
- Android manifestinde Expo şablonundan gelen `SYSTEM_ALERT_WINDOW` ve
  `READ/WRITE_EXTERNAL_STORAGE` (maxSdk 32) var. Uygulama kullanmıyor.
  Kaldırmak istersen `android.blockedPermissions` ekle (universal links PR'ı
  birleştikten sonra, çakışmasın diye ayrı küçük PR).
- `expo-secure-store` varsayılan İngilizce Face ID metni (`NSFaceIDUsageDescription`)
  Info.plist'te duruyor. Face ID kullanılmadığı için kullanıcıya hiç gösterilmez.

## 12. Bu pakette depoda yapılanlar

- `eas.json`: `preview` (iç dağıtım, Android APK), `production` (`distribution: store`,
  Android AAB, `autoIncrement`), `submit.production` (iOS `TODO` yer tutucular,
  Android `track: internal`, `releaseStatus: draft`, servis hesabı yolu
  `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH` ya da `./secrets/…`).
- `app.json`: `expo-audio` eklentisinin mikrofon metni ("Sesli tarif arama…")
  gerçek kullanımla değiştirildi. Bu metin Info.plist'teki asıl metni ezip
  olmayan bir özelliği anlatıyordu.
- Paylaşım uzantısı production için doğru: `com.tariften.app.share-extension`,
  `group.com.tariften.app`, EAS `appExtensions` kaydı eklenti tarafından ekleniyor.
  Değişiklik gerekmedi.
- CI: `scripts/check-release-prep.test.cjs`.
