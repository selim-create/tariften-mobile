'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const src = read('lib/manual-recipe.ts');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', 'require', js)(mod, mod.exports, id => {
  assert.equal(id, './recipeUtils');
  return {
    parseIngredients: value => Array.isArray(value) ? value : JSON.parse(value || '[]'),
    parseSteps: value => (Array.isArray(value) ? value : JSON.parse(value || '[]'))
      .map(item => typeof item === 'string' ? item : item.content).filter(Boolean),
  };
});
const { emptyRecipeDraft, draftFromRecipe, validateManualDraft, approvedManualPayload } = mod.exports;

test('manual recipe create requires explicit title, person count, complete ingredients and real steps', () => {
  const value = emptyRecipeDraft();
  assert.equal(validateManualDraft(value).field, 'title');
  value.title = 'Anne usulü fasulye';
  assert.equal(validateManualDraft(value).field, 'servings');
  value.servings = '4';
  assert.equal(validateManualDraft(value).field, 'ingredients');
  value.ingredients = [{ name: 'taze fasulye', amount: '1', unit: 'kilo' }, { name: 'tuz', amount: '', unit: '' }];
  assert.equal(validateManualDraft(value).field, 'steps');
  value.steps = ['Fasulyeyi ayıkla.', 'Domatesi rendele.'];
  assert.equal(validateManualDraft(value), null);
  assert.equal(approvedManualPayload(value).servings, 4);
  assert.deepEqual(approvedManualPayload(value).ingredients[1], { name: 'tuz', amount: '', unit: '' });
  assert.deepEqual(approvedManualPayload(value).steps, ['Fasulyeyi ayıkla.', 'Domatesi rendele.']);
});

test('numeric constraints never invent servings, calories or cooking durations', () => {
  const value = emptyRecipeDraft();
  value.title = 'Fasulye';
  value.servings = '2';
  value.ingredients[0].name = 'Fasulye';
  value.steps[0] = 'Yıka.';
  for (const servings of ['0','-2','37','4.2','abc','']) {
    value.servings = servings;
    assert.equal(validateManualDraft(value).field, 'servings',servings);
  }
  value.servings = '2';
  value.cook_time = '-1';
  assert.equal(validateManualDraft(value).field, 'cook_time');
  value.cook_time = '';
  assert.equal(approvedManualPayload(value).cook_time,'');
  assert.equal(approvedManualPayload(value).calories,'');
  assert.equal(approvedManualPayload(value).ingredients[0].amount,'');
});

test('editing loads original fields and sends an image unchanged until replacement', () => {
  const recipe = {
    title:'Çiğden hazırlanan fasulye', excerpt:'Açıklama', image:'https://example.com/original.jpg',
    chef_tip:'Tencerenin kapağı kapalı.', servings:4, prep_time:15, cook_time:20, calories:0,
    cuisine:['Türk Mutfağı'],meal_type:['Akşam Yemeği'],difficulty:['Kolay'],diet:[],
    ingredients:[{name:'Fasulye',amount:1,unit:'kilo'}],
    steps:['Önce ayıkla.','Tencereye ekle.'],
  };
  const draft = draftFromRecipe(recipe);
  assert.equal(draft.servings,'4');
  assert.equal(draft.ingredients[0].amount,'1');
  assert.deepEqual(draft.steps,['Önce ayıkla.','Tencereye ekle.']);
  assert.equal(draft.image,recipe.image);
  const payload = approvedManualPayload(draft);
  assert.equal(payload.image,recipe.image);
  assert.deepEqual(payload.cuisine,['Türk Mutfağı']);
  assert.equal(payload.chef_tip,'Tencerenin kapağı kapalı.');
});

test('native create and edit share one staged editor, preserve author permissions and source data', () => {
  const editor = read('components/recipe/RecipeManualEditor.tsx');
  const create = read('app/recipe/create.tsx');
  const edit = read('app/recipe/edit/[id].tsx');
  const layout = read('app/_layout.tsx');
  const recipes = read('app/(tabs)/recipes.tsx');
  const details = read('app/recipe/[slug].tsx');
  assert.match(create,/RecipeManualEditor/);
  assert.match(edit,/RecipeManualEditor recipeId/);
  assert.match(edit,/Düzenlenecek tarifin bağlantısı geçersiz/);
  assert.match(layout,/name="recipe\/create"/);
  assert.match(layout,/name="recipe\/edit\/\[id\]"/);
  assert.match(recipes,/router.push\('\/recipe\/create'\)/);
  assert.match(recipes,/router.push\('\/recipe\/import'\)/);
  assert.match(details,/router.push\(`\/recipe\/edit\/\$\{recipe.id\}`\)/);
  assert.match(editor,/Number\(existing.author\?\.id\) !== Number\(user.id\)/);
  assert.match(editor,/approvedManualPayload\(draft, image\)/);
  assert.match(editor,/getRecipeById\(Number\(recipeId\)\)/);
  assert.match(editor,/fetchAccountQuotas\(token, signal\)/);
  assert.match(editor,/!editing/);
  assert.equal(editor.includes('uploadManualRecipePhoto(token, photo, signal)'), true);
  assert.match(editor,/isPublishResultUncertain\(cause\)/);
  assert.match(editor,/Tariflerimde kontrol et/);
  assert.match(editor,/withDeadline\(signal => createRecipe\(token, values, signal\), 45000\)/);
  assert.match(editor,/withDeadline\(signal => updateRecipe\(token, \{ \.\.\.values, id: recipeId \}, signal\), 45000\)/);
  assert.match(editor,/router.replace\('\/recipe\/' \+ encodeURIComponent\(slug\)\)/);
  assert.match(editor,/Alert.alert\(editing \? 'Değişiklikler kaydedilsin mi\?' : 'Tarifin yayımlansın mı\?'/);
});

test('manual photo picker uses JPEG conversion and validated authenticated WordPress Core upload, not legacy wp/v2/media', () => {
  const file = read('lib/manual-recipe-image.ts');
  assert.match(file,/ImageManipulator\.SaveFormat\.JPEG/);
  assert.match(file,/tariften\/v1\/recipes\/image\/upload/);
  assert.match(file,/body.append\('file'/);
  assert.match(file,/Authorization: `Bearer \$\{token\}`/);
  assert.match(file,/Number\.isSafeInteger\(result\.id\)/);
  assert.equal(file.includes('signal?: AbortSignal'), true);
  assert.match(file, /body, signal/);
  const editor = read('components/recipe/RecipeManualEditor.tsx');
  assert.equal(editor.includes('signal => uploadManualRecipePhoto(token, photo, signal)'), true);
  assert.doesNotMatch(file,/\/wp\/v2\/media|generateImage|ai\/generate/);
});
