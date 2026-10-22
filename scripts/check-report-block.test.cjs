'use strict';
/**
 * Bildir / Engelle — App Store Guideline 1.2 (user-generated content).
 * Contract: Core 1.0.67 report/block contract (POST /reports, /me/blocks,
 * author_blocked on recipe detail, account deletion keeps published recipes
 * under "Tariften Topluluğu").
 * Covers the API client (URLs, methods, bodies, error codes), the reason list,
 * the local filters, the blocked-author placeholder, the session store, the
 * confirmation copy and the screen/route wiring.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function loadTS(file, dependencies = {}) {
  const js = ts.transpileModule(read(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  const requireLocal = name => {
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
    throw new Error('Unexpected dependency ' + name);
  };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, requireLocal);
  return mod.exports;
}

const BASE = 'https://api.tariften.com/wp-json/tariften/v1';
const api = loadTS('lib/report-block-api.ts');

function stubFetch(replies) {
  const calls = [];
  const queue = [...replies];
  global.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = queue.shift() || { status: 200, json: {} };
    if (next.throws) throw next.throws;
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.json };
  };
  return calls;
}
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });

// ---------------------------------------------------------------------------
// Reasons

test('reasons: contract keys, order and Turkish labels', () => {
  assert.deepEqual(api.REPORT_REASONS.map(r => [r.key, r.label]), [
    ['spam', 'Spam veya reklam'],
    ['offensive', 'Hakaret veya taciz'],
    ['hate', 'Nefret söylemi'],
    ['sexual', 'Cinsel içerik'],
    ['violence', 'Şiddet'],
    ['dangerous', 'Tehlikeli veya sağlığa zararlı'],
    ['copyright', 'Telif hakkı ihlali'],
    ['misinformation', 'Yanlış veya yanıltıcı bilgi'],
    ['other', 'Diğer'],
  ]);
  assert.equal(api.REPORT_DETAILS_MAX, 1000);
  assert.equal(api.REPORT_OTHER_MIN, 10);
  assert.match(api.reportDetailsProblem(null, ''), /neden seç/);
  assert.equal(api.reportDetailsProblem('spam', ''), null, 'details are optional');
  assert.match(api.reportDetailsProblem('other', '  kısa  '), /en az 10 karakter/);
  assert.equal(api.reportDetailsProblem('other', 'çğıöşüÇĞİÖ'), null, '10 Turkish letters count as 10');
  assert.match(api.reportDetailsProblem('spam', 'a'.repeat(1001)), /1\.000 karakter/);
  assert.equal(api.reportDetailsProblem('spam', 'a'.repeat(1000)), null);
});

// ---------------------------------------------------------------------------
// POST /reports

test('report: POST /reports with target, reason and trimmed details; server message is returned', async () => {
  const calls = stubFetch([
    { status: 201, json: { success: true, reference: 77, already_reported: false, message: 'Bildirimin alındı. Ekibimiz en geç 24 saat içinde inceleyecek.' } },
    { status: 200, json: { success: true, reference: 77, already_reported: true, message: 'Bu içeriği zaten bildirdin.' } },
    { status: 201, json: { success: true, reference: 78 } },
  ]);
  const first = await api.submitReport('jwt', { target_type: 'recipe', target_id: 123, reason: 'spam', details: '  Reklam linki var.  ' });
  assert.equal(calls[0].url, `${BASE}/reports`);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer jwt');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.equal(calls[0].headers['Cache-Control'], 'no-store');
  assert.deepEqual(calls[0].body, { target_type: 'recipe', target_id: 123, reason: 'spam', details: 'Reklam linki var.' });
  assert.deepEqual(first, { reference: 77, alreadyReported: false, message: 'Bildirimin alındı. Ekibimiz en geç 24 saat içinde inceleyecek.' });
  const again = await api.submitReport('jwt', { target_type: 'comment', target_id: 9, reason: 'offensive', details: '   ' });
  assert.deepEqual(calls[1].body, { target_type: 'comment', target_id: 9, reason: 'offensive' }, 'empty details are omitted');
  assert.equal(again.alreadyReported, true);
  assert.equal(again.message, 'Bu içeriği zaten bildirdin.');
  const fallback = await api.submitReport('jwt', { target_type: 'user', target_id: 45, reason: 'other', details: 'Profilinde hakaret var.' });
  assert.equal(calls[2].body.target_type, 'user');
  assert.equal(fallback.message, api.REPORT_SUCCESS_MESSAGE);
});

test('report: guests, bad targets and short "Diğer" never hit the network', async () => {
  const calls = stubFetch([]);
  await assert.rejects(api.submitReport('', { target_type: 'recipe', target_id: 1, reason: 'spam' }), e => e.code === 'auth');
  await assert.rejects(api.submitReport('jwt', { target_type: 'menu', target_id: 1, reason: 'spam' }), e => e.code === 'invalid');
  await assert.rejects(api.submitReport('jwt', { target_type: 'recipe', target_id: 0, reason: 'spam' }), e => e.code === 'invalid');
  await assert.rejects(api.submitReport('jwt', { target_type: 'recipe', target_id: 1, reason: 'boring' }), e => e.code === 'invalid');
  await assert.rejects(api.submitReport('jwt', { target_type: 'recipe', target_id: 1, reason: 'other', details: 'kısa' }), e => e.code === 'invalid');
  assert.equal(calls.length, 0);
});

test('report errors: 400, 401, 404, 422, 429 (retry_after) and network become Turkish messages with codes', async () => {
  const input = { target_type: 'comment', target_id: 5, reason: 'spam' };
  stubFetch([{ status: 400, json: { code: 'report_invalid', message: 'Geçersiz neden.', data: { status: 400 } } }]);
  await assert.rejects(api.submitReport('jwt', input), e => e.code === 'invalid' && e.message === 'Geçersiz neden.');
  stubFetch([{ status: 401, json: { code: 'rest_forbidden', message: 'x', data: { status: 401 } } }]);
  await assert.rejects(api.submitReport('jwt', input), e => e.code === 'auth' && /giriş yap/.test(e.message));
  stubFetch([{ status: 404, json: { code: 'report_target_not_found', message: 'x', data: { status: 404 } } }]);
  await assert.rejects(api.submitReport('jwt', input), e => e.code === 'not_found' && /artık görünmüyor/.test(e.message));
  stubFetch([{ status: 422, json: { code: 'report_self', message: 'x', data: { status: 422 } } }]);
  await assert.rejects(api.submitReport('jwt', input), e => e.code === 'self' && /Kendi içeriğini/.test(e.message));
  stubFetch([{ status: 429, json: { code: 'report_rate_limited', message: 'x', data: { status: 429, retry_after: 7200 } } }]);
  await assert.rejects(api.submitReport('jwt', input), e => e.code === 'rate_limited' && e.retryAfter === 7200 && /2 saat sonra/.test(e.message));
  stubFetch([{ status: 429, json: { code: 'report_rate_limited', message: 'x', retry_after: 600 } }]);
  await assert.rejects(api.submitReport('jwt', input), e => e.retryAfter === 600 && /10 dakika sonra/.test(e.message), 'top-level retry_after');
  stubFetch([{ status: 429, json: { code: 'report_rate_limited', message: 'x' } }]);
  await assert.rejects(api.submitReport('jwt', input), e => e.retryAfter === null && /Biraz sonra/.test(e.message));
  stubFetch([{ throws: new TypeError('Network request failed') }]);
  await assert.rejects(api.submitReport('jwt', input), e => e.code === 'network' && /Bağlantı/.test(e.message));
  stubFetch([{ status: 500, json: null }]);
  await assert.rejects(api.submitReport('jwt', input), e => e.code === 'unavailable');
});

// ---------------------------------------------------------------------------
// /me/blocks

test('blocks: GET /me/blocks reads rows defensively; POST sends user_id; DELETE uses the id in the path', async () => {
  const calls = stubFetch([
    { status: 200, json: { success: true, max: 500, blocks: [
      { user_id: 45, name: 'Ayşe K.', avatar: 'https://cdn.tariften.com/a.jpg', blocked_at: '2026-10-22T09:00:00+00:00' },
      { user_id: 46, name: '', avatar: 'javascript:alert(1)', blocked_at: '2026-10-21T09:00:00+00:00' },
      { user_id: 45, name: 'dup' },
      { user_id: 0, name: 'Eski üye' },
      'bad',
    ] } },
    { status: 201, json: { success: true, user_id: 45, blocked: true } },
    { status: 200, json: { success: true, user_id: 45, blocked: true } },
    { status: 200, json: { success: true, user_id: 45, blocked: false } },
  ]);
  const list = await api.getMyBlocks('jwt');
  assert.equal(calls[0].url, `${BASE}/me/blocks`);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers.Authorization, 'Bearer jwt');
  assert.equal(calls[0].body, undefined);
  assert.equal(list.max, 500);
  assert.deepEqual(list.blocks.map(b => b.user_id), [45, 46], 'malformed, zero and duplicate rows are dropped');
  assert.equal(list.blocks[1].name, 'Tariften üyesi');
  assert.equal(list.blocks[1].avatar, null, 'only https avatars are rendered');
  const blocked = await api.blockMember('jwt', 45);
  assert.equal(calls[1].url, `${BASE}/me/blocks`);
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(calls[1].body, { user_id: 45 });
  assert.deepEqual(blocked, { userId: 45, blocked: true });
  assert.equal((await api.blockMember('jwt', 45)).blocked, true, '200 already blocked is success');
  const unblocked = await api.unblockMember('jwt', 45);
  assert.equal(calls[3].url, `${BASE}/me/blocks/45`);
  assert.equal(calls[3].method, 'DELETE');
  assert.equal(calls[3].body, undefined);
  assert.deepEqual(unblocked, { userId: 45, blocked: false });
  const none = stubFetch([]);
  await assert.rejects(api.blockMember('jwt', 0), e => e.code === 'invalid');
  await assert.rejects(api.unblockMember('', 4), e => e.code === 'auth');
  assert.equal(none.length, 0);
});

test('block errors: 403 block_not_allowed is graceful (not a sign-out); 401, 404, 409, 422 mapped', async () => {
  stubFetch([{ status: 403, json: { code: 'block_not_allowed', message: 'x', data: { status: 403 } } }]);
  await assert.rejects(api.blockMember('jwt', 3), e => e.code === 'not_allowed' && e.message === api.BLOCK_NOT_ALLOWED_MESSAGE);
  assert.match(api.BLOCK_NOT_ALLOWED_MESSAGE, /Bildir/);
  stubFetch([{ status: 403, json: { code: 'jwt_auth_invalid_token', message: 'x' } }]);
  await assert.rejects(api.blockMember('jwt', 3), e => e.code === 'auth');
  stubFetch([{ status: 401, json: { code: 'rest_forbidden', message: 'x' } }]);
  await assert.rejects(api.getMyBlocks('jwt'), e => e.code === 'auth');
  stubFetch([{ status: 404, json: { code: 'block_user_not_found', message: 'x' } }]);
  await assert.rejects(api.blockMember('jwt', 3), e => e.code === 'not_found');
  stubFetch([{ status: 409, json: { code: 'block_limit', message: 'x' } }]);
  await assert.rejects(api.blockMember('jwt', 3), e => e.code === 'limit' && /500/.test(e.message));
  stubFetch([{ status: 422, json: { code: 'block_self', message: 'x' } }]);
  await assert.rejects(api.blockMember('jwt', 3), e => e.code === 'self');
  stubFetch([{ status: 200, json: { success: true } }]);
  await assert.rejects(api.getMyBlocks('jwt'), e => e.code === 'unavailable', 'a list without blocks[] is not an empty list');
});

// ---------------------------------------------------------------------------
// Local filtering and placeholder

test('filters: recipe cards by author_id or author.id; comments by author.id or session-reported id', () => {
  const recipes = [
    { id: 1, author: { id: 45 } },
    { id: 2, author_id: 45 },
    { id: 3, author: { id: 7 } },
    { id: 4 },
    { id: 5, author_id: '46' },
  ];
  assert.deepEqual(api.filterBlockedRecipes(recipes, new Set([45, 46])).map(r => r.id), [3, 4]);
  assert.deepEqual(api.filterBlockedRecipes(recipes, [45]).map(r => r.id), [3, 4, 5]);
  assert.equal(api.filterBlockedRecipes(recipes, new Set()), recipes, 'same array when nothing is blocked');
  assert.equal(api.filterBlockedRecipes(recipes, new Set([999])), recipes, 'same array when nothing changes');
  assert.deepEqual(api.filterBlockedRecipes(null, [1]), []);
  assert.equal(api.recipeAuthorId({ author_id: 0, author: { id: 12 } }), 12);
  assert.equal(api.recipeAuthorId({ author: { id: 'x' } }), null);

  const comments = [
    { id: 10, author: { id: 45, name: 'Ayşe' } },
    { id: 11, author: { id: 7, name: 'Can' } },
    { id: 12, author: { id: 0, name: 'Eski üye' } },
    { id: 13, author: { id: 8, name: 'Deniz' } },
  ];
  assert.deepEqual(api.filterBlockedComments(comments, new Set([45]), new Set([13])).map(c => c.id), [11, 12]);
  assert.equal(api.filterBlockedComments(comments, [], []), comments);
  assert.equal(api.commentAuthorId(comments[2]), null, 'anonymised comments have no author to block');
});

test('placeholder: local list once loaded, author_blocked before that; reveal and own recipe never blocked', () => {
  const recipe = { id: 1, author: { id: 45 }, author_blocked: false };
  const show = (over) => api.shouldShowBlockedPlaceholder({ recipe, blockedIds: [], listReady: true, revealed: false, viewerId: 9, ...over });
  assert.equal(show({ blockedIds: [45] }), true, 'author in the local list');
  assert.equal(show({ blockedIds: [45], revealed: true }), false, '"Yine de göster"');
  assert.equal(show({ recipe: { ...recipe, author_blocked: true }, listReady: false }), true, 'Core flag before the list loads');
  assert.equal(show({ recipe: { ...recipe, author_blocked: true }, listReady: true }), false, 'after unblock the refreshed list wins');
  assert.equal(show({ blockedIds: [45], viewerId: 45 }), false, 'own recipe');
  assert.equal(show({}), false);
  assert.equal(show({ recipe: null }), false);
  assert.equal(api.BLOCKED_PLACEHOLDER_TITLE, 'Bu üyeyi engelledin.');
});

// ---------------------------------------------------------------------------
// Copy

test('confirmation copy is the contract sentence; menu label inflects the name', () => {
  assert.equal(api.blockConfirmText('Ayşe'),
    'Ayşe engellensin mi? Tariflerini ve yorumlarını artık görmeyeceksin. İstediğin zaman Ayarlar\'dan kaldırabilirsin.');
  assert.equal(api.blockConfirmTitle('Ayşe'), 'Ayşe engellensin mi?');
  assert.equal(api.blockConfirmTitle(''), 'Bu üye engellensin mi?');
  assert.deepEqual(
    ['Burak', 'Selim', 'Ayşe', 'Ali', 'Tuğba', 'Onur', 'Gönül', 'Mert Can', 'İrem', 'Ilgaz'].map(api.blockMenuLabel),
    ["Burak'ı engelle", "Selim'i engelle", "Ayşe'yi engelle", "Ali'yi engelle", "Tuğba'yı engelle",
      "Onur'u engelle", "Gönül'ü engelle", "Mert Can'ı engelle", "İrem'i engelle", "Ilgaz'ı engelle"],
  );
  assert.equal(api.blockMenuLabel(''), 'Bu üyeyi engelle');
  assert.equal(api.blockMenuLabel('1234'), 'Bu üyeyi engelle');
  assert.equal(api.canOfferBlock(45, 'Ayşe', 9), true);
  assert.equal(api.canOfferBlock(9, 'Ben', 9), false, 'never yourself');
  assert.equal(api.canOfferBlock(null, 'Eski üye', 9), false, 'anonymised author');
  assert.equal(api.canOfferBlock(45, 'Ayşe', null), false, 'guests');
  assert.equal(api.canOfferBlock(3, 'Tariften Topluluğu', 9), false, 'community account cannot be blocked');
  assert.equal(api.blockDateTr('2026-10-22T09:02:41+00:00', Date.parse('2026-11-01T00:00:00Z')), '22 Eki');
  assert.equal(api.blockDateTr('2025-10-19T12:00:00+00:00', Date.parse('2026-11-01T00:00:00Z')), '19 Eki 2025');
  assert.equal(api.blockDateTr('2026-10-22T08:01:40Z', Date.parse('2026-11-01T00:00:00Z')), '22 Eki', 'Core sends ISO 8601 UTC');
  assert.equal(api.blockDateTr('nope'), '');
});

// ---------------------------------------------------------------------------
// Session store

function loadStore() {
  const react = { useEffect: () => {}, useSyncExternalStore: (_s, get) => get() };
  return loadTS('lib/member-blocks.ts', { react, './report-block-api': api });
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('store: one GET per session, immediate hide on block, unblock, account switch and logout invalidate', async () => {
  const store = loadStore();
  const calls = stubFetch([
    { status: 200, json: { blocks: [{ user_id: 45, name: 'Ayşe', blocked_at: 'x' }], max: 500 } },
    { status: 201, json: { user_id: 46, blocked: true } },
    { status: 200, json: { blocks: [{ user_id: 46, name: 'Can', blocked_at: 'y' }, { user_id: 45, name: 'Ayşe', blocked_at: 'x' }] } },
    { status: 200, json: { user_id: 45, blocked: false } },
    { status: 200, json: { blocks: [{ user_id: 46, name: 'Can', blocked_at: 'y' }] } },
    { status: 200, json: { blocks: [{ user_id: 99, name: 'Başka', blocked_at: 'z' }] } },
  ]);
  await Promise.all([store.ensureMemberBlocks('jwt', 9), store.ensureMemberBlocks('jwt', 9)]);
  await store.ensureMemberBlocks('jwt', 9);
  assert.equal(calls.length, 1, 'loaded once; concurrent readers share the request');
  assert.equal(store.peekMemberBlocks().status, 'ready');
  assert.deepEqual([...store.peekMemberBlocks().ids], [45]);

  await store.blockAndRemember('jwt', { id: 46, name: 'Can' });
  assert.ok(store.peekMemberBlocks().ids.has(46), 'hidden at once, before the refresh returns');
  assert.equal(calls[1].method, 'POST');
  await tick(); await tick();
  assert.equal(calls[2].url, `${BASE}/me/blocks`, 're-read after a block');

  await store.unblockAndForget('jwt', 45);
  assert.equal(store.peekMemberBlocks().ids.has(45), false, 'visible again at once');
  assert.equal(calls[3].url, `${BASE}/me/blocks/45`);
  await tick(); await tick();
  assert.deepEqual([...store.peekMemberBlocks().ids], [46]);

  store.hideCommentLocally(501);
  assert.ok(store.peekMemberBlocks().hiddenComments.has(501));

  await store.ensureMemberBlocks('jwt-2', 10);
  assert.deepEqual([...store.peekMemberBlocks().ids], [99], 'another account loads its own list');
  assert.equal(store.peekMemberBlocks().hiddenComments.size, 0);
  assert.equal(calls.length, 6);

  store.forgetMemberBlocks();
  assert.equal(store.peekMemberBlocks().owner, null);
  assert.equal(store.peekMemberBlocks().ids.size, 0, 'logout clears the list');
  await store.ensureMemberBlocks(null, null);
  assert.equal(calls.length, 6, 'guests fetch nothing');
});

test('store: a failed block leaves the list unchanged; a failed read backs off', async () => {
  const store = loadStore();
  const calls = stubFetch([
    { status: 500, json: null },
    { status: 403, json: { code: 'block_not_allowed', message: 'x' } },
  ]);
  await store.ensureMemberBlocks('jwt', 9);
  assert.equal(store.peekMemberBlocks().status, 'error');
  await store.ensureMemberBlocks('jwt', 9);
  assert.equal(calls.length, 1, 'no hammering after a failure');
  await assert.rejects(store.blockAndRemember('jwt', { id: 3, name: 'Editör' }), e => e.code === 'not_allowed');
  assert.equal(store.peekMemberBlocks().ids.size, 0);
});

// ---------------------------------------------------------------------------
// Wiring

test('API code lives in its own module; lib/api.ts and its imports are untouched', () => {
  const apiSource = read('lib/api.ts');
  assert.doesNotMatch(apiSource, /\/reports|\/me\/blocks|report-block-api|member-blocks/);
  assert.doesNotMatch(read('lib/report-block-api.ts'), /^import /m, 'pure module: no imports');
  const store = read('lib/member-blocks.ts');
  assert.deepEqual([...store.matchAll(/from '([^']+)'/g)].map(m => m[1]).sort(), ['./report-block-api', 'react']);
  assert.doesNotMatch(store, /AsyncStorage|SecureStore|FileSystem/, 'block list stays in memory');
  assert.match(read('context/AuthContext.tsx'), /forgetMemberBlocks\(\);[^\n]*\n\s*forgetKitchenProfileCache\(\);/, 'logout forgets the list');
});

test('recipe detail: ⋯ menu for others\' recipes, placeholder with "Yine de göster" and "Engeli kaldır"', () => {
  const detail = read('app/recipe/[slug].tsx');
  assert.match(detail, /const safety = useContentSafety\(\{ onToast: setToast \}\);/);
  assert.match(detail, /\{!ownRecipe && !isPrivateRecipe\(recipe\) \? \(/);
  assert.match(detail, /safety\.open\(\{\s*type: 'recipe', id: recipe\.id/);
  assert.match(detail, /name="ellipsis-horizontal"/);
  assert.match(detail, /shouldShowBlockedPlaceholder\(\{ recipe, blockedIds, listReady, revealed: revealedBlocked, viewerId: user\?\.id \?\? null \}\)/);
  assert.match(detail, /\{BLOCKED_PLACEHOLDER_TITLE\}/);
  assert.match(detail, /Yine de göster/);
  assert.match(detail, /Engeli kaldır/);
  assert.match(detail, /unblockAndForget\(token, authorId\)/);
  assert.match(detail, /<CommentSection recipeId=\{recipe\.id\} onToast=\{setToast\} \/>/);
  assert.match(detail, /\{safety\.element\}/);
  // The block flow itself
  const flow = read('components/safety/useContentSafety.tsx');
  assert.match(flow, /Alert\.alert\(blockConfirmTitle\(author\.name\), BLOCK_CONFIRM_MESSAGE, \[/);
  assert.match(flow, /error\?\.code === 'not_allowed'/);
  assert.match(flow, /if \(!memberToken\) \{ router\.push\('\/login'\); return; \}/, 'guests: Bildir → login');
  assert.match(flow, /canOfferBlock\(menuTarget\.author\.id, menuTarget\.author\.name, user\?\.id \?\? null\)/);
  assert.match(flow, /blockMenuLabel\(menuTarget\.author\.name\)/);
  assert.match(flow, /if \(target\.type === 'comment'\) hideCommentLocally\(target\.id\);/);
  assert.match(flow, /await afterModalDismiss\(\);/, 'iOS: next modal/alert only after the sheet closes');
});

test('report sheet: contract reasons, keyboard-safe, details counter, server message toast', () => {
  const sheet = read('components/safety/ReportSheet.tsx');
  assert.match(sheet, /REPORT_REASONS\.map\(/);
  assert.match(sheet, /<KeyboardAvoidingView/);
  assert.match(sheet, /keyboardShouldPersistTaps="handled"/);
  assert.match(sheet, /submitReport\(memberToken, \{/);
  assert.match(sheet, /if \(failure\.code === 'not_found'\) \{ onGone\(failure\.message, target\); return; \}/);
  assert.match(sheet, /REPORT_DETAILS_MAX\.toLocaleString\('tr-TR'\)/);
  assert.match(sheet, /accessibilityRole="radio"/);
  assert.doesNotMatch(sheet, /dangerouslySetInnerHTML/);
});

test('comments: ⋯ (and long-press) on others\' comments; blocked and reported comments hidden', () => {
  const comments = read('components/CommentSection.tsx');
  assert.match(comments, /const \{ visibleComments \} = useBlockFilter\(\);/);
  assert.match(comments, /const shownComments = useMemo\(\(\) => visibleComments\(comments\), \[visibleComments, comments\]\);/);
  assert.match(comments, /data=\{shownComments\}/);
  assert.match(comments, /\{!isOwn\(item\) \? \(/);
  assert.match(comments, /onLongPress=\{isOwn\(item\) \? undefined : \(\) => openActions\(item\)\}/);
  assert.match(comments, /type: 'comment',/);
  assert.match(comments, /\{safety\.element\}/);
});

test('every recipe list hides blocked members (Keşfet/search/categories, home, Defterim, profile, collections, menus, similar)', () => {
  const surfaces = {
    'app/(tabs)/recipes.tsx': /data=\{shownRecipes\}/,
    'app/(tabs)/index.tsx': /shownPopular\.map\([\s\S]*shownEditors\.map\(/,
    'app/(tabs)/defterim.tsx': /data=\{shownItems\}/,
    'app/(tabs)/profile.tsx': /data=\{shownRecipes\}/,
    'app/collections/index.tsx': /data=\{loadingRecipes \? \[\] : shownRecipes\}/,
    'app/menu/[slug].tsx': /recipes: visibleRecipes\(section\.recipes\)/,
    'app/recipe/[slug].tsx': /shownSimilar\.map\(/,
  };
  for (const [file, pattern] of Object.entries(surfaces)) {
    const src = read(file);
    assert.match(src, /useBlockFilter\(\)/, file);
    assert.match(src, pattern, file);
  }
  const card = read('components/RecipeCard.tsx');
  assert.match(card, /if \(isRecipeHidden\(recipe\)\) return null;/, 'RecipeCard safety net');
  // Every screen that renders a RecipeCard list goes through the filter.
  const walk = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(rel) : /\.tsx$/.test(entry.name) ? [rel] : [];
  });
  for (const file of walk('app')) {
    if (/<RecipeCard /.test(read(file))) assert.match(read(file), /useBlockFilter\(\)/, `${file} renders recipe cards without the block filter`);
  }
});

test('Engellenen üyeler: registered route, profile row, avatar/name/date and unblock', () => {
  assert.match(read('app/_layout.tsx'), /name="profile\/blocks"[\s\S]{0,120}headerTitle: 'Engellenen üyeler'/);
  const profile = read('app/(tabs)/profile.tsx');
  assert.match(profile, /router\.push\('\/profile\/blocks'\)/);
  assert.match(profile, /<Text style=\{styles\.settingsRowText\}>Engellenen üyeler<\/Text>/);
  const screen = read('app/profile/blocks.tsx');
  assert.match(screen, /useMemberBlocks\(memberToken, user\?\.id \?\? null\)/);
  assert.match(screen, /unblockAndForget\(memberToken, item\.user_id\)/);
  assert.match(screen, /blockDateTr\(item\.blocked_at\)/);
  assert.match(screen, /source=\{\{ uri: item\.avatar \}\}/);
  assert.match(screen, /Engeli kaldır/);
  assert.match(screen, /router\.push\('\/login'\)/, 'guests are asked to sign in');
});

test('account deletion copy: recipes stay anonymously under "Tariften Topluluğu", drafts deleted, comments anonymised', () => {
  const profile = read('app/(tabs)/profile.tsx');
  const confirm = profile.match(/const ACCOUNT_DELETE_CONFIRM = ([\s\S]*?);\n/);
  assert.ok(confirm, 'confirmation copy constant');
  const text = confirm[1];
  assert.match(text, /geri alınamaz/);
  assert.match(text, /Yayındaki tariflerin sitede anonim olarak "Tariften Topluluğu" adıyla kalmaya devam eder/);
  assert.match(text, /Taslakların, özel tariflerin/);
  assert.match(text, /silinir/);
  assert.match(text, /yorumların anonimleştirilir/);
  assert.match(profile, /Alert\.alert\(\s*'Hesabı Sil',\s*ACCOUNT_DELETE_CONFIRM,/);
  assert.match(profile, /Hesabın silindi\. Yayındaki tariflerin anonim olarak sitede kalmaya devam edecek\./);
});

test('CI runs this suite', () => {
  assert.match(read('.github/workflows/mobile-ci.yml'), /node --test scripts\/check-report-block\.test\.cjs/);
});
