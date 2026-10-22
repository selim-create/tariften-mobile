/**
 * Mutfak Rehberi etkileşimli araçları (P23): yumurta pişme derecesi, makarna
 * zamanlayıcı, kurutma rehberi ve ölçü çevirici. Pure logic only: no React,
 * no network, no native modules, so every number here is covered by
 * scripts/check-guide-tools.test.cjs. The web implementation mirrors these
 * values; change both together.
 *
 * Roadmap rule: a result can never leave its safe range. Every calculator
 * clamps its output and refuses inputs it does not know.
 */

// ---------------------------------------------------------------------------
// Tool keys (Core `tool` meta, docs/MUTFAK_REHBERI.md)

export type GuideToolKey = 'egg_doneness' | 'pasta_timer' | 'drying_guide' | 'measure_converter';

export interface GuideToolInfo {
  key: GuideToolKey;
  /** `/rehber/araclar?arac=<slug>` */
  slug: 'yumurta' | 'makarna' | 'kurutma' | 'olcu';
  title: string;
  short: string;
  description: string;
  /** Ionicons glyph name. */
  icon: string;
}

export const GUIDE_TOOLS: readonly GuideToolInfo[] = [
  {
    key: 'egg_doneness', slug: 'yumurta', title: 'Yumurta pişme derecesi', short: 'Yumurta',
    description: 'Boyuna ve kıvamına göre dakika dakika süre, zamanlayıcıyla.', icon: 'egg-outline',
  },
  {
    key: 'pasta_timer', slug: 'makarna', title: 'Makarna zamanlayıcı', short: 'Makarna',
    description: 'Su, tuz ve süre: al dente ya da yumuşak, porsiyona göre.', icon: 'timer-outline',
  },
  {
    key: 'drying_guide', slug: 'kurutma', title: 'Kurutma rehberi', short: 'Kurutma',
    description: 'Sebze, meyve ve otlar için ısı, süre, hazır olma testi ve saklama.', icon: 'sunny-outline',
  },
  {
    key: 'measure_converter', slug: 'olcu', title: 'Ölçü çevirici', short: 'Ölçü',
    description: 'Su bardağı, kaşık, ml ve gram arasında güvenilir çeviri.', icon: 'swap-horizontal-outline',
  },
];

/** Known tool for a Core `tool` value; anything else (unknown key, null) → null. */
export function guideTool(key: unknown): GuideToolInfo | null {
  return typeof key === 'string' ? GUIDE_TOOLS.find(t => t.key === key) || null : null;
}

/** Tool for `?arac=` (slug or Core key); null when unknown. */
export function guideToolBySlug(slug: unknown): GuideToolInfo | null {
  const value = Array.isArray(slug) ? slug[0] : slug;
  if (typeof value !== 'string') return null;
  return GUIDE_TOOLS.find(t => t.slug === value || t.key === value) || null;
}

// ---------------------------------------------------------------------------
// Shared helpers

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** "1,5" · "1.5" · "1/2" · "1 1/2" · "½" → number; anything else → null. */
export function parseAmount(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input !== 'string') return null;
  const fractions: Record<string, string> = { '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3' };
  const text = input.trim().replace(/[½¼¾⅓⅔]/g, c => fractions[c]).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  let m = /^(\d+) (\d+)\/(\d+)$/.exec(text);
  if (m) return Number(m[3]) > 0 ? Number(m[1]) + Number(m[2]) / Number(m[3]) : null;
  m = /^(\d+)\/(\d+)$/.exec(text);
  if (m) return Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return Number(text.replace(',', '.'));
  return null;
}

/** Turkish decimal: 1.5 → "1,5"; trailing zeros dropped. */
export function formatNumberTr(value: number, maxDecimals = 1): string {
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded).replace('.', ',');
}

/** "6 dk" · "6,5 dk" · "6 dk 30 sn" style label for whole/half minutes. */
export function minutesLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (!sec) return `${min} dk`;
  if (!min) return `${sec} sn`;
  return `${min} dk ${sec} sn`;
}

/** Countdown clock "mm:ss" (or "h:mm:ss" past an hour). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// Timestamp timers (survive backgrounding: only the end time is stored)

export type TimerKind = 'egg' | 'pasta';

export interface KitchenTimer {
  kind: TimerKind;
  /** Total length, seconds. */
  durationSec: number;
  startedAt: number;
  endsAt: number;
  /** Short Turkish summary, e.g. "M boy · kayısı". */
  label: string;
}

/** Longest timer we ever start (pasta 20 dk, egg 13 dk; margin for both). */
export const TIMER_MAX_SEC = 30 * 60;

export function startTimer(kind: TimerKind, durationSec: number, label: string, now: number): KitchenTimer | null {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || !Number.isFinite(now)) return null;
  const duration = Math.round(clamp(durationSec, 1, TIMER_MAX_SEC));
  return { kind, durationSec: duration, startedAt: now, endsAt: now + duration * 1000, label: String(label || '').slice(0, 80) };
}

export interface TimerSnapshot {
  remainingSec: number;
  done: boolean;
  /** 0 → 1 elapsed share, for a progress ring/bar. */
  progress: number;
}

