/**
 * Kitchen profile ("Mutfağını tanıyalım"): types, the authenticated Core
 * calls, the pure helpers the screen is built on and a tiny in-memory
 * session cache (useKitchenProfile) for screens that only read it.
 *
 * Nothing in here imports React Native (only React's hook, used lazily), so
 * scripts/check-kitchen-profile.test.cjs can load it with plain Node. Option lists and their Turkish labels always
 * come from Core (GET /me/kitchen-profile → options); the app never keeps its
 * own copy, so a new diet or allergen shows up without an app release.
 */

import { useEffect, useSyncExternalStore } from 'react';

const KITCHEN_PROFILE_URL = 'https://api.tariften.com/wp-json/tariften/v1/me/kitchen-profile';

// --- Types -------------------------------------------------------------------

export type KitchenExperience = 'beginner' | 'intermediate' | 'pro';
export type KitchenTimePreference = 'under_20' | 'under_45' | 'no_limit';
export type AllergenReaction = 'allergy' | 'intolerance';

export interface KitchenAllergen {
  key: string;
  type: AllergenReaction;
}

export interface KitchenProfile {
  version: number;
  household_size: number | null;
  diets: string[];
  dislikes: string[];
  equipment: string[];
  experience: KitchenExperience | null;
  time_preference: KitchenTimePreference | null;
  allergens: KitchenAllergen[];
  allergen_consent_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

export interface KitchenOption {
  value: string;
  label: string;
}

export interface KitchenProfileOptions {
  household_size: { min: number; max: number };
  diets: KitchenOption[];
  equipment: KitchenOption[];
  experience: KitchenOption[];
  time_preference: KitchenOption[];
  allergens: KitchenOption[];
  reactions: KitchenOption[];
  dislikes: { max_items: number; max_length: number };
  allergen_notice: string;
}

/** Partial write: only the keys present change on the server. */
export interface KitchenProfileWrite {
  household_size?: number | null;
  diets?: string[];
  dislikes?: string[];
  equipment?: string[];
  experience?: KitchenExperience | null;
  time_preference?: KitchenTimePreference | null;
  allergens?: KitchenAllergen[];
  /** true must accompany the first non-empty allergens save; false erases allergens. */
  allergen_consent?: boolean;
  /** Sets completed_at once. */
  complete?: true;
}

/** The editable part of a profile, as the screen holds it while the member types. */
export interface KitchenDraft {
  household_size: number | null;
  diets: string[];
  dislikes: string[];
  equipment: string[];
  experience: KitchenExperience | null;
  time_preference: KitchenTimePreference | null;
  allergens: KitchenAllergen[];
}

export class KitchenProfileError extends Error {
  code: string;
  field: string | null;
  status: number;
  constructor(message: string, code = 'kitchen_profile_error', field: string | null = null, status = 0) {
    super(message);
    this.name = 'KitchenProfileError';
    this.code = code;
    this.field = field;
    this.status = status;
  }
}

// --- Normalisation of server data ----------------------------------------------

const EXPERIENCES: readonly string[] = ['beginner', 'intermediate', 'pro'];
const TIMES: readonly string[] = ['under_20', 'under_45', 'no_limit'];

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const stringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const isoOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

export function blankProfile(): KitchenProfile {
  return {
    version: 1, household_size: null, diets: [], dislikes: [], equipment: [], experience: null,
    time_preference: null, allergens: [], allergen_consent_at: null, completed_at: null, updated_at: null,
  };
}

/** Reads a profile defensively: unknown shapes become empty fields, never crashes. */
export function normaliseProfile(raw: unknown): KitchenProfile {
  if (!isRecord(raw)) return blankProfile();
  const size = Number(raw.household_size);
  const allergens: KitchenAllergen[] = Array.isArray(raw.allergens)
    ? raw.allergens.flatMap(item => {
      if (!isRecord(item) || typeof item.key !== 'string') return [];
      return [{ key: item.key, type: item.type === 'intolerance' ? 'intolerance' : 'allergy' } as KitchenAllergen];
    })
    : [];
  return {
    version: Number(raw.version) || 1,
    household_size: raw.household_size === null || raw.household_size === undefined || !Number.isInteger(size) ? null : size,
    diets: stringList(raw.diets),
    dislikes: stringList(raw.dislikes),
    equipment: stringList(raw.equipment),
    experience: typeof raw.experience === 'string' && EXPERIENCES.includes(raw.experience) ? raw.experience as KitchenExperience : null,
    time_preference: typeof raw.time_preference === 'string' && TIMES.includes(raw.time_preference)
      ? raw.time_preference as KitchenTimePreference : null,
    allergens,
    allergen_consent_at: isoOrNull(raw.allergen_consent_at),
    completed_at: isoOrNull(raw.completed_at),
    updated_at: isoOrNull(raw.updated_at),
  };
}

const optionList = (v: unknown): KitchenOption[] => (Array.isArray(v)
  ? v.flatMap(item => (isRecord(item) && typeof item.value === 'string' && typeof item.label === 'string' && item.label.trim()
    ? [{ value: item.value, label: item.label }] : []))
  : []);

/**
 * Validates the option catalogue. Returns null when Core did not send one
 * (an older deployment): the screen then explains instead of inventing lists.
 */
export function normaliseOptions(raw: unknown): KitchenProfileOptions | null {
  if (!isRecord(raw)) return null;
  const size = isRecord(raw.household_size) ? raw.household_size : {};
  const dislikes = isRecord(raw.dislikes) ? raw.dislikes : {};
  const options: KitchenProfileOptions = {
    household_size: {
      min: Number.isInteger(size.min) ? Number(size.min) : 1,
      max: Number.isInteger(size.max) ? Number(size.max) : 12,
    },
    diets: optionList(raw.diets),
    equipment: optionList(raw.equipment),
    experience: optionList(raw.experience),
    time_preference: optionList(raw.time_preference),
    allergens: optionList(raw.allergens),
    reactions: optionList(raw.reactions),
    dislikes: {
      max_items: Number.isInteger(dislikes.max_items) && Number(dislikes.max_items) > 0 ? Number(dislikes.max_items) : 30,
      max_length: Number.isInteger(dislikes.max_length) && Number(dislikes.max_length) > 0 ? Number(dislikes.max_length) : 40,
    },
    allergen_notice: typeof raw.allergen_notice === 'string' ? raw.allergen_notice.trim() : '',
  };
  if (!options.diets.length || !options.allergens.length || !options.reactions.length || !options.allergen_notice) return null;
  return options;
}

export function labelFor(options: KitchenOption[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find(o => o.value === value)?.label ?? null;
}

/** "Çırak · yeni başlıyorum" → title "Çırak", detail "yeni başlıyorum". */
export function splitLabel(label: string): { title: string; detail: string | null } {
  const [title, ...rest] = label.split(' · ');
  const detail = rest.join(' · ').trim();
  return { title: title.trim(), detail: detail ? detail.charAt(0).toLocaleUpperCase('tr-TR') + detail.slice(1) : null };
}

// --- Tags (Sevmediklerin) --------------------------------------------------------

/**
 * Turkish case folding, the same as Core: I → ı and İ → i before lowering,
 * so "IRMIK" and "ırmık" are one tag but "Irmak" never folds to "irmak".
 */
export function foldTr(value: string): string {
  return value.replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase();
}

/** Trims, strips markup and collapses whitespace (what Core stores). */
export function normaliseTag(raw: string): string {
  return String(raw ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export const tagKey = (value: string) => foldTr(normaliseTag(value));

/** Character count by code point, so "ğ" or an emoji counts once, as mb_strlen does. */
export const tagLength = (value: string) => Array.from(value).length;

export type TagError = 'empty' | 'too_long' | 'duplicate' | 'full';

export const TAG_ERROR_COPY: Record<TagError, (limits: { max_items: number; max_length: number }) => string> = {
  empty: () => 'Bir yiyecek adı yaz.',
  too_long: l => `En fazla ${l.max_length} karakter olabilir.`,
  duplicate: () => 'Bu zaten listende.',
  full: l => `En fazla ${l.max_items} yiyecek ekleyebilirsin.`,
};

export function addTag(
  list: string[], raw: string, limits: { max_items: number; max_length: number },
): { list: string[]; error: TagError | null } {
  const tag = normaliseTag(raw);
  if (!tag) return { list, error: 'empty' };
  if (tagLength(tag) > limits.max_length) return { list, error: 'too_long' };
  const key = foldTr(tag);
  if (list.some(item => tagKey(item) === key)) return { list, error: 'duplicate' };
  if (list.length >= limits.max_items) return { list, error: 'full' };
  return { list: [...list, tag], error: null };
}

export function removeTag(list: string[], tag: string): string[] {
  const key = tagKey(tag);
  return list.filter(item => tagKey(item) !== key);
}

/** First spelling wins; empty entries drop out (mirrors Core's dislikes()). */
export function dedupeTags(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const tag = normaliseTag(item);
    const key = foldTr(tag);
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

// --- Selections ------------------------------------------------------------------

export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

/**
 * Vegan already covers vegetarian and pescatarian (Core drops those two when
 * vegan is saved). Mirror that so a tapped chip never silently disappears.
 */
export function toggleDiet(list: string[], value: string): string[] {
  if (list.includes(value)) return list.filter(v => v !== value);
  if (value === 'vegan') return [...list.filter(v => v !== 'vegetarian' && v !== 'pescatarian'), value];
  if (value === 'vegetarian' || value === 'pescatarian') return [...list.filter(v => v !== 'vegan'), value];
  return [...list, value];
}

export function toggleAllergen(list: KitchenAllergen[], key: string): KitchenAllergen[] {
  return list.some(a => a.key === key) ? list.filter(a => a.key !== key) : [...list, { key, type: 'allergy' }];
}

export function setAllergenReaction(list: KitchenAllergen[], key: string, type: AllergenReaction): KitchenAllergen[] {
  return list.map(a => (a.key === key ? { ...a, type } : a));
}

/** − / + stepper. From "not set", + starts at the minimum and − stays unset. */
export function stepHousehold(current: number | null, delta: 1 | -1, min: number, max: number): number | null {
  if (current === null) return delta > 0 ? min : null;
  return Math.min(max, Math.max(min, current + delta));
}

// --- Steps -------------------------------------------------------------------------

export type KitchenStepKey = 'household' | 'diets' | 'dislikes' | 'equipment' | 'allergens';

export interface KitchenStep {
  key: KitchenStepKey;
  kicker: string;
  title: string;
  intro: string;
  fields: (keyof KitchenDraft)[];
}

export const KITCHEN_STEPS: readonly KitchenStep[] = [
  {
    key: 'household', kicker: 'Hane ve zaman', title: 'Kaç kişilik bir *sofra?*',
    intro: 'Porsiyonları ve tarif sürelerini buna göre önereceğiz.', fields: ['household_size', 'time_preference'],
  },
  {
    key: 'diets', kicker: 'Beslenme', title: 'Nasıl *besleniyorsun?*',
    intro: 'Uyduğun beslenme biçimlerini seç. Hiçbiri değilse geçebilirsin.', fields: ['diets'],
  },
  {
    key: 'dislikes', kicker: 'Sevmediklerin', title: 'Tabağında ne *olmasın?*',
    intro: 'Sevmediğin yiyecekleri ekle; bunları öne çıkarmayız.', fields: ['dislikes'],
  },
  {
    key: 'equipment', kicker: 'Ekipman ve deneyim', title: 'Mutfağında *neler var?*',
    intro: 'Elindeki aletlere ve tecrübene uygun tarifler gelsin.', fields: ['equipment', 'experience'],
  },
  {
    key: 'allergens', kicker: 'Alerjiler', title: 'Dikkat etmemiz gereken *bir şey* var mı?',
    intro: 'Alerjin ya da intoleransın olan besinleri seç.', fields: ['allergens'],
  },
];

export const KITCHEN_STEP_COUNT = KITCHEN_STEPS.length;

/** Which step shows a server error for a given field. */
export function stepForField(field: string | null | undefined): number | null {
  if (!field) return null;
  if (field === 'allergen_consent') return KITCHEN_STEPS.findIndex(s => s.key === 'allergens');
  const index = KITCHEN_STEPS.findIndex(s => (s.fields as string[]).includes(field));
  return index >= 0 ? index : null;
}

export function profileToDraft(profile: KitchenProfile): KitchenDraft {
  return {
    household_size: profile.household_size,
    diets: [...profile.diets],
    dislikes: [...profile.dislikes],
    equipment: [...profile.equipment],
    experience: profile.experience,
    time_preference: profile.time_preference,
    allergens: profile.allergens.map(a => ({ ...a })),
  };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(v => b.includes(v));
const sameAllergens = (a: KitchenAllergen[], b: KitchenAllergen[]) =>
  a.length === b.length && a.every(x => b.some(y => y.key === x.key && y.type === x.type));
const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function fieldChanged(field: keyof KitchenDraft, draft: KitchenDraft, saved: KitchenProfile): boolean {
  switch (field) {
    case 'diets':
    case 'equipment':
      return !sameSet(draft[field], saved[field]);
    case 'dislikes':
      return !sameTags(draft.dislikes, saved.dislikes);
    case 'allergens':
      return !sameAllergens(draft.allergens, saved.allergens);
    default:
      return draft[field] !== saved[field];
  }
}

export function stepIsDirty(stepIndex: number, draft: KitchenDraft, saved: KitchenProfile): boolean {
  const step = KITCHEN_STEPS[stepIndex];
  return !!step && step.fields.some(field => fieldChanged(field, draft, saved));
}

/** Allergens are health data: no allergen leaves the device without consent. */
export function allergenConsentMissing(draft: KitchenDraft, saved: KitchenProfile, consentChecked: boolean): boolean {
  return draft.allergens.length > 0 && !saved.allergen_consent_at && !consentChecked;
}

/**
 * The partial PUT for "Devam" on one step, or null when nothing needs sending
 * (unchanged step that is not the finishing one). `skip` sends none of the
 * step's fields; finishing the flow still marks the profile complete.
 */
export function buildStepPayload(
  stepIndex: number,
  draft: KitchenDraft,
  saved: KitchenProfile,
  opts: { consentChecked: boolean; skip?: boolean },
): KitchenProfileWrite | null {
  const step = KITCHEN_STEPS[stepIndex];
  if (!step) return null;
  const isLast = stepIndex === KITCHEN_STEP_COUNT - 1;
  const payload: KitchenProfileWrite = {};
  if (!opts.skip && stepIsDirty(stepIndex, draft, saved)) {
    for (const field of step.fields) {
      if (field === 'diets' || field === 'equipment') payload[field] = [...draft[field]];
      else if (field === 'dislikes') payload.dislikes = dedupeTags(draft.dislikes);
      else if (field === 'allergens') payload.allergens = draft.allergens.map(a => ({ key: a.key, type: a.type }));
      else if (field === 'household_size') payload.household_size = draft.household_size;
      else if (field === 'experience') payload.experience = draft.experience;
      else if (field === 'time_preference') payload.time_preference = draft.time_preference;
    }
    if (payload.allergens && payload.allergens.length > 0 && !saved.allergen_consent_at && opts.consentChecked) {
      payload.allergen_consent = true;
    }
  }
  if (isLast && !saved.completed_at) payload.complete = true;
  return Object.keys(payload).length ? payload : null;
}

/** Applies a saved server profile to the draft, only for the fields of one step. */
export function mergeStepIntoDraft(stepIndex: number, draft: KitchenDraft, saved: KitchenProfile): KitchenDraft {
  const step = KITCHEN_STEPS[stepIndex];
  if (!step) return draft;
  const fromServer = profileToDraft(saved);
  const next: KitchenDraft = { ...draft };
  for (const field of step.fields) (next as unknown as Record<string, unknown>)[field] = fromServer[field];
  return next;
}

export function stepCta(stepIndex: number, editing: boolean): { primary: string; skip: string } {
  const isLast = stepIndex === KITCHEN_STEP_COUNT - 1;
  if (editing) return { primary: isLast ? 'Kaydet ve bitir' : 'Kaydet ve devam', skip: 'Değiştirmeden geç' };
  return { primary: isLast ? 'Bitir' : 'Devam', skip: 'Şimdilik atla' };
}

/** "22 Ekim 2026" in Istanbul time (UTC+3 all year; Hermes ships no tz data). */
export function consentDateTr(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const d = new Date(time + 3 * 3600 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Short summary for the profile card: "3 tercih · 2 alerjen". */
export function profileSummary(profile: KitchenProfile): string | null {
  const parts: string[] = [];
  if (profile.household_size) parts.push(`${profile.household_size} kişilik`);
  const prefs = profile.diets.length + profile.equipment.length + profile.dislikes.length;
  if (prefs) parts.push(`${prefs} tercih`);
  if (profile.allergens.length) parts.push(`${profile.allergens.length} alerjen`);
  return parts.length ? parts.join(' · ') : null;
}

// --- One-shot success line for the profile screen ----------------------------------

let pendingFlash: string | null = null;

/** Set when the flow finishes; the profile screen shows it once on focus. */
export function setKitchenFlash(message: string | null) {
  pendingFlash = message;
}

export function takeKitchenFlash(): string | null {
  const message = pendingFlash;
  pendingFlash = null;
  return message;
}

// --- Core calls -----------------------------------------------------------------------

async function request(token: string, method: 'GET' | 'PUT' | 'DELETE', body?: KitchenProfileWrite) {
  if (!token) throw new KitchenProfileError('Mutfak profilin için giriş yapmalısın.', 'not_signed_in', null, 401);
  let res: Response;
  try {
    res = await fetch(KITCHEN_PROFILE_URL, {
      method,
      headers: body ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new KitchenProfileError('Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.', 'network');
  }
  const json: unknown = await res.json().catch(() => null);
  const data = isRecord(json) ? json : {};
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new KitchenProfileError('Oturumunu yenileyip tekrar denemelisin.', 'unauthorized', null, res.status);
    }
    if (res.status === 404) {
      throw new KitchenProfileError('Mutfak profili servisi henüz hazır değil. Biraz sonra tekrar dene.', 'not_found', null, 404);
    }
    const detail = isRecord(data.data) ? data.data : {};
    const message = typeof data.message === 'string' && data.message.trim() ? data.message : 'Kaydedilemedi. Birazdan tekrar dene.';
    throw new KitchenProfileError(
      message,
      typeof data.code === 'string' ? data.code : 'kitchen_profile_error',
      typeof detail.field === 'string' ? detail.field : null,
      res.status,
    );
  }
  if (data.success !== true) throw new KitchenProfileError('Beklenmeyen bir yanıt geldi. Tekrar dene.', 'bad_response', null, res.status);
  return data;
}

export async function getKitchenProfile(token: string): Promise<{ profile: KitchenProfile; options: KitchenProfileOptions }> {
  const data = await request(token, 'GET');
  const options = normaliseOptions(data.options);
  if (!options) throw new KitchenProfileError('Mutfak profili servisi güncelleniyor. Biraz sonra tekrar dene.', 'options_missing');
  return { profile: normaliseProfile(data.profile), options };
}

export async function updateKitchenProfile(token: string, payload: KitchenProfileWrite): Promise<KitchenProfile> {
  const data = await request(token, 'PUT', payload);
  if (!isRecord(data.profile)) throw new KitchenProfileError('Kaydedilen profil geri okunamadı. Tekrar dene.', 'bad_response');
  const profile = normaliseProfile(data.profile);
  // Every save refreshes the session cache, so the recipe allergen band
  // never shows an allergen the member has just removed (or misses a new one).
  primeKitchenProfileCache(token, profile);
  return profile;
}

export async function deleteKitchenProfile(token: string): Promise<void> {
  await request(token, 'DELETE');
  invalidateKitchenProfileCache();
}

// --- Session cache (read-only screens: recipe allergen band) ---------------------------

export interface KitchenProfileSnapshot {
  profile: KitchenProfile;
  options: KitchenProfileOptions;
}

interface CacheEntry {
  token: string;
  data: KitchenProfileSnapshot | null;
  promise: Promise<KitchenProfileSnapshot | null> | null;
  failedAt: number;
}

/** After a failed read, other screens wait this long before asking Core again. */
export const KITCHEN_PROFILE_RETRY_MS = 60_000;

let cache: CacheEntry | null = null;
const cacheListeners = new Set<() => void>();
const emitCache = () => { cacheListeners.forEach(listener => listener()); };

export function subscribeKitchenProfile(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => { cacheListeners.delete(listener); };
}

/** The cached profile for this token, or null. Same object until it changes. */
export function peekKitchenProfile(token: string | null | undefined): KitchenProfileSnapshot | null {
  return token && cache && cache.token === token ? cache.data : null;
}

/**
 * One GET per session and token. Concurrent callers share the request; a
 * failure resolves to null (callers show nothing) and is retried only after
 * KITCHEN_PROFILE_RETRY_MS. A result that arrives after an invalidation is
 * dropped, so a save can never be overwritten by an older read.
 */
export function loadKitchenProfileOnce(token: string, now: number = Date.now()): Promise<KitchenProfileSnapshot | null> {
  if (!token) return Promise.resolve(null);
  if (!cache || cache.token !== token) cache = { token, data: null, promise: null, failedAt: 0 };
  const entry = cache;
  if (entry.data) return Promise.resolve(entry.data);
  if (entry.promise) return entry.promise;
  if (entry.failedAt && now - entry.failedAt < KITCHEN_PROFILE_RETRY_MS) return Promise.resolve(null);
  const promise = getKitchenProfile(token).then(
    data => {
      if (cache !== entry) return null;
      entry.data = data;
      entry.promise = null;
      emitCache();
      return data;
    },
    () => {
      if (cache === entry) {
        entry.failedAt = Date.now();
        entry.promise = null;
      }
      return null;
    },
  );
  entry.promise = promise;
  return promise;
}

/** Applies a freshly saved profile; without a cached copy (or mid-read) it invalidates. */
export function primeKitchenProfileCache(token: string, profile: KitchenProfile) {
  if (cache && cache.token === token && cache.data) {
    cache = { token, data: { profile, options: cache.data.options }, promise: null, failedAt: 0 };
    emitCache();
    return;
  }
  invalidateKitchenProfileCache();
}

/** Drops a stale profile (profile deleted, save during a read); mounted readers fetch again. */
export function invalidateKitchenProfileCache() {
  if (!cache) return;
  cache = null;
  emitCache();
}

/**
 * Sign-out: forgets the profile without notifying readers, so nothing
 * re-fetches with the old token. Screens drop it as soon as auth re-renders.
 */
export function forgetKitchenProfileCache() {
  cache = null;
}

/**
 * The signed-in member's kitchen profile for read-only UI, or null while
 * loading, signed out or unavailable. Pass null for guests: nothing is fetched.
 */
export function useKitchenProfile(token: string | null | undefined): KitchenProfileSnapshot | null {
  const data = useSyncExternalStore(subscribeKitchenProfile, () => peekKitchenProfile(token));
  useEffect(() => {
    if (!token) return undefined;
    // Re-checked on every store change: an invalidation while a read is in
    // flight leaves the snapshot null (no re-render), but must still re-fetch.
    const ensure = () => { if (!peekKitchenProfile(token)) void loadKitchenProfileOnce(token); };
    ensure();
    return subscribeKitchenProfile(ensure);
  }, [token]);
  return data;
}
