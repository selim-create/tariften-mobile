'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const load = file => {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
  return mod.exports;
};

const base = {
  platform: 'tiktok', video_id: '7083514528025136386', url: 'https://www.tiktok.com/@sef/video/7083514528025136386',
  creator_handle: 'sef', creator_name: 'Şef Mutfak', metrics_origin: 'public_tiktok_extractor',
  metrics_captured_at: '2026-10-21T22:30:00Z', view_count: 2843000, like_count: 35410, comment_count: 412, follower_count: 1240000,
};

test('social card shows four import-time counts and nothing from another platform', () => {
  const { trustedMetrics, creatorLabel, capturedDateTr, PLATFORM_COPY } = load('lib/social-format.ts');
  assert.deepEqual(trustedMetrics(base).map(m => `${m.label} ${m.value}`), ['Takipçi 1,2 Mn', 'İzlenme 2,8 Mn', 'Beğeni 35,4 B', 'Yorum 412']);
  assert.deepEqual(trustedMetrics({ ...base, comment_count: null }).map(m => m.key), ['followers', 'views', 'likes']);
  assert.deepEqual(trustedMetrics({ ...base, metrics_origin: 'public_youtube_data_api' }), []);
  assert.deepEqual(creatorLabel(base), { primary: 'Şef Mutfak', handle: '@sef' });
  assert.deepEqual(creatorLabel({ ...base, creator_name: null }), { primary: '@sef', handle: null });
  assert.deepEqual(creatorLabel({ ...base, creator_name: ' ', creator_handle: 'bad handle!' }), { primary: null, handle: null });
  assert.equal(capturedDateTr(base.metrics_captured_at), '22 Ekim 2026', 'snapshot dates read in Istanbul time');
  assert.equal(PLATFORM_COPY.tiktok.from, "TikTok'tan");
  assert.equal(PLATFORM_COPY.youtube.at, "YouTube'da");
});