export function timerSnapshot(timer: KitchenTimer, now: number): TimerSnapshot {
  const remainingMs = Math.max(0, timer.endsAt - now);
  const totalMs = Math.max(1, timer.durationSec * 1000);
  return {
    remainingSec: Math.ceil(remainingMs / 1000),
    done: remainingMs <= 0,
    progress: clamp(1 - remainingMs / totalMs, 0, 1),
  };
}

/** A stored timer from SecureStore; null when malformed, foreign or stale (> 6 h past its end). */
export function parseStoredTimer(raw: unknown, now: number): KitchenTimer | null {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const t = value as Record<string, unknown>;
  if (t.kind !== 'egg' && t.kind !== 'pasta') return null;
  const durationSec = Number(t.durationSec);
  const startedAt = Number(t.startedAt);
  const endsAt = Number(t.endsAt);
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > TIMER_MAX_SEC) return null;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt)) return null;
  if (Math.abs(endsAt - startedAt - durationSec * 1000) > 1000) return null;
  if (startedAt > now + 60_000) return null; // clock moved back or forged
  if (now - endsAt > 6 * 3600 * 1000) return null;
  return { kind: t.kind, durationSec, startedAt, endsAt, label: typeof t.label === 'string' ? t.label.slice(0, 80) : '' };
}

// ---------------------------------------------------------------------------
// 1. Yumurta pişme derecesi

export type EggSize = 'S' | 'M' | 'L' | 'XL';
export type EggStart = 'fridge' | 'room';
export type EggDoneness = 'rafadan' | 'kayisi' | 'kati';

export const EGG_SIZES: readonly { key: EggSize; label: string; grams: string }[] = [
  { key: 'S', label: 'S', grams: '53 g altı' },
  { key: 'M', label: 'M', grams: '53–63 g' },
  { key: 'L', label: 'L', grams: '63–73 g' },
  { key: 'XL', label: 'XL', grams: '73 g üstü' },
];

export const EGG_STARTS: readonly { key: EggStart; label: string }[] = [
  { key: 'fridge', label: 'Buzdolabından' },
  { key: 'room', label: 'Oda sıcaklığında' },
];

export const EGG_DONENESS: readonly { key: EggDoneness; label: string; description: string }[] = [
  { key: 'rafadan', label: 'Rafadan', description: 'Beyazı pişmiş, sarısı akışkan.' },
  { key: 'kayisi', label: 'Kayısı', description: 'Sarısı koyu, kremamsı; ortası hafif yumuşak.' },
  { key: 'kati', label: 'Katı', description: 'Beyazı da sarısı da tamamen pişmiş.' },
];

/** Minutes from boiling water for a fridge-cold M egg. */
export const EGG_BASE_MINUTES: Record<EggDoneness, number> = { rafadan: 6, kayisi: 8, kati: 11 };
/** Size correction, minutes. */
export const EGG_SIZE_OFFSET: Record<EggSize, number> = { S: -0.5, M: 0, L: 0.5, XL: 1 };
/** A room-temperature egg is ready about a minute sooner. */
export const EGG_ROOM_OFFSET = -1;
/** Safe window per doneness, minutes. Katı never goes under 10: the yolk must be fully set. */
export const EGG_RANGE: Record<EggDoneness, [number, number]> = { rafadan: [4.5, 7.5], kayisi: [6.5, 9.5], kati: [10, 13] };

export const EGG_SAFETY_NOTE = 'Akışkan ya da yarı akışkan sarı her zaman biraz risk taşır. Küçük çocuklar, hamileler, yaşlılar ve bağışıklığı zayıf olanlar için yumurtayı katı (sarısı tamamen pişmiş) haşla.';

export interface EggResult {
  seconds: number;
  minutes: number;
  label: string;
  steps: string[];
  /** Shown for rafadan and kayısı. */
  safetyNote: string | null;
}

export function eggTime(input: { size: EggSize; start: EggStart; doneness: EggDoneness }): EggResult | null {
  const base = EGG_BASE_MINUTES[input.doneness];
  const sizeOffset = EGG_SIZE_OFFSET[input.size];
  if (base === undefined || sizeOffset === undefined || (input.start !== 'fridge' && input.start !== 'room')) return null;
  const [min, max] = EGG_RANGE[input.doneness];
  const minutes = clamp(roundTo(base + sizeOffset + (input.start === 'room' ? EGG_ROOM_OFFSET : 0), 0.5), min, max);
  const seconds = Math.round(minutes * 60);
  return {
    seconds,
    minutes,
    label: minutesLabel(seconds),
    steps: [
      'Yumurtaların tamamen batacağı kadar suyu kaynat.',
      'Yumurtaları kaşıkla tek tek, yavaşça suya bırak ve zamanlayıcıyı hemen başlat.',
      'Ateşi kıs; su hafifçe kaynamaya devam etsin.',
      input.doneness === 'kati'
        ? 'Süre bitince yumurtaları soğuk suya al; soyması kolaylaşır.'
        : 'Süre bitince yumurtaları hemen soğuk suya al, pişmesi dursun.',
    ],
    safetyNote: input.doneness === 'kati' ? null : EGG_SAFETY_NOTE,
  };
}

// ---------------------------------------------------------------------------
// 2. Makarna zamanlayıcı

export type PastaShape = 'spagetti' | 'linguine' | 'penne' | 'burgu' | 'fiyonk' | 'rigatoni' | 'eriste' | 'taze';
export type PastaTexture = 'al_dente' | 'yumusak';

