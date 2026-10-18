'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const read = p => fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source = read('lib/recipe-measurements.ts');
const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
new Function('module','exports',code)(mod,mod.exports);
const {validateRecipeAmount, validateRecipeUnit, RECIPE_UNITS}=mod.exports;
test('reasonable Turkish amounts allow decimals, simple ranges and fractions without invented quantities',()=>{
 for(const value of ['', '2', '1,5', '0.5', '1/2', '2-3', 'yarım','çeyrek'])
   assert.equal(validateRecipeAmount(value),null,value);
 for(const value of ['domatas','xyz','abc123','1 litre','-2','0','10001','3/0','5-2','1..2','a5'])
   assert.ok(validateRecipeAmount(value),'should reject '+value);
});
test('selectable units include legacy Turkish measurement labels and block garbage',()=>{
 for(const value of ['', 'kg', 'kilo','su bardağı','yemek kaşığı','adet'])
   assert.equal(validateRecipeUnit(value),null,value);
 for(const value of ['abc','unuttum', '123','kilokiloo'])
   assert.ok(validateRecipeUnit(value),'should reject '+value);
 assert.ok(RECIPE_UNITS.length>15);
});
test('manual create and edit are visually and behaviorally aligned',()=>{
 const create=read('components/recipe/RecipeManualEditor.tsx');
 const edit=read('components/recipe/RecipeManualEditor.tsx');
 const picker=read('components/recipe/RecipePicker.tsx');
 assert.match(picker,/RecipePicker|RecipeSelect/);
 assert.match(create,/RECIPE_UNITS/);
 assert.match(edit,/RECIPE_UNITS/);
 assert.match(create,/validateManual/);
 assert.match(edit,/validateManual/);
 
 assert.match(create,/\[stage\]/);
 assert.match(create,/scrollRef\.current\?\.scrollTo/);
 assert.match(create,/setError\(/);
 assert.match(create,/RecipePicker/);
 assert.match(read('app/recipe/create.tsx'),/RecipeManualEditor/);
 assert.match(read('app/recipe/edit\/[id].tsx'),/RecipeManualEditor/);
 
 const preview=read('components/recipe/QuickRecipeReview.tsx');
 assert.match(preview,/RECIPE_UNITS/);
 assert.match(preview,/RecipePicker|RecipeSelect/);
});
