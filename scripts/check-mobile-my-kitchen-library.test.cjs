'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const read = filename => fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
const file = read('lib/api.ts');
const compiled = ts.transpileModule(file, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(data, status = 200) {
  const calls = [];
  let capturedFetch = async (url, options) => {
    calls.push({ url, options });
    return { ok: status >= 200 && status < 300, status, json: async () => data };
  };
  const m = { exports: {} };
  new Function('module', 'exports', 'require', 'fetch', '__DEV__', compiled)(
    m, m.exports, id => {
      if (id === './recipeUtils') return { parseIngredients: x => x, parseSteps: x => x };
      if (id === './recipe-publish') return { RecipeCreateUnconfirmedError: class extends Error {} };
      throw new Error('Unexpected import ' + id);
    }, (...args) => capturedFetch(...args), false);
  return { api: m.exports, calls };
}

test('mobile owned content API uses token, author=me, bounded pages, and enforces the real author', async () => {
  const data = { count: 17, pages: 2, data: [
    { id: 3, slug: 'taze-fasulye', author: { id: 17 }, title: 'Fasulye' },
  ] };
  const { api, calls } = harness(data);
  const r = await api.getOwnedRecipesPage('jwt-token', 1, 17);
  assert.equal(r.total, 17);
  assert.equal(r.pages, 2);
  assert.equal(r.items[0].id, 3);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /recipes\/search\?author=me&page=1$/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt-token');
  assert.equal(calls[0].options.cache, 'no-store');
});

test('owner menus require a proof of scope so older Core cannot leak public results', async () => {
  const owned = { source:'db', scope:'owner', count:13, pages:2, data:[
    { id: 13, author_id:17, slug:'akşam-sofram', title:'Akşam Sofram' },
  ] };
  const good = harness(owned);
  assert.equal((await good.api.getOwnedMenusPage('secret', 2, 17)).items[0].id, 13);
  assert.match(good.calls[0].url, /menus\/search\?author=me&page=2$/);
  const oldCore = harness({ ...owned, scope:undefined });
  await assert.rejects(() => oldCore.api.getOwnedMenusPage('secret', 1, 17), /güncelleniyor/);
  const wrongOwner = harness({ ...owned, data:[{ id: 18, author_id:30, title:'Yabancı menü' }] });
  await assert.rejects(() => wrongOwner.api.getOwnedMenusPage('secret', 1, 17), /Hesabına ait olmayan/);
});

test('empty owner menus are a real empty collection, outages and 401 never look empty', async () => {
  const empty = harness({ scope:'owner', count:0, pages:0, data:[] });
  assert.deepEqual((await empty.api.getOwnedMenusPage('valid', 1, 17)).items, []);
  const down = harness({ message:'server offline' }, 503);
  await assert.rejects(() => down.api.getOwnedMenusPage('valid', 1, 17), /yüklenemedi/);
  const denied = harness({ message:'unauthorized' }, 401);
  await assert.rejects(() => denied.api.getOwnedRecipesPage('bad', 1, 17), /Oturumunu/);
});

test('profile tabs keep existing favorites and cooked lists while adding personal kitchen sections', () => {
  const profile = read('app/(tabs)/profile.tsx');
  const library = read('components/account/MyKitchenLibrary.tsx');
  assert.match(profile, /type ProfileTab = 'my_recipes' \| 'my_menus' \| 'favorites' \| 'cooked'/);
  assert.match(profile, /label: 'Tariflerim'/);
  assert.match(profile, /label: 'Sofralarım'/);
  assert.match(profile, /label: 'Favoriler'/);
  assert.match(profile, /label: 'Pişirdiklerim'/);
  assert.match(profile, /<MyKitchenLibrary kind=/);
  assert.match(profile, /useFocusEffect/);
  assert.match(library, /getOwnedRecipesPage\(token, nextPage, userId\)/);
  assert.match(library, /getOwnedMenusPage\(token, nextPage, userId\)/);
  assert.match(library, /requestId\.current !== currentRequest/);
  assert.match(library, /const existing = new Set\(previous\.map\(item => item\.id\)\)/);
  assert.match(library, /toLocaleLowerCase\('tr-TR'\)/);
  assert.match(library, /page < pages/);
  assert.match(library, /Daha fazla yükle/);
  assert.match(library, /accessibilityLabel="İçeriklerimi yenile"/);
  assert.match(library, /router\.push\(`\/recipe\/edit\/\$\{item\.id\}`\)/);
  assert.match(library, /router\.push\(isRecipe \? '\/recipe\/create' : '\/menu\/create'\)/);
  assert.doesNotMatch(library, /router\.push\(`\/menu\/edit\//);
});

test('no anonymous cross-owner profile data, no publish/write actions from personal lists', () => {
  const api = read('lib/api.ts');
  const lib = read('components/account/MyKitchenLibrary.tsx');
  assert.match(api, /actualAuthorId !== expectedOwnerId/);
  assert.match(api, /data\.scope !== 'owner'/);
  assert.match(api, /throw new Error\('İçerik listesi eksik geldi/);
  assert.match(lib, /getOwnedRecipesPage/);
  assert.match(lib, /getOwnedMenusPage/);
  assert.doesNotMatch(lib, /createRecipe|updateRecipe|updateMenu|publish|deleteRecipe/);
});
