import { GroundedImportPreview, parseImportPreview, validateRecipeSource } from './recipe-import';

/**
 * WordPress Core (never the Web's same-origin proxy) handles mobile imports.
 * No text or JWT is persisted locally or logged. A preview is not a recipe.
 */
const CORE_PREVIEW = 'https://api.tariften.com/wp-json/tariften/v1/ai/recipe-import/preview';

type CoreError = { code?: string; message?: string };
function asError(value: unknown): CoreError {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as CoreError;
  return {};
}

export async function previewRecipeText(
  token: string,
  sourceText: string,
  signal?: AbortSignal,
): Promise<GroundedImportPreview> {
  const error = validateRecipeSource(sourceText);
  if (error) throw new Error(error);
  if (!token) throw new Error('Tarifini aktarmak için giriş yapmalısın.');

  const controller = new AbortController();
  // Core has a 90s provider timeout. 110s lets us display its error when
  // available, but never makes an extra paid request.
  const timeout = setTimeout(() => controller.abort(), 110000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(CORE_PREVIEW, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ source_text: sourceText }),
      signal: controller.signal,
    });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const data = asError(json);
      if (response.status === 404 && data.code === 'rest_no_route') {
        throw new Error('Tarif aktarımı henüz sunucuda hazır değil.');
      }
      if (data.code === 'recipe_import_unavailable') {
        throw new Error('Akıllı Tarif Aktarımı henüz etkinleştirilmedi.');
      }
      if (response.status === 504 || data.code === 'recipe_import_timeout') {
        throw new Error('Tarifini düzenlemek beklediğimizden uzun sürdü. Notların burada duruyor; birazdan yeniden deneyebilirsin. Deneme hakkından kullanım düşmüş olabilir.');
      }
      throw new Error(typeof data.message === 'string' ? data.message : 'Önizleme hazırlanamadı.');
    }
    // Reject ungrounded/malformed responses before showing editable cards.
    return parseImportPreview(json);
  } catch (cause) {
    if (controller.signal.aborted || signal?.aborted) {
      throw new Error('Tarif düzenleme süresi doldu ya da işlem iptal edildi. Deneme hakkından kullanım düşmüş olabilir.');
    }
    if (cause instanceof TypeError) {
      throw new Error('Sunucuya bağlanılamadı. İnternet bağlantını kontrol edip yeniden dene.');
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Creator-description import only. This calls the single existing Core paid
 * import when the source has enough text; video/audio are not processed here.
 */
export async function previewRecipeSocial(
  token: string,
  sourceUrl: string,
  signal?: AbortSignal,
): Promise<GroundedImportPreview> {
  if (!token) throw new Error('Tarif oluşturmak için giriş yapmalısın.');
  const link = sourceUrl.trim();
  if (!/^https:\/\/[^\s]+$/i.test(link) || link.length > 2048) {
    throw new Error('Geçerli bir HTTPS paylaşım bağlantısı gir.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 110000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch('https://api.tariften.com/wp-json/tariften/v1/ai/recipe-social/preview', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({ source_url: link }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = asError(payload);
      if (response.status === 404 && error.code === 'rest_no_route') {
        throw new Error('Sosyal tarif aktarımı henüz sunucuda hazır değil.');
      }
      if (error.code === 'social_source_unavailable' || error.code === 'recipe_import_unavailable') {
        throw new Error('Sosyal tarif aktarımı beta özelliği henüz etkinleştirilmedi.');
      }
      if (response.status === 504 || error.code === 'recipe_import_timeout') {
        throw new Error('Tarifin hazırlanması zaman aşımına uğradı. Kullanım hakkından deneme düşmüş olabilir.');
      }
      throw new Error(error.message || 'Bu bağlantıdan tarif çıkarılamadı.');
    }
    const preview = parseImportPreview(payload);
    if (preview.provenance.origin_type !== 'social_creator_description') {
      throw new Error('Sosyal tarif kaynağı doğrulanamadı.');
    }
    return preview;
  } catch (cause) {
    if (controller.signal.aborted || signal?.aborted) {
      throw new Error('Kaynak incelemesi zaman aşımına uğradı ya da iptal edildi. Kullanım hakkından deneme düşmüş olabilir.');
    }
    if (cause instanceof TypeError) {
      throw new Error('Tariften sunucusuna bağlanılamadı. İnternet bağlantını kontrol et.');
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}


/**
 * Real native-video beta: Core owns the job, quota and payment; this client
 * never invokes Cloud Run or Gemini and never retries a provider call.
 */
import { needsRightsConfirmation, parseVideoJob, type VideoJob } from './video-recipe-import';

const VIDEO_BASE = 'https://api.tariften.com/wp-json/tariften/v1/ai/recipe-social/video';

/** Thrown when Core reports that this video already has a published recipe. */
export class VideoAlreadyPublished extends Error {
  constructor(public readonly slug: string) { super('Bu videonun tarifi zaten yayında.'); }
}

export type VideoSourceState =
  | { status: 'published'; slug: string }
  | { status: 'pending' }
  | { status: 'existing'; job: VideoJob }
  | { status: 'new'; canStart: boolean }
  | { status: 'unsupported' };

/**
 * Free, authenticated look-up before any paid analysis: an already published
 * recipe opens directly, the user's earlier job resumes, and a new analysis
 * starts only when Core says it can.
 */
export async function resolveVideoSource(token: string, sourceUrl: string, signal?: AbortSignal): Promise<VideoSourceState> {
  if (!token) throw new Error('Video aktarmak için giriş yapmalısın.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(VIDEO_BASE + '/resolve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_url: sourceUrl.trim() }),
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
    if (!response.ok) {
      if (data.code === 'rest_no_route') throw new Error('Video analizi sunucuda henüz etkinleştirilmedi.');
      if (response.status === 422) return { status: 'unsupported' };
      throw new Error(typeof data.message === 'string' && data.message ? data.message : 'Video kaydı doğrulanamadı; yeni analiz başlatılmadı.');
    }
    if (data.status === 'published' && typeof data.recipe_slug === 'string' && data.recipe_slug) return { status: 'published', slug: data.recipe_slug };
    if (data.status === 'pending') return { status: 'pending' };
    if (data.status === 'existing') return { status: 'existing', job: parseVideoJob(data.job) };
    if (data.status === 'new') return { status: 'new', canStart: data.can_start === true };
    throw new Error('Video kaydı doğrulanamadı; yeni analiz başlatılmadı.');
  } catch (cause) {
    if (controller.signal.aborted) throw new Error('Tariften sunucusu geç yanıt verdi. Henüz analiz başlatılmadı; tekrar deneyebilirsin.');
    if (cause instanceof TypeError) throw new Error('Tariften sunucusuna ulaşılamadı. Henüz analiz başlatılmadı.');
    throw cause;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
async function videoRequest(
  token: string, url: string, options: RequestInit, signal?: AbortSignal,
): Promise<VideoJob> {
  if (!token) throw new Error('Video aktarmak için giriş yapmalısın.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...options.headers },
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = asError(payload);
      if (error.code === 'rest_no_route' || error.code === 'video_job_unavailable') {
        throw new Error('Video analizi henüz etkinleştirilmedi.');
      }
      throw new Error(error.message || 'Video analizi sunucusundan yanıt alınamadı.');
    }
    if (payload && typeof payload === 'object' && !Array.isArray(payload)
        && (payload as { status?: unknown }).status === 'published'
        && typeof (payload as { recipe_slug?: unknown }).recipe_slug === 'string') {
      // The same video was already turned into a public recipe: open it, never pay twice.
      throw new VideoAlreadyPublished((payload as { recipe_slug: string }).recipe_slug);
    }
    return parseVideoJob(payload);
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new Error('Video işinin yanıtı gecikti. Aynı bağlantıyla durumunu kontrol edebilirsin; yeni ücretli analiz başlatılmaz.');
    }
    if (cause instanceof TypeError) {
      throw new Error('Tariften sunucusuna ulaşılamadı. Aynı bağlantıyla tekrar kontrol edebilirsin.');
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}
export function startVideoRecipeJob(
  token: string, sourceUrl: string, requestId: string, signal?: AbortSignal, rightsConfirmed = false,
): Promise<VideoJob> {
  if (!/^[A-Za-z0-9-]{16,80}$/.test(requestId)) throw new Error('Video iş kimliği geçersiz.');
  const social = needsRightsConfirmation(sourceUrl);
  if (social && rightsConfirmed !== true) {
    throw new Error('Bu videoyu analiz etmek için kullanım iznini onaylamalısın.');
  }
  return videoRequest(token, VIDEO_BASE + '/start', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(social
      ? { source_url: sourceUrl.trim(), request_id: requestId, rights_confirmed: true }
      : { source_url: sourceUrl.trim(), request_id: requestId }),
  }, signal);
}
export function getVideoRecipeJob(token: string, id: number, signal?: AbortSignal): Promise<VideoJob> {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Video iş kimliği geçersiz.');
  return videoRequest(token, VIDEO_BASE + '/status/' + id, { method: 'GET' }, signal);
}
