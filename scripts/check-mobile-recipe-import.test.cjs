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
  const listing = read('app/(tabs)/recipes.tsx');
  assert.match(api, /\/ai\/recipe-import\/preview/);
  assert.match(api, /parseImportPreview\(json\)/);
  assert.match(api, /110000/);
  assert.match(api, /recipe_import_unavailable/);
  assert.match(api, /recipe_import_timeout/);
  assert.match(page, /fetchAccountQuotas\(token\)/);
  assert.match(page, /reached\(rights, 'recipe_ai_day'\)/);
  assert.match(page, /reached\(rights, 'recipe_day'\)/);
  assert.match(page, /buildApprovedRecipe\(editor\)/);
  assert.match(page, /createRecipe\(token, buildApprovedRecipe\(editor\)\)/);
  assert.match(page, /Alert\.alert\('Tarifini herkese açık yayımla'/);
  assert.match(page, /Onayla ve yayımla/);
  assert.match(page, /Porsiyonu malzeme ağırlığından tahmin etmiyoruz/);
  assert.match(page, /Kaynağındaki ifade/);
  assert.match(routes, /name="recipe\/import"/);
  assert.match(listing, /router\.push\('\/recipe\/import'\)/);
  assert.doesNotMatch(page, /generateAIRecipe|generateImage|AsyncStorage|SecureStore/);
  assert.doesNotMatch(api, /console\./);
});