/** Typical package time (minutes) for dried pasta; fresh pasta is short. */
export const PASTA_SHAPES: readonly { key: PastaShape; label: string; minutes: number }[] = [
  { key: 'spagetti', label: 'Spagetti', minutes: 9 },
  { key: 'linguine', label: 'Linguine', minutes: 10 },
  { key: 'penne', label: 'Penne', minutes: 11 },
  { key: 'burgu', label: 'Burgu', minutes: 10 },
  { key: 'fiyonk', label: 'Fiyonk', minutes: 11 },
  { key: 'rigatoni', label: 'Rigatoni', minutes: 12 },
  { key: 'eriste', label: 'Erişte', minutes: 8 },
  { key: 'taze', label: 'Taze makarna', minutes: 3 },
];

export const PASTA_TEXTURES: readonly { key: PastaTexture; label: string; description: string }[] = [
  { key: 'al_dente', label: 'Al dente', description: 'Dişe gelen, ortası hafif diri.' },
  { key: 'yumusak', label: 'Yumuşak', description: 'Tamamen yumuşak; çocuklar için ideal.' },
];

/** Package minutes we accept from the person; outside → refused. */
export const PASTA_PACKAGE_RANGE: [number, number] = [2, 20];
/** Final timer window, minutes. */
export const PASTA_TIMER_RANGE: [number, number] = [2, 20];
export const PASTA_GRAMS_PER_PORTION = 100;
export const PASTA_PORTION_RANGE: [number, number] = [1, 10];
/** 1 L water and 10 g salt per 100 g pasta. */
export const PASTA_WATER_L_PER_100G = 1;
export const PASTA_SALT_G_PER_100G = 10;

export interface PastaResult {
  seconds: number;
  minutes: number;
  label: string;
  grams: number;
  waterLiters: number;
  saltGrams: number;
  saltHint: string;
  steps: string[];
  note: string | null;
}

export function pastaPlan(input: {
  shape?: PastaShape | null;
  /** Package minutes; overrides the shape when given. */
  packageMinutes?: number | null;
  texture: PastaTexture;
  portions: number;
}): PastaResult | null {
  let pkg: number | null = null;
  if (input.packageMinutes !== undefined && input.packageMinutes !== null) {
    const n = Number(input.packageMinutes);
    if (!Number.isFinite(n) || n < PASTA_PACKAGE_RANGE[0] || n > PASTA_PACKAGE_RANGE[1]) return null;
    pkg = n;
  } else {
    pkg = PASTA_SHAPES.find(s => s.key === input.shape)?.minutes ?? null;
  }
  if (pkg === null || (input.texture !== 'al_dente' && input.texture !== 'yumusak')) return null;
  const portions = Math.round(Number(input.portions));
  if (!Number.isFinite(portions) || portions < PASTA_PORTION_RANGE[0] || portions > PASTA_PORTION_RANGE[1]) return null;
  const fresh = input.shape === 'taze' && (input.packageMinutes === undefined || input.packageMinutes === null);
  const delta = input.texture === 'al_dente' ? -1 : 1;
  const minutes = clamp(roundTo(pkg + delta, 0.5), PASTA_TIMER_RANGE[0], PASTA_TIMER_RANGE[1]);
  const seconds = Math.round(minutes * 60);
  const grams = portions * PASTA_GRAMS_PER_PORTION;
  const waterLiters = (grams / 100) * PASTA_WATER_L_PER_100G;
  const saltGrams = (grams / 100) * PASTA_SALT_G_PER_100G;
  return {
    seconds,
    minutes,
    label: minutesLabel(seconds),
    grams,
    waterLiters,
    saltGrams,
    saltHint: spoonHint(saltGrams, 'tuz'),
    steps: [
      `${formatNumberTr(waterLiters)} litre suyu büyük bir tencerede fokur fokur kaynat.`,
      `Su kaynayınca ${formatNumberTr(saltGrams, 0)} g tuzu (${spoonHint(saltGrams, 'tuz')}) ekle.`,
      'Makarnayı at, ilk dakika birbirine yapışmasın diye karıştır; zamanlayıcıyı başlat.',
      'Süzmeden önce bir kupa makarna suyu ayır; sosu bağlamak için işe yarar.',
    ],
    note: fresh
      ? 'Taze makarna çok çabuk pişer; paketinde süre yazıyorsa onu gir.'
      : waterLiters > 6 ? 'Bu kadar su için tencere küçük kalırsa makarnayı iki partide haşla.' : null,
  };
}

// ---------------------------------------------------------------------------
// 3. Kurutma rehberi

export type DryingFood = 'domates' | 'biber' | 'patlican' | 'elma' | 'armut' | 'kayisi' | 'mantar' | 'nane' | 'kekik';
export type DryingMethod = 'firin' | 'makine' | 'gunes';

export const DRYING_METHODS: readonly { key: DryingMethod; label: string }[] = [
  { key: 'firin', label: 'Fırın' },
  { key: 'makine', label: 'Kurutma makinesi' },
  { key: 'gunes', label: 'Güneş' },
];

export interface DryingSpec {
  prep: string;
  /** null when drying happens at ambient temperature (sun, shade). */
  tempC: [number, number] | null;
  /** Ambient conditions or oven handling. */
  conditions: string;
  time: { min: number; max: number; unit: 'saat' | 'gün' };
  ready: string;
  storage: string;
  notes: string[];
}

