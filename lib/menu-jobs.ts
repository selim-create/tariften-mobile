/**
 * Mobile menu jobs use Core's resumable API, not the legacy synchronous
 * generate-menu endpoint. Every call advances at most one recipe.
 */
const API = 'https://api.tariften.com/wp-json/tariften/v1';

export type MenuJob = {
  success: true;
  id: number;
  slug: string;
  status: 'generating' | 'ready' | 'needs_attention';
  total: number;
  completed: number;
  message?: string;
  failures?: Array<{ name: string; error: string }>;
};

async function request(path: string, token: string, method: 'GET' | 'POST' = 'GET', data?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
  const raw = await response.text();
  let result: Record<string, unknown> | null = null;
  try { result = JSON.parse(raw) as Record<string, unknown>; } catch { /* Proxy sometimes returns HTML */ }
  if (!result) throw new Error('Menü sunucusundan beklenmeyen yanıt. Kayıtlı işlemi kontrol edip devam edin.');
  if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : 'Menü isteği tamamlanamadı.');
  return result;
}

function job(value: Record<string, unknown>): MenuJob {
  if (value.success !== true || typeof value.id !== 'number'
    || typeof value.slug !== 'string' || typeof value.completed !== 'number'
    || typeof value.total !== 'number' || !['generating', 'ready', 'needs_attention'].includes(String(value.status))) {
    throw new Error('Menü işleminin durumu alınamadı; yeni menü başlatmayın.');
  }
  return value as MenuJob;
}

export async function beginMenu(token: string, form: {
  concept: string; guest_count: number; event_type: string; diet: string; cuisine: string;
}, requestId: string) {
  return job(await request('/ai/generate-menu', token, 'POST', {
    ...form, diet_preference: form.diet, async: true, request_id: requestId,
  }));
}
export async function findMenu(token: string, requestId: string): Promise<MenuJob | null> {
  const value = await request(`/ai/menu-job/find?request_id=${encodeURIComponent(requestId)}`, token);
  return !value.found && !value.id ? null : job(value);
}
export async function readMenu(token: string, id: number) {
  return job(await request(`/ai/menu-job/${id}`, token));
}
export async function advanceMenu(token: string, id: number) {
  return job(await request(`/ai/menu-job/${id}/advance`, token, 'POST'));
}
export async function retryMenu(token: string, id: number) {
  return job(await request(`/ai/menu-job/${id}/retry`, token, 'POST'));
}
