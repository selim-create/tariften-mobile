/**
 * Bildir / Engelle (Core 1.0.67 · App Store Guideline 1.2, user-generated content).
 *
 * - POST   /reports              → report a recipe, comment or member
 * - GET    /me/blocks            → the member's block list (newest first)
 * - POST   /me/blocks            → block a member (silent: they are never told)
 * - DELETE /me/blocks/{user_id}  → unblock (idempotent)
 *
 * Many lists are rendered from cached, token-less responses, so the app also
 * hides blocked members' recipes and comments locally with the helpers below.
 *
 * Dependency-free (no React Native imports) so
 * scripts/check-report-block.test.cjs can load it with plain Node.
 */

const BASE = 'https://api.tariften.com/wp-json/tariften/v1';
const TIMEOUT_MS = 15_000;

// --- Reasons ------------------------------------------------------------------

export type ReportTargetType = 'recipe' | 'comment' | 'user';
export type ReportReason =
  | 'spam' | 'offensive' | 'hate' | 'sexual' | 'violence' | 'dangerous' | 'copyright' | 'misinformation' | 'other';

/** Contract order and labels; the sheet lists them exactly like this. */
export const REPORT_REASONS: readonly { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam veya reklam' },
  { key: 'offensive', label: 'Hakaret veya taciz' },
  { key: 'hate', label: 'Nefret söylemi' },
  { key: 'sexual', label: 'Cinsel içerik' },
  { key: 'violence', label: 'Şiddet' },
  { key: 'dangerous', label: 'Tehlikeli veya sağlığa zararlı' },
  { key: 'copyright', label: 'Telif hakkı ihlali' },
  { key: 'misinformation', label: 'Yanlış veya yanıltıcı bilgi' },
  { key: 'other', label: 'Diğer' },
];

export const REPORT_DETAILS_MAX = 1000;
export const REPORT_OTHER_MIN = 10;

export const REPORT_SUCCESS_MESSAGE = 'Bildirimin alındı. Ekibimiz en geç 24 saat içinde inceleyecek.';
export const REPORT_ALREADY_MESSAGE = 'Bu içeriği zaten bildirdin.';

/** Characters as Core counts them: a Turkish letter or an emoji is one. */
export function detailsLength(text: string): number {
  return Array.from(String(text ?? '').trim()).length;
}

/** A Turkish sentence when the details cannot be sent yet, otherwise null. */
export function reportDetailsProblem(reason: ReportReason | null, details: string): string | null {
  if (!reason) return 'Bir neden seç.';
  const length = detailsLength(details);
  if (length > REPORT_DETAILS_MAX) return `Açıklama en fazla ${REPORT_DETAILS_MAX.toLocaleString('tr-TR')} karakter olabilir.`;
  if (reason === 'other' && length < REPORT_OTHER_MIN) return `"Diğer" için kısaca ne olduğunu yaz (en az ${REPORT_OTHER_MIN} karakter).`;
  return null;
}

// --- Errors -------------------------------------------------------------------

export type SafetyErrorCode =
  | 'auth' | 'invalid' | 'not_found' | 'self' | 'rate_limited' | 'not_allowed' | 'limit' | 'network' | 'unavailable';