export interface DryingFoodInfo {
  key: DryingFood;
  label: string;
  group: 'sebze' | 'meyve' | 'ot';
  methods: Record<DryingMethod, DryingSpec | { notRecommended: string }>;
}

/** Safe bounds every spec must respect (checked by the tests). */
export const DRYING_TEMP_LIMITS = {
  sebze: [50, 70] as [number, number],
  meyve: [50, 70] as [number, number],
  ot: [35, 50] as [number, number],
};

export const DRYING_GENERAL_NOTES = [
  'Yalnızca taze, sağlam ve iyice yıkanmış ürün kurut; ezik ya da küflü kısımları ayıkla.',
  'Dilimleri aynı kalınlıkta kes ve tepsiye üst üste gelmeden diz.',
  'Et, tavuk ve balık kurutma (jerky) bu rehberde yok: güvenli olması için özel ısıl işlem ve ölçüm gerekir.',
];

const OVEN = 'Fırını en düşük ısıya ayarla, kapağı tahta kaşıkla 3–5 cm aralık bırak; fanlı programı kullan. Tepsilerin yerini ara ara değiştir.';
const SUN = 'Hava en az 30 °C, güneşli ve nemi düşük olmalı. Tepsiyi yerden yükseğe koy, üstünü tülbentle ört; akşam çiğ düşmeden içeri al.';
const SUN_PASTEURIZE = 'Güneşte kuruyan ürünü saklamadan önce 48 saat dondurucuda bekletin ya da 70 °C fırında 30 dakika tutun; olası böcek yumurtalarından arınır.';
const CONDITION = 'Kavanoza gevşek doldurup 7–10 gün her gün çalkala; kavanozda buğu oluşursa kurutmaya geri dön.';
const LOW_ACID = 'Düşük asitli sebzelerde güneşte bozulma riski yüksek olduğu için önermiyoruz; fırın ya da kurutma makinesini kullan.';

const fruitStorage = `Ağzı sıkı kapanan kavanozda, serin ve karanlık yerde 6 aya kadar; daha uzun saklamak için dondurucuya al. ${CONDITION}`;
const vegStorage = 'Ağzı sıkı kapanan kavanozda, serin ve karanlık yerde 6 aya kadar. Nem kapmışsa ya da kokusu değiştiyse tüketme.';

