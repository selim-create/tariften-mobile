import { EXPO_TOKEN, isValidDeviceId, parseInboxPage, positiveId, type InboxPage } from './notifications-core';

/**
 * Core 1.0.51 notification endpoints (docs/NOTIFICATIONS.md). Authenticated,
 * never cached. Tokens and JWTs are never logged.
 */
const BASE = 'https://api.tariften.com/wp-json/tariften/v1';

async function call(
  authToken: string, path: string, init: { method: string; body?: unknown }, timeoutMs: number, signal?: AbortSignal,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  if (!authToken) throw new Error('Bildirimler için giriş yapmalısın.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(BASE + path, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${authToken}`,
        Accept: 'application/json',
        'Cache-Control': 'no-store',
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const json: unknown = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, json };
  } catch (cause) {
    if (controller.signal.aborted) throw new Error('Tariften sunucusu geç yanıt verdi.');
    throw new Error('Tariften sunucusuna ulaşılamadı. İnternet bağlantını kontrol et.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const message = (json: unknown, fallback: string) =>
  json && typeof json === 'object' && typeof (json as { message?: unknown }).message === 'string'
    ? (json as { message: string }).message : fallback;

/** POST /me/push-tokens — 201 new, 200 existing. */
export async function registerPushToken(
  authToken: string, input: { token: string; platform: 'ios' | 'android'; deviceId?: string | null },
): Promise<void> {
  if (!EXPO_TOKEN.test(input.token)) throw new Error('Bildirim anahtarı geçersiz.');
  if (input.platform !== 'ios' && input.platform !== 'android') throw new Error('Platform desteklenmiyor.');
  const body: Record<string, string> = { token: input.token, platform: input.platform };
  if (isValidDeviceId(input.deviceId)) body.device_id = input.deviceId;
  const res = await call(authToken, '/me/push-tokens', { method: 'POST', body }, 10000);
  if (!res.ok) throw new Error(message(res.json, 'Bildirim anahtarı kaydedilemedi.'));
}

/** DELETE /me/push-tokens {token} — called on sign-out and when push is turned off. */
export async function deletePushToken(authToken: string, token: string, timeoutMs = 5000): Promise<boolean> {
  if (!EXPO_TOKEN.test(token)) return false;
  const res = await call(authToken, '/me/push-tokens', { method: 'DELETE', body: { token } }, timeoutMs);
  return res.ok;
}

export async function fetchNotifications(
  authToken: string, page = 1, perPage = 20, signal?: AbortSignal,
): Promise<InboxPage> {
  const p = Math.min(1000, Math.max(1, Math.trunc(page) || 1));
  const n = Math.min(50, Math.max(1, Math.trunc(perPage) || 20));
  const res = await call(authToken, `/me/notifications?page=${p}&per_page=${n}`, { method: 'GET' }, 15000, signal);
  if (!res.ok) throw new Error(message(res.json, 'Bildirimler yüklenemedi.'));
  return parseInboxPage(res.json);
}

/** POST /me/notifications/read — either ids (1–100) or all, never both. Returns the new unread count. */
export async function markNotificationsRead(
  authToken: string, target: { ids: number[] } | { all: true },
): Promise<number | null> {
  let body: { ids: number[] } | { all: true };
  if ('all' in target) {
    body = { all: true };
  } else {
    const ids = Array.from(new Set(target.ids.map(positiveId).filter((id): id is number => id !== null))).slice(0, 100);
    if (!ids.length) return null;
    body = { ids };
  }
  const res = await call(authToken, '/me/notifications/read', { method: 'POST', body }, 10000);
  if (!res.ok) throw new Error(message(res.json, 'Bildirim okundu olarak işaretlenemedi.'));
  const count = Number((res.json as { unread_count?: unknown } | null)?.unread_count);
  return Number.isInteger(count) && count >= 0 ? count : null;
}
