'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file, fetchImpl) => {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  Function('module', 'exports', 'require', 'fetch', out)(mod, mod.exports, () => ({}), fetchImpl || (() => { throw new Error('no network in tests'); }));
  return mod.exports;
};

const ui = load('lib/allergen-ui.ts');

// Option labels exactly as Core 1.0.51 sends them (GET /me/kitchen-profile → options.allergens, trimmed).
const LABELS = [
  { value: 'gluten', label: 'Gluten içeren tahıllar' },
  { value: 'eggs', label: 'Yumurta' },
  { value: 'peanuts', label: 'Yer fıstığı' },
  { value: 'milk', label: 'Süt ve süt ürünleri' },
  { value: 'tree_nuts', label: 'Sert kabuklu yemişler (fındık, ceviz, badem…)' },
];
const NOTE = 'Malzeme adlarından otomatik çıkarılır; etiket okumanın yerini tutmaz.';
const profile = (allergens, consent = '2026-10-22T08:00:00+00:00') => ({
  version: 1, household_size: null, diets: [], dislikes: [], equipment: [], experience: null, time_preference: null,
  allergens, allergen_consent_at: consent, completed_at: null, updated_at: null,
});

test('recipe allergens are read defensively; a key is never in both lists', () => {
  assert.equal(ui.normaliseRecipeAllergens(undefined), null, 'older Core: no summary, no band');
  assert.equal(ui.normaliseRecipeAllergens([]), null);
  assert.deepEqual(ui.normaliseRecipeAllergens({ contains: ['milk', 'milk', 3, ''], possible: ['milk', 'gluten'] }),
    { contains: ['milk'], possible: ['gluten'] });
  assert.deepEqual(ui.normaliseRecipeAllergens({}), { contains: [], possible: [] });
});

test('only consented, declared allergens that the recipe has are matched (EU order kept)', () => {
  const summary = { contains: ['gluten', 'peanuts', 'milk'], possible: ['tree_nuts'] };
  assert.equal(ui.matchProfileAllergens(summary, null), null, 'signed out / not loaded');
  assert.equal(ui.matchProfileAllergens(summary, profile([])), null, 'no allergens');
  assert.equal(ui.matchProfileAllergens(summary, profile([{ key: 'milk', type: 'allergy' }], null)), null, 'no consent');
  assert.equal(ui.matchProfileAllergens(summary, profile([{ key: 'eggs', type: 'allergy' }])), null, 'no overlap');
  assert.equal(ui.matchProfileAllergens(undefined, profile([{ key: 'milk', type: 'allergy' }])), null);
  assert.deepEqual(
    ui.matchProfileAllergens(summary, profile([{ key: 'milk', type: 'intolerance' }, { key: 'peanuts', type: 'allergy' }, { key: 'tree_nuts', type: 'allergy' }])),
    { contains: ['peanuts', 'milk'], possible: ['tree_nuts'] },
    'intolerance counts like allergy; recipe order, not profile order',
  );
});

test('band copy uses Core labels and Turkish grammar', () => {
  assert.equal(ui.joinTr(['A']), 'A');
  assert.equal(ui.joinTr(['A', 'B']), 'A ve B');
  assert.equal(ui.joinTr(['A', 'B', 'C']), 'A, B ve C');

  const one = ui.allergenBand({ contains: ['peanuts'], possible: [] }, profile([{ key: 'peanuts', type: 'allergy' }]), LABELS);
  assert.deepEqual(one.lines, ['Bu tarif profilindeki Yer fıstığı alerjenini içeriyor.']);
  assert.equal(one.tone, 'contains');
  assert.equal(one.note, NOTE);
  assert.match(one.accessibilityLabel, /^Alerjen uyarısı\. Bu tarif profilindeki Yer fıstığı alerjenini içeriyor\. Malzeme adlarından/);

  const maybe = ui.allergenBand({ contains: [], possible: ['milk'] }, profile([{ key: 'milk', type: 'allergy' }]), LABELS);
  assert.deepEqual(maybe.lines, ['Bu tarif profilindeki Süt ve süt ürünleri alerjenini içerebilir.']);
  assert.equal(maybe.tone, 'possible');

  const both = ui.allergenBand(
    { contains: ['gluten', 'eggs'], possible: ['milk'] },
    profile([{ key: 'eggs', type: 'allergy' }, { key: 'gluten', type: 'allergy' }, { key: 'milk', type: 'allergy' }]), LABELS);
  assert.deepEqual(both.lines, [
    'Bu tarif profilindeki Gluten içeren tahıllar ve Yumurta alerjenlerini içeriyor.',
    'Bu tarif profilindeki Süt ve süt ürünleri alerjenini içerebilir.',
  ]);

  // A key without a label is never dropped silently.
  assert.equal(ui.allergenSentence(['lupin'], LABELS, 'contains'), 'Bu tarif profilindeki alerjenlerden birini içeriyor.');
  assert.equal(ui.allergenSentence(['lupin', 'milk'], LABELS, 'possible'), 'Bu tarif profilindeki alerjenlerden bazılarını içerebilir.');
  assert.equal(ui.allergenSentence([], LABELS, 'contains'), null);

  assert.equal(ui.allergenBand({ contains: ['milk'], possible: [] }, profile([{ key: 'eggs', type: 'allergy' }]), LABELS), null);
  assert.equal(ui.allergenBand({ contains: ['milk'], possible: [] }, null, LABELS), null);
});

