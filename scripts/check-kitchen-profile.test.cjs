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

const kp = load('lib/kitchen-profile.ts');
const limits = { max_items: 30, max_length: 40 };

// Shape Core 1.0.47 returns from GET /me/kitchen-profile (options trimmed).
const OPTIONS = {
  household_size: { min: 1, max: 12 },
  diets: [{ value: 'vegetarian', label: 'Vejetaryen' }, { value: 'vegan', label: 'Vegan' }, { value: 'pescatarian', label: 'Pesketaryen' }, { value: 'keto', label: 'Ketojenik' }],
  equipment: [{ value: 'oven', label: 'Fırın' }, { value: 'airfryer', label: 'Airfryer' }],
  experience: [{ value: 'beginner', label: 'Çırak · yeni başlıyorum' }, { value: 'pro', label: 'Usta şef · gözü kapalı' }],
  time_preference: [{ value: 'under_20', label: '20 dakikanın altı' }],
  allergens: [{ value: 'gluten', label: 'Gluten içeren tahıllar' }, { value: 'milk', label: 'Süt ve süt ürünleri' }],
  reactions: [{ value: 'allergy', label: 'Alerji' }, { value: 'intolerance', label: 'İntolerans' }],
  dislikes: { max_items: 30, max_length: 40 },
  allergen_notice: 'Alerji bilgin yalnızca sana gösterilen tarif ve menü önerilerini güvenli hale getirmek için kullanılır.',
};

test('Turkish case folding matches Core: I→ı, İ→i, first spelling wins', () => {
  assert.equal(kp.foldTr('IRMIK'), 'ırmık');
  assert.equal(kp.foldTr('İncir'), 'incir');
  assert.notEqual(kp.foldTr('Irmak'), kp.foldTr('irmak'), 'dotless I never folds to dotted i');
  assert.equal(kp.normaliseTag('  <b>Kara</b>   lahana \n'), 'Kara lahana');
  assert.deepEqual(kp.dedupeTags(['Irmık', 'ırmık', ' ', 'İNCİR', 'incir', 'Mantar']), ['Irmık', 'İNCİR', 'Mantar']);
  assert.equal(kp.tagLength('ğüşıöç'), 6, 'counted per character like mb_strlen');
});

test('adding tags enforces Core limits and reports why', () => {
  let r = kp.addTag([], '  kişniş ', limits);
  assert.deepEqual(r, { list: ['kişniş'], error: null });
  assert.equal(kp.addTag(r.list, 'KİŞNİŞ', limits).error, 'duplicate');
  assert.equal(kp.addTag(r.list, '   ', limits).error, 'empty');
  assert.equal(kp.addTag([], 'ş'.repeat(41), limits).error, 'too_long');
  assert.equal(kp.addTag([], 'ş'.repeat(40), limits).error, null);
  const full = Array.from({ length: 30 }, (_, i) => `yiyecek ${i}`);
  assert.equal(kp.addTag(full, 'bir tane daha', limits).error, 'full');
  assert.equal(kp.TAG_ERROR_COPY.full(limits), 'En fazla 30 yiyecek ekleyebilirsin.');
  assert.equal(kp.TAG_ERROR_COPY.too_long(limits), 'En fazla 40 karakter olabilir.');
  assert.deepEqual(kp.removeTag(['Irmık', 'Mantar'], 'IRMIK'), ['Mantar']);
});

