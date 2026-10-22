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

test('social counts are formatted, never estimated; metrics need a matching origin', () => {
  const { compactCountTr, trustedMetrics, profileUrl, capturedDateTr } = load('lib/social-format.ts');
  assert.equal(compactCountTr(2800000), '2,8 Mn');
  assert.equal(compactCountTr(35400), '35,4 B');
  assert.equal(compactCountTr(950), '950');
  assert.equal(compactCountTr(null), null);
  assert.equal(compactCountTr(-1), null);
  assert.equal(compactCountTr(1.5), null);
  const base = { platform: 'tiktok', video_id: '1', url: 'https://www.tiktok.com/@sef/video/1', creator_handle: 'sef',
    view_count: 22500000, like_count: 951000, follower_count: 1200000, metrics_captured_at: '2026-10-21T10:00:00Z' };
  assert.deepEqual(trustedMetrics({ ...base, metrics_origin: 'public_instagram_extractor' }), [], 'origin of another platform hides metrics');
  const shown = trustedMetrics({ ...base, metrics_origin: 'public_tiktok_extractor' });
  assert.deepEqual(shown.map(m => m.label), ['Takipçi', 'İzlenme', 'Beğeni']);
  assert.equal(trustedMetrics({ ...base, platform: 'youtube', metrics_origin: 'public_youtube_data_api' })[0].label, 'Abone');
  assert.equal(profileUrl({ ...base }), 'https://www.tiktok.com/@sef');
  assert.equal(profileUrl({ ...base, creator_profile_url: 'https://evil.example/@sef' }), 'https://www.tiktok.com/@sef');
  assert.equal(profileUrl({ ...base, platform: 'youtube', creator_handle: 'sef' }), null, 'YouTube links are never built from a handle');
  assert.equal(capturedDateTr('2026-10-21T10:00:00Z'), '21 Ekim 2026');
  assert.equal(capturedDateTr('nope'), null);
});

test('recipe detail credits the creator, keeps one rating control and real actions', () => {
  const detail = read('app/recipe/[slug].tsx');
  assert.match(detail, /<SocialSourceCard source=\{recipe\.social_source\} \/>/);
  assert.doesNotMatch(detail, /interactive\s+onRate/, 'no second, star-based rating control');
  assert.match(detail, /addRecipeToShopping\(\{ id: recipe\.id/);
  assert.match(detail, /addToPlan\(/);
  assert.match(detail, /<WeekPickerSheet/);
  assert.match(detail, /requestCookingAssistant/);
  const card = read('components/recipe/SocialSourceCard.tsx');
  assert.match(card, /Canlı istatistik değildir/);
  assert.match(card, /tarihinde, Tariften'e aktarıldığı anki değerler/);
});

test('kitchen store keeps plan and list on device first and rebuilds rows from recipe ingredients', () => {
  const store = read('lib/kitchen-store.ts');
  assert.match(store, /buildShoppingList\(s\.shopping\.map/);
  assert.match(store, /FileSystem\.documentDirectory/);
  // The only network call is the member's own /me/kitchen document; nothing is inferred.
  assert.equal((store.match(/fetch\(/g) || []).length, 1);
  assert.match(store, /fetch\(KITCHEN_API/);
  assert.match(read('app/(tabs)/alisveris.tsx'), /Liste bu cihazda saklanır; giriş yapınca hesabına taşınır/);
  assert.match(read('app/(tabs)/bu-hafta.tsx'), /Planın hesabına kaydedilir/);
});

test('brand foundation: tokens, fonts and new logo are in place', () => {
  const theme = read('constants/theme.ts');
  assert.match(theme, /brand: '#db4c3f'/);
  assert.match(theme, /heading: 'Poppins_600SemiBold'/);
  const rootLayout = read('app/_layout.tsx');
  assert.match(rootLayout, /useFonts\(/);
  assert.match(rootLayout, /Poppins_700Bold_Italic/);
  const logo = read('assets/logo.svg');
  assert.doesNotMatch(logo, /enable-background|Layer_1/, 'traced logo replaced by the geometric one');
});

test('ingredient amounts read the Turkish way without changing their value', () => {
  const { formatAmountTr } = load('lib/amount-format.ts');
  assert.equal(formatAmountTr('0.5'), '½');
  assert.equal(formatAmountTr('1.5'), '1½');
  assert.equal(formatAmountTr('0,25'), '¼');
  assert.equal(formatAmountTr('0.3'), '0,3');
  assert.equal(formatAmountTr('1/2'), '½');
  assert.equal(formatAmountTr('1 1/2'), '1½');
  assert.equal(formatAmountTr('2-3'), '2-3');
  assert.equal(formatAmountTr('bir tutam'), 'bir tutam');
  assert.equal(formatAmountTr(350), '350');
  assert.equal(formatAmountTr(''), '');
});
