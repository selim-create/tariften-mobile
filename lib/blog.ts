import type { BlogPost } from './types';

/**
 * Presentation helpers for WordPress posts (same rules as the web). Everything
 * shown comes from the post itself: title, content, embedded term/author/media.
 * Reading time is computed from the article's real word count.
 */

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»',
};

export function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

export function plainText(html: unknown): string {
  if (typeof html !== 'string') return '';
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s*\[…\]\s*$/, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

export const postTitle = (post: BlogPost) => plainText(post.title?.rendered);
export const postExcerpt = (post: BlogPost) => plainText(post.excerpt?.rendered);

/** A written standfirst only: WordPress auto-excerpts end in "[…]" and read broken. */
export function postStandfirst(post: BlogPost): string | null {
  const raw = post.excerpt?.rendered || '';
  if (/(\[&hellip;\]|\[…\]|&hellip;|…)\s*(<\/p>)?\s*$/.test(raw)) return null;
  return postExcerpt(post) || null;
}

/** Minutes at ~200 words per minute, from the article's own text. */
export function readingMinutes(html: unknown): number | null {
  const words = plainText(html).split(' ').filter(Boolean).length;
  return words >= 80 ? Math.max(1, Math.round(words / 200)) : null;
}

export function postImage(post: BlogPost): string | null {
  return post._embedded?.['wp:featuredmedia']?.[0]?.source_url || null;
}

export function postCategory(post: BlogPost): { id?: number; name: string; slug: string } | null {
  for (const group of post._embedded?.['wp:term'] || []) {
    for (const term of group || []) {
      if (term?.taxonomy === 'category' && term.name && !/^(genel|uncategorized|kategorisiz)$/i.test(term.slug || term.name)) {
        return { id: term.id, name: decodeEntities(term.name), slug: term.slug || '' };
      }
    }
  }
  return null;
}

/** Author name when WordPress exposes a real one; never "admin". */
export function postAuthor(post: BlogPost): string | null {
  const name = post._embedded?.author?.[0]?.name?.trim();
  if (!name || /^(admin|administrator|wordpress)$/i.test(name)) return null;
  return decodeEntities(name);
}

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "5 Şubat 2026" from a WordPress local date ("2026-02-05T20:04:20"). */
export function postDate(value?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : '';
}