test('selections: vegan covers vegetarian/pescatarian, allergens default to allergy, stepper clamps', () => {
  assert.deepEqual(kp.toggleDiet(['vegetarian', 'keto'], 'vegan'), ['keto', 'vegan']);
  assert.deepEqual(kp.toggleDiet(['vegan'], 'pescatarian'), ['pescatarian']);
  assert.deepEqual(kp.toggleDiet(['keto'], 'keto'), []);
  assert.deepEqual(kp.toggleValue(['oven'], 'airfryer'), ['oven', 'airfryer']);
  const a = kp.toggleAllergen([], 'milk');
  assert.deepEqual(a, [{ key: 'milk', type: 'allergy' }]);
  assert.deepEqual(kp.setAllergenReaction(a, 'milk', 'intolerance'), [{ key: 'milk', type: 'intolerance' }]);
  assert.deepEqual(kp.toggleAllergen(a, 'milk'), []);
  assert.equal(kp.stepHousehold(null, 1, 1, 12), 1);
  assert.equal(kp.stepHousehold(null, -1, 1, 12), null);
  assert.equal(kp.stepHousehold(12, 1, 1, 12), 12);
  assert.equal(kp.stepHousehold(1, -1, 1, 12), 1);
  assert.equal(kp.stepHousehold(3, 1, 1, 12), 4);
});

test('server data is read defensively and options come only from Core', () => {
  const p = kp.normaliseProfile({ household_size: '4', diets: ['vegan', 3], experience: 'wizard', time_preference: 'under_45',
    allergens: [{ key: 'milk', type: 'intolerance' }, { key: 'gluten', type: 'odd' }, 'bad'], allergen_consent_at: '', completed_at: '2026-10-22T08:00:00+00:00' });
  assert.equal(p.household_size, 4);
  assert.deepEqual(p.diets, ['vegan']);
  assert.equal(p.experience, null);
  assert.equal(p.time_preference, 'under_45');
  assert.deepEqual(p.allergens, [{ key: 'milk', type: 'intolerance' }, { key: 'gluten', type: 'allergy' }]);
  assert.equal(p.allergen_consent_at, null);
  assert.equal(p.completed_at, '2026-10-22T08:00:00+00:00');
  assert.deepEqual(kp.normaliseProfile(null), kp.blankProfile());
  const o = kp.normaliseOptions(OPTIONS);
  assert.equal(o.allergens.length, 2);
  assert.equal(o.allergen_notice, OPTIONS.allergen_notice);
  assert.equal(kp.normaliseOptions({ ...OPTIONS, allergen_notice: '' }), null, 'no notice → no allergen consent → refuse');
  assert.equal(kp.normaliseOptions(undefined), null);
  assert.deepEqual(kp.splitLabel('Çırak · yeni başlıyorum'), { title: 'Çırak', detail: 'Yeni başlıyorum' });
  assert.deepEqual(kp.splitLabel('20 dakikanın altı'), { title: '20 dakikanın altı', detail: null });
  assert.equal(kp.consentDateTr('2026-10-21T22:30:00Z'), '22 Ekim 2026', 'Istanbul date');
  assert.equal(kp.consentDateTr('nope'), null);
});