test('video players and stills are built only from validated ids', () => {
  const { embedUrl, videoPoster } = load('lib/social-format.ts');
  assert.equal(embedUrl(base), 'https://www.tiktok.com/embed/v2/7083514528025136386');
  assert.equal(embedUrl({ platform: 'tiktok', video_id: '12' }), null);
  assert.equal(embedUrl({ platform: 'youtube', video_id: 'dQw4w9WgXcQ' }), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&playsinline=1');
  assert.equal(embedUrl({ platform: 'youtube', video_id: 'x"><script>' }), null);
  assert.equal(embedUrl({ platform: 'instagram', video_id: 'C5ToOyqIZvb' }), 'https://www.instagram.com/reel/C5ToOyqIZvb/embed/');
  assert.equal(videoPoster({ platform: 'youtube', video_id: 'dQw4w9WgXcQ' }), 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  assert.equal(videoPoster(base), null, 'no invented thumbnail for TikTok or Instagram');
  const card = read('components/recipe/SocialSourceCard.tsx');
  assert.match(card, /embedUrl\(source\) \|\| source\.url/);
  assert.match(card, /Canlı istatistik değildir/);
  assert.match(card, /Videoyu izle/);
  assert.doesNotMatch(card, /avatar|profile_image|profile_pic/i, 'no creator photo is fetched or invented');
});

test('blog helpers only show what the post itself says', () => {
  const blog = load('lib/blog.ts');
  const post = {
    id: 1, date: '2026-02-05T23:30:00', modified: '2026-02-12T10:00:00', slug: 'x',
    title: { rendered: 'Fermente G&#305;dalar &#8211; Kefir' },
    excerpt: { rendered: '<p>İlk cümleler kesildi [&hellip;]</p>\n' },
    content: { rendered: '<p>' + 'kelime '.repeat(410) + '</p>' },
    categories: [3], featured_media: 0,
    _embedded: { author: [{ name: 'admin' }], 'wp:term': [[{ taxonomy: 'category', name: 'Püf Noktaları', slug: 'puf-noktalari', id: 3 }]] },
  };
  assert.equal(blog.postTitle(post), 'Fermente Gıdalar – Kefir');
  assert.equal(blog.postStandfirst(post), null, 'auto excerpt is not shown as a standfirst');
  assert.equal(blog.postStandfirst({ ...post, excerpt: { rendered: '<p>Elle yazılmış giriş.</p>' } }), 'Elle yazılmış giriş.');
  assert.equal(blog.postAuthor(post), null, 'no "admin" byline');
  assert.equal(blog.readingMinutes(post.content.rendered), 2);
  assert.equal(blog.readingMinutes('<p>kısa</p>'), null);
  assert.equal(blog.postDate(post.date), '5 Şubat 2026', 'WordPress local date is not shifted by the device time zone');
  assert.deepEqual(blog.postCategory(post), { id: 3, name: 'Püf Noktaları', slug: 'puf-noktalari' });
});

test('Tarifler is a real archive: two-column tiles, API total, Core-supported sorting', () => {
  const recipes = read('app/(tabs)/recipes.tsx');
  assert.match(recipes, /minColumns=\{2\}/);
  assert.match(recipes, /variant="tile"/);
  assert.match(recipes, /setTotal\(data\.source !== 'error'/);
  assert.match(recipes, /Tüm \*tarifler\*/);
  const sheet = read('components/FilterSheet.tsx');
  assert.match(sheet, /value: 'En Yeniler'/);
  assert.match(sheet, /value: 'Hazırlama Süresi'/);
  assert.doesNotMatch(sheet, /value: '(date|popular|rating)'/, 'no sort option the API ignores');
  const home = read('app/(tabs)/index.tsx');
  assert.match(home, /accessibilityLabel="Tüm tarifleri gör"/);
  assert.match(read('app/(tabs)/defterim.tsx'), /title="Tarifler" line="Herkesin tarifleri"\s+onPress=\{\(\) => router\.push\('\/recipes'\)\}/);
  const layout = read('app/(tabs)/_layout.tsx');
  assert.match(layout, /\{ name: 'recipes', title: 'Tarifler', ownHeader: true \}/);
});

test('menus page through the API and a menu fills the shopping list from its own recipes', () => {
  const api = read('lib/api.ts');
  assert.match(api, /export async function getMenusPage\(page = 1\)/);
  const list = read('app/(tabs)/menus.tsx');
  assert.match(list, /getMenusPage\(target\)/);
  assert.match(list, /Kendi menünü kur/);
  const detail = read('app/menu/[slug].tsx');
  assert.match(detail, /addRecipeToShopping\(\{/);
  assert.match(detail, /ingredients: parseIngredients\(recipe\.ingredients\)/);
  assert.match(detail, /variant="row"/);
  assert.doesNotMatch(detail, /Davetlilerinizi büyüleyecek/, 'no generic marketing quote presented as the menu text');
  const root = read('app/_layout.tsx');
  for (const name of ['menu/[slug]', 'blog/index', 'blog/[slug]']) {
    assert.ok(root.includes(`<Stack.Screen name="${name}" options={{ headerShown: false }} />`), name);
  }
});

test('blog uses WordPress categories, real totals and brand typography', () => {
  const api = read('lib/api.ts');
  assert.match(api, /wp\/v2\/categories\?per_page=50&hide_empty=true/);
  assert.match(api, /X-WP-Total'/);
  const list = read('app/blog/index.tsx');
  assert.match(list, /getBlogCategories\(\)/);
  assert.match(list, /FeaturedPost/);
  const post = read('app/blog/[slug].tsx');
  assert.match(post, /systemFonts=\{SYSTEM_FONTS\}/);
  assert.match(post, /Sıradaki \*okumalık\*/);
  assert.match(post, /postStandfirst\(post\)/);
});
