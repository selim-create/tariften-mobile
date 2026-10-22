'use strict';

/**
 * Fotoğraftan tarif, Defterden tarif and Kendi videondan tarif (Core 1.0.58 / P19).
 * Pure TypeScript modules are transpiled and run with mocked fetch/FormData and a
 * mocked expo-file-system: no network, no AI call, no recipe is created.
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
  const module = { exports: {} };
  const requireLocal = name => {
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected dependency ${name} in ${file}`);
  };
  new Function('module', 'exports', 'require', js)(module, module.exports, requireLocal);
  return module.exports;
}

const measurements = loadTS('lib/recipe-measurements.ts');
const quick = loadTS('lib/quick-recipe-review.ts', { './recipe-measurements': measurements });
const allergenUi = loadTS('lib/allergen-ui.ts');
const photo = loadTS('lib/photo-recipe.ts', {
  './quick-recipe-review': quick, './recipe-measurements': measurements, './allergen-ui': allergenUi,
});
const photoApi = loadTS('lib/photo-recipe-api.ts', { './photo-recipe': photo });
const ownVideo = loadTS('lib/own-video.ts');
const publishGuard = loadTS('lib/recipe-publish.ts');
const visibility = loadTS('lib/recipe-visibility.ts');
const videoImport = loadTS('lib/video-recipe-import.ts');
const api = loadTS('lib/api.ts', {
  './recipeUtils': { parseIngredients: list => list, parseSteps: list => list },
  './recipe-publish': publishGuard,
  './allergen-ui': allergenUi,
});

const BASE = 'https://api.tariften.com/wp-json/tariften/v1';
const TOKEN = 'Qm3fA1b2C3d4E5f6G7h8I9j0KlMnOpQr';

class FakeFormData {
  constructor() { this.entries = []; }
  append(name, value) { this.entries.push([name, value]); }
}

async function withFetch(responses, run) {
  const oldFetch = global.fetch;
  const oldFormData = global.FormData;
  const calls = [];
  global.FormData = FakeFormData;
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected request ' + url);
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.json };
  };
  try { await run(calls); } finally { global.fetch = oldFetch; global.FormData = oldFormData; }
}

function dishResponse(extra = {}) {
  return {
    success: true, mode: 'dish', generation_status: 'needs_review', requires_approval: true,
    ai_estimated: true, label: 'AI Tahmini Tarif',
    detected: { dish: 'Adana Kebap', confidence: 0.82, confidence_level: 'high', alternatives: ['Urfa Kebap'] },
    recipe: {
      title: 'Közlenmiş Biberli Adana Kebap', excerpt: 'Evde Adana.', prep_time: '30', cook_time: '20',
      calories: '', servings: '4', cuisine: ['Türk Mutfağı'], meal_type: ['Akşam Yemeği'], difficulty: ['Orta'], diet: [],
      ingredients: [{ name: 'Dana kıyma', amount: '500', unit: 'gram' }, { name: 'Lavaş', amount: '4', unit: 'adet' }],
      steps: ['Kıymayı yoğurun.', 'Közde pişirin.'], chef_tip: 'Elinizi buzlu suya batırın.',
      seo: { title: 'Adana Kebap', description: 'Evde.', focus_keywords: 'adana kebap' },
      quality_check: { status: 'reviewed', issues: [], warnings: ['nutrition_unverified'] },
      ai_estimated: true, image: 'https://evil.example/x.jpg',
    },
    assumptions: ['Acı seviyesi kullanıcı notundan alındı.'], uncertain: [], illegible: [],
    warnings: ['ai_estimated_recipe', 'nutrition_unverified'], needs_confirmation: [],
    allergens: { contains: ['gluten'], possible: [] }, allergen_conflicts: [], allergen_cautions: [], allergen_warning: '',
    preview_token: TOKEN, expires_at: '2026-10-22T14:05:00+00:00', page_count: 1,
    cover_available: true, default_visibility: 'private', source_kind: 'photo',
    ...extra,
  };
}

function notebookResponse() {
  return {
    success: true, mode: 'notebook', generation_status: 'needs_review', requires_approval: true,
    ai_estimated: false, label: '', detected: null,
    recipe: {
      title: 'Anneannemin Un Kurabiyesi', excerpt: '', prep_time: '', cook_time: '20', servings: '',
      cuisine: ['Türk Mutfağı'], meal_type: ['Tatlı'], difficulty: ['Kolay'],
      ingredients: [
        { name: 'Tereyağı', amount: '250', unit: 'gram', uncertain: false, note: '', original_text: '250 gr tereyağ', page: 1 },
        { name: 'Pudra şekeri', amount: '1', unit: 'su bardağı', uncertain: true, note: '1 mi 7 mi okunamadı', original_text: '1 (7?) sb', page: 1 },
        { name: 'Un', amount: '3', unit: 'su bardağı', uncertain: true, note: '', original_text: '3 S.B. un', page: 2 },
      ],
      steps: ['Tereyağını ve pudra şekerini çırpın.', 'Unu azar azar ekleyip yoğurun.', 'Fırında pişirin.'],
      ai_estimated: false,
    },
    source_notes: 'Bayramlarda yapılırdı', assumptions: [],
    uncertain: [
      { field: 'ingredients', index: 1, name: 'Pudra şekeri', note: '1 mi 7 mi okunamadı' },
      { field: 'ingredients', index: 2, name: 'Un', note: '' },
      { field: 'steps', index: 1, text: 'Unu azar azar ekleyip yoğurun.', note: 'Un miktarı silik' },
    ],
    illegible: ['Sayfa 2 sol alt köşe'], warnings: ['transcription_review', 'illegible_parts', 'uncertain_items'],
    needs_confirmation: ['uncertain_items'],
    allergens: { contains: ['gluten', 'milk'], possible: [] },
    allergen_conflicts: [{ key: 'milk', label: 'Süt', ingredients: ['Tereyağı'] }], allergen_cautions: [],
    allergen_warning: 'Bu tarif alerji listendeki Süt alerjenini içeriyor.',
    preview_token: TOKEN, expires_at: '', page_count: 2, cover_available: false,
    default_visibility: 'private', source_kind: 'notebook',
  };
}

const jpeg = n => ({ uri: `file:///cache/p${n}.jpg`, name: `tariften-photo-${n}.jpg`, type: 'image/jpeg' });

// --- API client: URLs, methods, multipart fields ------------------------------------

test('photo preview is a multipart POST to /ai/photo-recipe with mode, images[] in order, note and keep_cover', async () => {
  await withFetch([{ status: 200, json: dishResponse() }], async calls => {
    const preview = await photoApi.previewPhotoRecipe('jwt', 'dish', [jpeg(1)], '  restoranda yedim, acılıydı ');
    assert.equal(calls[0].url, `${BASE}/ai/photo-recipe`);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt');
    assert.ok(!('Content-Type' in calls[0].options.headers), 'fetch sets the multipart boundary itself');
    const entries = calls[0].options.body.entries;
    assert.deepEqual(entries.map(([k]) => k), ['mode', 'images[]', 'note', 'keep_cover']);
    assert.deepEqual(entries[0], ['mode', 'dish']);
    assert.deepEqual(entries[1][1], jpeg(1));
    assert.deepEqual(entries[2], ['note', 'restoranda yedim, acılıydı']);
    assert.deepEqual(entries[3], ['keep_cover', '1']);
    assert.equal(preview.aiEstimated, true);
    assert.equal(preview.defaultVisibility, 'private');
  });
  await withFetch([{ status: 200, json: notebookResponse() }], async calls => {
    await photoApi.previewPhotoRecipe('jwt', 'notebook', [jpeg(1), jpeg(2), jpeg(3)]);
    const entries = calls[0].options.body.entries;
    assert.deepEqual(entries.filter(([k]) => k === 'images[]').map(([, v]) => v.name),
      ['tariften-photo-1.jpg', 'tariften-photo-2.jpg', 'tariften-photo-3.jpg'], 'page order is kept');
    assert.ok(!entries.some(([k]) => k === 'keep_cover'), 'notebook pages are never kept as a cover');
    assert.ok(!entries.some(([k]) => k === 'note'), 'empty note is not sent');
  });
});

test('photo counts and note length are checked before any request', async () => {
  await withFetch([], async calls => {
    await assert.rejects(photoApi.previewPhotoRecipe('jwt', 'dish', [jpeg(1), jpeg(2)]), /Tek bir yemek/);
    await assert.rejects(photoApi.previewPhotoRecipe('jwt', 'dish', []), /Tek bir yemek/);
    await assert.rejects(photoApi.previewPhotoRecipe('jwt', 'notebook', [1, 2, 3, 4, 5].map(jpeg)), /en fazla 4/);
    await assert.rejects(photoApi.previewPhotoRecipe('jwt', 'notebook', [jpeg(1)], 'x'.repeat(301)), /300/);
    await assert.rejects(photoApi.previewPhotoRecipe('', 'dish', [jpeg(1)]), /giriş/);
    assert.equal(calls.length, 0);
  });
});

test('friendly errors for not food, unreadable, 413/415, 429 and feature off (503)', async () => {
  const cases = [
    [422, 'photo_recipe_not_food', 'dish', /yemek göremedik/, false, false],
    [422, 'photo_recipe_unreadable', 'notebook', /okuyamadık/, false, false],
    [422, 'photo_recipe_not_recipe_page', 'notebook', /tarif bulamadık/, false, false],
    [413, 'photo_recipe_payload_too_large', 'notebook', /çok büyük/, false, false],
    [415, 'photo_recipe_image_unsupported', 'dish', /JPEG, PNG veya WebP/, false, false],
    [429, 'tariften_quota_exceeded', 'dish', /yapay zekâ tarif hakkını/, false, true],
    [503, 'photo_recipe_unavailable', 'dish', /yakında/i, true, false],
  ];
  for (const [status, code, mode, pattern, unavailable, quota] of cases) {
    await withFetch([{ status, json: { code, message: 'Core mesajı', data: { status } } }], async () => {
      await assert.rejects(photoApi.previewPhotoRecipe('jwt', mode, [jpeg(1)]), error => {
        assert.ok(error instanceof photoApi.PhotoRecipeError, code);
        assert.match(error.message, pattern, code);
        assert.equal(error.unavailable, unavailable, code);
        assert.equal(error.quota, quota, code);
        return true;
      });
    });
  }
  assert.match(photo.photoErrorInfo(429, 'tariften_quota_exceeded', '', 'dish', 'save').message, /kaydetme hakkın/);
  assert.match(photo.photoErrorInfo(410, 'photo_recipe_preview_expired', '').message, /Tariflerim/);
});

test('save posts JSON to /ai/photo-recipe/save, private by default, never sends server-owned fields', async () => {
  const preview = photo.parsePhotoPreview(dishResponse(), 'dish');
  await withFetch([{ status: 201, json: { success: true, id: 4812, slug: 'evde-adana-kebap', visibility: 'private', cover_attached: true } }], async calls => {
    const result = await photoApi.savePhotoRecipe('jwt', preview.previewToken, preview.draft, { mode: 'dish', coverAvailable: true, useCover: true });
    assert.equal(calls[0].url, `${BASE}/ai/photo-recipe/save`);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
    const body = JSON.parse(calls[0].options.body);
    assert.equal(body.preview_token, TOKEN);
    assert.equal(body.visibility, 'private', 'no visibility chosen → private');
    assert.equal(body.use_photo_as_cover, true);
    for (const key of ['image', 'ai_estimated', 'visibility', 'source_kind', 'quality_check', 'status', 'author', 'id']) {
      assert.ok(!Object.hasOwn(body.recipe, key), `recipe.${key} is set by Core, never by the app`);
    }
    assert.equal(body.recipe.title, 'Közlenmiş Biberli Adana Kebap');
    assert.deepEqual(body.recipe.ingredients[0], { name: 'Dana kıyma', amount: '500', unit: 'gram' });
    assert.equal(result.slug, 'evde-adana-kebap');
  });
  const notebook = photo.parsePhotoPreview(notebookResponse(), 'notebook');
  const payload = photo.buildPhotoSavePayload(TOKEN, notebook.draft, { mode: 'notebook', visibility: 'public', useCover: true, coverAvailable: true });
  assert.equal(payload.visibility, 'public');
  assert.equal(payload.use_photo_as_cover, false, 'a notebook page never becomes a cover');
  assert.ok(!payload.recipe.ingredients.some(row => 'uncertain' in row || 'original_text' in row));
  assert.equal(photo.normalizeVisibility(undefined), 'private');
  assert.equal(photo.normalizeVisibility('PUBLIC'), 'private');
  assert.equal(photo.normalizeVisibility('public'), 'public');
  assert.equal(photo.buildPhotoSavePayload(TOKEN, notebook.draft, { mode: 'dish', useCover: true, coverAvailable: false }).use_photo_as_cover, false);
});

// --- Preview view model ---------------------------------------------------------------

test('dish preview: AI estimate label, detected dish, confidence and a client-side image is ignored', () => {
  const preview = photo.parsePhotoPreview(dishResponse(), 'dish');
  assert.equal(preview.aiEstimated, true);
  assert.equal(preview.detected.dish, 'Adana Kebap');
  assert.equal(photo.confidenceText(preview.detected.confidence), '%82 · Yüksek güven');
  assert.equal(preview.draft.image, '');
  assert.equal(preview.coverAvailable, true);
  assert.deepEqual(preview.assumptions, ['Acı seviyesi kullanıcı notundan alındı.']);
  assert.equal(photo.isLowConfidence(preview), false);
  const low = photo.parsePhotoPreview(dishResponse({
    detected: { dish: 'Köfte', confidence: 0.3, alternatives: ['Kebap'] }, warnings: ['low_confidence'], needs_confirmation: ['dish'],
  }), 'dish');
  assert.equal(photo.isLowConfidence(low), true);
  assert.throws(() => photo.parsePhotoPreview(dishResponse({ preview_token: 'kısa' }), 'dish'));
  assert.throws(() => photo.parsePhotoPreview(dishResponse(), 'notebook'), 'mode must match the request');
  // Notebook is never labelled as an AI estimate.
  assert.equal(photo.parsePhotoPreview(notebookResponse(), 'notebook').aiEstimated, false);
});

test('notebook preview highlights uncertain rows until the member edits them', () => {
  const preview = photo.parsePhotoPreview(notebookResponse(), 'notebook');
  const draft = preview.draft;
  assert.equal(photo.uncertainIngredientNote(preview, draft.ingredients[0]), null);
  assert.equal(photo.uncertainIngredientNote(preview, draft.ingredients[1]), '1 mi 7 mi okunamadı');
  assert.equal(photo.uncertainIngredientNote(preview, draft.ingredients[2]), 'Sayfada: 3 S.B. un');
  assert.equal(photo.uncertainStepNote(preview, draft.steps[1]), 'Un miktarı silik');
  assert.equal(photo.unresolvedUncertainCount(preview, draft), 3);
  const fixed = { ...draft, ingredients: draft.ingredients.map((row, i) => i === 1 ? { ...row, amount: '7' } : row) };
  assert.equal(photo.uncertainIngredientNote(preview, fixed.ingredients[1]), null, 'fixed row is no longer highlighted');
  assert.equal(photo.unresolvedUncertainCount(preview, fixed), 2);
  assert.deepEqual(preview.illegible, ['Sayfa 2 sol alt köşe']);
  assert.equal(preview.sourceNotes, 'Bayramlarda yapılırdı');
  assert.equal(preview.coverAvailable, false);
  // Allergen hits on the member's profile must be confirmed before saving.
  assert.equal(photo.needsAllergenAcknowledgement(preview), true);
  assert.equal(photo.needsAllergenAcknowledgement(photo.parsePhotoPreview(dishResponse(), 'dish')), false);
  // A notebook page often has no portion: servings stays empty and optional.
  assert.equal(draft.servings, '');
  assert.equal(photo.validatePhotoDraft(draft), null);
  assert.match(photo.validatePhotoDraft({ ...draft, title: '' }), /ad/);
  assert.match(photo.validatePhotoDraft({ ...draft, servings: '99' }), /1–36/);
  assert.match(photo.validatePhotoDraft({ ...draft, steps: [] }), /adım/);
});

test('client downscale (≤2000 px long edge) and notebook page add/remove/reorder', () => {
  assert.deepEqual(photo.downscaleAction(4032, 3024), { resize: { width: 2000 } });
  assert.deepEqual(photo.downscaleAction(1000, 3000), { resize: { height: 2000 } });
  assert.equal(photo.downscaleAction(1600, 1200), null);
  assert.equal(photo.PHOTO_JPEG_QUALITY, 0.8);
  assert.deepEqual(photo.addPages(['a', 'b', 'c'], ['d', 'e']), ['a', 'b', 'c', 'd'], 'max 4 pages');
  assert.deepEqual(photo.removePage(['a', 'b', 'c'], 1), ['a', 'c']);
  assert.deepEqual(photo.movePage(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
  assert.deepEqual(photo.movePage(['a', 'b'], 0, 5), ['a', 'b']);
  const image = read('lib/photo-recipe-image.ts');
  assert.match(image, /ImageManipulator\.manipulateAsync\(photo\.uri, action \? \[action\] : \[\]/);
  assert.match(image, /format: ImageManipulator\.SaveFormat\.JPEG/);
  assert.match(image, /requestCameraPermissionsAsync/);
  assert.match(image, /selectionLimit: limit/);
});

// --- Own video --------------------------------------------------------------------------

test('own video: duration ≤3:00 and size ≤200 MB are checked before upload; MP4/MOV only', () => {
  const ok = { uri: 'file:///v.mov', durationMs: 180000, fileSize: 200 * 1024 * 1024, mimeType: 'video/quicktime' };
  assert.equal(ownVideo.validateOwnVideo(ok), null);
  assert.match(ownVideo.validateOwnVideo({ ...ok, durationMs: 180001 }), /3 dakika/);
  assert.match(ownVideo.validateOwnVideo({ ...ok, fileSize: 200 * 1024 * 1024 + 1 }), /200 MB/);
  assert.match(ownVideo.validateOwnVideo({ uri: 'file:///v.webm', mimeType: 'video/webm' }), /MP4 veya MOV/);
  assert.equal(ownVideo.validateOwnVideo({ uri: 'file:///clip.MP4', durationMs: null, fileSize: null }), null, 'unknown values are left to Core');
  assert.deepEqual(ownVideo.ownVideoKind({ fileName: 'IMG_1.MOV' }), { mimeType: 'video/quicktime', extension: 'mov' });
  assert.equal(ownVideo.formatDuration(65000), '1:05');
  assert.equal(ownVideo.uploadPercent(50, 200), 25);
  assert.equal(ownVideo.uploadPercent(5, 0), 0);
  assert.equal(ownVideo.uploadPercent(300, 200), 100);
  assert.match(ownVideo.ownVideoErrorInfo(413, '').message, /200 MB/, 'nginx HTML 413 still reads as a size error');
  assert.equal(ownVideo.ownVideoErrorInfo(503, 'video_upload_unavailable').unavailable, true);
});

test('own video upload: multipart field `video`, stable uuid request_id, progress, opaque upload ref', async () => {
  const requestId = '3f6c2a8e-7d41-4b1e-9a55-0c2d9e7b1a10';
  assert.deepEqual(ownVideo.ownVideoUploadFields(requestId, ' 4 kişilik '), { request_id: requestId, note: '4 kişilik' });
  assert.deepEqual(ownVideo.ownVideoUploadFields(requestId), { request_id: requestId });
  assert.throws(() => ownVideo.ownVideoUploadFields('kısa'), /kimliği/);
  assert.throws(() => ownVideo.ownVideoUploadFields(requestId, 'x'.repeat(1001)), /1000/);

  const tasks = [];
  const responses = [];
  const fakeFs = {
    FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
    FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
    createUploadTask(url, uri, options, callback) {
      const task = { url, uri, options, callback, cancelled: false,
        uploadAsync: async () => { callback({ totalBytesSent: 50, totalBytesExpectedToSend: 100 }); return responses.shift(); },
        cancelAsync: async () => { task.cancelled = true; } };
      tasks.push(task);
      return task;
    },
  };
  const ownApi = loadTS('lib/own-video-api.ts', {
    'expo-file-system/legacy': fakeFs, './recipe-publish': publishGuard, './own-video': ownVideo,
  });
  responses.push({ status: 202, body: JSON.stringify({ job_id: 412, success: true, id: 412, status: 'queued',
    source_url: 'upload:9b1f0c7e2d4a4f8e8a6b3c2d1e0f9a8b', source_kind: 'upload', requires_approval: true }) });
  const progress = [];
  const upload = ownApi.uploadOwnVideo('jwt', { uri: 'file:///IMG_0042.MOV', mimeType: 'video/quicktime' }, requestId, '4 kişilik',
    (sent, expected) => progress.push(ownVideo.uploadPercent(sent, expected)));
  const job = await upload.promise;
  assert.equal(job.jobId, 412);
  assert.equal(job.isNew, true);
  assert.deepEqual(progress, [50]);
  const task = tasks[0];
  assert.equal(task.url, `${BASE}/ai/video-upload`);
  assert.equal(task.options.httpMethod, 'POST');
  assert.equal(task.options.uploadType, 1);
  assert.equal(task.options.fieldName, 'video');
  assert.equal(task.options.mimeType, 'video/quicktime');
  assert.equal(task.options.headers.Authorization, 'Bearer jwt');
  assert.deepEqual(task.options.parameters, { request_id: requestId, note: '4 kişilik' });

  responses.push({ status: 413, body: '<html>413 Request Entity Too Large</html>' });
  await assert.rejects(ownApi.uploadOwnVideo('jwt', { uri: 'file:///a.mp4' }, requestId, '', () => {}).promise, /200 MB/);
  responses.push({ status: 202, body: JSON.stringify({ job_id: 9, success: true, status: 'queued', source_url: 'https://x.test/v', source_kind: 'upload' }) });
  await assert.rejects(ownApi.uploadOwnVideo('jwt', { uri: 'file:///a.mp4' }, requestId, '', () => {}).promise, /doğrulanamadı/);
  responses.push({ status: 202, body: JSON.stringify({ job_id: 413, success: true, status: 'failed', source_url: 'upload:9b1f0c7e2d4a4f8e8a6b3c2d1e0f9a8b',
    source_kind: 'upload', error_code: 'tariften_quota_exceeded', message: 'Bugünkü yapay zekâ tarif hakkını kullandın.', retryable: false }) });
  const failed = await ownApi.uploadOwnVideo('jwt', { uri: 'file:///a.mp4' }, requestId, '', () => {}).promise;
  assert.equal(failed.status, 'failed');
  assert.match(failed.failedMessage, /hakkını kullandın/);

  await withFetch([{ status: 201, json: { success: true, id: 9876, slug: 'firinda-patatesli-kofte', reused: false } }], async calls => {
    const result = await ownApi.publishOwnVideoRecipe('jwt', 412, { title: 'Köfte' });
    assert.equal(calls[0].url, `${BASE}/ai/recipe-social/video/publish`);
    assert.deepEqual(JSON.parse(calls[0].options.body), { job_id: 412, recipe: { title: 'Köfte' } });
    assert.equal(result.slug, 'firinda-patatesli-kofte');
  });
});

test('own video screen: quota first, uuid request_id, validation, then the existing job screen', () => {
  const screen = read('app/recipe/kendi-video.tsx');
  assert.match(screen, /mediaTypes: \['videos'\]/);
  assert.match(screen, /validateOwnVideo\(candidate\)/);
  assert.match(screen, /requestIdRef\.current = randomUUID\(\)/);
  const quota = screen.indexOf("reached(rights, 'recipe_ai_day')");
  const send = screen.indexOf('uploadOwnVideo(token, video, requestId');
  assert.ok(quota > 0 && send > quota, 'GET /account/quotas runs before the upload');
  assert.match(screen, /router\.replace\(`\/recipe\/aktar\?job=\$\{job\.jobId\}`\)/);
  assert.match(screen, /Yeni video yükle/);
  assert.match(screen, /Yüklemeyi durdur/);
  assert.doesNotMatch(screen, /source_url/, 'the opaque upload reference is never shown');
});

test('existing video job screen accepts own uploads, never shows source_url and offers a new upload instead of retry', () => {
  const upload = {
    success: true, id: 412, status: 'processing', source_url: 'upload:9b1f0c7e2d4a4f8e8a6b3c2d1e0f9a8b',
    source_kind: 'upload', message: 'Video analiz ediliyor.', requires_approval: true,
  };
  assert.equal(videoImport.parseVideoJob(upload).id, 412);
  assert.equal(videoImport.isOwnVideoJob(upload), true);
  assert.throws(() => videoImport.parseVideoJob({ ...upload, source_kind: 'social' }), 'an upload ref alone is not a social link');
  assert.throws(() => videoImport.parseVideoJob({ ...upload, source_url: 'upload:../../etc' }));
  assert.equal(videoImport.isOwnVideoJob({ source_kind: 'upload', source_url: 'https://youtu.be/abcdefghijk' }), false);
  const page = read('app/recipe/import.tsx');
  assert.match(page, /if \(isOwnVideoJob\(job\)\) \{\s*\/\/ Never put the upload reference[^\n]*\n\s*setOwnVideoJobId\(job\.id\);\s*setOwnVideoFailed\(false\);\s*setSocialUrl\(''\);/);
  assert.match(page, /if \(ownVideoFailed\) router\.replace\('\/recipe\/kendi-video'\);/);
  assert.match(page, /ownVideoFailed \? 'Yeni video yükle' : 'Durumu kontrol et'/);
  assert.match(page, /job\.retryable === true && !isOwnVideoJob\(job\)/);
  assert.match(page, /publishOwnVideoRecipe\(token, ownVideoJobId, buildApprovedRecipe\(editor\), signal\)/);
  assert.match(page, /Kendi videon/);
});

// --- Badge, private recipes, visibility ----------------------------------------------------

test('"AI Tahmini Tarif" badge and owner-only private controls', () => {
  assert.equal(visibility.AI_ESTIMATED_LABEL, 'AI Tahmini Tarif');
  assert.equal(visibility.PRIVATE_OWNER_NOTICE, 'Sadece sen görüyorsun');
  assert.equal(visibility.showAiEstimatedBadge({ ai_estimated: true }), true);
  for (const value of [false, 'true', 1, undefined, null]) assert.equal(visibility.showAiEstimatedBadge({ ai_estimated: value }), false);
  assert.equal(visibility.showAiEstimatedBadge(null), false);
  const mine = { author: { id: 7 }, visibility: 'private', source_kind: 'photo' };
  assert.equal(visibility.isPrivateRecipe(mine), true);
  assert.equal(visibility.canToggleVisibility(mine, 7), true);
  assert.equal(visibility.canToggleVisibility({ ...mine, source_kind: 'notebook', visibility: 'public' }, 7), true);
  assert.equal(visibility.canToggleVisibility(mine, 8), false, 'not the owner');
  assert.equal(visibility.canToggleVisibility(mine, null), false);
  assert.equal(visibility.canToggleVisibility({ ...mine, source_kind: '' }, 7), false, 'normal recipes are not toggled here');
  assert.equal(visibility.nextVisibility('private'), 'public');
  assert.equal(visibility.nextVisibility('public'), 'private');

  const card = read('components/RecipeCard.tsx');
  assert.match(card, /showAiEstimatedBadge\(recipe\)/);
  assert.match(card, /<AiEstimatedBadge onPhoto \/>/);
  assert.match(card, /<PrivateBadge/);
  const detail = read('app/recipe/[slug].tsx');
  assert.match(detail, /await getRecipe\(slug, token\)/);
  assert.match(detail, /if \(!slug \|\| authLoading\) return;/);
  assert.match(detail, /showAiEstimatedBadge\(recipe\) \? <View style=\{styles\.aiBadgeRow\}><AiEstimatedBadge \/>/);
  assert.match(detail, /PRIVATE_OWNER_NOTICE/);
  assert.match(detail, /canToggleVisibility\(recipe, user\.id\)/);
  assert.match(detail, /await setRecipeVisibility\(token, recipe\.id, target\)/);
  assert.match(read('components/account/MyKitchenLibrary.tsx'), /isPrivateRecipe\(recipe\)/);
  assert.match(read('components/recipe/RecipeManualEditor.tsx'), /getRecipeById\(Number\(recipeId\), token\)/);
});

test('private recipe reads send the token without cache; visibility is POST /recipes/visibility', async () => {
  await withFetch([{ status: 200, json: { data: [{ id: 4812, slug: 'evde', visibility: 'private', ingredients: [], steps: [] }] } }], async calls => {
    const recipe = await api.getRecipe('evde', 'jwt');
    assert.equal(recipe.visibility, 'private');
    assert.equal(calls[0].url, `${BASE}/recipes/search?slug=evde`);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt');
    assert.equal(calls[0].options.cache, 'no-store');
  });
  await withFetch([{ status: 200, json: { data: [{ id: 1, ingredients: [], steps: [] }] } }], async calls => {
    await api.getRecipe('12');
    assert.equal(calls[0].url, `${BASE}/recipes/search?id=12`);
    assert.equal(calls[0].options.headers, undefined, 'anonymous reads stay plain and cacheable');
    assert.equal(calls[0].options.cache, undefined);
  });
  await withFetch([{ status: 200, json: { success: true, id: 4812, slug: 'evde', visibility: 'public', ai_estimated: true, source_kind: 'photo' } }], async calls => {
    const result = await api.setRecipeVisibility('jwt', 4812, 'public');
    assert.equal(calls[0].url, `${BASE}/recipes/visibility`);
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer jwt');
    assert.deepEqual(JSON.parse(calls[0].options.body), { id: 4812, visibility: 'public' });
    assert.equal(result.visibility, 'public');
  });
  await withFetch([{ status: 409, json: { code: 'recipe_visibility_unsupported', message: 'x' } }], async () => {
    await assert.rejects(api.setRecipeVisibility('jwt', 1, 'private'), /buradan değiştirilemez/);
  });
  await assert.rejects(api.setRecipeVisibility('jwt', 1, 'herkes'), /geçersiz/);
});

// --- Screens, menu, permissions, CI --------------------------------------------------------

test('review screen reuses the shared AI recipe editor with private default, cover switch and allergen confirmation', () => {
  const flow = read('components/recipe/PhotoRecipeFlow.tsx');
  assert.match(flow, /<QuickRecipeReview/);
  assert.match(flow, /useState<RecipeVisibility>\('private'\)/);
  assert.match(flow, /Sadece ben/);
  assert.match(flow, /Herkese açık/);
  assert.match(flow, /Fotoğrafı kapak yap/);
  assert.match(flow, /'AI Tahmini Tarif'/);
  assert.match(flow, /needsAllergenAcknowledgement\(preview\)/);
  assert.match(flow, /Alerjen uyarısını okudum/);
  assert.match(flow, /ingredientNote=\{row => uncertainIngredientNote\(preview, row\)\}/);
  assert.match(flow, /markFeatureUnavailable\(feature\)/);
  const quotaCheck = flow.indexOf("reached(rights, 'recipe_ai_day')");
  assert.ok(quotaCheck > 0 && quotaCheck < flow.indexOf('await previewPhotoRecipe('), 'quota is checked before the paid preview');
  const review = read('components/recipe/QuickRecipeReview.tsx');
  assert.match(review, /validate = validateQuickRecipe/, 'AI Şef keeps its own quality gate by default');
  assert.match(review, /primaryLabel = 'Kontrol ettim, yayımla'/);
  assert.match(read('app/recipe/fotograf.tsx'), /<PhotoRecipeFlow mode="dish" \/>/);
  assert.match(read('app/recipe/defter.tsx'), /<PhotoRecipeFlow mode="notebook" \/>/);
});

test('the "+" sheet lists the three new flows in the same style and can show "Yakında"', () => {
  const sheet = read('components/navigation/GlobalCreateAction.tsx');
  for (const [route, title] of [
    ['/recipe/fotograf', 'Fotoğraftan Tarif'], ['/recipe/defter', 'Defterden Tarif'], ['/recipe/kendi-video', 'Kendi Videondan Tarif'],
  ]) {
    assert.match(sheet, new RegExp(`route: '${route}',\\s*title: '${title}'`));
    assert.ok(fs.existsSync(path.join(root, 'app' + route + '.tsx')), route);
    assert.match(read('app/_layout.tsx'), new RegExp(`name="${route.slice(1)}"`));
  }
  assert.match(sheet, /feature: 'photo'/);
  assert.match(sheet, /feature: 'own_video'/);
  assert.match(sheet, /isFeatureUnavailable\(action\.feature\)/);
  assert.match(sheet, /Yakında/);
});

test('camera and photo library purpose strings exist (no native config change needed)', () => {
  const app = JSON.parse(read('app.json')).expo;
  assert.match(app.ios.infoPlist.NSCameraUsageDescription, /kamera/i);
  assert.match(app.ios.infoPlist.NSPhotoLibraryUsageDescription, /galeri/i);
  assert.ok(app.android.permissions.includes('CAMERA'));
  const pkg = JSON.parse(read('package.json'));
  for (const name of ['expo-image-picker', 'expo-image-manipulator', 'expo-file-system', 'expo-crypto']) {
    assert.ok(pkg.dependencies[name], name + ' is already installed');
  }
});

test('mobile CI runs this guard', () => {
  assert.match(read('.github/workflows/mobile-ci.yml'), /node --test scripts\/check-photo-video-recipe\.test\.cjs/);
});