export const DRYING_FOODS: readonly DryingFoodInfo[] = [
  {
    key: 'domates', label: 'Domates', group: 'meyve',
    methods: {
      firin: {
        prep: 'İkiye ya da 1 cm kalın dilimlere böl; çekirdekli suyunu hafifçe al. Kesik yüz yukarı gelecek şekilde diz, az tuz serp.',
        tempC: [60, 70], conditions: OVEN, time: { min: 6, max: 12, unit: 'saat' },
        ready: 'Deri gibi esnek; sıkınca nem çıkmıyor, ortası yapış yapış değil.',
        storage: `${fruitStorage} Zeytinyağına yatırırsan buzdolabında sakla ve 1 hafta içinde tüket.`,
        notes: ['Yağlı domatesi oda sıcaklığında saklama: botulizm riski taşır.'],
      },
      makine: {
        prep: 'İkiye ya da 1 cm kalın dilimlere böl; çekirdekli suyunu hafifçe al. Kesik yüz yukarı gelecek şekilde diz, az tuz serp.',
        tempC: [55, 60], conditions: 'Raflar arasında hava dolaşsın; yarı sürede rafların yerini değiştir.', time: { min: 8, max: 16, unit: 'saat' },
        ready: 'Deri gibi esnek; sıkınca nem çıkmıyor, ortası yapış yapış değil.',
        storage: `${fruitStorage} Zeytinyağına yatırırsan buzdolabında sakla ve 1 hafta içinde tüket.`,
        notes: ['Yağlı domatesi oda sıcaklığında saklama: botulizm riski taşır.'],
      },
      gunes: {
        prep: 'İkiye böl, çekirdekli suyunu hafifçe al; kesik yüzlere tuz serp ve tepsiye diz.',
        tempC: null, conditions: SUN, time: { min: 4, max: 8, unit: 'gün' },
        ready: 'Deri gibi esnek; sıkınca nem çıkmıyor, ortası yapış yapış değil.',
        storage: `${fruitStorage} Zeytinyağına yatırırsan buzdolabında sakla ve 1 hafta içinde tüket.`,
        notes: [SUN_PASTEURIZE, 'Yağlı domatesi oda sıcaklığında saklama: botulizm riski taşır.'],
      },
    },
  },
  {
    key: 'biber', label: 'Biber', group: 'sebze',
    methods: {
      firin: {
        prep: 'Sap ve çekirdeklerini çıkar; 1 cm şeritler ya da halkalar halinde doğra. Acı biberde eldiven kullan.',
        tempC: [60, 70], conditions: OVEN, time: { min: 6, max: 10, unit: 'saat' },
        ready: 'Gevrek ve kırılgan; büküldüğünde çıt diye kırılıyor.', storage: vegStorage, notes: [],
      },
      makine: {
        prep: 'Sap ve çekirdeklerini çıkar; 1 cm şeritler ya da halkalar halinde doğra. Acı biberde eldiven kullan.',
        tempC: [55, 60], conditions: 'Raflar arasında hava dolaşsın; yarı sürede rafların yerini değiştir.', time: { min: 8, max: 12, unit: 'saat' },
        ready: 'Gevrek ve kırılgan; büküldüğünde çıt diye kırılıyor.', storage: vegStorage, notes: [],
      },
      gunes: { notRecommended: `Biber geleneksel olarak güneşte de kurutulur. ${LOW_ACID}` },
    },
  },
  {
    key: 'patlican', label: 'Patlıcan', group: 'sebze',
    methods: {
      firin: {
        prep: '6 mm kalın dilimle. Kaynar suda 3–4 dakika haşla, soğuk suya alıp iyice kurula; renk ve güvenlik için önerilir.',
        tempC: [60, 70], conditions: OVEN, time: { min: 4, max: 8, unit: 'saat' },
        ready: 'Gevrek ve kırılgan; ortasında nem kalmamış.', storage: vegStorage, notes: [],
      },
      makine: {
        prep: '6 mm kalın dilimle. Kaynar suda 3–4 dakika haşla, soğuk suya alıp iyice kurula; renk ve güvenlik için önerilir.',
        tempC: [55, 60], conditions: 'Raflar arasında hava dolaşsın; yarı sürede rafların yerini değiştir.', time: { min: 6, max: 10, unit: 'saat' },
        ready: 'Gevrek ve kırılgan; ortasında nem kalmamış.', storage: vegStorage, notes: [],
      },
      gunes: { notRecommended: `Dolmalık patlıcan geleneksel olarak güneşte de kurutulur. ${LOW_ACID}` },
    },
  },
  {
    key: 'elma', label: 'Elma', group: 'meyve',
    methods: {
      firin: {
        prep: 'Çekirdek evini çıkar, 6 mm halkalar kes. Kararmasın diye 1 litre suya 1 limonun suyunu ekleyip dilimleri 10 dakika beklet, kurula.',
        tempC: [60, 70], conditions: OVEN, time: { min: 5, max: 10, unit: 'saat' },
        ready: 'Deri gibi esnek; ikiye kesince içinde nem görünmüyor.', storage: fruitStorage, notes: [],
      },
      makine: {
        prep: 'Çekirdek evini çıkar, 6 mm halkalar kes. Kararmasın diye 1 litre suya 1 limonun suyunu ekleyip dilimleri 10 dakika beklet, kurula.',
        tempC: [55, 60], conditions: 'Raflar arasında hava dolaşsın; yarı sürede rafların yerini değiştir.', time: { min: 6, max: 12, unit: 'saat' },
        ready: 'Deri gibi esnek; ikiye kesince içinde nem görünmüyor.', storage: fruitStorage, notes: [],
      },
      gunes: {
        prep: 'Çekirdek evini çıkar, 6 mm halkalar kes; limonlu suda 10 dakika beklet, kurula.',
        tempC: null, conditions: SUN, time: { min: 2, max: 4, unit: 'gün' },
        ready: 'Deri gibi esnek; ikiye kesince içinde nem görünmüyor.', storage: fruitStorage, notes: [SUN_PASTEURIZE],
      },
    },
  },
  {
    key: 'armut', label: 'Armut', group: 'meyve',
    methods: {
      firin: {
        prep: 'Kabuğunu soy, çekirdek evini çıkar; 6 mm dilimle. Limonlu suda 10 dakika beklet, kurula.',
        tempC: [60, 70], conditions: OVEN, time: { min: 6, max: 12, unit: 'saat' },
        ready: 'Esnek ve hafif yumuşak; sıkınca nem çıkmıyor.', storage: fruitStorage, notes: [],
      },
      makine: {
        prep: 'Kabuğunu soy, çekirdek evini çıkar; 6 mm dilimle. Limonlu suda 10 dakika beklet, kurula.',
        tempC: [55, 60], conditions: 'Raflar arasında hava dolaşsın; yarı sürede rafların yerini değiştir.', time: { min: 8, max: 14, unit: 'saat' },
        ready: 'Esnek ve hafif yumuşak; sıkınca nem çıkmıyor.', storage: fruitStorage, notes: [],
      },
      gunes: {
        prep: 'Kabuğunu soy, çekirdek evini çıkar; 6 mm dilimle. Limonlu suda 10 dakika beklet, kurula.',
        tempC: null, conditions: SUN, time: { min: 3, max: 5, unit: 'gün' },
        ready: 'Esnek ve hafif yumuşak; sıkınca nem çıkmıyor.', storage: fruitStorage, notes: [SUN_PASTEURIZE],
      },
    },
  },
  {
    key: 'kayisi', label: 'Kayısı', group: 'meyve',
    methods: {
      firin: {
        prep: 'İkiye böl, çekirdeğini çıkar. Limonlu suda 10 dakika beklet, kurula; kesik yüz yukarı gelecek şekilde diz.',
        tempC: [60, 70], conditions: OVEN, time: { min: 12, max: 20, unit: 'saat' },
        ready: 'Esnek, yapışkan değil; ikiye katlayınca nem damlası çıkmıyor.', storage: fruitStorage, notes: [],
      },
      makine: {
        prep: 'İkiye böl, çekirdeğini çıkar. Limonlu suda 10 dakika beklet, kurula; kesik yüz yukarı gelecek şekilde diz.',
        tempC: [55, 60], conditions: 'Raflar arasında hava dolaşsın; yarı sürede rafların yerini değiştir.', time: { min: 18, max: 30, unit: 'saat' },
        ready: 'Esnek, yapışkan değil; ikiye katlayınca nem damlası çıkmıyor.', storage: fruitStorage, notes: [],
      },
      gunes: {
        prep: 'İkiye böl, çekirdeğini çıkar; kesik yüz yukarı gelecek şekilde diz.',
        tempC: null, conditions: SUN, time: { min: 3, max: 6, unit: 'gün' },
        ready: 'Esnek, yapışkan değil; ikiye katlayınca nem damlası çıkmıyor.', storage: fruitStorage, notes: [SUN_PASTEURIZE],
      },
    },
  },
  {
    key: 'mantar', label: 'Mantar', group: 'sebze',
    methods: {
      firin: {
        prep: 'Yıkamadan, nemli bezle ya da fırçayla temizle; 6 mm dilimle.',
        tempC: [55, 65], conditions: OVEN, time: { min: 3, max: 6, unit: 'saat' },
        ready: 'Kuru ve sert; büküldüğünde kırılıyor.', storage: vegStorage,
        notes: ['Yalnızca market ya da güvenilir kaynaktan kültür mantarı kurut; yabani mantarı tanımadan toplama.'],
      },
      makine: {
        prep: 'Yıkamadan, nemli bezle ya da fırçayla temizle; 6 mm dilimle.',
        tempC: [50, 55], conditions: 'Raflar arasında hava dolaşsın; yarı sürede rafların yerini değiştir.', time: { min: 4, max: 8, unit: 'saat' },
        ready: 'Kuru ve sert; büküldüğünde kırılıyor.', storage: vegStorage,
        notes: ['Yalnızca market ya da güvenilir kaynaktan kültür mantarı kurut; yabani mantarı tanımadan toplama.'],
      },
      gunes: { notRecommended: `Mantar nemi hızla çeker. ${LOW_ACID}` },
    },
  },
  {
    key: 'nane', label: 'Nane', group: 'ot',
    methods: {
      firin: {
        prep: 'Yıkayıp iyice kurula; yaprakları saplarından ayır ve tepsiye tek kat ser.',
        tempC: [40, 50], conditions: 'Fırının en düşük ısısı 50 °C üstündeyse fırın yerine gölgede kurut. Kapağı aralık bırak, sık kontrol et.', time: { min: 1, max: 3, unit: 'saat' },
        ready: 'Yapraklar parmakta ufalanıyor, saplar çıt diye kırılıyor.',
        storage: 'Işık almayan, ağzı kapalı kavanozda; aroması 6–12 ayda azalır. Kullanırken ufala.', notes: [],
      },
      makine: {
        prep: 'Yıkayıp iyice kurula; yaprakları saplarından ayır ve rafa tek kat ser.',
        tempC: [35, 45], conditions: 'En düşük ayarı kullan; yüksek ısı aromayı uçurur.', time: { min: 2, max: 4, unit: 'saat' },
        ready: 'Yapraklar parmakta ufalanıyor, saplar çıt diye kırılıyor.',
        storage: 'Işık almayan, ağzı kapalı kavanozda; aroması 6–12 ayda azalır. Kullanırken ufala.', notes: [],
      },
      gunes: {
        prep: 'Yıkayıp iyice kurula; küçük demetler halinde bağla.',
        tempC: null, conditions: 'Doğrudan güneş rengini ve aromasını soldurur: demetleri gölgede, havadar bir yerde baş aşağı as ya da tülbent üstüne ser.',
        time: { min: 5, max: 10, unit: 'gün' },
        ready: 'Yapraklar parmakta ufalanıyor, saplar çıt diye kırılıyor.',
        storage: 'Işık almayan, ağzı kapalı kavanozda; aroması 6–12 ayda azalır. Kullanırken ufala.', notes: [],
      },
    },
  },
  {
    key: 'kekik', label: 'Kekik', group: 'ot',
    methods: {
      firin: {
        prep: 'Yıkayıp iyice kurula; dalları tepsiye tek kat ser.',
        tempC: [40, 50], conditions: 'Fırının en düşük ısısı 50 °C üstündeyse fırın yerine gölgede kurut. Kapağı aralık bırak, sık kontrol et.', time: { min: 1, max: 2, unit: 'saat' },
        ready: 'Yapraklar dallardan kolayca dökülüyor ve ufalanıyor.',
        storage: 'Işık almayan, ağzı kapalı kavanozda; aroması 6–12 ayda azalır.', notes: [],
      },
      makine: {
        prep: 'Yıkayıp iyice kurula; dalları rafa tek kat ser.',
        tempC: [35, 45], conditions: 'En düşük ayarı kullan; yüksek ısı aromayı uçurur.', time: { min: 2, max: 4, unit: 'saat' },
        ready: 'Yapraklar dallardan kolayca dökülüyor ve ufalanıyor.',
        storage: 'Işık almayan, ağzı kapalı kavanozda; aroması 6–12 ayda azalır.', notes: [],
      },
      gunes: {
        prep: 'Yıkayıp iyice kurula; küçük demetler halinde bağla.',
        tempC: null, conditions: 'Doğrudan güneş yerine gölgede, havadar bir yerde baş aşağı as.',
        time: { min: 5, max: 10, unit: 'gün' },
        ready: 'Yapraklar dallardan kolayca dökülüyor ve ufalanıyor.',
        storage: 'Işık almayan, ağzı kapalı kavanozda; aroması 6–12 ayda azalır.', notes: [],
      },
    },
  },
];

