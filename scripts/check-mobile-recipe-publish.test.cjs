'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function loadTS(file, dependencies = {}) {
  const js = ts.transpileModule(read(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const requireLocal = name => {
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
    throw new Error('Unexpected dependency ' + name);
  };
  new Function('module', 'exports', 'require', js)(module, module.exports, requireLocal);
  return module.exports;
}
const guard = loadTS('lib/recipe-publish.ts');
const api = loadTS('lib/api.ts', {
  './recipeUtils': { parseIngredients: list => list, parseSteps: list => list },
  './recipe-publish': guard,
});
const publishUrl = 'https://api.tariften.com/wp-json/tariften/v1/recipes/create';

test('a native request that never resolves stops waiting and aborts after bounded deadline', async () => {
  let abortSignal;
  const start = Date.now();
  await assert.rejects(
    guard.withDeadline(signal => {
      abortSignal = signal;
      return new Promise(() => {});
    }, 25),
    error => error instanceof guard.RequestDeadlineError,
  );
  assert.equal(abortSignal.aborted, true);
  assert.ok(Date.now() - start < 2000, 'A lost request must never leave an indefinite spinner');
});

test('quota preflight can be bounded independently without issuing a publication POST', async () => {
  let published = 0;
  await assert.rejects(
    guard.withDeadline(async () => new Promise(() => {}), 15),
    guard.RequestDeadlineError,
  );
  assert.equal(published, 0);
});

test('successful publish returns the real recipe slug once only', async () => {
  const oldFetch = global.fetch;
  let hits = 0;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, publishUrl);
      assert.equal(options.headers.Authorization, 'Bearer jwt');
      hits++;
      return new Response(JSON.stringify({ success: true, id: 1877, slug: 'fasulye-tarifi' }),
        { status: 201, headers: { 'content-type': 'application/json' } });
    };
    const result = await guard.withDeadline(signal =>
      api.createRecipe('jwt', { title: 'Fasulye Tarifi' }, signal), 500);
    assert.equal(result.slug, 'fasulye-tarifi');
    assert.equal(hits, 1);
  } finally {
    global.fetch = oldFetch;
  }
});

test('lost connection AFTER POST is unconfirmed, never a safe-to-retry failure', async () => {
  const oldFetch = global.fetch;
  let hits = 0;
  try {
    global.fetch = async () => { hits++; throw new TypeError('Network request failed'); };
    await assert.rejects(api.createRecipe('jwt', { title: 'Fasulye' }),
      guard.RecipeCreateUnconfirmedError);
    assert.equal(hits, 1);
    assert.equal(guard.isPublishResultUncertain(new guard.RecipeCreateUnconfirmedError()), true);
    assert.equal(guard.isPublishResultUncertain(new guard.RequestDeadlineError()), true);
  } finally { global.fetch = oldFetch; }
});

test('malformed success payload and server 500 are unconfirmed; 400 is a definite error', async () => {
  const oldFetch = global.fetch;
  try {
    global.fetch = async () => new Response('<html>upstream proxy</html>', { status: 200 });
    await assert.rejects(api.createRecipe('jwt', {}), guard.RecipeCreateUnconfirmedError);
    global.fetch = async () => new Response(JSON.stringify({ message: 'Proxy timeout' }), { status: 500 });
    await assert.rejects(api.createRecipe('jwt', {}), guard.RecipeCreateUnconfirmedError);
    global.fetch = async () => new Response(JSON.stringify({ message: 'Tarif başlığı gerekli.' }), { status: 400 });
    await assert.rejects(api.createRecipe('jwt', {}), /Tarif başlığı gerekli/);
  } finally { global.fetch = oldFetch; }
});

test('native UI distinguishes preflight timeouts from ambiguous POSTs and requires profile verification', () => {
  const screen = read('app/recipe/import.tsx');
  const quota = read('lib/quotas.ts');
  assert.match(screen, /withDeadline\(signal => fetchAccountQuotas\(token, signal\), 15000\)/);
  assert.equal(screen.includes('createRecipe(token, buildApprovedRecipe(editor), signal)'), true);
  assert.match(screen, /45000/);
  assert.match(screen, /postStarted && isPublishResultUncertain\(cause\)/);
  assert.match(screen, /setPublishUnknown\(true\)/);
  assert.match(screen, /Tekrar yayımlamadan önce Tariflerim/);
  assert.match(screen, /router\.push\('\/\(tabs\)\/profile'\)/);
  assert.match(screen, /Tariflerimde kontrol et/);
  assert.match(screen, /requestLock\.current = false/);
  assert.match(screen, /setBusy\(null\)/);
  assert.match(screen, /finally \{/);
  assert.match(screen, /Tarifin yayımlanıyor/);
  assert.match(screen, /Sunucu yanıtını bekliyoruz/);
  assert.match(quota, /fetchAccountQuotas\(token: string, signal\?: AbortSignal\)/);
  assert.match(quota, /signal \}/);
  assert.doesNotMatch(screen, /retryCreateRecipe|setInterval\(.*createRecipe/);
});
