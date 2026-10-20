'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

// Run the same pure TypeScript validation logic used by Expo Hermes without
// fetching the provider, charging tokens or creating a WordPress recipe.
const source = read('lib/recipe-import.ts');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
});
const mod = { exports: {} };
new Function('module', 'exports', compiled.outputText)(mod, mod.exports);
const importLib = mod.exports;

function previewFixture() {
  const sourceText = '1 kilo fasulye ekle. Soğanı rendele ve kapağı kapatıp kaynat.';
  return {
    success: true, mode: 'manual_text_import', generation_status: 'needs_review',
    requires_approval: true, source_text: sourceText,
    recipe: {
      title: 'Fasulye Tarifi',
      excerpt: 'Kaynağındaki fasulye tarifi.',
      ingredients: [{
        name: 'Fasulye', amount: '1', unit: 'kilo', original_span: '1 kilo fasulye',
        source_name: 'fasulye', source_verified: true,
      }],
      steps: [{
        content: 'Soğanı rendele ve kapağı kapatıp kaynat.',
        original_span: 'Soğanı rendele ve kapağı kapatıp kaynat.',
        source_verified: true, editorial_rewrite: true,
      }],
      seo: { title: 'Fasulye Tarifi', description: 'Ev yapımı fasulye.', focus_keywords: ['fasulye'] },
    },
    warnings: ['step_editorial_rewrite'], needs_confirmation: ['step_0_source_check'],
    provenance: { origin_type: 'manual_text', ingredient_evidence: 'source', step_evidence: 'source', editorial_fields: ['title'] },
  };
}

test('native mobile rejects empty, short and over-20KB source before any AI request', () => {
  assert.match(importLib.validateRecipeSource('domates'), /daha ayrıntılı/);
  assert.match(importLib.validateRecipeSource('😊'.repeat(6000)), /20 KB/);
  assert.equal(importLib.validateRecipeSource(previewFixture().source_text), null);
});

test('native importer validates provenance and requires explicit user servings', () => {
  const fixture = previewFixture();
  const preview = importLib.parseImportPreview(fixture);
  const editor = importLib.editorFromPreview(preview);
  assert.equal(editor.servings, '', '1 kilo fasulye does not establish a serving size');
  assert.match(importLib.publishValidation(editor), /kaç kişilik/);
  editor.servings = '4';
  assert.equal(importLib.publishValidation(editor), null);
  const payload = importLib.buildApprovedRecipe(editor);
  assert.equal(payload.servings, 4);
  assert.equal(payload.ingredients[0].amount, '1');
  assert.equal(payload.ingredients[0].unit, 'kilo');
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'image'), 'No image API is used');
  assert.equal(payload.steps.length, 1);
  assert.ok(!Object.prototype.hasOwnProperty.call(payload, 'source_text'), 'Raw private notes never persisted on publish');
});

test('mobile accepts bounded editable metadata in one preview, never a second AI request', () => {
  const candidate = previewFixture();
  candidate.recipe.suggestions = {
    servings: 4, calories_per_serving: 190, cuisine: 'Türk Mutfağı', meal_type: 'Öğle Yemeği',
  };
  const model = importLib.editorFromPreview(importLib.parseImportPreview(candidate));
  assert.equal(model.servings, '4');
  assert.equal(model.calories, '190');
  model.calories = '205';
  const payload = importLib.buildApprovedRecipe(model);
  assert.equal(payload.calories, 205);
  assert.deepEqual(payload.meal_type, ['Öğle Yemeği']);
  model.calories = '9999';
  assert.match(importLib.publishValidation(model), /kalori/);
});

test('mobile validates AI output against exact original text and explicit approval', () => {
  const unverified = previewFixture();
  unverified.recipe.ingredients[0].original_span = 'yeni malzeme ve miktar';
  assert.throws(() => importLib.parseImportPreview(unverified), /kanıt/);
  const wrongApproval = previewFixture();
  wrongApproval.requires_approval = false;
  assert.throws(() => importLib.parseImportPreview(wrongApproval), /beklenen biçimde/);
  const wrongRecipe = previewFixture();
  wrongRecipe.recipe.ingredients[0].source_name = 'domates';
  assert.throws(() => importLib.parseImportPreview(wrongRecipe), /kanıt/);
});

