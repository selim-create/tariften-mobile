/**
 * "Sosyal medyadan tarif kaydetmeyi öğren": the short walkthrough shown once
 * to a NEW account after the kitchen profile step, and any time from Profile
 * ("Nasıl kullanılır?"). Pure data + rules (no React Native) so
 * scripts/check-onboarding-review.test.cjs can test them.
 *
 * The steps mirror the real "Paylaş → Tariften" path:
 *  - iOS: the video app's Paylaş → its menu's "Paylaş…" (system share sheet)
 *    → first time only "Daha Fazla" → "Tariften'e Aktar" (our share extension,
 *    app.json `iosShareExtensionName`) → Tarif Aktar opens with the link
 *    already filled in → "Bağlantıdan tarif oluştur".
 *  - Android: Paylaş → "Tariften" in the system share sheet (expo-share-intent
 *    text/* filter) → Tarif Aktar → "Bağlantıdan tarif oluştur".
 *
 * Everything shown is a self-drawn mock with local demo data: no platform
 * names or logos inside the mock, no network call, no quota.
 */

export type DemoPlatform = 'ios' | 'android';
export type DemoEntry = 'welcome' | 'replay';

/** Scenes drawn inside the phone mock. */
export type DemoScene = 'video' | 'appMenu' | 'systemSheet' | 'moreApps' | 'androidSheet' | 'aktar';

export type DemoStep = {
  scene: DemoScene;
  kicker: string;
  /** AccentText: the *starred* part is the brand-italic accent. */
  title: string;
  hint: string;
  /** What the highlighted target says (also its VoiceOver label). */
  target: string;
  /** VoiceOver hint for the target. */
  a11yHint: string;
};

/** Label of the iOS share sheet's last item in the app row (Turkish iOS). */
export const IOS_MORE_LABEL = 'Daha Fazla';
/** Our iOS share extension's name in the share sheet (app.json `iosShareExtensionName`). */
export const IOS_SHARE_TARGET = "Tariften'e Aktar";
/** Android share sheet shows the app's name. */
export const ANDROID_SHARE_TARGET = 'Tariften';
/** The real Tarif Aktar button for a shared video link (app/recipe/import.tsx). */
export const AKTAR_BUTTON = 'Bağlantıdan tarif oluştur';

const VIDEO_STEP: DemoStep = {
  scene: 'video',
  kicker: 'Adım 1',
  title: 'Tarif videosunda *Paylaş*’a dokun',
  hint: 'Instagram, TikTok veya YouTube’da beğendiğin bir tarif videosu açıkken.',
  target: 'Paylaş',
  a11yHint: 'Paylaşım menüsünü açar',
};

const AKTAR_STEP: DemoStep = {
  scene: 'aktar',
  kicker: 'Son adım',
  title: 'Bağlantın hazır, *tarifi oluştur*',
  hint: 'Tariften kendiliğinden açılır ve video bağlantısını yapıştırır. Tek dokunuş yeter.',
  target: AKTAR_BUTTON,
  a11yHint: 'Örnek tarifi hazırlar',
};

const IOS_STEPS: DemoStep[] = [
  VIDEO_STEP,
  {
    scene: 'appMenu',
    kicker: 'Adım 2',
    title: 'Menüde *Paylaş…*’ı seç',
    hint: 'Bazı uygulamalarda bu seçeneğin adı “Diğer”.',
    target: 'Paylaş…',
    a11yHint: 'Telefonun paylaşım ekranını açar',
  },
  {
    scene: 'systemSheet',
    kicker: 'Adım 3 · Yalnızca ilk sefer',
    title: 'Tariften’i göremezsen *Daha Fazla*',
    hint: 'Uygulama sırasının sonundadır. Bir kez seçince Tariften bu sırada kalır.',
    target: IOS_MORE_LABEL,
    a11yHint: 'Tüm uygulamaların listesini açar',
  },
  {
    scene: 'moreApps',
    kicker: 'Adım 4',
    title: '*Tariften’e Aktar*’ı seç',
    hint: 'İstersen Sık Kullanılanlar’a ekle; bir dahaki sefere ilk sırada çıkar.',
    target: IOS_SHARE_TARGET,
    a11yHint: 'Videoyu Tariften’e gönderir',
  },
  AKTAR_STEP,
];

