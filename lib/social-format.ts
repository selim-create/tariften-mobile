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
  ].filter((m): m is { key: string; label: string; value: string } => m.value !== null);
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

/** "21 Ekim 2026" from an ISO timestamp, or null. */
export function capturedDateTr(iso?: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const d = new Date(time);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const PLATFORM_LABEL: Record<RecipeSocialSource['platform'], string> = {
  instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube',
};
