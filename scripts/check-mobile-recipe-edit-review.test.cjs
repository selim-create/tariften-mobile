'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('Mobile recipe edit review status is an authenticated, no-cache owner API', () => {
  const api = read('lib/api.ts');
  assert.match(api, /export async function getRecipeEditReviewStatus/);
  assert.match(api, /tariften\/v1\/recipes\/edit-review\/\$\{recipeId\}/);
  assert.match(api, /headers: authHeaders\(token\), cache: 'no-store'/);
  assert.match(api, /'pending' && status !== 'approved' && status !== 'rejected'/);
});

test('manual recipe editor never reports 202 review as immediate public publication', () => {
  const editor = read('components/recipe/RecipeManualEditor.tsx');
  assert.match(editor, /getRecipeEditReviewStatus\(token, Number\(recipeId\)\)/);
  assert.match(editor, /result\?\.pending_review === true \|\| result\?\.status === 'pending_review'/);
  assert.match(editor, /Değişikliklerin incelemeye gönderildi/);
  assert.match(editor, /Yönetici onayına kadar tarifinin yayındaki hâli değişmeyecek/);
  assert.match(editor, /Tariflerime dön/);
  assert.match(editor, /reviewStatus\?\.status === 'pending'/);
  assert.match(editor, /reviewStatus\?\.status === 'rejected'/);
  assert.match(editor, /Yönetici notu:/);
  assert.match(editor, /reviewStatus\?\.status === 'approved'/);
  assert.match(editor, /Yönetici onayı bekleniyor/);
  assert.match(editor, /Değişiklikleri gönder/);
  assert.match(editor, /Onaya gönder/);
  assert.match(editor, /\(editing && reviewStatus\?\.status === 'pending' && stage === 2\)/);
  assert.doesNotMatch(editor, /Tarifinin mevcut sayfası yeni bilgilerle güncellenecek/);
});

test('approval is server-controlled and ordinary AI recipe creation and quotas remain intact', () => {
  const editor = read('components/recipe/RecipeManualEditor.tsx');
  const api = read('lib/api.ts');
  assert.match(editor, /withDeadline\(signal => updateRecipe\(token, \{ \.\.\.values, id: recipeId \}, signal\), 45000\)/);
  assert.match(editor, /withDeadline\(signal => createRecipe\(token, values, signal\), 45000\)/);
  assert.match(editor, /fetchAccountQuotas\(token, signal\)/);
  assert.match(editor, /approvedManualPayload\(draft, image\)/);
  assert.match(api, /tariften\/v1\/recipes\/update/);
  assert.doesNotMatch(editor, /auto_approve|is_ai:\s*true|approval:\s*true/);
});
