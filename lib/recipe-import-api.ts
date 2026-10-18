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
