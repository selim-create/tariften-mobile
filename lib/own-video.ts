/**
 * Kendi videondan tarif (Core P19). Pure helpers, no React Native imports, so
 * scripts/check-photo-video-recipe.test.cjs can load this file with plain Node.
 */
export const OWN_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const OWN_VIDEO_MAX_MS = 3 * 60 * 1000;
export const OWN_VIDEO_NOTE_MAX = 1000;

export type OwnVideoCandidate = {
  /** Picker duration in milliseconds (null when the platform did not report it). */
  durationMs?: number | null;
  /** Bytes (null when unknown; Core still validates). */
  fileSize?: number | null;
  mimeType?: string | null;
  fileName?: string | null;
  uri?: string | null;
};

export type OwnVideoKind = { mimeType: 'video/mp4' | 'video/quicktime'; extension: 'mp4' | 'mov' };

/** MP4 or MOV only (by MIME type or file extension). */
export function ownVideoKind(candidate: OwnVideoCandidate): OwnVideoKind | null {
  const mime = (candidate.mimeType || '').toLowerCase();
  const name = (candidate.fileName || candidate.uri || '').toLowerCase().split('?')[0];
  if (mime === 'video/quicktime' || /\.mov$/.test(name)) return { mimeType: 'video/quicktime', extension: 'mov' };
  if (mime === 'video/mp4' || /\.(mp4|m4v)$/.test(name)) return { mimeType: 'video/mp4', extension: 'mp4' };
  return null;
}

/** Client-side check right after picking: nothing is uploaded when this returns a message. */
export function validateOwnVideo(candidate: OwnVideoCandidate): string | null {
  if (!candidate.uri) return 'Bir video seçmelisin.';
  if (!ownVideoKind(candidate)) return 'Yalnızca MP4 veya MOV videolar yüklenebilir.';
  const duration = candidate.durationMs;
  if (typeof duration === 'number' && Number.isFinite(duration) && duration > OWN_VIDEO_MAX_MS) {
    return 'Video en fazla 3 dakika olabilir. Daha kısa bir video seç.';
  }
  const size = candidate.fileSize;
  if (typeof size === 'number' && Number.isFinite(size) && size > OWN_VIDEO_MAX_BYTES) {
    return 'Video en fazla 200 MB olabilir. Daha kısa ya da daha küçük bir video seç.';
  }
  if (typeof size === 'number' && size === 0) return 'Video okunamadı. Başka bir video seç.';
  return null;
}

/** Same rule as Core: 16–80 characters of [A-Za-z0-9-] (a UUID fits). */
export function isValidRequestId(value: string): boolean {
  return /^[A-Za-z0-9-]{16,80}$/.test(value);
}

/**
 * Multipart text fields that travel with the `video` file. The SAME request_id
 * is sent on every attempt for one picked video, so a retried upload never
 * stores a second file or uses a second daily credit.
 */
export function ownVideoUploadFields(requestId: string, note = ''): Record<string, string> {
  if (!isValidRequestId(requestId)) throw new Error('Video yükleme kimliği geçersiz.');
  const trimmed = note.trim();
  if (trimmed.length > OWN_VIDEO_NOTE_MAX) throw new Error(`Not en fazla ${OWN_VIDEO_NOTE_MAX} karakter olabilir.`);
  return trimmed ? { request_id: requestId, note: trimmed } : { request_id: requestId };
}

/** "1:05", "2:59" — duration label for the picked video. */
export function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function formatMegabytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB`;
}

/** Upload progress 0–100 (never NaN, never above 100). */
export function uploadPercent(sent: number, expected: number): number {
  if (!(expected > 0) || !(sent >= 0)) return 0;
  return Math.min(100, Math.round((sent / expected) * 100));
}

/** The opaque Core reference of an uploaded video. It is an id, never a link. */
export function isUploadSourceRef(value: unknown): boolean {
  return typeof value === 'string' && /^upload:[a-f0-9]{32}$/.test(value);
}

export type OwnVideoErrorInfo = { message: string; unavailable: boolean };

/** Friendly Turkish copy for POST /ai/video-upload errors. 413 may arrive as HTML from nginx. */
export function ownVideoErrorInfo(status: number, code: string, serverMessage = ''): OwnVideoErrorInfo {
  const plain = (message: string) => ({ message, unavailable: false });
  if (status === 413 || code === 'video_upload_too_large') return plain('Video en fazla 200 MB olabilir.');
  switch (code) {
    case 'video_upload_unavailable':
      return { message: 'Kendi videondan tarif çok yakında burada. Şimdilik video bağlantısıyla aktarabilirsin.', unavailable: true };
    case 'video_upload_worker_offline':
      return plain('Video servisi şu anda yeni iş kabul etmiyor. Hakkın kullanılmadı; biraz sonra tekrar dene.');
    case 'video_upload_type':
      return plain('Yalnızca MP4 veya MOV videolar yüklenebilir.');
    case 'video_upload_codec':
      return plain('Bu videonun biçimi desteklenmiyor. Telefonunun kamerasıyla çektiğin bir video dene.');
    case 'video_upload_too_long':
      return plain('Video en fazla 3 dakika olabilir.');
    case 'video_upload_invalid':
    case 'video_upload_no_video':
      return plain('Video okunamadı. Başka bir video dene.');
    case 'video_upload_busy':
      return plain('Şu anda işlenen 2 videon var. Biri bitince yeni video yükleyebilirsin.');
    case 'video_upload_missing':
    case 'video_upload_failed':
      return plain('Video tam gönderilemedi. Bağlantını kontrol edip yeniden yükle.');
    case 'video_upload_note_invalid':
    case 'video_upload_note_too_long':
      return plain(`Not en fazla ${OWN_VIDEO_NOTE_MAX} karakter olabilir.`);
    case 'tariften_quota_exceeded':
      return plain('Bugünkü yapay zekâ tarif hakkını kullandın.');
    default:
      break;
  }
  if (status === 401) return plain('Oturumunun süresi dolmuş. Tekrar giriş yapıp dene.');
  if (status === 415) return plain('Yalnızca MP4 veya MOV videolar yüklenebilir.');
  if (status === 429) return plain('Çok sık denedin. Biraz sonra yeniden dene.');
  if (status >= 500) return plain('Video şu anda gönderilemedi. Biraz sonra tekrar dene.');
  return plain(serverMessage && serverMessage.length <= 240 ? serverMessage : 'Video yüklenemedi. Tekrar dene.');
}
