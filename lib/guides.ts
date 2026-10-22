import { decodeEntities, plainText } from './blog';

/**
 * Mutfak Rehberi (Core 1.0.53 · P21 contract, docs/MUTFAK_REHBERI.md §3).
 * Pure helpers: API mapping, article blocks (headings, tip/warning callouts,
 * tables, video embeds), table of contents and safe links. No React, no
 * network, so everything here is covered by scripts/check-kitchen-guide.test.cjs.
 */

export const GUIDE_WEB_BASE = 'https://tariften.com/rehber/';

export type GuideTerm = { slug: string; name: string };

export interface GuideSummary {
  id: number;
  slug: string;
  url: string;
  title: string;
  excerpt: string;
  image: string | null;
  topics: GuideTerm[];
  level: GuideTerm | null;
  readingMinutes: number | null;
  tool: string | null;
  updatedAt: string | null;
}

export interface GuideRelatedRecipe {
  id: number;
  slug: string;
  title: string;
  image: string | null;
  totalTime: number | null;
}

export interface GuideSource { title: string; url: string; host: string }

export interface GuideDetail extends GuideSummary {
  contentHtml: string;
  relatedRecipes: GuideRelatedRecipe[];
  sources: GuideSource[];
  /** Only an approved review is public; reviewer name and notes never are. */
  foodSafety: { reviewedAt: string | null } | null;
  authorName: string | null;
  publishedAt: string | null;
}

export interface GuidePage {
  items: GuideSummary[];
  total: number;
  pages: number;
  page: number;
  perPage: number;
}

export interface GuideTopic {
  id: number;
  slug: string;
  name: string;
  count: number;
  totalCount: number;
  children: GuideTopic[];
}

export interface GuideLevel { slug: string; name: string; count: number }

export interface GuideTaxonomy { topics: GuideTopic[]; levels: GuideLevel[] }

// ---------------------------------------------------------------------------
// Small validators

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const text = (value: unknown): string => (typeof value === 'string' ? decodeEntities(value).replace(/\s+/g, ' ').trim() : '');

const positiveInt = (value: unknown): number | null => {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === 'number' && Number.isSafeInteger(n) && n > 0 ? n : null;
};

const nonNegativeInt = (value: unknown): number => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
};

/** WordPress slugs: lowercase letters (Turkish too), digits and hyphens. */
export function isGuideSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && /^[\p{Ll}\p{N}]+(?:-[\p{Ll}\p{N}]+)*$/u.test(value);
}

/** https only, no credentials, a real host; anything else is dropped. */
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /\s/.test(value.trim())) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
}

function term(value: unknown): GuideTerm | null {
  if (!isRecord(value)) return null;
  const slug = typeof value.slug === 'string' ? value.slug : '';
  const name = text(value.name);
  return slug && name ? { slug, name } : null;
}

// ---------------------------------------------------------------------------
// API mapping

export function parseGuideSummary(raw: unknown): GuideSummary | null {
  if (!isRecord(raw)) return null;
  const id = positiveInt(raw.id);
  const slug = raw.slug;
  const title = text(raw.title);
  if (!id || !isGuideSlug(slug) || !title) return null;
  const minutes = positiveInt(raw.reading_minutes);
  return {
    id,
    slug,
    url: safeHttpsUrl(raw.url) || guideWebUrl(slug),
    title,
    excerpt: text(raw.excerpt),
    image: safeHttpsUrl(raw.image),
    topics: Array.isArray(raw.topics) ? raw.topics.map(term).filter((t): t is GuideTerm => !!t) : [],
    level: term(raw.level),
    readingMinutes: minutes && minutes <= 600 ? minutes : null,
    // P23 tool key: kept as data only; unknown keys are ignored by the UI.
    tool: typeof raw.tool === 'string' && raw.tool ? raw.tool : null,
    updatedAt: isoDate(raw.updated_at),
  };
}

/** `GET /guides`: null when the body is not the documented shape. */
export function parseGuidePage(json: unknown, requestedPage = 1): GuidePage | null {
  if (!isRecord(json) || !Array.isArray(json.data)) return null;
  const items: GuideSummary[] = [];
  for (const raw of json.data) {
    const guide = parseGuideSummary(raw);
    if (guide && !items.some(item => item.id === guide.id)) items.push(guide);
  }
  const page = positiveInt(json.page) || requestedPage;
  const pages = nonNegativeInt(json.pages);
  return {
    items,
    total: Math.max(nonNegativeInt(json.count), items.length),
    pages,
    page,
    perPage: positiveInt(json.per_page) || items.length,
  };
}

