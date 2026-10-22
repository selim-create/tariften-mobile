/**
 * Core client for Fotoğraftan tarif / Defterden tarif (Core 1.0.58).
 * Preview first (no recipe is created), then an explicit, private-by-default save.
 * Photos are never stored on the device by us and never logged.
 */
import {
  NOTEBOOK_MAX_PAGES, PHOTO_NOTE_MAX, PHOTO_PREVIEW_TIMEOUT_MS,
  buildPhotoSavePayload, parsePhotoPreview, photoErrorInfo,
  type PhotoMode, type PhotoPreview, type PhotoSaveOptions,
} from './photo-recipe';
import type { QuickRecipeDraft } from './quick-recipe-review';

const BASE = 'https://api.tariften.com/wp-json/tariften/v1';
export const PHOTO_PREVIEW_URL = `${BASE}/ai/photo-recipe`;
export const PHOTO_SAVE_URL = `${BASE}/ai/photo-recipe/save`;

/** A JPEG already prepared on the device (downscaled, EXIF left for Core to strip). */
export type PreparedPhoto = { uri: string; name: string; type: string };

export class PhotoRecipeError extends Error {
  constructor(message: string, readonly status: number, readonly code: string,
    readonly unavailable = false, readonly quota = false) {
    super(message);
    this.name = 'PhotoRecipeError';
  }
}

type CoreError = { code?: unknown; message?: unknown };
const asError = (value: unknown): CoreError => (value && typeof value === 'object' && !Array.isArray(value) ? value as CoreError : {});

function toError(status: number, payload: unknown, mode: PhotoMode, phase: 'preview' | 'save'): PhotoRecipeError {
  const body = asError(payload);
  const code = typeof body.code === 'string' ? body.code : '';
  const message = typeof body.message === 'string' ? body.message : '';
  if (status === 404 && code === 'rest_no_route') {
    return new PhotoRecipeError(photoErrorInfo(503, 'photo_recipe_unavailable', '', mode).message, status, code, true);
  }
  const info = photoErrorInfo(status, code, message, mode, phase);
  return new PhotoRecipeError(info.message, status, code, info.unavailable, info.quota);
}

/** POST /ai/photo-recipe — multipart: mode, images[] (in page order), note?, keep_cover? */
export function buildPhotoPreviewForm(mode: PhotoMode, photos: PreparedPhoto[], note = '', keepCover = true): FormData {
  if (mode !== 'dish' && mode !== 'notebook') throw new Error('Geçersiz fotoğraf türü.');
  if (mode === 'dish' && photos.length !== 1) throw new Error('Tek bir yemek fotoğrafı seçmelisin.');
  if (mode === 'notebook' && (photos.length < 1 || photos.length > NOTEBOOK_MAX_PAGES)) {
    throw new Error('En az 1, en fazla 4 sayfa ekleyebilirsin.');
  }
  const trimmed = note.trim();
  if (trimmed.length > PHOTO_NOTE_MAX) throw new Error(`Not en fazla ${PHOTO_NOTE_MAX} karakter olabilir.`);
  const form = new FormData();
  form.append('mode', mode);
  for (const photo of photos) {
    form.append('images[]', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
  }
  if (trimmed) form.append('note', trimmed);
  // Notebook pages are never kept by Core; only a dish photo can become the cover.
  if (mode === 'dish') form.append('keep_cover', keepCover ? '1' : '0');
  return form;
}

export async function previewPhotoRecipe(
  token: string, mode: PhotoMode, photos: PreparedPhoto[], note = '', signal?: AbortSignal,
): Promise<PhotoPreview> {
  if (!token) throw new Error('Tarif oluşturmak için giriş yapmalısın.');
  const body = buildPhotoPreviewForm(mode, photos, note, true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PHOTO_PREVIEW_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(PHOTO_PREVIEW_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Cache-Control': 'no-store' },
      body,
      signal: controller.signal,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw toError(response.status, payload, mode, 'preview');
    return parsePhotoPreview(payload, mode);
  } catch (cause) {
    if (cause instanceof PhotoRecipeError) throw cause;
    if (signal?.aborted) throw new Error('İşlem iptal edildi.');
    if (controller.signal.aborted) {
      throw new Error('Tarifin hazırlanması uzun sürdü. Birazdan yeniden deneyebilirsin; deneme hakkından kullanım düşmüş olabilir.');
    }
    if (cause instanceof TypeError) throw new Error('Sunucuya bağlanılamadı. İnternet bağlantını kontrol edip yeniden dene.');
    throw cause;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

export type PhotoSaveResult = { id: number; slug: string; visibility: 'private' | 'public'; coverAttached: boolean };

/**
 * POST /ai/photo-recipe/save. The preview token is single-use, so retrying
 * after a dropped connection can never create a second recipe (Core answers 410).
 */
export async function savePhotoRecipe(
  token: string, previewToken: string, draft: QuickRecipeDraft, options: PhotoSaveOptions, signal?: AbortSignal,
): Promise<PhotoSaveResult> {
  if (!token) throw new Error('Tarifini kaydetmek için giriş yapmalısın.');
  const body = buildPhotoSavePayload(previewToken, draft, options);
  let response: Response;
  try {
    response = await fetch(PHOTO_SAVE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new Error('Bağlantı koptu. Tekrar kaydetmeyi deneyebilirsin; tarifin iki kez oluşmaz.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toError(response.status, payload, options.mode, 'save');
  const data = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const id = Number(data.id);
  if (data.success !== true || !Number.isSafeInteger(id) || id < 1 || typeof data.slug !== 'string' || !data.slug) {
    throw new Error('Kayıt sonucu doğrulanamadı. Tariflerim bölümünü kontrol et.');
  }
  return {
    id, slug: data.slug,
    visibility: data.visibility === 'public' ? 'public' : 'private',
    coverAttached: data.cover_attached === true,
  };
}