export type DryingResult =
  | ({ status: 'ok'; food: DryingFoodInfo; method: DryingMethod; tempLabel: string; timeLabel: string } & DryingSpec)
  | { status: 'not_recommended'; food: DryingFoodInfo; method: DryingMethod; reason: string; alternatives: DryingMethod[] };

/** Food × method; null for anything not in the list (no meat, fish or unknown food). */
export function dryingPlan(foodKey: unknown, method: unknown): DryingResult | null {
  const food = DRYING_FOODS.find(f => f.key === foodKey);
  if (!food || (method !== 'firin' && method !== 'makine' && method !== 'gunes')) return null;
  const spec = food.methods[method];
  if ('notRecommended' in spec) {
    return {
      status: 'not_recommended', food, method, reason: spec.notRecommended,
      alternatives: DRYING_METHODS.map(m => m.key).filter(m => m !== method && !('notRecommended' in food.methods[m])),
    };
  }
  const tempLabel = spec.tempC ? `${spec.tempC[0]}–${spec.tempC[1]} °C` : method === 'gunes' && food.group === 'ot' ? 'Gölgede, oda sıcaklığı' : 'Hava en az 30 °C';
  const timeLabel = `${spec.time.min}–${spec.time.max} ${spec.time.unit}`;
  return { status: 'ok', food, method, tempLabel, timeLabel, ...spec };
}