test('step payloads are partial and carry consent / complete only when needed', () => {
  const saved = kp.blankProfile();
  const draft = kp.profileToDraft(saved);
  assert.equal(kp.KITCHEN_STEP_COUNT, 5);
  assert.deepEqual(kp.KITCHEN_STEPS.map(s => s.key), ['household', 'diets', 'dislikes', 'equipment', 'allergens']);

  // Unchanged middle step: nothing is sent.
  assert.equal(kp.buildStepPayload(1, draft, saved, { consentChecked: false }), null);
  // Step 1 sends exactly its own fields.
  assert.deepEqual(kp.buildStepPayload(0, { ...draft, household_size: 3 }, saved, { consentChecked: false }),
    { household_size: 3, time_preference: null });
  // Skip never sends the step's values.
  assert.equal(kp.buildStepPayload(0, { ...draft, household_size: 3 }, saved, { consentChecked: false, skip: true }), null);
  // Dislikes are deduped before they leave the device.
  assert.deepEqual(kp.buildStepPayload(2, { ...draft, dislikes: ['Irmık', 'IRMIK '] }, saved, { consentChecked: false }),
    { dislikes: ['Irmık'] });

  // Last step: first non-empty allergens need consent; complete marks the profile.
  const withAllergen = { ...draft, allergens: [{ key: 'milk', type: 'intolerance' }] };
  assert.equal(kp.allergenConsentMissing(withAllergen, saved, false), true);
  assert.equal(kp.allergenConsentMissing(withAllergen, saved, true), false);
  assert.deepEqual(kp.buildStepPayload(4, withAllergen, saved, { consentChecked: true }),
    { allergens: [{ key: 'milk', type: 'intolerance' }], allergen_consent: true, complete: true });
  // Skipping the last step still finishes the flow, without allergens.
  assert.deepEqual(kp.buildStepPayload(4, withAllergen, saved, { consentChecked: false, skip: true }), { complete: true });

  // With consent on file, allergens change without re-consenting; already complete sends no complete flag.
  const consented = { ...saved, allergen_consent_at: '2026-10-20T10:00:00Z', completed_at: '2026-10-20T10:00:00Z',
    allergens: [{ key: 'milk', type: 'allergy' }] };
  const changed = { ...kp.profileToDraft(consented), allergens: [{ key: 'milk', type: 'intolerance' }] };
  assert.equal(kp.allergenConsentMissing(changed, consented, false), false);
  assert.deepEqual(kp.buildStepPayload(4, changed, consented, { consentChecked: false }),
    { allergens: [{ key: 'milk', type: 'intolerance' }] });
  assert.equal(kp.buildStepPayload(4, kp.profileToDraft(consented), consented, { consentChecked: false }), null);

  // Set membership, not order, decides whether diets changed.
  const ordered = { ...saved, diets: ['keto', 'vegan'] };
  assert.equal(kp.stepIsDirty(1, { ...kp.profileToDraft(ordered), diets: ['vegan', 'keto'] }, ordered), false);
});

test('server field errors land on the step that owns the field', () => {
  assert.equal(kp.stepForField('household_size'), 0);
  assert.equal(kp.stepForField('time_preference'), 0);
  assert.equal(kp.stepForField('diets'), 1);
  assert.equal(kp.stepForField('dislikes'), 2);
  assert.equal(kp.stepForField('experience'), 3);
  assert.equal(kp.stepForField('allergens'), 4);
  assert.equal(kp.stepForField('allergen_consent'), 4);
  assert.equal(kp.stepForField('body'), null);
  const merged = kp.mergeStepIntoDraft(0, { ...kp.profileToDraft(kp.blankProfile()), household_size: 9, diets: ['keto'] },
    { ...kp.blankProfile(), household_size: 4 });
  assert.equal(merged.household_size, 4, 'saved value replaces the draft for this step');
  assert.deepEqual(merged.diets, ['keto'], 'other steps keep their unsaved draft');
  assert.deepEqual(kp.stepCta(4, false), { primary: 'Bitir', skip: 'Şimdilik atla' });
  assert.deepEqual(kp.stepCta(0, false), { primary: 'Devam', skip: 'Şimdilik atla' });
  assert.equal(kp.stepCta(0, true).primary, 'Kaydet ve devam');
  kp.setKitchenFlash('ok');
  assert.equal(kp.takeKitchenFlash(), 'ok');
  assert.equal(kp.takeKitchenFlash(), null, 'success line shows once');
});

