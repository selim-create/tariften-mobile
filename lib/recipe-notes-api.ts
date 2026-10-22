/**
 * Kişisel tarif notları (Core 1.0.59 · P11, docs/RECIPE_NOTES.md).
 *
 * A member's note is private: every call is authenticated, never cached and
 * never logged. The note never travels with the public recipe payload, so
 * the recipe screen asks for it separately with GET /recipes/{id}/my-note.
 *
 * Dependency-free (no React Native imports) so
 * scripts/check-recipe-notes.test.cjs can load it with plain Node.
 */

const BASE = 'https://api.tariften.com/wp-json/tariften/v1';
const TIMEOUT_MS = 15_000;

/** Core's limit; GET also returns it as max_length. Counted in characters, not bytes. */
export const RECIPE_NOTE_MAX_LENGTH = 2000;
export const MY_NOTES_PER_PAGE = 20;

export interface RecipeNote {
  recipe_id: number;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface MyNoteItem {
  recipe_id: number;
  available: boolean;
  slug: string | null;
  title: string | null;
  image: string | null;
  note_excerpt: string;
  updated_at: string;
}

export interface MyNotesPage {
  notes: MyNoteItem[];
  page: number;
  pages: number;
  total: number;
}

export type RecipeNoteErrorCode =
  | 'auth' | 'too_long' | 'invalid' | 'limit' | 'rate_limited' | 'not_found' | 'unavailable' | 'network';

export class RecipeNoteError extends Error {
  code: RecipeNoteErrorCode;
  status: number;
  /** Seconds until writes are allowed again (429 only). */
  retryAfter: number | null;
  constructor(message: string, code: RecipeNoteErrorCode, status = 0, retryAfter: number | null = null) {
    super(message);
    this.name = 'RecipeNoteError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Characters as Core counts them: a Turkish letter or an emoji is one. */
export function noteLength(text: string): number {
  return Array.from(text.trim()).length;
}

export function noteTooLong(text: string, max: number = RECIPE_NOTE_MAX_LENGTH): boolean {
  return noteLength(text) > max;
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positiveId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

function parseNote(raw: unknown): RecipeNote | null {
  if (!isRecord(raw) || typeof raw.note !== 'string') return null;
  return {
    recipe_id: positiveId(raw.recipe_id) ?? 0,
    note: raw.note,
    created_at: str(raw.created_at),
    updated_at: str(raw.updated_at),
  };
}

function parseItem(raw: unknown): MyNoteItem | null {
  if (!isRecord(raw)) return null;
  const id = positiveId(raw.recipe_id);
  if (!id) return null;
  const available = raw.available === true;
  return {
    recipe_id: id,
    available,
    // A recipe the member can no longer see carries no title, slug or image.
    slug: available ? strOrNull(raw.slug) : null,
    title: available ? strOrNull(raw.title) : null,
    image: available ? strOrNull(raw.image) : null,
    note_excerpt: str(raw.note_excerpt),
    updated_at: str(raw.updated_at),
  };
}

function waitLabel(seconds: number | null): string {
  if (!seconds || seconds < 60) return 'Biraz sonra';
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} dakika sonra`;
}

/** Turns a Core error into one calm Turkish sentence and a code the screen can act on. */
export function noteErrorFrom(status: number, json: unknown, fallback: string): RecipeNoteError {
  const body = isRecord(json) ? json : {};
  const code = str(body.code);
  const data = isRecord(body.data) ? body.data : {};
  const serverMessage = str(body.message).trim();
  if (status === 401 || status === 403) {
    return new RecipeNoteError('Oturumunun süresi dolmuş. Notlarına ulaşmak için yeniden giriş yap.', 'auth', status);
  }
  if (status === 429 || code === 'recipe_note_rate_limited') {
    const retry = Number(data.retry_after);
    const retryAfter = Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : null;
    return new RecipeNoteError(
      `Kısa sürede çok sayıda not kaydettin. ${waitLabel(retryAfter)} tekrar dene.`, 'rate_limited', status, retryAfter,
    );
  }
  if (code === 'recipe_note_too_long') {
    const max = positiveId(data.max_length) ?? RECIPE_NOTE_MAX_LENGTH;
    return new RecipeNoteError(`Not en fazla ${max.toLocaleString('tr-TR')} karakter olabilir. Biraz kısaltıp tekrar dene.`, 'too_long', status);
  }
  if (status === 409 || code === 'recipe_note_limit') {
    return new RecipeNoteError('Not sınırına ulaştın. Yeni bir not için Notlarım\'dan eski bir notu silebilirsin.', 'limit', status);
  }
  if (status === 404 || code === 'recipe_not_found') {
    return new RecipeNoteError('Bu tarif artık erişilebilir değil.', 'not_found', status);
  }
  if (status === 400) {
    return new RecipeNoteError(serverMessage || 'Not kaydedilemedi. Metni kontrol edip tekrar dene.', 'invalid', status);
  }
  return new RecipeNoteError(serverMessage || fallback, 'unavailable', status);
}

async function call(
  token: string, path: string, method: 'GET' | 'PUT' | 'DELETE', body: unknown, fallback: string, signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!token) throw new RecipeNoteError('Not eklemek için giriş yap.', 'auth', 401);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Cache-Control': 'no-store',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted && !signal?.aborted) {
      throw new RecipeNoteError('Tariften sunucusu geç yanıt verdi. Tekrar dene.', 'network');
    }
    throw new RecipeNoteError('Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.', 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) throw noteErrorFrom(response.status, json, fallback);
  if (!isRecord(json)) throw new RecipeNoteError(fallback, 'unavailable', response.status);
  return json;
}

const notePath = (recipeId: number) => {
  const id = positiveId(recipeId);
  if (!id) throw new RecipeNoteError('Bu tarif artık erişilebilir değil.', 'not_found', 404);
  return `/recipes/${id}/my-note`;
};

/** GET /recipes/{id}/my-note → the member's note or null (200 in both cases). */
export async function getMyRecipeNote(
  token: string, recipeId: number, signal?: AbortSignal,
): Promise<{ note: RecipeNote | null; maxLength: number }> {
  const json = await call(token, notePath(recipeId), 'GET', undefined, 'Notun yüklenemedi. Birazdan tekrar dene.', signal);
  return { note: parseNote(json.note), maxLength: positiveId(json.max_length) ?? RECIPE_NOTE_MAX_LENGTH };
}

/**
 * PUT /recipes/{id}/my-note. An empty (or whitespace-only) note deletes it on
 * the server, so "clear the text and save" needs no separate DELETE. The
 * screen must show the returned (sanitised) text, not what was typed.
 */
export async function saveMyRecipeNote(
  token: string, recipeId: number, text: string,
): Promise<{ note: RecipeNote | null; created: boolean; deleted: boolean }> {
  const value = typeof text === 'string' ? text : '';
  const json = await call(token, notePath(recipeId), 'PUT', { note: value.trim() === '' ? '' : value },
    'Notun kaydedilemedi. Birazdan tekrar dene.');
  const note = parseNote(json.note);
  return { note, created: json.created === true, deleted: note === null };
}

/** DELETE /recipes/{id}/my-note. Idempotent; works even when the recipe is gone. */
export async function deleteMyRecipeNote(token: string, recipeId: number): Promise<{ deleted: boolean }> {
  const json = await call(token, notePath(recipeId), 'DELETE', undefined, 'Notun silinemedi. Birazdan tekrar dene.');
  return { deleted: json.deleted === true };
}

/** GET /me/notes — "Notlarım", most recently updated first. */
export async function getMyNotesPage(
  token: string, page = 1, perPage: number = MY_NOTES_PER_PAGE, signal?: AbortSignal,
): Promise<MyNotesPage> {
  const current = Math.min(10000, Math.max(1, Math.trunc(page) || 1));
  const size = Math.min(50, Math.max(1, Math.trunc(perPage) || MY_NOTES_PER_PAGE));
  const json = await call(token, `/me/notes?page=${current}&per_page=${size}`, 'GET', undefined,
    'Notların yüklenemedi. Birazdan tekrar dene.', signal);
  if (!Array.isArray(json.notes)) throw new RecipeNoteError('Not listesi eksik geldi. Tekrar dene.', 'unavailable', 200);
  const notes = json.notes.map(parseItem).filter((n): n is MyNoteItem => n !== null);
  const total = Number(json.total);
  const pages = Number(json.pages);
  return {
    notes,
    page: positiveId(json.page) ?? current,
    pages: Number.isInteger(pages) && pages >= 0 ? pages : 1,
    total: Number.isInteger(total) && total >= 0 ? total : notes.length,
  };
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** "22 Eki" this year, "19 Eki 2025" otherwise; '' for an unreadable date. */
export function noteDateTr(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const d = new Date(at);
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? label : `${label} ${d.getFullYear()}`;
}