// ---------------------------------------------------------------------------
// 4. Ölçü çevirici

export type MeasureUnit = 'su_bardagi' | 'cay_bardagi' | 'yemek_kasigi' | 'tatli_kasigi' | 'cay_kasigi' | 'ml' | 'g';

export const MEASURE_UNITS: readonly { key: MeasureUnit; label: string; short: string; ml: number | null }[] = [
  { key: 'su_bardagi', label: 'Su bardağı', short: 'su bardağı', ml: 200 },
  { key: 'cay_bardagi', label: 'Çay bardağı', short: 'çay bardağı', ml: 100 },
  { key: 'yemek_kasigi', label: 'Yemek kaşığı', short: 'yemek kaşığı', ml: 15 },
  { key: 'tatli_kasigi', label: 'Tatlı kaşığı', short: 'tatlı kaşığı', ml: 10 },
  { key: 'cay_kasigi', label: 'Çay kaşığı', short: 'çay kaşığı', ml: 5 },
  { key: 'ml', label: 'Mililitre', short: 'ml', ml: 1 },
  { key: 'g', label: 'Gram', short: 'g', ml: null },
];

/** Grams per millilitre, level (silme) measures. Approximate household values. */
export const INGREDIENT_DENSITY: readonly { key: string; label: string; density: number; aliases: string[] }[] = [
  { key: 'un', label: 'Un', density: 0.55, aliases: ['buğday unu', 'beyaz un'] },
  { key: 'seker', label: 'Toz şeker', density: 0.85, aliases: ['şeker', 'toz şeker', 'kristal şeker'] },
  { key: 'pudra_sekeri', label: 'Pudra şekeri', density: 0.56, aliases: ['pudra şekeri', 'pudra'] },
  { key: 'pirinc', label: 'Pirinç', density: 0.85, aliases: ['pirinç', 'baldo', 'osmancık'] },
  { key: 'bulgur', label: 'Bulgur', density: 0.75, aliases: ['bulgur', 'pilavlık bulgur'] },
  { key: 'mercimek', label: 'Mercimek', density: 0.85, aliases: ['mercimek', 'kırmızı mercimek', 'yeşil mercimek'] },
  { key: 'tuz', label: 'Tuz', density: 1.2, aliases: ['tuz', 'sofra tuzu', 'ince tuz'] },
  { key: 'tereyagi', label: 'Tereyağı', density: 0.91, aliases: ['tereyağı', 'tereyag', 'margarin'] },
  { key: 'sut', label: 'Süt', density: 1.03, aliases: ['süt'] },
  { key: 'su', label: 'Su', density: 1, aliases: ['su'] },
  { key: 'yogurt', label: 'Yoğurt', density: 1.05, aliases: ['yoğurt'] },
  { key: 'sivi_yag', label: 'Sıvı yağ', density: 0.92, aliases: ['sıvı yağ', 'yağ', 'ayçiçek yağı', 'mısırözü yağı'] },
  { key: 'zeytinyagi', label: 'Zeytinyağı', density: 0.91, aliases: ['zeytinyağı', 'zeytin yağı'] },
  { key: 'bal', label: 'Bal', density: 1.42, aliases: ['bal'] },
  { key: 'kakao', label: 'Kakao', density: 0.42, aliases: ['kakao', 'kakao tozu'] },
  { key: 'irmik', label: 'İrmik', density: 0.75, aliases: ['irmik'] },
  { key: 'nisasta', label: 'Nişasta', density: 0.55, aliases: ['nişasta', 'mısır nişastası', 'buğday nişastası'] },
];

const trLower = (s: string) => s.replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();