test('mobile uses Core directly with quota preflight, no auto-publish, double approval and 110s guard', () => {
  const page = read('app/recipe/import.tsx');
  const api = read('lib/recipe-import-api.ts');
  const routes = read('app/_layout.tsx');
  const createSheet = read('components/navigation/GlobalCreateAction.tsx');
  assert.match(api, /\/ai\/recipe-import\/preview/);
  assert.match(api, /parseImportPreview\(json\)/);
  assert.match(api, /110000/);
  assert.match(api, /recipe_import_unavailable/);
  assert.match(api, /recipe_import_timeout/);
  assert.match(page, /fetchAccountQuotas\(token\)/);
  assert.match(page, /reached\(rights, 'recipe_ai_day'\)/);
  assert.match(page, /reached\(rights, 'recipe_day'\)/);
  assert.match(page, /buildApprovedRecipe\(editor\)/);
  assert.match(page, /createRecipe\(token, buildApprovedRecipe\(editor\), signal\)/);
  assert.match(page, /Alert\.alert\('Tarifini herkese açık yayımla'/);
  assert.match(page, /Onayla ve yayımla/);
  assert.match(page, /AI kişi sayısı önermiş olabilir/);
  assert.match(page, /Kaynağındaki ifade/);
  assert.match(routes, /name="recipe\/import"/);
  assert.match(createSheet, /route: '\/recipe\/aktar'/);
  assert.doesNotMatch(page, /generateAIRecipe|generateImage|AsyncStorage|SecureStore/);
  assert.doesNotMatch(api, /console\./);
});

test('AI preview takes the user into a dedicated review stage, not below a long source form', () => {
  const page = read('app/recipe/import.tsx');
  assert.match(page, /type Stage = 'source' \| 'review'/);
  assert.match(page, /setStage\('review'\)/);
  assert.match(page, /setStage\('source'\)/);
  assert.match(page, /stage === 'source' \? <>/);
  assert.match(page, /stage === 'review' && editor && \(preview \|\| videoReview\)/);
  assert.match(page, /scrollRef\.current\?\.scrollTo\(\{ y: 0, animated: true \}\)/);
  assert.match(page, /Mutfak notlarıma dön/);
  assert.match(page, /\(preview \|\| videoReview\) && editor/);
  assert.match(page, /Return to saved preview at no extra AI cost/);
  assert.match(page, /Düzenlenmiş tarifime dön/);
  assert.match(page, /Henüz yayımlanmadı/);
  assert.match(page, /Tarifinin son hâli/);
  assert.doesNotMatch(page, /Önizlemeyi yeniden oluştur/);
});

test('sticky review CTA points at missing servings and avoids silent publish failures', () => {
  const page = read('app/recipe/import.tsx');
  assert.match(page, /const checkBeforePublish = \(\): boolean/);
  assert.match(page, /setFieldError\('servings'\)/);
  assert.match(page, /scrollToSection\('servings'\)/);
  assert.match(page, /servingsRef\.current\?\.focus\(\)/);
  assert.match(page, /accessibilityRole="alert"/);
  assert.match(page, /Yayımlamak için kaç kişilik olduğunu seç/);
  assert.match(page, /\[2, 4, 6, 8\]\.map/);
  assert.match(page, /Tarifimin herkese açık yayımlanacağını|Herkese açık yayımlamayı onaylıyorum/);
  assert.match(page, /style=\{\[styles\.bottomBar/);
  assert.match(page, /if \(!checkBeforePublish\(\)\) return;/);
  assert.match(page, /Alert\.alert\('Tarifini herkese açık yayımla'/);
  assert.match(page, /createRecipe\(token, buildApprovedRecipe\(editor\), signal\)/);
  assert.match(page, /disabled=\{!!busy \|\| \(!publishUnknown && quotas\.loading\) \|\| \(stage === 'review' && !accepted && !publishUnknown\)\}/);
});

test('mobile editor uses quiet semantic ingredient marks rather than meaningless empty rings', () => {
  const page = read('app/recipe/import.tsx');
  assert.match(page, /<LokmaIngredientIcon name=\{ingredient\.name\} size=\{22\} \/>/);
  assert.match(page, /import LokmaIngredientIcon from/);
  assert.doesNotMatch(page, /<View style=\{styles\.dot\} \/>/);
});


test('mobile uses Core video jobs without forging source evidence or auto-publishing', () => {
  const compiled = ts.transpileModule(read('lib/video-recipe-import.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const moduleShim = { exports: {} };
  new Function('module', 'exports', compiled.outputText)(moduleShim, moduleShim.exports);
  const lib = moduleShim.exports;
  const link = 'https://www.youtube.com/watch?v=abcdefghijk';
  assert.equal(lib.isYouTubeVideoLink(link), true);
  assert.equal(lib.isYouTubeVideoLink('https://youtube.com.evil.test/watch?v=abcdefghijk'), false);
  const reel = 'https://www.instagram.com/reel/C5ToOyqIZvb/';
  assert.equal(lib.isInstagramReelLink(reel), true);
  assert.equal(lib.isInstagramReelLink('https://instagram.com/reels/C5ToOyqIZvb/?igsh=abc'), true);
  assert.equal(lib.isVideoRecipeLink(reel), true);
  assert.equal(lib.isVideoRecipeLink(link), true);
  for (const bad of [
    'http://instagram.com/reel/C5ToOyqIZvb/', 'https://instagram.com.evil.test/reel/C5ToOyqIZvb/',
    'https://user@instagram.com/reel/C5ToOyqIZvb/', 'https://instagram.com:444/reel/C5ToOyqIZvb/',
    'https://instagram.com/p/C5ToOyqIZvb/', 'https://instagram.com/tv/C5ToOyqIZvb/',
    'https://instagram.com/reel/C5ToOyqIZvb/extra',
  ]) assert.equal(lib.isInstagramReelLink(bad), false, bad);
  assert.equal(lib.videoEditorFromJob(lib.parseVideoJob({
    success: true, id: 21, status: 'needs_review', source_url: reel,
    message: 'Tarif hazır', requires_approval: true,
    preview: { status: 'needs_review', requires_approval: true, recipe: {
      title: 'Gnocchi', excerpt: 'Pesto', ingredients: [{ name: 'Gnocchi' }],
      steps: [{ instruction: 'Pişir.' }],
    } },
  })).editor.title, 'Gnocchi');
  assert.match(read('lib/recipe-import-api.ts'), /rights_confirmed: true/);
  assert.match(read('lib/recipe-import-api.ts'), /rightsConfirmed !== true/);
  const pageConsent = read('app/recipe/import.tsx');
  assert.match(pageConsent, /\[instagramRightsConfirmed, setInstagramRightsConfirmed\] = useState\(true\)/);
  assert.match(pageConsent, /setInstagramRightsConfirmed\(true\); setSocialUrl/);
  assert.match(pageConsent, /setInstagramRightsConfirmed\(value => !value\)/);
  assert.match(pageConsent, /fontSize: 11, lineHeight: 16/);
  assert.doesNotMatch(pageConsent, /Herkese açık olması tek başına kullanım hakkı vermez/);
  const job = lib.parseVideoJob({
    success: true, id: 19, status: 'needs_review', source_url: link,
    message: 'Tarif hazır', requires_approval: true, preview: {
      status: 'needs_review', requires_approval: true,
      recipe: {
        title: 'Gnocchi', excerpt: 'Kuru domates sosu.', servings: 2,
        cuisine: 'İtalyan', meal_type: 'Ana Yemek', nutrition: { calories_per_serving: null },
        ingredients: [
          { name: 'Gnocchi', amount: 400, unit: 'g', quantity_verified: false, evidence: 'visual' },
          { name: 'Sarımsak', amount: null, unit: null, quantity_verified: false, evidence: 'inferred' },
        ],
        steps: [{ instruction: 'Pişirin.', evidence: 'visual' }],
        needs_confirmation: ['Sarımsak görüntüden doğrulanamadı.'],
      },
    },
  });
  const { editor, warnings } = lib.videoEditorFromJob(job);
  assert.equal(editor.servings, '2');
  assert.equal(editor.calories, '');
  assert.equal(editor.ingredients[0].amount, '400');
  assert.equal(editor.ingredients[1].amount, '');
  assert.ok(editor.ingredients.every(i => i.source_verified === false && i.original_span === ''));
  assert.equal(editor.steps[0].source_verified, false);
  assert.ok(warnings.some(w => /Sarımsak/.test(w)));
  assert.match(read('lib/recipe-import-api.ts'), /ai\/recipe-social\/video/);
  assert.match(read('app/recipe/import.tsx'), /requestVideoPreview/);
  assert.match(read('app/recipe/import.tsx'), /getVideoRecipeJob\(token, job\.id/);
  assert.match(read('app/recipe/import.tsx'), /randomUUID\(\)/);
  assert.match(read('app/recipe/import.tsx'), /buildApprovedRecipe\(editor\)/);
});
