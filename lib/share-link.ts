/**
 * Links shared into Tariften from Instagram, TikTok, YouTube or a browser.
 * Only the address is used; nothing else from the shared text is kept.
 */
import { isTikTokShortLink } from './video-recipe-import';

const LINK = /https?:\/\/[^\s<>"'“”‘’]+/gi;

/** First web address in a shared text, without trailing punctuation. */
export function firstLink(text: unknown): string | null {
  if (typeof text !== 'string' || text.length > 4000) return null;
  for (const match of text.match(LINK) || []) {
    const clean = match.replace(/[).,!?;:]+$/, '');
    try {
      const url = new URL(clean);
      if (url.protocol === 'https:' || url.protocol === 'http:') return clean;
    } catch { /* not a URL */ }
  }
  return null;
}

/**
 * Canonical form for the platforms Tariften turns into recipes: https, the
 * platform's own host, tracking parameters (igsh, si, _r, _t…) removed.
 * Anything else is returned as given (https only), or null.
 */
export function canonicalShareLink(raw: string): string | null {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  let m: RegExpMatchArray | null;
  if (host === 'instagram.com' || host === 'www.instagram.com') {
    m = path.match(/^\/(reel|reels|p|tv)\/([A-Za-z0-9_-]{5,64})\/?$/);
    return m ? `https://www.instagram.com/${m[1] === 'reels' ? 'reel' : m[1]}/${m[2]}/` : null;
  }
  if (host === 'tiktok.com' || host === 'www.tiktok.com' || host === 'm.tiktok.com') {
    m = path.match(/^\/@([A-Za-z0-9._]{2,32})\/video\/([0-9]{15,24})\/?$/);
    return m ? `https://www.tiktok.com/@${m[1]}/video/${m[2]}` : null;
  }
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com') {
    m = path.match(/^\/([A-Za-z0-9]{5,20})\/?$/);
    return m ? `https://${host}/${m[1]}/` : null;
  }
  if (host === 'youtu.be') {
    m = path.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
    return m ? `https://youtu.be/${m[1]}` : null;
  }
  if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
    m = path.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/);
    if (m) return `https://www.youtube.com/shorts/${m[1]}`;
    const id = url.searchParams.get('v') || '';
    return /^\/watch\/?$/.test(path) && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
  }
  return url.protocol === 'https:' ? url.toString() : null;
}

/**
 * Opens a TikTok short link (vm./vt.) to learn the video's full address. Only
 * the final URL is read; the page itself is discarded. Other links pass through.
 */
export async function expandShortLink(link: string, timeoutMs = 8000): Promise<string> {
  if (!isTikTokShortLink(link)) return link;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(link, { method: 'GET', redirect: 'follow', signal: controller.signal });
    const finalUrl = canonicalShareLink(response.url || '');
    if (!finalUrl || isTikTokShortLink(finalUrl)) throw new Error('short');
    return finalUrl;
  } catch {
    throw new Error("TikTok kısa bağlantısı açılamadı. Videoyu TikTok'ta açıp \"Bağlantıyı kopyala\" ile tam adresi yapıştır.");
  } finally {
    clearTimeout(timer);
  }
}

/** What the share sheet sent, reduced to one link or a short piece of text. */
export function sharedContent(share: { webUrl?: string | null; text?: string | null }): { url: string | null; text: string | null } {
  const raw = (share.webUrl && firstLink(share.webUrl)) || firstLink(share.text) || null;
  const url = raw ? canonicalShareLink(raw) : null;
  const text = !url && typeof share.text === 'string' && share.text.trim() ? share.text.trim().slice(0, 20000) : null;
  return { url, text };
}
