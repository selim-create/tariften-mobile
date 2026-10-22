/**
 * Kendi videondan tarif (Core P19): upload the member's own MP4/MOV with
 * progress, then hand over to the existing video job screen (/recipe/aktar?job=).
 * The upload reference (source_url "upload:…") is never shown or linked.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { RecipeCreateUnconfirmedError } from './recipe-publish';
import { isUploadSourceRef, ownVideoErrorInfo, ownVideoKind, ownVideoUploadFields, type OwnVideoCandidate } from './own-video';

const BASE = 'https://api.tariften.com/wp-json/tariften/v1';
export const OWN_VIDEO_UPLOAD_URL = `${BASE}/ai/video-upload`;
export const VIDEO_PUBLISH_URL = `${BASE}/ai/recipe-social/video/publish`;

export class OwnVideoUploadError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly unavailable = false) {
    super(message);
    this.name = 'OwnVideoUploadError';
  }
}

export type OwnVideoJobStart = {
  jobId: number;
  status: string;
  /** Set when Core accepted the request but the job already ended (e.g. quota). */
  failedMessage: string;
  /** 202 = a new job; 200 = the same request_id resumed an existing job. */
  isNew: boolean;
};

export type OwnVideoUpload = {
  promise: Promise<OwnVideoJobStart>;
  cancel: () => void;
};

function parseBody(body: string | undefined | null): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(body || '');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/**
 * POST /ai/video-upload as multipart (field `video`, plus request_id and note).
 * Progress is reported 0..1 of the bytes sent. Cancelling never starts a new job;
 * uploading again with the same request_id resumes the same Core job.
 */
export function uploadOwnVideo(
  token: string,
  video: OwnVideoCandidate & { uri: string },
  requestId: string,
  note: string,
  onProgress: (sent: number, expected: number) => void,
): OwnVideoUpload {
  const kind = ownVideoKind(video);
  if (!token) throw new Error('Video yüklemek için giriş yapmalısın.');
  if (!kind) throw new Error('Yalnızca MP4 veya MOV videolar yüklenebilir.');
  const parameters = ownVideoUploadFields(requestId, note);
  let cancelled = false;
  const task = FileSystem.createUploadTask(OWN_VIDEO_UPLOAD_URL, video.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
    fieldName: 'video',
    mimeType: kind.mimeType,
    parameters,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    // Foreground: a lost connection fails visibly instead of retrying silently.
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
  }, data => onProgress(data.totalBytesSent, data.totalBytesExpectedToSend));

  const promise = (async (): Promise<OwnVideoJobStart> => {
    let result: FileSystem.FileSystemUploadResult | null | undefined;
    try {
      result = await task.uploadAsync();
    } catch {
      if (cancelled) throw new OwnVideoUploadError('Yükleme durduruldu.', 0, 'cancelled');
      throw new OwnVideoUploadError('Bağlantı koptu. Aynı videoyu yeniden yüklediğinde ikinci kez hak düşmez.', 0, 'network');
    }
    if (!result) {
      throw new OwnVideoUploadError(cancelled ? 'Yükleme durduruldu.' : 'Yükleme tamamlanamadı. Yeniden dene.', 0, cancelled ? 'cancelled' : 'network');
    }
    const data = parseBody(result.body);
    const code = typeof data.code === 'string' ? data.code : '';
    if (result.status < 200 || result.status >= 300) {
      const info = ownVideoErrorInfo(result.status, code, typeof data.message === 'string' ? data.message : '');
      throw new OwnVideoUploadError(info.message, result.status, code, info.unavailable);
    }
    const jobId = Number(data.job_id ?? data.id);
    if (data.success !== true || !Number.isSafeInteger(jobId) || jobId < 1 || data.source_kind !== 'upload'
        || !isUploadSourceRef(data.source_url)) {
      throw new OwnVideoUploadError('Video kaydı doğrulanamadı. Tekrar dene.', result.status, 'invalid_response');
    }
    const status = typeof data.status === 'string' ? data.status : 'queued';
    const failedMessage = status === 'failed'
      ? (typeof data.message === 'string' && data.message ? data.message : ownVideoErrorInfo(0, typeof data.error_code === 'string' ? data.error_code : '').message)
      : '';
    return { jobId, status, failedMessage, isNew: result.status === 202 };
  })();

  return {
    promise,
    cancel: () => { cancelled = true; void task.cancelAsync().catch(() => undefined); },
  };
}

/**
 * Existing Core publish for video jobs: {job_id, recipe}. For an own-video job
 * Core attaches the frame cover and keeps the upload reference private.
 * Like recipes/create, a network or 5xx failure is an UNKNOWN outcome.
 */
export async function publishOwnVideoRecipe(
  token: string, jobId: number, recipe: Record<string, unknown>, signal?: AbortSignal,
): Promise<{ success: true; id: number; slug: string }> {
  if (!Number.isSafeInteger(jobId) || jobId < 1) throw new Error('Video iş kimliği geçersiz.');
  let res: Response;
  try {
    res = await fetch(VIDEO_PUBLISH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ job_id: jobId, recipe }),
      signal,
    });
  } catch {
    throw new RecipeCreateUnconfirmedError();
  }
  const json: unknown = await res.json().catch(() => null);
  const data = json && typeof json === 'object' ? json as Record<string, unknown> : {};
  if (res.status >= 500 || (res.ok && data.success !== true)) throw new RecipeCreateUnconfirmedError();
  if (!res.ok) throw new Error(typeof data.message === 'string' ? data.message : 'Tarif yayımlanamadı.');
  const id = Number(data.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new RecipeCreateUnconfirmedError();
  return { success: true, id, slug: typeof data.slug === 'string' ? data.slug : '' };
}