test('422 ai_allergen_conflict becomes a typed error with the conflicting ingredients', () => {
  const body = {
    success: false, code: 'ai_allergen_conflict',
    message: 'Bu tarif alerji listendeki malzemeleri (süt ve süt ürünleri) içermeden üretilemedi. Güvenliğin için tarifi göstermiyoruz; farklı bir istekle tekrar dene. Uyarılar etiket okumanın yerini tutmaz.',
    allergen_conflicts: [{ key: 'milk', label: 'Süt ve süt ürünleri', ingredients: ['Tereyağı', 'Krema'] }, { key: 'x' }, 'bad'],
  };
  assert.equal(ui.allergenConflictFrom(500, body), null);
  assert.equal(ui.allergenConflictFrom(422, { code: 'other' }), null);
  assert.equal(ui.allergenConflictFrom(422, null), null);
  const err = ui.allergenConflictFrom(422, body);
  assert.ok(err instanceof ui.AIAllergenConflictError);
  assert.ok(err instanceof Error);
  assert.equal(err.code, 'ai_allergen_conflict');
  assert.equal(err.message, body.message);
  assert.deepEqual(err.conflicts, [{ key: 'milk', label: 'Süt ve süt ürünleri', ingredients: ['Tereyağı', 'Krema'] }, { key: 'x', label: '', ingredients: [] }]);

  const copy = ui.allergenConflictCopy(err);
  assert.equal(copy.title, 'Alerji listene uygun tarif çıkmadı');
  assert.equal(copy.message, `${body.message}\n\nSorunlu malzemeler:\n• Süt ve süt ürünleri: Tereyağı, Krema`);

  const bare = ui.allergenConflictFrom(422, { code: 'ai_allergen_conflict' });
  assert.match(bare.message, /alerji listene uygun/);
  assert.equal(ui.allergenConflictCopy(bare).message, bare.message, 'no list when Core sent none');
});

test('allergen_warning is read from the recipe (or the top level)', () => {
  const warning = 'Bazı malzemeler alerji listendekileri içerebilir (Bitter çikolata). Etiketini kontrol et; uyarılar etiket okumanın yerini tutmaz.';
  assert.equal(ui.allergenWarningFrom({ success: true, recipe: { allergen_warning: ` ${warning} ` } }), warning);
  assert.equal(ui.allergenWarningFrom({ success: true, allergen_warning: warning, recipe: {} }), warning);
  assert.equal(ui.allergenWarningFrom({ success: true, recipe: { allergen_warning: '' } }), null);
  assert.equal(ui.allergenWarningFrom(null), null);
});

// --- Session cache in lib/kitchen-profile.ts ---------------------------------------------

const OPTIONS = {
  household_size: { min: 1, max: 12 },
  diets: [{ value: 'vegan', label: 'Vegan' }],
  equipment: [], experience: [], time_preference: [],
  allergens: LABELS,
  reactions: [{ value: 'allergy', label: 'Alerji' }],
  dislikes: { max_items: 30, max_length: 40 },
  allergen_notice: 'Alerji bilgin yalnızca öneriler için kullanılır.',
};
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fakeCore() {
  const calls = [];
  let next = null;
  const fetchImpl = (url, init = {}) => {
    calls.push({ method: init.method || 'GET', auth: init.headers && init.headers.Authorization });
    if (next) { const r = next; next = null; return r(); }
    if ((init.method || 'GET') === 'PUT') {
      const body = JSON.parse(init.body);
      return Promise.resolve(json(200, { success: true, profile: { allergens: body.allergens || [], allergen_consent_at: '2026-10-22T09:00:00Z' } }));
    }
    return Promise.resolve(json(200, { success: true, profile: { allergens: [{ key: 'milk', type: 'allergy' }], allergen_consent_at: '2026-10-22T08:00:00Z' }, options: OPTIONS }));
  };
  return { calls, fetchImpl, once: fn => { next = fn; } };
}