test('Core calls: bearer JWT, partial PUT body, structured 400 errors', async () => {
  const calls = [];
  const reply = (status, body) => async (url, options) => {
    calls.push({ url, options });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  const ok = load('lib/kitchen-profile.ts', reply(200, { success: true, profile: { household_size: 2 }, options: OPTIONS }));
  const got = await ok.getKitchenProfile('jwt-1');
  assert.equal(got.profile.household_size, 2);
  assert.equal(calls[0].url, 'https://api.tariften.com/wp-json/tariften/v1/me/kitchen-profile');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt-1');

  await ok.updateKitchenProfile('jwt-1', { diets: ['vegan'] });
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[1].options.body), { diets: ['vegan'] });

  const refused = load('lib/kitchen-profile.ts', reply(400, {
    code: 'allergen_consent_required', message: 'Alerji bilgisini kaydetmek için onayın gerekiyor.', data: { status: 400, field: 'allergen_consent' },
  }));
  await assert.rejects(() => refused.updateKitchenProfile('jwt-1', { allergens: [{ key: 'milk', type: 'allergy' }] }), err => {
    assert.equal(err.code, 'allergen_consent_required');
    assert.equal(err.field, 'allergen_consent');
    assert.equal(err.status, 400);
    assert.match(err.message, /onayın gerekiyor/);
    return true;
  });
  const old = load('lib/kitchen-profile.ts', reply(200, { success: true, profile: {} }));
  await assert.rejects(() => old.getKitchenProfile('jwt-1'), /güncelleniyor/, 'missing options never fall back to hardcoded lists');
  await assert.rejects(() => ok.getKitchenProfile(''), /giriş yapmalısın/);
});

test('screen contract: Core labels, consent before allergens, skippable steps, a11y', () => {
  const screen = read('app/profile/kitchen.tsx');
  const lib = read('lib/kitchen-profile.ts');
  assert.match(screen, /Şimdilik atla|stepCta/);
  assert.match(lib, /skip: 'Şimdilik atla'/);
  assert.match(screen, /options\.allergen_notice/);
  assert.match(screen, /allergenConsentMissing\(draft, saved, consentChecked\)/);
  assert.match(screen, /allergen_consent: false/);
  assert.match(screen, /Alert\.alert\(\s*'Alerji bilgin silinsin mi\?'/);
  assert.match(screen, /Alerji bilgimi sil/);
  assert.match(screen, /Onay verildi/);
  assert.match(screen, /accessibilityRole="checkbox" accessibilityState=\{\{ checked: on \}\}/);
  assert.match(screen, /accessibilityRole="progressbar"/);
  assert.match(screen, /KeyboardAvoidingView/);
  assert.match(screen, /useSafeAreaInsets/);
  assert.match(screen, /welcome === '1'/);
  assert.match(screen, /router\.dismissTo\('\/\(tabs\)\/profile'\)/);
  assert.match(screen, /options\.(diets|equipment|allergens|experience|time_preference)/);
  // No hardcoded option catalogue in the app.
  assert.doesNotMatch(screen + lib, /'Vejetaryen'|'Gluten içeren|'Yer fıstığı'|'Airfryer'/);
  assert.match(screen, /Mutfağını tanıyalım/);
  assert.match(read('app/_layout.tsx'), /name="profile\/kitchen"/);
});

test('registration signs in with the returned token and opens the kitchen profile', () => {
  const auth = read('context/AuthContext.tsx');
  const register = read('app/register.tsx');
  const api = read('lib/api.ts');
  assert.match(auth, /const data = await apiRegister\(userData\);/);
  assert.match(auth, /if \(!jwt\) return false;/);
  assert.match(auth, /await SecureStore\.setItemAsync\(TOKEN_KEY, jwt\);\s*setToken\(jwt\);\s*const me = await getMe\(jwt\);/);
  assert.match(register, /router\.replace\(\{ pathname: '\/profile\/kitchen', params: \{ welcome: '1' \} \}\)/);
  assert.match(register, /setShowModal\(true\)/, 'older Core keeps the sign-in modal');
  assert.match(api, /kitchen_profile_completed: u\.kitchen_profile_completed === true/);
});

test('profile shows the kitchen profile entry; edit links to the full profile', () => {
  const profile = read('app/(tabs)/profile.tsx');
  const edit = read('app/profile/edit.tsx');
  assert.match(profile, /Mutfak profilim/);
  assert.match(profile, /router\.push\('\/profile\/kitchen'\)/);
  assert.match(profile, /user\.kitchen_profile_completed/);
  assert.match(profile, /takeKitchenFlash\(\)/);
  assert.match(edit, /router\.push\('\/profile\/kitchen'\)/);
  assert.match(edit, /DIET_OPTIONS/, 'legacy diet/experience editor stays');
});
