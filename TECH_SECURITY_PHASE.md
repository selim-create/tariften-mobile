# Tariften Mobile — Teknik güvenlik fazı (Premium kapsam dışı)

Bu PR için **Premium/abonelik/ödeme** geliştirmesi yapılmıyor.

## Çözülenler
- `forgotPassword` artık API çağrısı başarısız olsa bile "başarılı" dönmüyor. Unverified password recovery UX düzeltildi. Core 1.0.15 gerçek WordPress reset endpoint'i ekliyor.
- WordPress yorum moderasyonu açık olduğunda kullanıcı "Yorum onay bekliyor" mesajı alıyor.
- Android manifest'inden eski/çoğu yeni cihazda gereksiz `READ_EXTERNAL_STORAGE` doğrudan izin isteği çıkarıldı; uygulama içindeki Expo ImagePicker akışı korunuyor. Değişiklik native EAS rebuild sonrasında manifestte görünür.
- Expo/Xcode 27, MacBook'ta doğruladığımız IPv6 `localhost` sorununu yaşamamak için **`npm run ios:sim`** scripti eklendi (Mac geliştirme ortamı).
- CI artık `npx expo install --check` sonucu ve `npm audit --omit=dev` JSON raporunu kaydediyor; production güvenlik bulgularını GitHub Actions artifact olarak saklıyor.
- `package-lock.json` **bilerek değiştirilmedi**: versiyon ve lock dosyasını eşsiz, tutarlı bir yükseltme PR'ında bir arada güncellemek gerekiyor. Kullanıcı Mac'inde `package.json` ve `package-lock.json` üzerinde daha önce yerel değişiklikler yapmıştı, bunları sıfırlama.

## Kalan teknik borç / açık risk
Önceki yerel kurulum 52 npm audit bulgusu (3 kritik dahil) ve Expo SDK 55 patch sürümü uyumsuzlukları gösteriyordu. Bu PR bunları **düzelttik diye iddia etmiyor**. Ağ, paketin etkilenme kapsamı ve desteklenen Expo sürümüyle birlikte ayrı bağımlılık PR'ında çözülecek; rastgele `npm audit fix --force` kullanılmamalı.

## Uygulama sırası
1. Önce Core 1.0.15 PR merge ve `./deploy-core.sh`.
2. Ardından bu Mobile PR'ı manuel merge.
3. Mac: `cd "/Users/selimaltinkaynak/Desktop/edit/Projeler/Tariften.com/tariften-mobile"`; `git status --short`; `git pull --ff-only origin main`; `npm ci`; `npx tsc --noEmit`; `npm run ios:sim`.
4. Mevcut üyeyle oturum açma, şifre sıfırlama yanıtı, yorum gönderme/moderasyon; fiş okutma ise ücretli AI çağrısı gerektirdiğinden açık onay olmadan canlı test edilmez.
5. CI artifact `mobile-production-npm-audit` indirilerek doğrudan runtime bağımlılıkları sınıflandırılır.
