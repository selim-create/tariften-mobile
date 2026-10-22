'use strict';
/**
 * "Bu Hafta" / "Alışveriş" account sync: three-way merge rules and the store's
 * sync contract. The merge module must stay identical to the web's copy.
 */
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
const { mergeKitchen, sameKitchen, EMPTY_DOC } = load('lib/kitchen-merge.ts');

const plan = (id, addedAt = 1, day = '2026-10-22') => ({ id, recipeId: 1, slug: 's', title: `T${id}`, day, addedAt });
const shop = (recipeId, addedAt = 1, n = 1) => ({ recipeId, slug: `r${recipeId}`, title: `R${recipeId}`, servings: null,
  ingredients: Array.from({ length: n }, (_, i) => ({ name: `m${i}`, amount: '1', unit: 'adet' })), addedAt });
const manual = (key, addedAt = 1) => ({ key, name: key, addedAt });
const doc = (p = {}) => ({ ...EMPTY_DOC, ...p });

test('first sync keeps everything from both sides', () => {
  const merged = mergeKitchen(null, doc({ plan: [plan('a')] }), doc({ plan: [plan('b', 2)], manual: [manual('m1')] }));
  assert.deepEqual(merged.plan.map(p => p.id), ['a', 'b']);
  assert.deepEqual(merged.manual.map(m => m.key), ['m1']);
});

test('additions on either side survive', () => {
  const base = doc({ plan: [plan('a')] });
  const merged = mergeKitchen(base, doc({ plan: [plan('a'), plan('phone', 2)] }), doc({ plan: [plan('a'), plan('web', 3)] }));
  assert.deepEqual(merged.plan.map(p => p.id), ['a', 'phone', 'web']);
});

test('a deletion on either side is not resurrected', () => {
  const base = doc({ plan: [plan('a'), plan('b')], shopping: [shop(5)], manual: [manual('m1')] });
  const local = doc({ plan: [plan('b')], shopping: [shop(5)], manual: [manual('m1')] });       // phone removed a
  const remote = doc({ plan: [plan('a'), plan('b')], shopping: [], manual: [manual('m1')] });  // web removed recipe 5
  const merged = mergeKitchen(base, local, remote);
  assert.deepEqual(merged.plan.map(p => p.id), ['b']);
  assert.deepEqual(merged.shopping, []);
  assert.deepEqual(merged.manual.map(m => m.key), ['m1']);
});

test('a row changed on one side takes that side; changed on both takes the newer', () => {
  const base = doc({ shopping: [shop(5, 1, 1)] });
  const onlyRemote = mergeKitchen(base, base, doc({ shopping: [shop(5, 1, 3)] }));
  assert.equal(onlyRemote.shopping[0].ingredients.length, 3);
  const onlyLocal = mergeKitchen(base, doc({ shopping: [shop(5, 1, 2)] }), base);
  assert.equal(onlyLocal.shopping[0].ingredients.length, 2);
  const both = mergeKitchen(base, doc({ shopping: [shop(5, 9, 2)] }), doc({ shopping: [shop(5, 4, 3)] }));
  assert.equal(both.shopping[0].ingredients.length, 2, 'newer addedAt wins');
});

test('checked marks merge as a set with the same rules', () => {
  const base = doc({ checked: ['x', 'y'] });
  const merged = mergeKitchen(base, doc({ checked: ['x', 'y', 'phone'] }), doc({ checked: ['x', 'web'] })); // web unchecked y
  assert.deepEqual(merged.checked, ['phone', 'web', 'x']);
});

test('merging the same document is a no-op and equality ignores order', () => {
  const d = doc({ plan: [plan('a', 1), plan('b', 2)], checked: ['k2', 'k1'] });
  assert.ok(sameKitchen(mergeKitchen(d, d, d), d));
  assert.ok(sameKitchen(doc({ plan: [plan('b', 2), plan('a', 1)], checked: ['k1', 'k2'] }), d));
  assert.ok(!sameKitchen(d, EMPTY_DOC));
});

test('store syncs through /me/kitchen with base_rev and retries on 409', () => {
  const store = read('lib/kitchen-store.ts');
  assert.match(store, /tariften\/v1\/me\/kitchen/);
  assert.match(store, /base_rev: remote\.rev/);
  assert.match(store, /put\.status === 409 \? serverDoc\(put\.data\?\.data\?\.current\)/);
  assert.match(store, /mergeKitchen\(syncMeta\.base \?\? EMPTY_DOC, snapshot, remote\.state\)/);
  assert.match(store, /scheduleSync\(1500\)/, 'local changes are pushed after a short pause');
  assert.match(store, /AppState\.addEventListener/, 'returning to the app syncs');
  assert.match(store, /Things added before signing in move to the account once/);
  const auth = read('context/AuthContext.tsx');
  assert.match(auth, /setKitchenAuth\(token\)/);
});
