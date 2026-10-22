'use strict';
/**
 * P22 Mutfak Rehberi (mobile): Core API mapping, article blocks (TOC from h2,
 * tip/warning callouts, tables, YouTube/Vimeo embeds as "Videoyu izle"
 * cards), safe links and the screen/navigation contracts.
 * Contract: tariften-core docs/MUTFAK_REHBERI.md §3 (Core 1.0.53).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const localRequire = request => {
    if (request.startsWith('./')) return load(path.join(path.dirname(file), request.slice(2) + '.ts'));
    throw new Error('Unexpected import ' + request + ' in ' + file);
  };
  Function('module', 'exports', 'require', out)(mod, mod.exports, localRequire);
  cache.set(file, mod.exports);
  return mod.exports;
}
const g = load('lib/guides.ts');
const api = load('lib/guides-api.ts');

const LIST_ITEM = {
  id: 812,
  slug: 'yumurta-haslama-sureleri',
  url: 'https://tariften.com/rehber/yumurta-haslama-sureleri',
  title: 'Yumurta haşlama süreleri',
  excerpt: 'Rafadan, kayısı ve katı kıvam için dakika dakika rehber.',
  image: 'https://api.tariften.com/wp-content/uploads/2026/10/yumurta-1024x683.jpg',
  topics: [
    { slug: 'teknikler', name: 'Teknikler' },
    { slug: 'pisirme-sureleri-ve-kivamlar', name: 'Pişirme süreleri ve kıvamlar' },
  ],
  level: { slug: 'baslangic', name: 'Başlangıç' },
  reading_minutes: 4,
  tool: 'egg_doneness',
  updated_at: '2026-10-21T09:30:00Z',
};

const DETAIL = {
  ...LIST_ITEM,
  topics: [{ slug: 'teknikler', name: 'Teknikler' }],
  content_html: '<h2>Süreler</h2><p>Su kaynayınca <strong>6 dakika</strong>…</p>',
  related_recipes: [
    { id: 431, slug: 'menemen', title: 'Menemen', image: 'https://api.tariften.com/wp-content/uploads/menemen-300x200.jpg', total_time: 25 },
    { id: 77, slug: 'karniyarik', title: 'Karnıyarık', image: null, total_time: null },
  ],
  sources: [{ title: 'USDA FSIS — Egg Safety', url: 'https://www.fsis.usda.gov/food-safety' }],
  food_safety: null,
  author: { name: 'Selim Altınkaynak' },
  published_at: '2026-10-20T08:00:00Z',
  seo: { title: 'x', description: 'y', canonical: 'https://tariften.com/rehber/yumurta-haslama-sureleri', og_image: null },
};

// ---------------------------------------------------------------------------
// API mapping

test('GET /guides maps the documented list shape', () => {
  const page = g.parseGuidePage({ data: [LIST_ITEM], count: 1, pages: 1, page: 1, per_page: 12 });
  assert.equal(page.total, 1);
  assert.equal(page.pages, 1);
  assert.equal(page.perPage, 12);
  const [item] = page.items;
  assert.equal(item.slug, 'yumurta-haslama-sureleri');
  assert.equal(item.readingMinutes, 4);
  assert.deepEqual(item.level, { slug: 'baslangic', name: 'Başlangıç' });
  assert.equal(item.tool, 'egg_doneness');
  assert.equal(g.primaryTopic(item.topics).slug, 'pisirme-sureleri-ve-kivamlar', 'most specific topic last');
  assert.equal(g.guideArt(item.topics), 'soğan');
});

test('list mapping drops broken items, duplicates, unsafe images and keeps nulls honest', () => {
  const page = g.parseGuidePage({
    data: [
      { ...LIST_ITEM, image: 'http://api.tariften.com/x.jpg', level: null, tool: null, reading_minutes: 0 },
      LIST_ITEM,
      { id: 0, slug: 'x', title: 'Yok' },
      { id: 5, slug: 'Bad Slug', title: 'Yok' },
      { id: 6, slug: 'bos-baslik', title: '   ' },
      'nope',
      { id: 9, slug: 'entity', title: 'Tuz &amp; biber', excerpt: '<b>x</b>' },
    ],
    count: '7', pages: 1,
  }, 3);
  assert.deepEqual(page.items.map(i => i.id), [812, 9]);
  assert.equal(page.items[0].image, null, 'http image is not shown');
  assert.equal(page.items[0].level, null);
  assert.equal(page.items[0].readingMinutes, null);
  assert.equal(page.items[1].title, 'Tuz & biber');
  assert.equal(page.items[1].url, 'https://tariften.com/rehber/entity', 'missing url falls back to the canonical page');
  assert.equal(page.page, 3, 'falls back to the requested page');
  assert.equal(g.parseGuidePage({ data: 'x' }), null);
  assert.equal(g.parseGuidePage(null), null);
});

test('GET /guides/<slug> maps related recipes, sources, author and food safety', () => {
  const guide = g.parseGuideDetail(DETAIL);
  assert.equal(guide.contentHtml, DETAIL.content_html);
  assert.deepEqual(guide.relatedRecipes, [
    { id: 431, slug: 'menemen', title: 'Menemen', image: DETAIL.related_recipes[0].image, totalTime: 25 },
    { id: 77, slug: 'karniyarik', title: 'Karnıyarık', image: null, totalTime: null },
  ]);
  assert.deepEqual(guide.sources, [{ title: 'USDA FSIS — Egg Safety', url: 'https://www.fsis.usda.gov/food-safety', host: 'fsis.usda.gov' }]);
  assert.equal(guide.foodSafety, null);
  assert.equal(guide.authorName, 'Selim Altınkaynak');
  assert.equal(guide.publishedAt, '2026-10-20T08:00:00Z');

  const approved = g.parseGuideDetail({ ...DETAIL, food_safety: { status: 'approved', reviewed_at: '2026-10-19T12:00:00Z' } });
  assert.deepEqual(approved.foodSafety, { reviewedAt: '2026-10-19T12:00:00Z' });
  assert.equal(g.parseGuideDetail({ ...DETAIL, food_safety: { status: 'pending' } }).foodSafety, null);

  const messy = g.parseGuideDetail({
    ...DETAIL,
    related_recipes: [{ id: 1, slug: '../login', title: 'x' }, { id: 431, slug: 'menemen', title: 'Menemen' }, { id: 431, slug: 'menemen', title: 'Tekrar' }],
    sources: [
      { title: '', url: 'https://www.who.int/food' },
      { title: 'dup', url: 'https://www.who.int/food' },
      { title: 'http', url: 'http://example.com' },
      { title: 'js', url: 'javascript:alert(1)' },
      { title: 'creds', url: 'https://u:p@example.com' },
    ],
    author: null,
  });
  assert.deepEqual(messy.relatedRecipes.map(r => r.slug), ['menemen']);
  assert.deepEqual(messy.sources, [{ title: 'who.int', url: 'https://www.who.int/food', host: 'who.int' }]);
  assert.equal(messy.authorName, null);
  assert.equal(g.parseGuideDetail({ code: 'guide_not_found' }), null);
});

test('topic tree and levels: chips only for topics with guides, sub-topics under their parent', () => {
  const tax = g.parseGuideTaxonomy({
    data: [
      { id: 101, slug: 'teknikler', name: 'Teknikler', description: '', count: 6, total_count: 6, children: [] },
      { id: 103, slug: 'saklama', name: 'Saklama', count: 2, total_count: 3, children: [
        { id: 140, slug: 'dondurucu', name: 'Dondurucu', count: 1, total_count: 1, children: [] },
        { id: 141, slug: 'kavanoz', name: 'Kavanoz', count: 0, total_count: 0, children: [] },
      ] },
      { id: 104, slug: 'kurutma', name: 'Kurutma', count: 0, total_count: 0, children: [] },
    ],
    levels: [{ slug: 'baslangic', name: 'Başlangıç', count: 4 }, { slug: 'orta', name: 'Orta', count: 2 }, { slug: 'ileri', name: 'İleri', count: 0 }],
  });
  const topics = g.visibleTopics(tax.topics);
  assert.deepEqual(topics.map(t => t.slug), ['teknikler', 'saklama']);
  assert.deepEqual(topics[1].children.map(c => c.slug), ['dondurucu']);
  assert.deepEqual(g.visibleTopics(tax.topics, 'kurutma').map(t => t.slug), ['teknikler', 'saklama', 'kurutma'], 'a linked empty topic stays visible');
  assert.deepEqual(g.topicPath(topics, 'dondurucu').map(t => t.slug), ['saklama', 'dondurucu']);
  assert.deepEqual(g.topicPath(topics, 'saklama').map(t => t.slug), ['saklama']);
  assert.deepEqual(g.topicPath(topics, 'yok'), []);
  assert.deepEqual(g.visibleLevels(tax.levels).map(l => l.slug), ['baslangic', 'orta']);
  assert.deepEqual(g.visibleLevels(tax.levels, 'ileri').map(l => l.slug), ['baslangic', 'orta', 'ileri']);
  assert.equal(g.parseGuideTaxonomy({}), null);
});

test('pages merge without duplicates', () => {
  const a = g.parseGuideSummary(LIST_ITEM);
  const b = g.parseGuideSummary({ ...LIST_ITEM, id: 813, slug: 'pilav' });
  assert.deepEqual(g.mergeGuides([a], [a, b]).map(x => x.id), [812, 813]);
});

// ---------------------------------------------------------------------------
// Article HTML

const ARTICLE = `
<p>Giriş paragrafı. <strong>İyi</strong> bir başlangıç.</p>
<!-- yorum -->
<h2 class="wp-block-heading">Neden <em>önemli?</em></h2>
<p>Birinci bölüm.</p>
<h3 class="wp-block-heading">Ayrıntı</h3>
<ul class="wp-block-list"><li>Bir<li>İki</li></ul>
<p class="tariften-tip"><strong>İpucu:</strong> Yumurtayı <em>oda sıcaklığında</em> kullanın.</p>
<h2>Süre tablosu</h2>
<figure class="wp-block-table"><table class="has-fixed-layout"><thead><tr><th>Kıvam</th><th>Süre</th></tr></thead><tbody><tr><td>Rafadan</td><td>3 dk</td></tr><tr><td>Kayısı</td><td>6 dk<br>(büyük boy 7)</td></tr><tr><td>Katı</td></tr></tbody></table><figcaption class="wp-element-caption">Kaynar suya koyduktan sonra.</figcaption></figure>
<p class="tariften-warning"><strong>Dikkat:</strong>&nbsp;Çatlak yumurtayı haşlamayın.</p>
<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube"><div class="wp-block-embed__wrapper"><iframe title="Yumurta nasıl haşlanır" width="500" height="281" src="https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed" allowfullscreen></iframe></div></figure>
<h2>Son söz</h2>
<p>Bir video daha <iframe src="https://player.vimeo.com/video/76979871"></iframe> burada.</p>
<iframe src="https://evil.example.com/embed"></iframe>
<p><strong>İpucu:</strong> Sınıfsız ipucu da tanınır.</p>
`;

test('top-level split: comments dropped, unclosed <li> cannot shift boundaries', () => {
  const parts = g.splitTopLevel('<p>a</p><!-- c --><ul><li>x<li>y</ul>serbest <b>metin</b><hr/><p>İ son</p>');
  assert.deepEqual(parts, ['<p>a</p>', '<ul><li>x<li>y</ul>', 'serbest', '<b>metin</b>', '<hr/>', '<p>İ son</p>']);
  assert.deepEqual(g.splitTopLevel('<div><div>iç</div></div><p>x</p>'), ['<div><div>iç</div></div>', '<p>x</p>']);
});

test('blocks: h2 → TOC, tip/warning callouts, table, video cards, merged HTML', () => {
  const blocks = g.guideBlocks(ARTICLE);
  assert.deepEqual(blocks.map(b => b.kind), ['html', 'heading', 'html', 'callout', 'heading', 'table', 'callout', 'video', 'heading', 'html', 'callout']);
  assert.match(blocks[0].html, /Giriş paragrafı/);
  assert.doesNotMatch(blocks[0].html, /yorum/);

  assert.deepEqual(g.guideToc(blocks), [
    { id: 'bolum-1', text: 'Neden önemli?', index: 1 },
    { id: 'bolum-2', text: 'Süre tablosu', index: 2 },
    { id: 'bolum-3', text: 'Son söz', index: 3 },
  ]);
  assert.match(blocks[2].html, /<h3[^>]*>Ayrıntı<\/h3><ul/, 'h3 and list stay HTML, merged into one chunk');

  assert.equal(blocks[3].tone, 'tip');
  assert.equal(blocks[3].label, 'İpucu');
  assert.equal(blocks[3].html, 'Yumurtayı <em>oda sıcaklığında</em> kullanın.', 'label stripped, inline markup kept');
  assert.equal(blocks[6].tone, 'warning');
  assert.equal(blocks[6].label, 'Dikkat');
  assert.equal(blocks[6].html, 'Çatlak yumurtayı haşlamayın.');
  assert.equal(blocks[10].tone, 'tip', 'bold label without the class');

  const table = blocks[5];
  assert.deepEqual(table.head, ['Kıvam', 'Süre']);
  assert.deepEqual(table.rows, [['Rafadan', '3 dk'], ['Kayısı', '6 dk\n(büyük boy 7)'], ['Katı', '']]);
  assert.equal(table.caption, 'Kaynar suya koyduktan sonra.');

  assert.deepEqual(blocks[7], { kind: 'video', provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Yumurta nasıl haşlanır' });
  assert.match(blocks[9].html, /<a href="https:\/\/vimeo\.com\/76979871">Videoyu izle<\/a>/, 'iframe in running text becomes a link');
  assert.doesNotMatch(blocks.map(b => b.html || '').join(''), /<iframe|evil\.example/, 'no iframe survives; unknown hosts are dropped');
});

test('callout detection is not fooled by Turkish İ in the paragraph', () => {
  const [block] = g.guideBlocks('<p class="tariften-warning"><strong>Dikkat:</strong> İÇ SICAKLIK 75 °C OLMALI. İİİ</p>');
  assert.equal(block.kind, 'callout');
  assert.equal(block.html, 'İÇ SICAKLIK 75 °C OLMALI. İİİ');
  assert.equal(g.calloutOf('<p>İpucu: düz metin, kalın değil</p>'), null);
  assert.equal(g.calloutOf('<div class="tariften-tip">x</div>'), null);
});

test('embeds: bare oEmbed URL, captions and tables without thead', () => {
  const [video] = g.guideBlocks('<figure class="wp-block-embed is-provider-youtube"><div class="wp-block-embed__wrapper">\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n</div><figcaption>Teknik</figcaption></figure>');
  assert.deepEqual(video, { kind: 'video', provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', title: 'Teknik' });
  const [table] = g.guideBlocks('<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');
  assert.deepEqual([table.head, table.rows], [['A', 'B'], [['1', '2']]]);
  const [plain] = g.guideBlocks('<figure class="wp-block-table"><table><tbody><tr><td>x</td><td>y</td></tr></tbody></table></figure>');
  assert.deepEqual([plain.head, plain.rows], [[], [['x', 'y']]]);
  assert.deepEqual(g.guideBlocks(''), []);
  assert.deepEqual(g.guideBlocks(null), []);
});

test('video watch URLs: only YouTube/Vimeo over https', () => {
  assert.deepEqual(g.videoWatchUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0'), { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.deepEqual(g.videoWatchUrl('//www.youtube.com/embed/dQw4w9WgXcQ'), { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.deepEqual(g.videoWatchUrl('https://youtu.be/dQw4w9WgXcQ'), { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  assert.deepEqual(g.videoWatchUrl('https://player.vimeo.com/video/76979871?h=abc'), { provider: 'vimeo', url: 'https://vimeo.com/76979871' });
  for (const bad of ['http://www.youtube.com/embed/dQw4w9WgXcQ', 'https://evil.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com.evil.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/embed/short', 'javascript:alert(1)', '', null]) {
    assert.equal(g.videoWatchUrl(bad), null, String(bad));
  }
});

// ---------------------------------------------------------------------------
// Links, dates, layout helpers

test('article links: tariften.com recipes, guides and blog open in the app', () => {
  assert.equal(g.internalRouteFor('https://tariften.com/recipe/menemen'), '/recipe/menemen');
  assert.equal(g.internalRouteFor('https://www.tariften.com/tarif/karniyarik/'), '/recipe/karniyarik');
  assert.equal(g.internalRouteFor('/rehber/pilav-pisirme'), '/rehber/pilav-pisirme');
  assert.equal(g.internalRouteFor('https://tariften.com/blog/ekmek?utm=1'), '/blog/ekmek');
  assert.equal(g.internalRouteFor('https://tariften.com/recipe/mercimek-%C3%A7orbas%C4%B1'), `/recipe/${encodeURIComponent('mercimek-çorbası')}`);
  for (const outside of ['https://example.com/recipe/x', 'https://tariften.com/about', 'https://tariften.com/recipe/a/b', 'https://tariften.com/recipe/..', 'mailto:a@b.c', 'javascript:alert(1)', '#bolum', 42]) {
    assert.equal(g.internalRouteFor(outside), null, String(outside));
  }
});

test('safe URLs, share address and slugs', () => {
  assert.equal(g.safeHttpsUrl('https://www.fsis.usda.gov/food-safety'), 'https://www.fsis.usda.gov/food-safety');
  for (const bad of ['http://x.com', 'https://localhost', 'https://a b.com', 'https://u:p@x.com', 'data:text/html,1', '//x.com', 42]) {
    assert.equal(g.safeHttpsUrl(bad), null, String(bad));
  }
  assert.equal(g.guideShareUrl({ slug: 'pilav', url: 'https://tariften.com/rehber/pilav' }), 'https://tariften.com/rehber/pilav');
  assert.equal(g.guideShareUrl({ slug: 'pilav', url: 'https://api.tariften.com/?p=1' }), 'https://tariften.com/rehber/pilav', 'never share the API host');
  assert.ok(g.isGuideSlug('yumurta-haslama-sureleri'));
  assert.ok(g.isGuideSlug('topics-rehberi'));
  for (const bad of ['', 'A', 'a b', '../x', 'a/b', '-a', 'a--b', 'x'.repeat(201)]) assert.equal(g.isGuideSlug(bad), false, bad);
});

test('dates in Türkiye time, reading label, level rank', () => {
  assert.equal(g.guideDateTr('2026-10-19T12:00:00Z'), '19 Ekim 2026');
  assert.equal(g.guideDateTr('2026-12-31T22:30:00Z'), '1 Ocak 2027', 'UTC+3');
  assert.equal(g.guideDateTr(null), '');
  assert.equal(g.guideDateTr('dün'), '');
  assert.equal(g.readingLabel(4), '4 dk okuma');
  assert.equal(g.readingLabel(null), '');
  assert.deepEqual(['baslangic', 'orta', 'ileri', 'usta'].map(slug => g.levelRank({ slug, name: slug })), [1, 2, 3, 0]);
  assert.equal(g.levelRank(null), 0);
});

test('table columns: clamped by content, stretched to fill when narrow', () => {
  const wide = g.tableColumnWidths(['Malzeme', 'Gram', 'Su bardağı', 'Yemek kaşığı', 'Not'], [['Un', '120', '1', '8', 'Elenmiş, bastırmadan doldurulmuş ölçü']], 335);
  assert.ok(wide.reduce((a, b) => a + b, 0) > 335, 'wide tables scroll');
  assert.ok(wide.every(w => w >= 96 && w <= 240));
  const narrow = g.tableColumnWidths(['A', 'B'], [['1', '2']], 335);
  assert.equal(narrow.length, 2);
  assert.ok(narrow.reduce((a, b) => a + b, 0) <= 335 && narrow.reduce((a, b) => a + b, 0) >= 333, 'fills the width');
  assert.deepEqual(g.tableColumnWidths([], [], 300), []);
});

// ---------------------------------------------------------------------------
// API client

function withFetch(handler, fn) {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url, init) => { calls.push({ url, init }); return handler(url, init); };
  return Promise.resolve(fn(calls)).finally(() => { global.fetch = original; });
}
const respond = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('fetchGuides: public GET with clamped paging and filters, no token', () => withFetch(
  () => respond(200, { data: [LIST_ITEM], count: 1, pages: 1, page: 1, per_page: 12 }),
  async calls => {
    const page = await api.fetchGuides({ topic: 'saklama', level: 'orta', page: 900, perPage: 99 });
    assert.equal(page.items.length, 1);
    assert.equal(calls[0].url, 'https://api.tariften.com/wp-json/tariften/v1/guides?topic=saklama&level=orta&page=500&per_page=50');
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[0].init.headers.Authorization, undefined);
    await api.fetchGuides();
    assert.equal(calls[1].url, 'https://api.tariften.com/wp-json/tariften/v1/guides?page=1&per_page=12');
  },
));

test('fetchGuides: server errors and broken bodies are errors, not empty lists', async () => {
  await withFetch(() => respond(500, { code: 'x' }), () => assert.rejects(api.fetchGuides(), /yüklenemedi/));
  await withFetch(() => respond(200, { nope: true }), () => assert.rejects(api.fetchGuides(), /eksik geldi/));
  await withFetch(() => { throw new TypeError('Network request failed'); }, () => assert.rejects(api.fetchGuides(), /Bağlantı kurulamadı/));
});

test('fetchGuide: 404 guide_not_found → GuideNotFoundError; slug is validated and encoded', async () => {
  await withFetch(() => respond(404, { code: 'guide_not_found', message: 'Rehber yazısı bulunamadı.', data: { status: 404 } }), async calls => {
    await assert.rejects(api.fetchGuide('yok-boyle-bir-yazi'), err => err instanceof api.GuideNotFoundError);
    assert.equal(calls[0].url, 'https://api.tariften.com/wp-json/tariften/v1/guides/yok-boyle-bir-yazi');
  });
  await withFetch(() => respond(200, DETAIL), async calls => {
    await assert.rejects(api.fetchGuide('../auth/me'), err => err instanceof api.GuideNotFoundError);
    assert.equal(calls.length, 0, 'invalid slug never reaches the network');
    const guide = await api.fetchGuide('yumurta-haslama-sureleri');
    assert.equal(guide.title, 'Yumurta haşlama süreleri');
  });
  await withFetch(() => respond(503, null), () => assert.rejects(api.fetchGuide('pilav'), err => !(err instanceof api.GuideNotFoundError) && /yüklenemedi/.test(err.message)));
});

test('fetchGuideTaxonomy reads /guides/topics', () => withFetch(
  () => respond(200, { data: [{ id: 1, slug: 'teknikler', name: 'Teknikler', count: 1, total_count: 1, children: [] }], levels: [] }),
  async calls => {
    const tax = await api.fetchGuideTaxonomy();
    assert.equal(tax.topics[0].slug, 'teknikler');
    assert.equal(calls[0].url, 'https://api.tariften.com/wp-json/tariften/v1/guides/topics');
  },
));

// ---------------------------------------------------------------------------
// Screens, navigation and the JS-only boundary

test('routes: rehber list and article are stack screens with their own headers; no 6th tab', () => {
  const layout = read('app/_layout.tsx');
  assert.ok(layout.includes('<Stack.Screen name="rehber/index" options={{ headerShown: false }} />'));
  assert.ok(layout.includes('<Stack.Screen name="rehber/[slug]" options={{ headerShown: false }} />'));
  assert.ok(fs.existsSync(path.join(root, 'app/rehber/index.tsx')));
  assert.ok(fs.existsSync(path.join(root, 'app/rehber/[slug].tsx')));
  const tabs = read('app/(tabs)/_layout.tsx');
  assert.deepEqual([...tabs.matchAll(/<Tabs\.Screen name="([^"]+)"/g)].map(m => m[1]), ['defterim', 'bu-hafta', 'alisveris']);
  assert.doesNotMatch(tabs, /rehber/);
});

test('entry points: Keşfet rail (never blocks the feed) and a Profile row', () => {
  const home = read('app/(tabs)/index.tsx');
  assert.match(home, /fetchGuides\(\{ perPage: 5 \}\)\.then\(page => page\.items\)\.catch\(/);
  assert.match(home, /onMore=\{\(\) => router\.push\('\/rehber'\)\}/);
  assert.match(home, /variant="rail"/);
  const profile = read('app/(tabs)/profile.tsx');
  assert.match(profile, /router\.push\('\/rehber'\)/);
  assert.match(profile, /Mutfak Rehberi/);
});

test('article screen: TOC, food-safety badge, sources, related recipes, share, not-found', () => {
  const screen = read('app/rehber/[slug].tsx');
  for (const expected of [
    /Gıda güvenliği uzmanı tarafından incelendi/, /İçindekiler/, /GuideTocSheet/, /Kaynaklar/, /openExternal\(item\.url\)/,
    /router\.push\(`\/recipe\/\$\{encodeURIComponent\(recipe\.slug\)\}`\)/, /Share\.share\(/, /guideShareUrl\(guide\)/,
    /GuideNotFoundError/, /Bu rehber yazısını bulamadık/, /Tekrar dene/, /scrollTo\(/,
  ]) assert.match(screen, expected);
  const list = read('app/rehber/index.tsx');
  for (const expected of [/fetchGuideTaxonomy\(\)/, /onEndReached=\{loadMore\}/, /Daha fazla/, /Tekrar dene/, /Filtreleri temizle/, /RefreshControl/]) {
    assert.match(list, expected);
  }
});

test('article body reuses react-native-render-html with one shared engine; embeds never play inline', () => {
  const article = read('components/guide/GuideArticle.tsx');
  assert.match(article, /TRenderEngineProvider/);
  assert.match(article, /RenderHTMLSource/);
  assert.match(article, /enableCSSInlineProcessing=\{false\}/);
  assert.match(article, /Videoyu izle/);
  assert.match(article, /<ScrollView horizontal/);
});

test('JS-only: guide code imports nothing native beyond what the build already has', () => {
  const allowed = /^(react|react-native|expo-router|expo-image|expo-web-browser|@expo\/vector-icons|react-native-render-html|react-native-safe-area-context|\.{1,2}\/.*)$/;
  const files = ['app/rehber/index.tsx', 'app/rehber/[slug].tsx', 'lib/guides.ts', 'lib/guides-api.ts',
    ...fs.readdirSync(path.join(root, 'components/guide')).map(f => `components/guide/${f}`)];
  for (const file of files) {
    for (const [, spec] of read(file).matchAll(/from '([^']+)'/g)) assert.match(spec, allowed, `${file} imports ${spec}`);
  }
  const pkg = JSON.parse(read('package.json'));
  for (const name of ['expo-web-browser', 'react-native-render-html', 'expo-image']) assert.ok(pkg.dependencies[name], name);
  assert.equal(pkg.dependencies['react-native-webview'], undefined, 'no WebView: videos open in the browser');
  const app = JSON.parse(read('app.json')).expo;
  assert.equal(app.scheme, 'tariften', 'tariften://rehber/<slug> resolves through Expo Router');
  assert.ok(app.plugins.includes('expo-web-browser'));
});
