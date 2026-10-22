'use strict';
/**
 * P11 kişisel tarif notları + "Evime göre uyarla (N kişi)".
 * Contracts: tariften-core docs/RECIPE_NOTES.md (Core 1.0.59) and
 * docs/AI_PERSONALIZATION_ALLERGENS.md, "Hane halkına göre uyarlama isteğe bağlı" (Core 1.0.62).
 * Covers the notes API client (URLs, methods, empty → delete, errors), the
 * adapt_household flag (sent only when on), and screen/route registration.
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
const notes = loadTS('lib/recipe-notes-api.ts');
const household = loadTS('lib/household-adapt.ts');

function stubFetch(replies) {
  const calls = [];
  const queue = [...replies];
  global.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = queue.shift() || { status: 200, json: {} };
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.json };
  };
  return calls;
}
const realFetch = global.fetch;
test.afterEach(() => { global.fetch = realFetch; });

// ---------------------------------------------------------------------------
// Notes API client

test('GET my-note: authenticated, uncached, null when there is no note', async () => {
  const calls = stubFetch([
    { status: 200, json: { success: true, recipe_id: 1234, note: { recipe_id: 1234, note: 'Tuzu azalt.', created_at: 'a', updated_at: 'b' }, max_length: 2000 } },
    { status: 200, json: { success: true, recipe_id: 1234, note: null, max_length: 2000 } },
  ]);
  const withNote = await notes.getMyRecipeNote('jwt', 1234);
  assert.equal(calls[0].url, `${BASE}/recipes/1234/my-note`);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].headers.Authorization, 'Bearer jwt');
  assert.equal(calls[0].headers['Cache-Control'], 'no-store');
  assert.equal(calls[0].body, undefined);
  assert.equal(withNote.note.note, 'Tuzu azalt.');
  assert.equal(withNote.maxLength, 2000);
  const none = await notes.getMyRecipeNote('jwt', 1234);
  assert.equal(none.note, null);
});

test('PUT saves the note; empty or whitespace-only text is a delete on Core', async () => {
  const calls = stubFetch([
    { status: 201, json: { success: true, recipe_id: 7, note: { recipe_id: 7, note: 'Tuzu azalt,\n10 dk fazla pişir.', created_at: 'x', updated_at: 'x' }, created: true, deleted: false } },
    { status: 200, json: { success: true, recipe_id: 7, note: null, deleted: true } },
  ]);
  const saved = await notes.saveMyRecipeNote('jwt', 7, '  Tuzu azalt,\r\n10 dk fazla pişir.  ');
  assert.equal(calls[0].url, `${BASE}/recipes/7/my-note`);
  assert.equal(calls[0].method, 'PUT');
  assert.equal(calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(Object.keys(calls[0].body), ['note']);
  assert.equal(saved.note.note, 'Tuzu azalt,\n10 dk fazla pişir.', 'screen shows the sanitised server text');
  assert.equal(saved.created, true);
  const cleared = await notes.saveMyRecipeNote('jwt', 7, '   \n ');
  assert.equal(calls[1].method, 'PUT', 'clearing uses PUT, not a separate DELETE');
  assert.deepEqual(calls[1].body, { note: '' });
  assert.equal(cleared.note, null);
  assert.equal(cleared.deleted, true);
});

test('DELETE removes the note; /me/notes pages newest first with per_page', async () => {
  const calls = stubFetch([
    { status: 200, json: { success: true, recipe_id: 987, deleted: true } },
    { status: 200, json: { success: true, page: 2, per_page: 20, total: 22, pages: 2, notes: [
      { recipe_id: 1234, available: true, slug: 'mercimek-corbasi', title: 'Mercimek Çorbası', image: 'https://x/y.jpg', note_excerpt: 'Tuzu azalt', updated_at: '2026-10-22T09:02:41+00:00' },
      { recipe_id: 987, available: false, slug: 'leak', title: 'Leak', image: 'https://x/z.jpg', note_excerpt: 'Fırını düşük tut…', updated_at: '2026-10-19T17:45:00+00:00' },
      { recipe_id: 'bad' },
    ] } },
  ]);
  const removed = await notes.deleteMyRecipeNote('jwt', 987);
  assert.equal(calls[0].url, `${BASE}/recipes/987/my-note`);
  assert.equal(calls[0].method, 'DELETE');
  assert.equal(removed.deleted, true);
  const list = await notes.getMyNotesPage('jwt', 2);
  assert.equal(calls[1].url, `${BASE}/me/notes?page=2&per_page=20`);
  assert.equal(calls[1].method, 'GET');
  assert.equal(list.notes.length, 2, 'malformed rows are dropped');
  assert.equal(list.notes[0].slug, 'mercimek-corbasi');
  assert.equal(list.notes[1].available, false);
  assert.equal(list.notes[1].slug, null, 'an unavailable recipe never exposes slug/title/image');
  assert.equal(list.notes[1].title, null);
  assert.equal(list.total, 22);
  assert.equal(list.pages, 2);
  const clamp = stubFetch([{ status: 200, json: { notes: [], page: 1, pages: 0, total: 0 } }]);
  await notes.getMyNotesPage('jwt', 0, 500);
  assert.equal(clamp[0].url, `${BASE}/me/notes?page=1&per_page=50`, 'Core caps per_page at 50');
});

test('errors: 400 too long, 429 retry_after, 409 limit, 401, 404 become Turkish messages with codes', async () => {
  stubFetch([{ status: 400, json: { code: 'recipe_note_too_long', message: 'x', data: { status: 400, max_length: 2000 } } }]);
  await assert.rejects(notes.saveMyRecipeNote('jwt', 1, 'a'), e => e.code === 'too_long' && /2\.000 karakter/.test(e.message));
  stubFetch([{ status: 429, json: { code: 'recipe_note_rate_limited', message: 'x', data: { status: 429, retry_after: 600 } } }]);
  await assert.rejects(notes.saveMyRecipeNote('jwt', 1, 'a'), e => e.code === 'rate_limited' && e.retryAfter === 600 && /10 dakika sonra/.test(e.message));
  stubFetch([{ status: 409, json: { code: 'recipe_note_limit', message: 'x', data: { status: 409 } } }]);
  await assert.rejects(notes.saveMyRecipeNote('jwt', 1, 'a'), e => e.code === 'limit' && /Notlarım/.test(e.message));
  stubFetch([{ status: 401, json: { code: 'rest_forbidden', message: 'x', data: { status: 401 } } }]);
  await assert.rejects(notes.getMyRecipeNote('jwt', 1), e => e.code === 'auth' && /giriş yap/.test(e.message));
  stubFetch([{ status: 404, json: { code: 'recipe_not_found', message: 'x', data: { status: 404 } } }]);
  await assert.rejects(notes.getMyRecipeNote('jwt', 1), e => e.code === 'not_found' && e.message === 'Bu tarif artık erişilebilir değil.');
  const none = stubFetch([]);
  await assert.rejects(notes.getMyRecipeNote('', 1), e => e.code === 'auth');
  await assert.rejects(notes.saveMyRecipeNote('jwt', 0, 'a'), e => e.code === 'not_found');
  assert.equal(none.length, 0, 'guests and invalid ids never hit the network');
  global.fetch = async () => { throw new TypeError('Network request failed'); };
  await assert.rejects(notes.getMyNotesPage('jwt', 1), e => e.code === 'network' && /Bağlantı/.test(e.message));
});

test('character counting matches Core: trimmed, multi-byte letters count once', () => {
  assert.equal(notes.noteLength('  çğıöşü  '), 6);
  assert.equal(notes.noteLength('🍅🍅'), 2);
  assert.equal(notes.noteTooLong('ş'.repeat(2000)), false);
  assert.equal(notes.noteTooLong('ş'.repeat(2001)), true);
  assert.equal(notes.RECIPE_NOTE_MAX_LENGTH, 2000);
  assert.equal(notes.noteDateTr('not a date'), '');
  assert.equal(notes.noteDateTr('2026-10-22T09:02:41+00:00', Date.parse('2026-11-01T00:00:00Z')), '22 Eki');
  assert.equal(notes.noteDateTr('2025-10-19T12:00:00+00:00', Date.parse('2026-11-01T00:00:00Z')), '19 Eki 2025');
});

// ---------------------------------------------------------------------------
// "Evime göre uyarla (N kişi)"

test('household size 1–12 shows the toggle; anything else hides it', () => {
  assert.equal(household.householdAdaptSize(1), 1);
  assert.equal(household.householdAdaptSize(12), 12);
  for (const bad of [0, 13, null, undefined, 2.5, '4', NaN]) assert.equal(household.householdAdaptSize(bad), null, String(bad));
  assert.equal(household.householdAdaptLabel(4), 'Evime göre uyarla (4 kişi)');
  assert.equal(household.shouldAdaptHousehold(4, true), true);
  assert.equal(household.shouldAdaptHousehold(4, false), false);
  assert.equal(household.shouldAdaptHousehold(null, true), false, 'hidden toggle never sends the flag');
});

test('POST /ai/generate sends adapt_household: true only when on, otherwise omits it', async () => {
  const api = loadTS('lib/api.ts', {
    './recipeUtils': { parseIngredients: list => list, parseSteps: list => list },
    './recipe-publish': { RecipeCreateUnconfirmedError: class extends Error {} },
    './allergen-ui': { allergenConflictFrom: () => null },
  });
  const calls = stubFetch([
    { status: 200, json: { success: true, recipe: {} } },
    { status: 200, json: { success: true, recipe: {} } },
    { status: 200, json: { success: true, recipe: {} } },
  ]);
  await api.generateAIRecipe('jwt', 'mercimek', { adaptHousehold: true });
  await api.generateAIRecipe('jwt', 'mercimek', { adaptHousehold: false });
  await api.generateAIRecipe('jwt', 'mercimek');
  assert.equal(calls[0].url, 'https://api.tariften.com/wp-json/tariften/v1/ai/generate');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { ingredients: 'mercimek', type: 'suggest', adapt_household: true });
  assert.deepEqual(calls[1].body, { ingredients: 'mercimek', type: 'suggest' });
  assert.ok(!('adapt_household' in calls[2].body));
});

test('every /ai/generate caller shows the toggle and passes the guarded flag', () => {
  const callers = ['app/(tabs)/recipes.tsx', 'app/(tabs)/pantry.tsx'];
  for (const file of callers) {
    const src = read(file);
    assert.match(src, /const householdSize = useHouseholdAdaptSize\(user \? token : null\);/, file);
    assert.match(src, /const \[adaptHousehold, setAdaptHousehold\] = useState\(false\);/, `${file}: default OFF`);
    assert.match(src, /generateAIRecipe\(token, \w+, \{\s*adaptHousehold: shouldAdaptHousehold\(householdSize, adaptHousehold\),\s*\}\)/, file);
    assert.match(src, /<HouseholdAdaptToggle size=\{householdSize\} value=\{adaptHousehold\} onValueChange=\{setAdaptHousehold\}/, file);
  }
  const toggle = read('components/recipe/HouseholdAdaptToggle.tsx');
  assert.match(toggle, /if \(size === null\) return null;/, 'hidden without a household size');
  assert.match(toggle, /householdAdaptLabel\(size\)/);
  assert.match(toggle, /useKitchenProfile\(token \|\| null\)/, 'reads the shared kitchen-profile cache');
});

// ---------------------------------------------------------------------------
// Screens

test('recipe page: private Notum card for members, quiet login hint for guests', () => {
  const detail = read('app/recipe/[slug].tsx');
  assert.match(detail, /<RecipeNoteCard recipeId=\{recipe\.id\} onToast=\{setToast\} \/>/);
  assert.doesNotMatch(read('lib/api.ts'), /my-note|my_note/, 'the note never rides on the public recipe payload');
  const card = read('components/recipe/RecipeNoteCard.tsx');
  assert.match(card, /const memberToken = user && token \? token : null;/);
  assert.match(card, /if \(!memberToken\) \{[\s\S]*?router\.push\('\/login'\)/, 'guests get a login hint, no request');
  assert.match(card, /getMyRecipeNote\(memberToken, recipeId, controller\.signal\)/);
  assert.match(card, /saveMyRecipeNote\(memberToken, recipeId, draft\)/);
  assert.match(card, /deleteMyRecipeNote\(memberToken, recipeId\)/);
  assert.match(card, /<KeyboardAvoidingView/, 'keyboard-safe editor');
  assert.match(card, /length\.toLocaleString\('tr-TR'\)\} \/ \{maxLength\.toLocaleString\('tr-TR'\)\}/, 'character counter');
  assert.match(card, /Notum/);
  assert.match(card, /Yalnızca sen görürsün/);
  assert.doesNotMatch(card, /AsyncStorage|SecureStore|dangerouslySetInnerHTML/, 'note stays in memory, rendered as text');
});

test('Notlarım is registered and reachable from the profile tab', () => {
  assert.match(read('app/_layout.tsx'), /name="profile\/notes"[\s\S]{0,120}headerTitle: 'Notlarım'/);
  const profile = read('app/(tabs)/profile.tsx');
  assert.match(profile, /router\.push\('\/profile\/notes'\)/);
  assert.match(profile, /<Text style=\{styles\.settingsRowText\}>Notlarım<\/Text>/);
  const screen = read('app/profile/notes.tsx');
  assert.match(screen, /getMyNotesPage\(memberToken, nextPage, MY_NOTES_PER_PAGE, controller\.signal\)/);
  assert.match(screen, /onEndReached=/, 'paged');
  assert.match(screen, /Bu tarif artık erişilebilir değil/);
  assert.match(screen, /deleteMyRecipeNote\(memberToken, item\.recipe_id\)/);
  assert.match(screen, /pathname: '\/recipe\/\[slug\]', params: \{ slug: item\.slug \}/);
});

test('CI runs this suite', () => {
  assert.match(read('.github/workflows/mobile-ci.yml'), /node --test scripts\/check-recipe-notes\.test\.cjs/);
});