/** Density for a key or a Turkish name (aliases, any case); null when unknown. */
export function ingredientDensity(nameOrKey: unknown): { key: string; label: string; density: number } | null {
  if (typeof nameOrKey !== 'string' || !nameOrKey.trim()) return null;
  const q = trLower(nameOrKey);
  const hit = INGREDIENT_DENSITY.find(i => i.key === nameOrKey || trLower(i.label) === q || i.aliases.some(a => trLower(a) === q));
  return hit ? { key: hit.key, label: hit.label, density: hit.density } : null;
}

/** Largest amount we convert (10 litres or 10 kg). */
export const MEASURE_MAX_ML = 10_000;

/** Sensible rounding: grams/ml by size; cups and spoons to quarters. */
export function roundMeasure(value: number, unit: MeasureUnit): number {
  if (unit === 'g' || unit === 'ml') {
    if (value < 10) return roundTo(value, 0.5);
    if (value < 100) return Math.round(value);
    if (value < 1000) return roundTo(value, 5);
    return roundTo(value, 10);
  }
  return roundTo(value, 0.25);
}

/** 1.5 → "1 ½", 0.25 → "¼", 2 → "2"; grams/ml with a Turkish decimal comma. */
export function formatMeasure(value: number, unit: MeasureUnit): string {
  const v = roundMeasure(value, unit);
  if (unit === 'g' || unit === 'ml') return `${formatNumberTr(v)} ${unit}`;
  const whole = Math.floor(v + 1e-9);
  const frac = Math.round((v - whole) * 4);
  const glyph = ['', '¼', '½', '¾'][frac] || '';
  const num = whole && glyph ? `${whole} ${glyph}` : whole ? String(whole) : glyph || '0';
  return `${num} ${MEASURE_UNITS.find(u => u.key === unit)?.short || ''}`.trim();
}

export type ConvertResult =
  | { ok: true; value: number; rounded: number; text: string; approximate: boolean }
  | { ok: false; error: string };

export function convertMeasure(amount: unknown, from: MeasureUnit, to: MeasureUnit, ingredient?: string | null): ConvertResult {
  const n = parseAmount(amount as string);
  if (n === null || n <= 0) return { ok: false, error: 'Geçerli bir miktar yaz (ör. 1,5 ya da 1/2).' };
  const fromUnit = MEASURE_UNITS.find(u => u.key === from);
  const toUnit = MEASURE_UNITS.find(u => u.key === to);
  if (!fromUnit || !toUnit) return { ok: false, error: 'Bu ölçü birimini tanımıyoruz.' };
  const needsDensity = (from === 'g') !== (to === 'g');
  const info = ingredientDensity(ingredient);
  if (needsDensity && !info) {
    return { ok: false, error: 'Gram çevirisi için malzemeyi seç. Listede olmayan malzemelerin ağırlığı değiştiği için gram hesaplamıyoruz.' };
  }
  // Everything goes through millilitres (grams via density).
  const ml = from === 'g' ? n / (info ? info.density : 1) : n * (fromUnit.ml as number);
  if (ml > MEASURE_MAX_ML) return { ok: false, error: 'Bu kadar büyük bir miktarı çevirmiyoruz; 10 litre / 10 kg altında bir değer yaz.' };
  const value = to === 'g' ? ml * (info ? info.density : 1) : ml / (toUnit.ml as number);
  if (from === to) return { ok: true, value: n, rounded: roundMeasure(n, to), text: formatMeasure(n, to), approximate: false };
  return { ok: true, value, rounded: roundMeasure(value, to), text: formatMeasure(value, to), approximate: needsDensity || roundMeasure(value, to) !== value };
}

export interface ConverterRow { unit: MeasureUnit; label: string; text: string }

/**
 * Every other unit for one amount, skipping silly rows (65 yemek kaşığı,
 * ⅛ su bardağı) and grams when the ingredient is unknown.
 */
export function converterRows(amount: unknown, from: MeasureUnit, ingredient?: string | null): { rows: ConverterRow[]; error: string | null; gramsRefused: boolean } {
  const probe = convertMeasure(amount, from, 'ml', ingredient);
  if (!probe.ok) return { rows: [], error: probe.error, gramsRefused: from === 'g' && !ingredientDensity(ingredient) };
  const rows: ConverterRow[] = [];
  let gramsRefused = false;
  for (const unit of MEASURE_UNITS) {
    if (unit.key === from) continue;
    const r = convertMeasure(amount, from, unit.key, ingredient);
    if (!r.ok) { if (unit.key === 'g') gramsRefused = true; continue; }
    if (unit.key !== 'g' && unit.key !== 'ml' && (r.value < 0.25 || r.value > 20)) continue;
    rows.push({ unit: unit.key, label: unit.label, text: r.text });
  }
  return { rows, error: null, gramsRefused };
}

/** "≈ 1 tatlı kaşığı" style hint for a weight (salt for pasta water, etc.). */
export function spoonHint(grams: number, ingredient: string): string {
  const info = ingredientDensity(ingredient);
  if (!info || !(grams > 0)) return '';
  const ml = grams / info.density;
  const tbsp = ml / 15;
  if (tbsp >= 2) return `yaklaşık ${formatMeasure(tbsp, 'yemek_kasigi')}`;
  const dsp = ml / 10;
  if (dsp >= 0.75) return `yaklaşık ${formatMeasure(dsp, 'tatli_kasigi')}`;
  return `yaklaşık ${formatMeasure(Math.max(0.25, ml / 5), 'cay_kasigi')}`;
}
