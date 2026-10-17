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
 assert.match(recipe,/<LokmaIngredientIcon name=\{ing\.name\} size=\{27\} \/>/);
 assert.match(recipe,/displayAmount\(ing\.amount\)/);
 assert.match(recipe,/LOKMA_RATINGS\.map/);
 assert.match(recipe,/handleRate\(rating\)/);
 assert.match(comment,/LOKMA_REACTIONS\.map/);
 assert.match(comment,/setNewComment\(current =>/);
 assert.match(comment,/addComment\(token, recipeId, newComment\.trim\(\)\)/);
});

test('mobile Lokma illustrations match the full curated 89-art Web catalog, including neutral fallback', () => {
 const artSrc=fs.readFileSync(path.join(__dirname,'..','lib/lokma-svg-art.ts'),'utf8');
 const artComp=ts.transpileModule(artSrc,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const artModule={exports:{}};
 new Function('module','exports',artComp)(artModule,artModule.exports);
 const {LOKMA_SVG_ART,LOKMA_FIGURES,lokmaArtUri}=artModule.exports;
 const list=shim.exports.LOKMA_ICON_SAMPLES;
 assert.equal(LOKMA_FIGURES.length,89);
 assert.equal(new Set(LOKMA_FIGURES).size,89);
 assert.equal(list.length,89);
 assert.ok(list.every(item=>item.figure in LOKMA_SVG_ART), 'All 89 preview figures have real art');
 for (const id of LOKMA_FIGURES) {
  const svg=decodeURIComponent(lokmaArtUri(id).replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<\/(?:svg)>$/);
  assert.match(svg, /<(?:path|rect|ellipse|circle)/);
  assert.doesNotMatch(svg, /stroke=\{|strokeWidth=|className=|<span|<img/,id);
 }
 assert.equal(lokmaArtUri('unknown-figure'),lokmaArtUri('plate'));
});

test('specific Turkish ingredients resolve distinct editorial miniature IDs before generic emoji families', () => {
 for(const [name,art] of [
  ['Yeşil mercimek','greenlentil'],['Kırmızı mercimek','redlentil'],
  ['Kapya biber','kapiapepper'],['Toz kırmızı biber','paprikaspice'],
  ['Kırmızı biber','redpepper'],['Tuz','salt'],
  ['Yeşil elma','greenapple'],['Zeytinyağı','oliveoil'],
  ['Kabak','zucchini'],['Bamya','okra'],['Taze fasulye','greenbean'],
  ['Mısır unu','flour'],['Pancar','beet'],['Çubuk tarçın','cinnamon'],
  ['Yoğurt','yogurt'],['Ceviz','walnut'],['Dereotu','dill'],
 ]) assert.equal(lokmaIngredient(name).art,art,name);
 assert.equal(lokmaIngredient('bilinmeyen meyve').emoji,'🍽️');
 assert.deepEqual(LOKMA_RATINGS.map(x=>x.rating),[1,2,3,4,5]);
});

test('real mobile recipe and native import editor render miniatures without altering ingredient text or amounts', () => {
 const detail=fs.readFileSync(path.join(__dirname,'..','app/recipe/[slug].tsx'),'utf8');
 const importer=fs.readFileSync(path.join(__dirname,'..','app/recipe/import.tsx'),'utf8');
 const icon=fs.readFileSync(path.join(__dirname,'..','components/LokmaIngredientIcon.tsx'),'utf8');
 assert.match(detail, /<LokmaIngredientIcon name=\{ing\.name\}/);
 assert.match(importer, /<LokmaIngredientIcon name=\{ingredient\.name\}/);
 assert.match(detail, /displayAmount\(ing\.amount\)/);
 assert.match(icon, /import \{ Image \} from 'expo-image'/);
 assert.match(icon, /lokmaArtUri\(safeFigure\)/);
 assert.match(icon, /onError=\{\(\) => setFailedFigure\(safeFigure\)\}/);
 assert.doesNotMatch(detail,/lokmaIngredient\(ing\.name\)\.emoji/);
 assert.doesNotMatch(importer, /<Text[^>]*>\{lokmaIngredient/);
});