const ANDROID_STEPS: DemoStep[] = [
  VIDEO_STEP,
  {
    scene: 'androidSheet',
    kicker: 'Adım 2',
    title: 'Paylaşım ekranında *Tariften*’i seç',
    hint: 'Göremezsen listeyi yukarı kaydır. İlk paylaşımdan sonra öne gelir.',
    target: ANDROID_SHARE_TARGET,
    a11yHint: 'Videoyu Tariften’e gönderir',
  },
  AKTAR_STEP,
];

/** The tap-to-advance steps for this platform (iOS 5 taps, Android 3). */
export function demoSteps(platform: string): DemoStep[] {
  return (platform === 'android' ? ANDROID_STEPS : IOS_STEPS).map(step => ({ ...step }));
}

/** "Tarifin hazırlanıyor…" checklist; ticks locally, nothing is sent anywhere. */
export const PREPARING_LINES = ['Video izleniyor', 'Malzemeler ve ölçüler çıkarılıyor', 'Adımlar yazılıyor'] as const;
export const PREPARING_TICK_MS = 750;

export const COPY = {
  progressLabel: 'Tarif kaydetmeyi öğren',
  skip: 'Atla',
  next: 'Devam',
  preparingTitle: 'Tarifin *hazırlanıyor…*',
  preparingHint: 'Gerçekte bu 1–2 dakika sürer. Uygulamadan çıkabilirsin; hazır olunca haber veririz.',
  doneKicker: 'Örnek tarif',
  doneTitle: 'Tarifin *hazır!*',
  doneHint: 'Malzemeler, ölçüler ve adımlar videodan çıkarıldı. Bir göz atıp onayladığında defterine eklenir.',
  doneCta: 'Harika, devam',
  finishCta: 'Mutfağa geç',
  replayFinishCta: 'Tamam',
  notifyTitle: 'Tarifin hazır olunca *haber verelim mi?*',
  notifyBody: 'Video incelemesi birkaç dakika sürebilir. Uygulamadan çıkabilirsin; tarifin hazır olduğunda tek bir bildirim göndeririz.',
  notifyNote: 'Kampanya ya da reklam bildirimi göndermeyiz. Profil’den istediğin zaman kapatabilirsin.',
  notifyAccept: 'Haber ver',
  notifyDecline: 'Şimdi değil',
  wrongTap: 'Turuncu halkaya dokun ya da Devam’a bas.',
} as const;

/** Static sample recipe for the success card. Local only. */
export const DEMO_RECIPE = {
  title: 'Domatesli Fesleğenli Makarna',
  creator: '@ornek.mutfak',
  caption: '15 dakikada domatesli makarna',
  minutes: 15,
  servings: 2,
  ingredients: [
    { name: 'makarna', label: '200 g makarna' },
    { name: 'domates', label: '3 domates' },
    { name: 'sarımsak', label: '2 diş sarımsak' },
    { name: 'fesleğen', label: '1 avuç fesleğen' },
    { name: 'zeytinyağı', label: '2 yemek kaşığı zeytinyağı' },
    { name: 'parmesan', label: 'Rendelenmiş parmesan' },
  ],
  firstStep: 'Makarnayı tuzlu suda haşla; bu sırada sarımsağı zeytinyağında hafifçe çevir.',
} as const;

// ---- who sees it ----------------------------------------------------------------------------

/** One flag per account on this device. SecureStore keys allow [A-Za-z0-9._-]. */
export function seenKey(userId: number): string | null {
  return Number.isInteger(userId) && userId > 0 ? `tariften_onb_social_v1_${userId}` : null;
}

export function parseEntry(value: unknown): DemoEntry {
  return value === 'welcome' ? 'welcome' : 'replay';
}

/**
 * Welcome (right after a new account's kitchen profile step): once per
 * account. Replay from Profile: always. Nothing else ever opens it, so
 * existing members are never forced through it.
 */
export function shouldShowSocialOnboarding(input: { entry: DemoEntry | null; userId: number | null | undefined; seen: boolean }): boolean {
  if (input.entry === 'replay') return true;
  if (input.entry !== 'welcome') return false;
  return !!input.userId && input.userId > 0 && !input.seen;
}

/** The optional notification card follows the existing permission rules (see notifications-core). */
export function showNotifyCard(canOffer: boolean): boolean {
  return canOffer;
}
