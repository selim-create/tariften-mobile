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
  preparingKicker: 'Neredeyse bitti',
  preparingTitle: 'Tarifin *hazırlanıyor…*',
  preparingHint: 'Gerçekte bu 1–2 dakika sürer. Uygulamadan çıkabilirsin; hazır olunca haber veririz.',
  doneKicker: 'Örnek tarif',
  doneTitle: 'Tarifin *hazır*',
  doneHint: 'Malzemeler, ölçüler ve adımlar videodan çıkarıldı. Göz atıp onayladığında defterine eklenir.',
  doneRibbon: 'Defterine eklemeye hazır',
  doneBadge: 'Videodan',
  doneCta: 'Harika, devam',
  finishCta: 'Mutfağa geç',
  replayFinishCta: 'Tamam',
  notifyTitle: 'Tarifin hazır olunca *haber verelim mi?*',
  notifyBody: 'Video incelemesi birkaç dakika sürebilir. Uygulamadan çıkabilirsin; tarifin hazır olduğunda tek bir bildirim göndeririz.',
  notifyNote: 'Kampanya ya da reklam bildirimi göndermeyiz. Profil’den istediğin zaman kapatabilirsin.',
  notifyAccept: 'Haber ver',
  notifyDecline: 'Şimdi değil',
  wrongTap: 'Vurgulanan alana dokun ya da Devam’a bas.',
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

// ---- layout helpers (pure, tested) -----------------------------------------------------------

/**
 * Turkish-aware uppercase for kickers. `textTransform: 'uppercase'` is not
 * locale aware on iOS ("Örnek tarif" → "ÖRNEK TARIF"), so kickers are
 * uppercased here instead: i → İ, ı → I.
 */
export function trUpper(text: string): string {
  return text.replace(/i/g, 'İ').replace(/ı/g, 'I').toUpperCase();
}

/** Height / width of the self-drawn phone. */
export const PHONE_RATIO = 2.05;

/**
 * The phone mock's size for the space it is given: as large as fits (at most
 * 600 pt tall, ~74% of the width), never taller than the stage, so it can
 * never run under the footer on a small phone or at large Dynamic Type.
 */
export function phoneSize(stage: { width: number; height: number }): { width: number; height: number } | null {
  if (!(stage.width > 0) || !(stage.height > 0)) return null;
  const h = Math.floor(Math.min(stage.height - 12, stage.width * 0.74 * PHONE_RATIO, 600));
  if (h < 120) return null;
  return { width: Math.floor(h / PHONE_RATIO), height: h };
}

export type Rect = { x: number; y: number; width: number; height: number };
export type TagSide = 'left' | 'top' | 'bottom' | 'right';
export type TagPlacement = {
  side: TagSide;
  /** Top-left of the pill, in the phone screen's coordinates. */
  x: number;
  y: number;
  /** Where the caret sits along the pill's edge that faces the target. */
  caret: number;
};

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function within(inner: Rect, outer: Rect): boolean {
  const e = 0.5; // sub-pixel rounding
  return inner.x >= outer.x - e && inner.y >= outer.y - e
    && inner.x + inner.width <= outer.x + outer.width + e && inner.y + inner.height <= outer.y + outer.height + e;
}

const OPPOSITE: Record<TagSide, TagSide> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Where the "Dokun" tag goes: next to the target on the preferred side, kept
 * fully inside the phone screen (`bounds`), clear of the target and of any
 * `avoid` rect (caption, rail). Falls back to the opposite side, then the
 * other two; returns null when no side fits (the ring alone then marks the
 * target, the tag is never drawn clipped or over content).
 */
export function placeTag(input: {
  target: Rect;
  tag: { width: number; height: number };
  bounds: Rect;
  prefer: TagSide;
  /** Space between the target and the caret tip. */
  gap: number;
  /** How far the caret pokes out of the pill. */
  caret: number;
  avoid?: Rect[];
  /**
   * Sides allowed, in order. Defaults to the preferred side, its opposite,
   * then the other two. The phone passes only the side it reserved room for,
   * so the tag never lands on a sheet's other rows.
   */
  sides?: TagSide[];
}): TagPlacement | null {
  const { target: t, tag, bounds: b, gap, caret: c } = input;
  if (!(tag.width > 0) || !(tag.height > 0)) return null;
  const rest = (['left', 'top', 'bottom', 'right'] as TagSide[]).filter(s => s !== input.prefer && s !== OPPOSITE[input.prefer]);
  const order: TagSide[] = input.sides && input.sides.length ? input.sides : [input.prefer, OPPOSITE[input.prefer], ...rest];
  const cx = t.x + t.width / 2;
  const cy = t.y + t.height / 2;
  const r = Math.min(tag.height / 2, tag.width / 2);

  for (const side of order) {
    const vertical = side === 'top' || side === 'bottom';
    let x: number;
    let y: number;
    let footprint: Rect;
    if (vertical) {
      x = clamp(cx - tag.width / 2, b.x, b.x + b.width - tag.width);
      y = side === 'top' ? t.y - gap - c - tag.height : t.y + t.height + gap + c;
      footprint = { x, y: side === 'top' ? y : y - c, width: tag.width, height: tag.height + c };
    } else {
      y = clamp(cy - tag.height / 2, b.y, b.y + b.height - tag.height);
      x = side === 'left' ? t.x - gap - c - tag.width : t.x + t.width + gap + c;
      footprint = { x: side === 'left' ? x : x - c, y, width: tag.width + c, height: tag.height };
    }
    if (tag.width > b.width || tag.height > b.height) continue;
    if (!within(footprint, b)) continue;
    // The caret must point at the target's centre from the pill's straight edge: a pill pushed
    // sideways by the screen edge would otherwise point past the target. Beside the target
    // (left/right) the rounded ends leave only the middle, so a clamped pill is rejected.
    const caretAt = vertical ? cx - x : cy - y;
    const lo = vertical ? r : tag.height / 2 - 1;
    const hi = vertical ? tag.width - r : tag.height / 2 + 1;
    if (caretAt < lo - 0.5 || caretAt > hi + 0.5) continue;
    if (rectsOverlap(footprint, t)) continue;
    if ((input.avoid || []).some(a => rectsOverlap(footprint, a))) continue;
    return { side, x, y, caret: caretAt };
  }
  return null;
}
