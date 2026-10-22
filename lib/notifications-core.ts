/**
 * Notifications: pure rules shared by the push bridge, the inbox screen and
 * tests. No React Native or Expo imports here, so node:test can load it.
 *
 * Contract: Core 1.0.51 docs/NOTIFICATIONS.md
 *   push data  {notification_id, type, recipe_slug, job_id, url}
 *   inbox item {id, type, title, body, target{type,id,slug}, data{...}, created_at, read_at, read}
 */

export type NotificationKind = 'recipe_ready' | 'recipe_review' | 'recipe_failed';
export const KNOWN_KINDS: readonly NotificationKind[] = ['recipe_ready', 'recipe_review', 'recipe_failed'];

/** Where everything we cannot route safely lands: the in-app inbox. */
export const INBOX_PATH = '/notifications';

export type NotificationTarget = {
  notificationId: number | null;
  type: string;
  recipeSlug: string | null;
  jobId: number | null;
  url: string | null;
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);

/** Positive safe integer from a number or a digit-only string (FCM can stringify data). */
export function positiveId(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const SLUG = /^[\p{L}\p{N}][\p{L}\p{N}._%-]{0,199}$/u;
export function safeSlug(value: unknown): string | null {
  return typeof value === 'string' && SLUG.test(value.trim()) ? value.trim() : null;
}

/**
 * Accepts either a push `data` object or an inbox item and returns one
 * normalized target. Unknown/missing fields become null; nothing throws.
 */
export function normalizeTarget(input: unknown): NotificationTarget {
  const root = isObject(input) ? input : {};
  const data = isObject(root.data) ? root.data : root;
  const target = isObject(root.target) ? root.target : {};
  const type = typeof data.type === 'string' ? data.type : typeof root.type === 'string' ? root.type : '';
  return {
    notificationId: positiveId(root.notification_id) ?? positiveId(data.notification_id)
      ?? (isObject(root.data) ? positiveId(root.id) : null),
    type,
    recipeSlug: safeSlug(data.recipe_slug) ?? (target.type === 'recipe' ? safeSlug(target.slug) : null),
    jobId: positiveId(data.job_id) ?? (target.type === 'video_job' ? positiveId(target.id) : null),
    url: typeof data.url === 'string' ? data.url : null,
  };
}

/** Only known app routes (recipe, import job, kitchen tools); anything else is ignored. */
function safeRelativeUrl(url: string | null): string | null {
  if (!url) return null;
  // Local kitchen-timer notification (Mutfak Rehberi tools): back to the tool.
  const tool = /^\/rehber\/araclar(?:\?arac=(yumurta|makarna|kurutma|olcu))?$/.exec(url);
  if (tool) return tool[1] ? `/rehber/araclar?arac=${tool[1]}` : '/rehber/araclar';
  const job = /^\/recipe\/aktar\?job=([1-9]\d{0,15})$/.exec(url);
  if (job) return `/recipe/aktar?job=${job[1]}`;
  const recipe = /^\/recipe\/([^/?#]+)$/.exec(url);
  if (recipe && recipe[1] !== 'aktar' && recipe[1] !== 'import' && recipe[1] !== 'create' && recipe[1] !== 'social') {
    let slug: string | null = null;
    try { slug = safeSlug(decodeURIComponent(recipe[1])); } catch { slug = null; }
    if (slug) return `/recipe/${encodeURIComponent(slug)}`;
  }
  return null;
}

/**
 * Tap → screen.
 *   recipe_ready                  → /recipe/<slug>
 *   recipe_review / recipe_failed → /recipe/aktar?job=<job_id> (the import screen resumes the job)
 * Missing ids or unknown types fall back to Core's `url` (only known app
 * routes) and finally to the inbox.
 */
export function routeForNotification(input: unknown): string {
  const t = normalizeTarget(input);
  if (t.type === 'recipe_ready' && t.recipeSlug) return `/recipe/${encodeURIComponent(t.recipeSlug)}`;
  if ((t.type === 'recipe_review' || t.type === 'recipe_failed') && t.jobId) return `/recipe/aktar?job=${t.jobId}`;
  return safeRelativeUrl(t.url) ?? INBOX_PATH;
}

// ---------------------------------------------------------------------------
// Permission gating

export type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';
export type PromptMoment = 'launch' | 'import_started' | 'settings_toggle';
export type PromptDecision = 'none' | 'sheet' | 'os' | 'settings';

/** After "Şimdi değil" on the import sheet we stay quiet this long. */
export const IMPORT_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export type PromptInput = {
  moment: PromptMoment;
  permission: PermissionStatus;
  canAskAgain: boolean;
  /** null = never chosen, false = member turned it off in profile. */
  preference: boolean | null;
  declinedAt: number | null;
  now: number;
};

/**
 * The OS prompt is NEVER shown at launch. It is offered only:
 *  - right after a social video import starts (an in-app sheet first), or
 *  - from the profile toggle (direct OS prompt, or system settings when iOS
 *    / Android will no longer show the prompt).
 */
export function promptDecision(input: PromptInput): PromptDecision {
  if (input.permission === 'unavailable') return 'none';
  if (input.moment === 'launch') return 'none';
  if (input.moment === 'settings_toggle') {
    if (input.permission === 'granted') return 'none';
    return input.canAskAgain ? 'os' : 'settings';
  }
  // import_started
  if (input.permission === 'granted') return 'none';
  if (input.preference === false) return 'none';
  if (!input.canAskAgain) return 'none';
  if (input.declinedAt && input.now - input.declinedAt < IMPORT_PROMPT_COOLDOWN_MS) return 'none';
  return 'sheet';
}

// ---------------------------------------------------------------------------
// Push token registration state machine

export type LastRegistration = { token: string; userKey: string; at: number } | null;
export type SyncInput = {
  signedIn: boolean;
  userKey: string | null;
  preference: boolean | null;
  permission: PermissionStatus;
  pushToken: string | null;
  last: LastRegistration;
  now: number;
  force?: boolean;
};
export type SyncAction =
  | { kind: 'register'; token: string }
  | { kind: 'unregister'; token: string }
  | { kind: 'none'; reason: 'signed_out' | 'disabled' | 'no_token' | 'fresh' };

/** Core keeps tokens 180 days; we refresh `updated_at` at most this often unless forced. */
export const REGISTRATION_REFRESH_MS = 6 * 60 * 60 * 1000;
export const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,120}\]$/;

export function isEnabled(preference: boolean | null, permission: PermissionStatus): boolean {
  return permission === 'granted' && preference !== false;
}

/**
 * Sign-out is handled separately (DELETE with the still-valid JWT before it is
 * dropped). Here: register when enabled and the token/account changed or the
 * refresh window passed; unregister when the member turned push off.
 */
export function planTokenSync(input: SyncInput): SyncAction {
  if (!input.signedIn || !input.userKey) return { kind: 'none', reason: 'signed_out' };
  if (!isEnabled(input.preference, input.permission)) {
    return input.last ? { kind: 'unregister', token: input.last.token } : { kind: 'none', reason: 'disabled' };
  }
  if (!input.pushToken || !EXPO_TOKEN.test(input.pushToken)) return { kind: 'none', reason: 'no_token' };
  const last = input.last;
  if (!input.force && last && last.token === input.pushToken && last.userKey === input.userKey
      && input.now - last.at >= 0 && input.now - last.at < REGISTRATION_REFRESH_MS) {
    return { kind: 'none', reason: 'fresh' };
  }
  return { kind: 'register', token: input.pushToken };
}

export function parseLastRegistration(raw: string | null): LastRegistration {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (isObject(value) && typeof value.token === 'string' && EXPO_TOKEN.test(value.token)
        && typeof value.userKey === 'string' && value.userKey && typeof value.at === 'number' && Number.isFinite(value.at)) {
      return { token: value.token, userKey: value.userKey, at: value.at };
    }
  } catch { /* corrupt → treat as never registered */ }
  return null;
}

