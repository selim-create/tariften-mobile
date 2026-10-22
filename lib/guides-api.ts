import {
  isGuideSlug, parseGuideDetail, parseGuidePage, parseGuideTaxonomy,
  type GuideDetail, type GuidePage, type GuideTaxonomy,
} from './guides';

/**
 * Mutfak Rehberi endpoints (Core 1.0.53, docs/MUTFAK_REHBERI.md §3). Public,
 * cacheable GETs: no token is ever sent. Failures throw a Turkish message so
 * screens can show a real error with "Tekrar dene" instead of an empty list.
 */
const BASE = 'https://api.tariften.com/wp-json/tariften/v1/guides';
const TIMEOUT_MS = 15000;

/** 404 guide_not_found (or an invalid slug): the friendly not-found state. */
export class GuideNotFoundError extends Error {
  constructor() {
    super('Rehber yazısı bulunamadı.');
    this.name = 'GuideNotFoundError';
  }
}

async function getJson(path: string, signal?: AbortSignal): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetch(BASE + path, { method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal });
    const json: unknown = await response.json().catch(() => null);
    return { status: response.status, json };
  } catch {
    if (signal?.aborted) throw new Error('İstek iptal edildi.');
    if (controller.signal.aborted) throw new Error('Tariften sunucusu geç yanıt verdi. Tekrar dene.');
    throw new Error('Bağlantı kurulamadı. İnternetini kontrol edip tekrar dene.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export interface GuideQuery {
  topic?: string | null;
  level?: string | null;
  page?: number;
  perPage?: number;
}

export function guidesQueryString({ topic, level, page = 1, perPage = 12 }: GuideQuery): string {
  const params = new URLSearchParams();
  if (topic) params.append('topic', topic);
  if (level) params.append('level', level);
  params.append('page', String(Math.min(500, Math.max(1, Math.trunc(page) || 1))));
  params.append('per_page', String(Math.min(50, Math.max(1, Math.trunc(perPage) || 12))));
  return params.toString();
}

/** `GET /guides`: newest first; unknown topic/level slugs give an empty page. */
export async function fetchGuides(query: GuideQuery = {}, signal?: AbortSignal): Promise<GuidePage> {
  const qs = guidesQueryString(query);
  const { status, json } = await getJson(`?${qs}`, signal);
  if (status < 200 || status >= 300) throw new Error('Rehber yazıları yüklenemedi. Birazdan tekrar dene.');
  const page = parseGuidePage(json, Number(new URLSearchParams(qs).get('page')));
  if (!page) throw new Error('Rehber listesi eksik geldi. Tekrar dene.');
  return page;
}

/** `GET /guides/<slug>`. Throws GuideNotFoundError on 404. */
export async function fetchGuide(slug: string, signal?: AbortSignal): Promise<GuideDetail> {
  if (!isGuideSlug(slug)) throw new GuideNotFoundError();
  const { status, json } = await getJson(`/${encodeURIComponent(slug)}`, signal);
  if (status === 404) throw new GuideNotFoundError();
  if (status < 200 || status >= 300) throw new Error('Rehber yazısı yüklenemedi. Birazdan tekrar dene.');
  const guide = parseGuideDetail(json);
  if (!guide) throw new Error('Rehber yazısı eksik geldi. Tekrar dene.');
  return guide;
}

/** `GET /guides/topics`: topic tree and levels for the filters. */
export async function fetchGuideTaxonomy(signal?: AbortSignal): Promise<GuideTaxonomy> {
  const { status, json } = await getJson('/topics', signal);
  if (status < 200 || status >= 300) throw new Error('Rehber konuları yüklenemedi.');
  const taxonomy = parseGuideTaxonomy(json);
  if (!taxonomy) throw new Error('Rehber konuları eksik geldi.');
  return taxonomy;
}
