const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const input = fs.readFileSync(path.join(__dirname, '..', 'lib/lokma-emoji.ts'), 'utf8');
const transpiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const shim = { exports: {} };
Function('module', 'exports', transpiled)(shim, shim.exports);
const { lokmaIngredient, LOKMA_RATINGS, LOKMA_REACTIONS } = shim.exports;

test('Lokma semantic ingredient emoji catalog handles common Turkish cooking nouns', () => {
 const expected = [
  ['kuru domates','🍅'],['havuç','🥕'],['parmesan peyniri','🧀'],
  ['sarımsak','🧄'],['zeytinyağı','🫒'],['gnocchi','🍝'],
  ['karabiber','🧂'],['taze fesleğen','🌿'],['soğan','🧅'],['nohut','🫘'],
 ];
 for (const [ingredient, emoji] of expected) assert.equal(lokmaIngredient(ingredient).emoji,emoji,ingredient);
 assert.equal(lokmaIngredient('tanımlanamayan malzeme').emoji,'🍽️');
});

test('rating reaction values preserve existing 1–5 server API contract', () => {
 assert.deepEqual(LOKMA_RATINGS.map(x=>x.rating),[1,2,3,4,5]);
 assert.equal(LOKMA_REACTIONS.length,6);
});

test('mobile cookbook ingredients, rating and comments use local emoji, not AI or altered recipe data', () => {
 const recipe=fs.readFileSync(path.join(__dirname,'..','app/recipe/[slug].tsx'),'utf8');
 const comment=fs.readFileSync(path.join(__dirname,'..','components/CommentSection.tsx'),'utf8');
 assert.match(recipe,/lokmaIngredient\(ing\.name\)\.emoji/);
 assert.match(recipe,/displayAmount\(ing\.amount\)/);
 assert.match(recipe,/LOKMA_RATINGS\.map/);
 assert.match(recipe,/handleRate\(rating\)/);
 assert.match(comment,/LOKMA_REACTIONS\.map/);
 assert.match(comment,/setNewComment\(current =>/);
 assert.match(comment,/addComment\(token, recipeId, newComment\.trim\(\)\)/);
});