/** device_id format accepted by Core: [A-Za-z0-9._:-]{1,100} */
export function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,100}$/.test(value);
}

// ---------------------------------------------------------------------------
// Inbox

export type InboxItem = {
  id: number;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  path: string;
};
export type InboxPage = { items: InboxItem[]; unreadCount: number; page: number; totalPages: number };

const text = (value: unknown, limit: number) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');

export function parseInboxItem(value: unknown): InboxItem | null {
  if (!isObject(value)) return null;
  const id = positiveId(value.id);
  const title = text(value.title, 200);
  if (!id || !title) return null;
  return {
    id,
    type: text(value.type, 40),
    title,
    body: text(value.body, 500),
    createdAt: text(value.created_at, 40),
    read: value.read === true || (typeof value.read_at === 'string' && value.read_at.length > 0),
    path: routeForNotification(value),
  };
}

export function parseInboxPage(value: unknown): InboxPage {
  if (!isObject(value) || !Array.isArray(value.items)) {
    throw new Error('Bildirimler beklenen biçimde gelmedi.');
  }
  const items = value.items.map(parseInboxItem).filter((item): item is InboxItem => !!item);
  const unread = Number(value.unread_count);
  const page = Number(value.page);
  const pages = Number(value.total_pages);
  return {
    items,
    unreadCount: Number.isInteger(unread) && unread >= 0 ? unread : items.filter(i => !i.read).length,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    totalPages: Number.isInteger(pages) && pages >= 0 ? pages : 1,
  };
}

export function badgeLabel(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count > 9 ? '9+' : String(Math.trunc(count));
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "şimdi", "5 dk önce", "3 sa önce", "dün", "4 gün önce", "12 Ekim", "12 Ekim 2025". */
export function relativeTimeTr(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const diff = Math.max(0, now - at);
  const minute = 60 * 1000;
  if (diff < minute) return 'şimdi';
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} dk önce`;
  const then = new Date(at);
  const today = new Date(now);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (diff < 24 * 60 * minute && at >= startOfToday) return `${Math.floor(diff / (60 * minute))} sa önce`;
  const days = Math.floor((startOfToday - new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) / (24 * 60 * minute));
  if (days <= 0) return `${Math.floor(diff / (60 * minute))} sa önce`;
  if (days === 1) return 'dün';
  if (days < 7) return `${days} gün önce`;
  const label = `${then.getDate()} ${MONTHS[then.getMonth()]}`;
  return then.getFullYear() === today.getFullYear() ? label : `${label} ${then.getFullYear()}`;
}
