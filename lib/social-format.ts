/**
 * Display helpers for a recipe's social source. They only format what the API
 * returned; a missing or invalid number is never replaced by an estimate.
 */
import type { RecipeSocialSource } from './types';

/** 2 800 000 → "2,8 Mn", 35 400 → "35,4 B", 950 → "950" (Turkish short scale). */
export function compactCountTr(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  const fmt = (n: number, unit: string) => {
    const rounded = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
    return `${String(rounded).replace('.', ',')} ${unit}`;
  };
  if (value >= 1_000_000_000) return fmt(value / 1_000_000_000, 'Mr');
  if (value >= 1_000_000) return fmt(value / 1_000_000, 'Mn');
  if (value >= 10_000) return fmt(value / 1_000, 'B');
  return value.toLocaleString('tr-TR');
}

const ORIGIN_FOR: Record<RecipeSocialSource['platform'], string> = {
  instagram: 'public_instagram_extractor',
  tiktok: 'public_tiktok_extractor',
  youtube: 'public_youtube_data_api',
};

/** Metrics are shown only when their origin belongs to the same platform. */
export function trustedMetrics(source: RecipeSocialSource) {
  if (source.metrics_origin !== ORIGIN_FOR[source.platform]) return [];
  return [
    { key: 'followers', label: source.platform === 'youtube' ? 'Abone' : 'Takipçi', value: compactCountTr(source.follower_count) },
    { key: 'views', label: 'İzlenme', value: compactCountTr(source.view_count) },
    { key: 'likes', label: 'Beğeni', value: compactCountTr(source.like_count) },
    { key: 'comments', label: 'Yorum', value: compactCountTr(source.comment_count) },
  ].filter((m): m is { key: string; label: string; value: string } => m.value !== null);
}

/**
 * Player address for a validated video id (same rules as the web). Opened
 * only when the reader asks to watch; null when the id is not safe.
 */
export function embedUrl(source: Pick<RecipeSocialSource, 'platform' | 'video_id'>): string | null {
  const id = String(source.video_id || '');
  if (source.platform === 'youtube') return /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1` : null;
  if (source.platform === 'tiktok') return /^[0-9]{15,24}$/.test(id) ? `https://www.tiktok.com/embed/v2/${id}` : null;
  if (source.platform === 'instagram') return /^[A-Za-z0-9_-]{5,64}$/.test(id) ? `https://www.instagram.com/reel/${id}/embed/` : null;
  return null;
}

/** YouTube's own still for the video; other platforms publish none we can use. */
export function videoPoster(source: Pick<RecipeSocialSource, 'platform' | 'video_id'>): string | null {
  const id = String(source.video_id || '');
  return source.platform === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Turkish case endings per platform ("TikTok'tan", "YouTube'da"). */
export const PLATFORM_COPY: Record<RecipeSocialSource['platform'], { name: string; from: string; at: string; short: string }> = {
  instagram: { name: 'Instagram Reels', from: "Instagram'dan", at: "Instagram'da", short: 'Reels' },
  tiktok: { name: 'TikTok', from: "TikTok'tan", at: "TikTok'ta", short: 'TikTok' },
  youtube: { name: 'YouTube', from: "YouTube'dan", at: "YouTube'da", short: 'YouTube' },
};

/** Display name for the creator: their own name, else the @handle, else null. */
export function creatorLabel(source: RecipeSocialSource): { primary: string | null; handle: string | null } {
  const handle = source.creator_handle && /^[A-Za-z0-9._-]{1,40}$/.test(source.creator_handle) ? `@${source.creator_handle}` : null;
  const name = typeof source.creator_name === 'string' && source.creator_name.trim() ? source.creator_name.trim().slice(0, 80) : null;
  return { primary: name || handle, handle: name ? handle : null };
}

/** Only https links on the platform's own host are opened. */
export function profileUrl(source: RecipeSocialSource): string | null {
  const allowed: Record<RecipeSocialSource['platform'], RegExp> = {
    instagram: /^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]{1,30}\/?$/,
    tiktok: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._-]{1,40}\/?$/,
    youtube: /^https:\/\/(www\.)?youtube\.com\/(@[A-Za-z0-9._-]{1,60}|channel\/UC[A-Za-z0-9_-]{20,24})\/?$/,
  };
  const stored = source.creator_profile_url || '';
  if (allowed[source.platform].test(stored)) return stored;
  const handle = source.creator_handle || '';
  if (source.platform === 'instagram' && /^[A-Za-z0-9._]{1,30}$/.test(handle)) return `https://www.instagram.com/${handle}/`;
  if (source.platform === 'tiktok' && /^[A-Za-z0-9._-]{1,40}$/.test(handle)) return `https://www.tiktok.com/@${handle}`;
  return null;
}

/** "21 Ekim 2026" (Istanbul time, UTC+3) from an ISO timestamp, or null. */
export function capturedDateTr(iso?: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  // Turkey has stayed on UTC+3 all year since 2016; Hermes ships no tz data.
  const d = new Date(time + 3 * 3600 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const PLATFORM_LABEL: Record<RecipeSocialSource['platform'], string> = {
  instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
};