test('profile is read once per session and token; concurrent readers share one request', async () => {
  const core = fakeCore();
  const kp = load('lib/kitchen-profile.ts', core.fetchImpl);
  let emits = 0;
  kp.subscribeKitchenProfile(() => { emits += 1; });
  assert.equal(kp.peekKitchenProfile('t1'), null);
  const [a, b] = await Promise.all([kp.loadKitchenProfileOnce('t1'), kp.loadKitchenProfileOnce('t1')]);
  assert.equal(core.calls.length, 1);
  assert.equal(a, b);
  assert.deepEqual(a.profile.allergens, [{ key: 'milk', type: 'allergy' }]);
  assert.equal(kp.peekKitchenProfile('t1'), a, 'stable snapshot for useSyncExternalStore');
  assert.equal(emits, 1);
  await kp.loadKitchenProfileOnce('t1');
  assert.equal(core.calls.length, 1, 'cached');
  assert.equal(kp.peekKitchenProfile('other'), null, 'never served to another token');
  await kp.loadKitchenProfileOnce('t2');
  assert.equal(core.calls.length, 2);
  assert.equal(core.calls[1].auth, 'Bearer t2');
});

test('saving the kitchen profile refreshes the cache; delete and sign-out forget it', async () => {
  const core = fakeCore();
  const kp = load('lib/kitchen-profile.ts', core.fetchImpl);
  const first = await kp.loadKitchenProfileOnce('t1');
  const saved = await kp.updateKitchenProfile('t1', { allergens: [{ key: 'peanuts', type: 'allergy' }], allergen_consent: true });
  const after = kp.peekKitchenProfile('t1');
  assert.notEqual(after, first);
  assert.deepEqual(after.profile, saved);
  assert.equal(after.options, first.options, 'options kept; no extra GET');
  assert.equal(core.calls.filter(c => c.method === 'GET').length, 1);

  core.once(() => Promise.resolve(json(200, { success: true })));
  await kp.deleteKitchenProfile('t1');
  assert.equal(kp.peekKitchenProfile('t1'), null);

  await kp.loadKitchenProfileOnce('t1');
  let emits = 0;
  kp.subscribeKitchenProfile(() => { emits += 1; });
  kp.invalidateKitchenProfileCache();
  assert.equal(kp.peekKitchenProfile('t1'), null);
  assert.equal(emits, 1, 'invalidation wakes readers so they re-fetch');

  await kp.loadKitchenProfileOnce('t1');
  emits = 0;
  kp.forgetKitchenProfileCache();
  assert.equal(kp.peekKitchenProfile('t1'), null);
  assert.equal(emits, 0, 'sign-out never wakes a reader that would re-fetch with the old token');
});

test('a read that started before a save never overwrites it; failures back off', async () => {
  const core = fakeCore();
  const kp = load('lib/kitchen-profile.ts', core.fetchImpl);
  let release;
  core.once(() => new Promise(resolve => { release = () => resolve(json(200, { success: true, profile: { allergens: [] , allergen_consent_at: null }, options: OPTIONS })); }));
  const pending = kp.loadKitchenProfileOnce('t1');
  let woke = 0;
  kp.subscribeKitchenProfile(() => { woke += 1; });
  await kp.updateKitchenProfile('t1', { allergens: [{ key: 'eggs', type: 'allergy' }], allergen_consent: true });
  assert.equal(woke, 1, 'the save wakes readers even though their snapshot was null');
  release();
  assert.equal(await pending, null, 'stale read dropped');
  assert.equal(woke, 1, 'a dropped read does not notify');
  assert.equal(kp.peekKitchenProfile('t1'), null, 'cache invalidated, next reader fetches fresh');

  const failing = load('lib/kitchen-profile.ts', () => Promise.reject(new Error('offline')));
  assert.equal(await failing.loadKitchenProfileOnce('t1'), null);
  let tries = 0;
  const counted = load('lib/kitchen-profile.ts', () => { tries += 1; return Promise.reject(new Error('offline')); });
  await counted.loadKitchenProfileOnce('t1');
  await counted.loadKitchenProfileOnce('t1');
  assert.equal(tries, 1, 'no retry storm across recipe screens');
  await counted.loadKitchenProfileOnce('t1', Date.now() + counted.KITCHEN_PROFILE_RETRY_MS + 1);
  assert.equal(tries, 2, 'retried after the back-off');
  assert.equal(await counted.loadKitchenProfileOnce(''), null);
});

// --- Source contracts --------------------------------------------------------------------