function relatedRecipe(raw: unknown): GuideRelatedRecipe | null {
  if (!isRecord(raw)) return null;
  const id = positiveInt(raw.id);
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
  const title = text(raw.title);
  if (!id || !slug || slug.length > 200 || /[\s/?#]/.test(slug) || !title) return null;
  const total = positiveInt(raw.total_time);
  return { id, slug, title, image: safeHttpsUrl(raw.image), totalTime: total && total <= 6000 ? total : null };
}

function source(raw: unknown): GuideSource | null {
  if (!isRecord(raw)) return null;
  const url = safeHttpsUrl(raw.url);
  if (!url) return null;
  const host = new URL(url).hostname.replace(/^www\./, '');
  return { url, host, title: text(raw.title) || host };
}

/** `GET /guides/<slug>`. */
export function parseGuideDetail(json: unknown): GuideDetail | null {
  const summary = parseGuideSummary(json);
  if (!summary || !isRecord(json)) return null;
  const relatedRecipes: GuideRelatedRecipe[] = [];
  for (const raw of Array.isArray(json.related_recipes) ? json.related_recipes : []) {
    const recipe = relatedRecipe(raw);
    if (recipe && !relatedRecipes.some(r => r.id === recipe.id)) relatedRecipes.push(recipe);
  }
  const sources: GuideSource[] = [];
  for (const raw of Array.isArray(json.sources) ? json.sources : []) {
    const item = source(raw);
    if (item && !sources.some(s => s.url === item.url)) sources.push(item);
  }
  const safety = isRecord(json.food_safety) && json.food_safety.status === 'approved'
    ? { reviewedAt: isoDate(json.food_safety.reviewed_at) }
    : null;
  return {
    ...summary,
    contentHtml: typeof json.content_html === 'string' ? json.content_html : '',
    relatedRecipes: relatedRecipes.slice(0, 12),
    sources: sources.slice(0, 10),
    foodSafety: safety,
    authorName: isRecord(json.author) ? text(json.author.name) || null : null,
    publishedAt: isoDate(json.published_at),
  };
}

function topic(raw: unknown, depth = 0): GuideTopic | null {
  if (!isRecord(raw)) return null;
  const id = positiveInt(raw.id);
  const slug = typeof raw.slug === 'string' ? raw.slug : '';
  const name = text(raw.name);
  if (!id || !slug || !name) return null;
  const count = nonNegativeInt(raw.count);
  const children = depth < 3 && Array.isArray(raw.children)
    ? raw.children.map(child => topic(child, depth + 1)).filter((t): t is GuideTopic => !!t)
    : [];
  return { id, slug, name, count, totalCount: Math.max(nonNegativeInt(raw.total_count), count), children };
}

/** `GET /guides/topics`: the tree in Core order, plus levels. */
export function parseGuideTaxonomy(json: unknown): GuideTaxonomy | null {
  if (!isRecord(json) || !Array.isArray(json.data)) return null;
  const levels: GuideLevel[] = [];
  for (const raw of Array.isArray(json.levels) ? json.levels : []) {
    const level = term(raw);
    if (level && isRecord(raw)) levels.push({ ...level, count: nonNegativeInt(raw.count) });
  }
  return { topics: json.data.map(raw => topic(raw)).filter((t): t is GuideTopic => !!t), levels };
}

// ---------------------------------------------------------------------------
// Filters

/** Topics worth a chip: those with published guides, plus the selected one. */
export function visibleTopics(topics: GuideTopic[], selected?: string | null): GuideTopic[] {
  return topics
    .filter(t => t.totalCount > 0 || t.slug === selected || t.children.some(c => c.slug === selected))
    .map(t => ({ ...t, children: t.children.filter(c => c.totalCount > 0 || c.slug === selected) }));
}

export function visibleLevels(levels: GuideLevel[], selected?: string | null): GuideLevel[] {
  return levels.filter(l => l.count > 0 || l.slug === selected);
}

/** [parent] or [parent, child] for a topic slug, or [] when unknown. */
export function topicPath(topics: GuideTopic[], slug?: string | null): GuideTopic[] {
  if (!slug) return [];
  for (const parent of topics) {
    if (parent.slug === slug) return [parent];
    const child = parent.children.find(c => c.slug === slug);
    if (child) return [parent, child];
  }
  return [];
}

/** Append a page, never showing the same guide twice. */
export function mergeGuides(previous: GuideSummary[], next: GuideSummary[]): GuideSummary[] {
  const seen = new Set(previous.map(g => g.id));
  return [...previous, ...next.filter(g => !seen.has(g.id))];
}

// ---------------------------------------------------------------------------
// Presentation

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

/** "19 Ekim 2026" in Türkiye time (UTC+3, no DST) from a UTC ISO date. */
export function guideDateTr(value: string | null | undefined): string {
  const time = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return '';
  const d = new Date(time + 3 * 3600 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const readingLabel = (minutes: number | null) => (minutes ? `${minutes} dk okuma` : '');

/** 1–3 for the closed level list (Başlangıç · Orta · İleri), 0 when unknown. */
export function levelRank(level: GuideTerm | null): number {
  return level ? ({ baslangic: 1, orta: 2, ileri: 3 } as Record<string, number>)[level.slug] || 0 : 0;
}

/** Lokma illustration for a guide without a photo, by topic. */
const TOPIC_ART: Record<string, string> = {
  teknikler: 'soğan',
  'pisirme-sureleri-ve-kivamlar': 'yumurta',
  saklama: 'limon',
  'fermentasyon-ve-tursu': 'salatalık',
  kurutma: 'acı biber',
  'olculer-ve-donusumler': 'un',
  ekipman: 'tuz',
  'malzeme-rehberi': 'domates',
};
export function guideArt(topics: GuideTerm[]): string {
  for (const t of topics) if (TOPIC_ART[t.slug]) return TOPIC_ART[t.slug];
  return 'fesleğen';
}

/** The most specific topic (Core lists parents first). */
export function primaryTopic(topics: GuideTerm[]): GuideTerm | null {
  return topics.length ? topics[topics.length - 1] : null;
}

export const guideWebUrl = (slug: string) => GUIDE_WEB_BASE + encodeURIComponent(slug);

/** Canonical share address: tariften.com only, never an API host. */
export function guideShareUrl(guide: { slug: string; url?: string }): string {
  const url = safeHttpsUrl(guide.url);
  return url && /^https:\/\/tariften\.com\/rehber\//.test(url) ? url : guideWebUrl(guide.slug);
}

/**
 * In-app route for a link inside an article: tariften.com recipes, guides and
 * blog posts open in the app; everything else returns null (browser).
 */
export function internalRouteFor(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  let url: URL;
  try { url = new URL(href.trim(), 'https://tariften.com'); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!/^(www\.)?tariften\.com$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/(recipe|tarif|rehber|blog)\/([^/?#]+)\/?$/);
  if (!m) return null;
  let slug: string;
  try { slug = decodeURIComponent(m[2]); } catch { return null; }
  if (!slug || slug.length > 200 || /[\s/\\.]/.test(slug)) return null;
  const section = m[1] === 'tarif' ? 'recipe' : m[1];
  return `/${section}/${encodeURIComponent(slug)}`;
}

// ---------------------------------------------------------------------------
// Article HTML → blocks

export type GuideBlock =
  | { kind: 'html'; html: string }
  | { kind: 'heading'; id: string; text: string }
  | { kind: 'callout'; tone: 'tip' | 'warning'; label: string; html: string }
  | { kind: 'table'; head: string[]; rows: string[][]; caption: string }
  | { kind: 'video'; provider: 'youtube' | 'vimeo'; url: string; title: string };

export type TocEntry = { id: string; text: string; index: number };

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

/**
 * Splits HTML into its top-level elements (comments dropped, stray text kept).
 * Nesting is counted per root tag name, so unclosed <li>/<p> inside a list
 * cannot shift the boundaries.
 */
export function splitTopLevel(html: string): string[] {
  const out: string[] = [];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g;
  let root = '';
  let depth = 0;
  let start = 0;
  let last = 0;
  const flush = (chunk: string) => { if (chunk.trim()) out.push(chunk.trim()); };
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const token = m[0];
    if (token.startsWith('<!--')) {
      if (!root) { flush(html.slice(last, m.index)); last = re.lastIndex; }
      continue;
    }
    const name = m[1].toLowerCase();
    const closing = token[1] === '/';
    const selfClosing = VOID_TAGS.has(name) || /\/\s*>$/.test(token);
    if (!root) {
      flush(html.slice(last, m.index));
      last = re.lastIndex;
      if (closing) continue; // stray closing tag
      if (selfClosing) { out.push(token); continue; }
      root = name; depth = 1; start = m.index;
      continue;
    }
    if (name !== root || selfClosing) continue;
    depth += closing ? -1 : 1;
    if (depth === 0) {
      out.push(html.slice(start, re.lastIndex));
      root = '';
      last = re.lastIndex;
    }
  }
  if (root) out.push(html.slice(start));
  else flush(html.slice(last));
  return out;
}

function openTag(block: string): { name: string; tag: string } {
  const m = /^<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/.exec(block);
  return m ? { name: m[1].toLowerCase(), tag: m[0] } : { name: '', tag: '' };
}

export function attr(tag: string, name: string): string {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : '';
}

const hasClass = (tag: string, cls: string) => attr(tag, 'class').split(/\s+/).includes(cls);

function innerHtml(block: string, name: string): string {
  // No toLowerCase() here: "İ" lowercases to two code units and shifts indexes.
  const open = openTag(block).tag.length;
  const close = new RegExp(`</${name}\\s*>\\s*$`, 'i').exec(block);
  return block.slice(open, close && close.index >= open ? close.index : undefined);
}

const CALLOUT_LABEL = /^\s*<(strong|b)\b[^>]*>\s*(İpucu|Dikkat)\s*:?\s*<\/\1>\s*:?(?:\s|&nbsp;| )*/i;

/** Tip/warning paragraph: Core's class, or the documented bold label. */
export function calloutOf(block: string): { tone: 'tip' | 'warning'; label: string; html: string } | null {
  const { name, tag } = openTag(block);
  if (name !== 'p') return null;
  const inner = innerHtml(block, 'p');
  const label = CALLOUT_LABEL.exec(inner);
  let tone: 'tip' | 'warning' | null = hasClass(tag, 'tariften-warning') ? 'warning' : hasClass(tag, 'tariften-tip') ? 'tip' : null;
  if (!tone && label) tone = /dikkat/i.test(label[2]) ? 'warning' : 'tip';
  if (!tone) return null;
  const html = (label ? inner.slice(label[0].length) : inner).trim();
  return { tone, label: tone === 'warning' ? 'Dikkat' : 'İpucu', html };
}

/**
 * Watch page for a YouTube/Vimeo embed (Core keeps only these https iframes).
 * Returns null for anything else, so no other player is ever opened.
 */
export function videoWatchUrl(src: unknown): { provider: 'youtube' | 'vimeo'; url: string } | null {
  const raw = typeof src === 'string' ? src.trim().replace(/^\/\//, 'https://') : '';
  const safe = safeHttpsUrl(raw);
  if (!safe) return null;
  const url = new URL(safe);
  const host = url.hostname.toLowerCase();
  if (['www.youtube.com', 'youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
    const id = host === 'youtu.be' ? url.pathname.slice(1)
      : (/^\/(?:embed|shorts|live)\/([^/?#]+)/.exec(url.pathname)?.[1] || (url.pathname === '/watch' ? url.searchParams.get('v') : '') || '');
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: 'youtube', url: `https://www.youtube.com/watch?v=${id}` } : null;
  }
  if (host === 'player.vimeo.com' || host === 'vimeo.com' || host === 'www.vimeo.com') {
    const id = (host === 'player.vimeo.com' ? /^\/video\/(\d+)/ : /^\/(\d+)/).exec(url.pathname)?.[1];
    return id ? { provider: 'vimeo', url: `https://vimeo.com/${id}` } : null;
  }
  return null;
}

/** Video block from a top-level iframe or a Gutenberg embed figure. */
export function videoOf(block: string): Extract<GuideBlock, { kind: 'video' }> | null {
  const { name, tag } = openTag(block);
  let iframe = /<iframe\b[^>]*>/i.exec(block)?.[0] || '';
  if (name === 'iframe') iframe = tag;
  const caption = plainText(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(block)?.[1] || '');
  let watch = iframe ? videoWatchUrl(attr(iframe, 'src')) : null;
  if (!watch && name === 'figure' && hasClass(tag, 'wp-block-embed')) {
    // oEmbed not resolved: the wrapper holds the bare address.
    const bare = /https:\/\/[^\s<"']+/.exec(block.replace(/<figcaption[\s\S]*$/i, ''))?.[0];
    watch = videoWatchUrl(bare);
  }
  if (!watch) return null;
  // A figure or wrapper may hold other text; only a pure embed becomes a card.
  const rest = plainText(block.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '').replace(/<figcaption\b[\s\S]*?<\/figcaption>/gi, '').replace(/https:\/\/[^\s<"']+/g, ''));
  if (rest) return null;
  return { kind: 'video', provider: watch.provider, url: watch.url, title: attr(iframe, 'title') || caption };
}

function cellText(html: string): string {
  return html.split(/<br\s*\/?>/i).map(part => plainText(part)).filter(Boolean).join('\n');
}

/** Gutenberg table block (figure.wp-block-table > table) or a bare table. */
export function tableOf(block: string): Extract<GuideBlock, { kind: 'table' }> | null {
  const { name, tag } = openTag(block);
  if (name !== 'table' && !(name === 'figure' && (hasClass(tag, 'wp-block-table') || /^\s*<table\b/i.test(innerHtml(block, 'figure'))))) return null;
  const table = /<table\b[\s\S]*<\/table>/i.exec(block)?.[0];
  if (!table) return null;
  const rowsOf = (html: string) => [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row => ({
    header: /<th\b/i.test(row[1]) && !/<td\b/i.test(row[1]),
    cells: [...row[1].matchAll(/<(t[hd])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(cell => cellText(cell[2])),
  })).filter(row => row.cells.length);
  const theadHtml = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(table)?.[1];
  let headRows = theadHtml ? rowsOf(theadHtml) : [];
  let bodyRows = rowsOf(table.replace(/<thead\b[\s\S]*?<\/thead>/i, ''));
  if (!headRows.length && bodyRows[0]?.header) { headRows = [bodyRows[0]]; bodyRows = bodyRows.slice(1); }
  const head = headRows[0]?.cells || [];
  const rows = bodyRows.map(r => r.cells);
  const width = Math.max(head.length, ...rows.map(r => r.length));
  if (!width) return null;
  const pad = (cells: string[]) => [...cells, ...Array(width - cells.length).fill('')];
  const caption = plainText(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/i.exec(block)?.[1]
    || /<caption\b[^>]*>([\s\S]*?)<\/caption>/i.exec(table)?.[1] || '');
  return { kind: 'table', head: head.length ? pad(head) : [], rows: rows.map(pad), caption };
}

/** An iframe left inside running text becomes a plain "Videoyu izle" link. */
function inlineVideoLinks(html: string): string {
  return html.replace(/<iframe\b[^>]*>(?:[\s\S]*?<\/iframe>)?/gi, tag => {
    const watch = videoWatchUrl(attr(tag, 'src'));
    return watch ? `<a href="${watch.url}">Videoyu izle</a>` : '';
  });
}

/**
 * Article blocks in reading order. h2s become TOC anchors, tip/warning
 * paragraphs callouts, tables native scrollable tables, embeds video cards.
 * Everything else stays HTML for react-native-render-html, merged into as
 * few chunks as possible.
 */
export function guideBlocks(html: unknown): GuideBlock[] {
  if (typeof html !== 'string' || !html.trim()) return [];
  const blocks: GuideBlock[] = [];
  let headings = 0;
  const pushHtml = (chunk: string) => {
    const clean = inlineVideoLinks(chunk);
    if (!clean.trim()) return;
    const last = blocks[blocks.length - 1];
    if (last?.kind === 'html') last.html += clean;
    else blocks.push({ kind: 'html', html: clean });
  };
  for (const block of splitTopLevel(html)) {
    const { name } = openTag(block);
    if (name === 'h2') {
      const heading = plainText(innerHtml(block, 'h2'));
      if (heading) { blocks.push({ kind: 'heading', id: `bolum-${++headings}`, text: heading }); continue; }
    }
    const callout = calloutOf(block);
    if (callout) { if (plainText(callout.html)) blocks.push({ kind: 'callout', ...callout }); continue; }
    const video = /<iframe\b|wp-block-embed/i.test(block) ? videoOf(block) : null;
    if (video) { blocks.push(video); continue; }
    const table = /<table\b/i.test(block) ? tableOf(block) : null;
    if (table) { blocks.push(table); continue; }
    pushHtml(block);
  }
  return blocks;
}

export function guideToc(blocks: GuideBlock[]): TocEntry[] {
  return blocks
    .filter((b): b is Extract<GuideBlock, { kind: 'heading' }> => b.kind === 'heading')
    .map((b, index) => ({ id: b.id, text: b.text, index: index + 1 }));
}

/** Column widths for a native table: by longest line, then stretched to fill. */
export function tableColumnWidths(head: string[], rows: string[][], available: number): number[] {
  const width = Math.max(head.length, ...rows.map(r => r.length), 0);
  const widths: number[] = [];
  for (let col = 0; col < width; col++) {
    const longest = Math.max(
      ...[head[col] || '', ...rows.map(r => r[col] || '')].flatMap(cell => cell.split('\n')).map(line => line.length),
      0,
    );
    widths.push(Math.min(240, Math.max(96, Math.round(longest * 7.6 + 28))));
  }
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total > 0 && total < available) return widths.map(w => Math.floor((w * available) / total));
  return widths;
}

export { plainText };