export class SafetyError extends Error {
  code: SafetyErrorCode;
  status: number;
  /** Seconds until another report is accepted (429 only). */
  retryAfter: number | null;
  constructor(message: string, code: SafetyErrorCode, status = 0, retryAfter: number | null = null) {
    super(message);
    this.name = 'SafetyError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const positiveId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** "Biraz sonra", "12 dakika sonra", "3 saat sonra". */
export function retryLabel(seconds: number | null): string {
  if (!seconds || seconds < 60) return 'Biraz sonra';
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} dakika sonra`;
  return `${Math.ceil(seconds / 3600)} saat sonra`;
}

function retryAfterFrom(body: Record<string, unknown>): number | null {
  const data = isRecord(body.data) ? body.data : {};
  const raw = Number(data.retry_after ?? body.retry_after);
  return Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : null;
}

/** POST /reports failures as one calm Turkish sentence and a code the sheet acts on. */
export function reportErrorFrom(status: number, json: unknown): SafetyError {
  const body = isRecord(json) ? json : {};
  const code = str(body.code);
  if (status === 401 || (status === 403 && code !== 'report_invalid')) {
    return new SafetyError('Bildirmek için yeniden giriş yap.', 'auth', status);
  }
  if (status === 429 || code === 'report_rate_limited') {
    const retryAfter = retryAfterFrom(body);
    return new SafetyError(`Bugün çok sayıda bildirim gönderdin. ${retryLabel(retryAfter)} tekrar dene.`, 'rate_limited', status, retryAfter);
  }
  if (status === 404 || code === 'report_target_not_found') {
    return new SafetyError('Bu içerik artık görünmüyor; kaldırılmış olabilir.', 'not_found', status);
  }
  if (status === 422 || code === 'report_self') {
    return new SafetyError('Kendi içeriğini bildiremezsin.', 'self', status);
  }
  if (status === 400 || code === 'report_invalid') {
    return new SafetyError(str(body.message).trim() || 'Bildirim gönderilemedi. Seçimini kontrol edip tekrar dene.', 'invalid', status);
  }
  return new SafetyError('Bildirim şu anda gönderilemedi. Birazdan tekrar dene.', 'unavailable', status);
}

export const BLOCK_NOT_ALLOWED_MESSAGE =
  'Tariften ekibinin ve Tariften Topluluğu\'nun hesapları engellenemez. İçeriği uygunsuz bulursan Bildir\'i kullanabilirsin.';

/** /me/blocks failures (403 block_not_allowed is a normal answer for staff and editorial accounts). */
export function blockErrorFrom(status: number, json: unknown): SafetyError {
  const body = isRecord(json) ? json : {};
  const code = str(body.code);
  if (code === 'block_not_allowed') return new SafetyError(BLOCK_NOT_ALLOWED_MESSAGE, 'not_allowed', status);
  if (status === 401 || status === 403) return new SafetyError('Oturumunun süresi dolmuş. Yeniden giriş yap.', 'auth', status);
  if (status === 409 || code === 'block_limit') {
    return new SafetyError('Engelleme sınırına (500 üye) ulaştın. Yeni bir üyeyi engellemek için önce Engellenen üyeler\'den birinin engelini kaldır.', 'limit', status);
  }
  if (status === 404 || code === 'block_user_not_found') return new SafetyError('Bu üye artık bulunamadı.', 'not_found', status);
  if (status === 422 || code === 'block_self') return new SafetyError('Kendini engelleyemezsin.', 'self', status);
  if (status === 400 || code === 'block_invalid') return new SafetyError('Bu üye engellenemedi. Tekrar dene.', 'invalid', status);
  return new SafetyError('Şu anda işlem yapılamadı. Birazdan tekrar dene.', 'unavailable', status);
}

// --- Transport -----------------------------------------------------------------

async function call(
  token: string, path: string, method: 'GET' | 'POST' | 'DELETE', body: unknown,
  toError: (status: number, json: unknown) => SafetyError, signal?: AbortSignal,
): Promise<{ status: number; json: Record<string, unknown> }> {
  if (!token) throw new SafetyError('Bu işlem için giriş yap.', 'auth', 401);
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
      throw new SafetyError('Tariften sunucusu geç yanıt verdi. Tekrar dene.', 'network');
    }
    throw new SafetyError('Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.', 'network');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toError(response.status, json);
  if (!isRecord(json)) throw toError(response.status >= 400 ? response.status : 500, null);
  return { status: response.status, json };
}

// --- Reports -------------------------------------------------------------------

export interface ReportInput {
  target_type: ReportTargetType;
  target_id: number;
  reason: ReportReason;
  details?: string;
}

export interface ReportResult {
  reference: number | null;
  alreadyReported: boolean;
  /** The server's sentence, shown as the toast. */
  message: string;
}

/** POST /reports. 201 new report, 200 already reported (an open report by the same member). */
export async function submitReport(token: string, input: ReportInput): Promise<ReportResult> {
  const targetId = positiveId(input?.target_id);
  const reason = REPORT_REASONS.find(r => r.key === input?.reason)?.key ?? null;
  if (!targetId || !['recipe', 'comment', 'user'].includes(input?.target_type) || !reason) {
    throw new SafetyError('Bildirim gönderilemedi. Seçimini kontrol edip tekrar dene.', 'invalid', 400);
  }
  const details = String(input.details ?? '').trim();
  const problem = reportDetailsProblem(reason, details);
  if (problem) throw new SafetyError(problem, 'invalid', 400);
  const body: Record<string, unknown> = { target_type: input.target_type, target_id: targetId, reason };
  if (details) body.details = details;
  const { json } = await call(token, '/reports', 'POST', body, reportErrorFrom);
  const alreadyReported = json.already_reported === true;
  return {
    reference: positiveId(json.reference),
    alreadyReported,
    message: str(json.message).trim() || (alreadyReported ? REPORT_ALREADY_MESSAGE : REPORT_SUCCESS_MESSAGE),
  };
}

// --- Blocks --------------------------------------------------------------------

export interface MemberBlock {
  user_id: number;
  name: string;
  avatar: string | null;
  blocked_at: string;
}

export const BLOCK_LIST_MAX = 500;

function parseBlock(raw: unknown): MemberBlock | null {
  if (!isRecord(raw)) return null;
  const id = positiveId(raw.user_id);
  if (!id) return null;
  const avatar = str(raw.avatar).trim();
  return {
    user_id: id,
    name: str(raw.name).trim() || 'Tariften üyesi',
    avatar: /^https:\/\//i.test(avatar) ? avatar : null,
    blocked_at: str(raw.blocked_at),
  };
}

/** GET /me/blocks — newest first; malformed rows are dropped. */
export async function getMyBlocks(token: string, signal?: AbortSignal): Promise<{ blocks: MemberBlock[]; max: number }> {
  const { json } = await call(token, '/me/blocks', 'GET', undefined, blockErrorFrom, signal);
  if (!Array.isArray(json.blocks)) throw new SafetyError('Engellenen üyeler listesi eksik geldi. Tekrar dene.', 'unavailable', 200);
  const seen = new Set<number>();
  const blocks = json.blocks.map(parseBlock).filter((b): b is MemberBlock => {
    if (!b || seen.has(b.user_id)) return false;
    seen.add(b.user_id);
    return true;
  });
  return { blocks, max: positiveId(json.max) ?? BLOCK_LIST_MAX };
}

/** POST /me/blocks. 201 blocked, 200 already blocked — both are success. */
export async function blockMember(token: string, userId: number): Promise<{ userId: number; blocked: boolean }> {
  const id = positiveId(userId);
  if (!id) throw new SafetyError('Bu üye engellenemedi. Tekrar dene.', 'invalid', 400);
  const { json } = await call(token, '/me/blocks', 'POST', { user_id: id }, blockErrorFrom);
  return { userId: positiveId(json.user_id) ?? id, blocked: json.blocked !== false };
}

/** DELETE /me/blocks/{user_id}. Idempotent. */
export async function unblockMember(token: string, userId: number): Promise<{ userId: number; blocked: boolean }> {
  const id = positiveId(userId);
  if (!id) throw new SafetyError('Engel kaldırılamadı. Tekrar dene.', 'invalid', 400);
  const { json } = await call(token, `/me/blocks/${id}`, 'DELETE', undefined, blockErrorFrom);
  return { userId: positiveId(json.user_id) ?? id, blocked: json.blocked === true };
}

// --- Local filtering -------------------------------------------------------------

type IdSet = ReadonlySet<number> | readonly number[];
const has = (ids: IdSet, id: number | null): boolean =>
  id !== null && (Array.isArray(ids) ? ids.includes(id) : (ids as ReadonlySet<number>).has(id));

/** Author of a recipe card or detail: `author_id` or `author.id`; null when unknown. */
export function recipeAuthorId(recipe: unknown): number | null {
  if (!isRecord(recipe)) return null;
  const author = isRecord(recipe.author) ? recipe.author : null;
  return positiveId(recipe.author_id) ?? positiveId(author?.id);
}

/** Comment author id; anonymised comments ("Eski üye", user_id 0) have none. */
export function commentAuthorId(comment: unknown): number | null {
  if (!isRecord(comment)) return null;
  const author = isRecord(comment.author) ? comment.author : null;
  return positiveId(author?.id) ?? positiveId(comment.user_id);
}

/** Drops recipe cards by blocked members. Returns the same array when nothing changes. */
export function filterBlockedRecipes<T>(recipes: readonly T[] | null | undefined, blockedIds: IdSet): T[] {
  const list = Array.isArray(recipes) ? (recipes as T[]) : [];
  const count = Array.isArray(blockedIds) ? blockedIds.length : (blockedIds as ReadonlySet<number>).size;
  if (!count || !list.length) return list;
  const kept = list.filter(r => !has(blockedIds, recipeAuthorId(r)));
  return kept.length === list.length ? list : kept;
}

/** Drops comments by blocked members and comments this member reported in this session. */
export function filterBlockedComments<T extends { id: number }>(
  comments: readonly T[] | null | undefined, blockedIds: IdSet, hiddenCommentIds: IdSet = [],
): T[] {
  const list = Array.isArray(comments) ? (comments as T[]) : [];
  if (!list.length) return list;
  const kept = list.filter(c => !has(blockedIds, commentAuthorId(c)) && !has(hiddenCommentIds, Number(c.id)));
  return kept.length === list.length ? list : kept;
}

/**
 * Recipe detail of a blocked author shows a calm placeholder until "Yine de göster".
 * Once the session's block list is loaded it is the truth (it is refreshed after every
 * block/unblock); before that, or when it failed, Core's `author_blocked` decides.
 */
export function shouldShowBlockedPlaceholder(input: {
  recipe: unknown; blockedIds: IdSet; listReady: boolean; revealed: boolean; viewerId?: number | null;
}): boolean {
  if (input.revealed || !isRecord(input.recipe)) return false;
  const authorId = recipeAuthorId(input.recipe);
  if (authorId !== null && input.viewerId != null && authorId === Number(input.viewerId)) return false;
  if (has(input.blockedIds, authorId)) return true;
  return !input.listReady && input.recipe.author_blocked === true;
}

export const COMMUNITY_AUTHOR_NAME = 'Tariften Topluluğu';
export const BLOCKED_PLACEHOLDER_TITLE = 'Bu üyeyi engelledin.';

/** The block item is offered for another real member; Core still answers 403 for staff. */
export function canOfferBlock(authorId: number | null, authorName: string | null | undefined, viewerId: number | null | undefined): boolean {
  if (authorId === null || viewerId == null) return false;
  if (authorId === Number(viewerId)) return false;
  return String(authorName ?? '').trim() !== COMMUNITY_AUTHOR_NAME;
}

// --- Copy ----------------------------------------------------------------------------

const VOWELS = 'aeıioöuü';

/**
 * Turkish accusative after an apostrophe, by vowel harmony:
 * Burak'ı, Selim'i, Ayşe'yi, Ali'yi, Tuğba'yı, Onur'u, Gönül'ü.
 */
export function accusativeName(name: string): string | null {
  const clean = String(name ?? '').trim();
  const letters = clean.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşüâîû]/g, '')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u');
  const last = [...letters].reverse().find(ch => VOWELS.includes(ch));
  if (!clean || !last) return null;
  const vowel = 'aı'.includes(last) ? 'ı' : 'ei'.includes(last) ? 'i' : 'ou'.includes(last) ? 'u' : 'ü';
  const endsWithVowel = VOWELS.includes(letters[letters.length - 1]);
  return `${clean}'${endsWithVowel ? 'y' : ''}${vowel}`;
}

/** "Selim'i engelle"; "Bu üyeyi engelle" when the name cannot be inflected. */
export function blockMenuLabel(name: string | null | undefined): string {
  const inflected = accusativeName(String(name ?? ''));
  return inflected ? `${inflected} engelle` : 'Bu üyeyi engelle';
}

export const BLOCK_CONFIRM_MESSAGE =
  'Tariflerini ve yorumlarını artık görmeyeceksin. İstediğin zaman Ayarlar\'dan kaldırabilirsin.';

/** Alert title; with BLOCK_CONFIRM_MESSAGE it reads exactly as the contract text. */
export function blockConfirmTitle(name: string | null | undefined): string {
  const clean = String(name ?? '').trim();
  return `${clean || 'Bu üye'} engellensin mi?`;
}

export function blockConfirmText(name: string | null | undefined): string {
  return `${blockConfirmTitle(name)} ${BLOCK_CONFIRM_MESSAGE}`;
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** "22 Eki" this year, "19 Eki 2025" otherwise; '' for an unreadable date. */
export function blockDateTr(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const d = new Date(at);
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? label : `${label} ${d.getFullYear()}`;
}