test('recipe detail: band only for members, after the quick actions, calm tokens, link to the kitchen profile', () => {
  const screen = read('app/recipe/[slug].tsx');
  assert.match(screen, /useKitchenProfile\(user \? token : null\)/, 'guests never fetch a profile');
  assert.match(screen, /allergenBand\(recipe\.allergens, kitchenProfile\.profile, kitchenProfile\.options\.allergens\)/);
  const quick = screen.indexOf('{quickActions.map(');
  const band = screen.indexOf('{allergenNotice ? (');
  const segment = screen.indexOf('<View style={styles.segment} accessibilityRole="tablist">');
  assert.ok(quick > 0 && band > quick && segment > band, 'band sits between quick actions and the Malzemeler/Tarif segment');
  assert.match(screen, /router\.push\('\/profile\/kitchen'\)/);
  assert.match(screen, /allergenBand: \{[^}]*backgroundColor: colors\.warningSoft/);
  assert.match(screen, /color=\{colors\.warning\}/);
  assert.match(screen, /accessibilityLabel=\{allergenNotice\.accessibilityLabel\}/);
  assert.match(screen, /accessibilityRole="link"/);
  // The hook is called with the other hooks, before any early return.
  assert.ok(screen.indexOf('useKitchenProfile(') < screen.indexOf('if (loading) return'));
});

test('kitchen profile cache: session store, refreshed on save, cleared on sign-out', () => {
  const lib = read('lib/kitchen-profile.ts');
  assert.match(lib, /export function useKitchenProfile\(/);
  assert.match(lib, /useSyncExternalStore\(subscribeKitchenProfile/);
  assert.match(lib, /primeKitchenProfileCache\(token, profile\);\s*return profile;/);
  assert.match(lib, /await request\(token, 'DELETE'\);\s*invalidateKitchenProfileCache\(\);/);
  assert.doesNotMatch(lib, /from 'react-native'/);
  assert.match(lib, /const ensure = \(\) => \{ if \(!peekKitchenProfile\(token\)\) void loadKitchenProfileOnce\(token\); \};\s*ensure\(\);\s*return subscribeKitchenProfile\(ensure\);/,
    'readers re-fetch after an invalidation even when their snapshot was already null');
  assert.match(read('context/AuthContext.tsx'), /forgetKitchenProfileCache\(\);[^\n]*\n\s*setToken\(null\);/);
  // The app keeps no allergen catalogue of its own.
  assert.doesNotMatch(read('lib/allergen-ui.ts').replace(/\/\*[\s\S]*?\*\//g, ''), /'Yer fıstığı'|'Süt ve süt ürünleri'|'Gluten/);
});

test('every /ai/generate caller handles the allergen conflict and the warning', () => {
  const api = read('lib/api.ts');
  assert.match(api, /const conflict = allergenConflictFrom\(res\.status, data\);\s*if \(conflict\) throw conflict;/);
  const callers = ['app/(tabs)/recipes.tsx', 'app/(tabs)/pantry.tsx'];
  const all = fs.readdirSync(path.join(root, 'app'), { recursive: true })
    .concat(fs.readdirSync(path.join(root, 'components'), { recursive: true }).map(f => `../components/${f}`))
    .filter(f => /\.tsx?$/.test(f))
    .map(f => path.join('app', f))
    .filter(f => /generateAIRecipe\(/.test(read(f)));
  assert.deepEqual(all.map(f => path.normalize(f)).sort(), callers.map(f => path.normalize(f)).sort(), 'no unguarded caller');
  for (const file of callers) {
    const src = read(file);
    assert.match(src, /error instanceof AIAllergenConflictError/, file);
    assert.match(src, /showAllergenConflict\(error, \(\) => router\.push\('\/profile\/kitchen'\)\)/, file);
    assert.match(src, /const allergenWarning = allergenWarningFrom\(aiResponse\);/, file);
    assert.match(src, /if \(!\(await confirmAllergenWarning\(allergenWarning, '[^']+'\)\)\) return;/, file);
    // The loading modal closes before an alert is shown (iOS would take the alert down with it).
    assert.match(src, /set(AiModalVisible|ShowAIModal)\(false\);[^]{0,200}?await afterModalDismiss\(\);\s*showAllergenConflict/, file);
  }
  const quick = read('app/(tabs)/recipes.tsx');
  assert.ok(quick.indexOf('confirmAllergenWarning(') < quick.indexOf('const draft = quickRecipeFromAI('), 'warning before any publish');
  const pantry = read('app/(tabs)/pantry.tsx');
  assert.ok(pantry.indexOf('confirmAllergenWarning(') < pantry.indexOf('createRecipe(token, aiResponse.recipe)'), 'warning before save');
  const alerts = read('lib/allergen-alerts.ts');
  assert.match(alerts, /text: ALLERGEN_BAND_LINK, onPress: openKitchenProfile/);
  assert.match(alerts, /onDismiss: \(\) => resolve\(false\)/, 'dismissing is a no, never a save');
});

test('CI runs this suite', () => {
  assert.match(read('.github/workflows/mobile-ci.yml'), /node --test scripts\/check-allergen-ui\.test\.cjs/);
});
