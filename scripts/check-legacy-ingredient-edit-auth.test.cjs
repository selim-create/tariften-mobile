'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const read = p => fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const lib = read('lib/recipe-measurements.ts');
const compiled = ts.transpileModule(lib,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};
new Function('module','exports',compiled)(mod,mod.exports);
const {validateRecipeAmount,validateRecipeUnit,canTypeRecipeAmount}=mod.exports;
test('existing 1877-like recipe ingredients remain editable without rewriting saved quantities',()=>{
 const rows=[
  {name:'soğan',amount:'1',unit:'orta boy'},
  {name:'domates',amount:'bir',unit:'adet'},
  {name:'tuz',amount:'2',unit:'kaşık'},
  {name:'karabiber',amount:'',unit:'çay kaşığı'},
  {name:'kırmızı toz biber',amount:'',unit:'çay kaşığı'},
  {name:'limon suyu',amount:'yarım',unit:'adet'},
  {name:'şeker',amount:'bir',unit:'çay kaşığı'},
  {name:'zeytinyağı',amount:'Yarım',unit:'su bardağı'},
  {name:'fasulye',amount:'1',unit:'kilo'}
 ];
 for(const row of rows){
   assert.equal(validateRecipeAmount(row.amount),null,row.name+' '+row.amount);
   assert.equal(validateRecipeUnit(row.unit),null,row.name+' '+row.unit);
 }
 assert.equal(validateRecipeAmount(''),null,'quantity is optional');
 assert.equal(validateRecipeUnit(''),null,'unit is optional, e.g. half a lemon');
});
test('progressively typed semantic amounts are accepted, arbitrary text rejected',()=>{
 for(const value of ['b','bi','bir','Y','Ya','Yar','Yarım','çeyrek','1','1,','1,5','1/2','2-3'])
  assert.equal(canTypeRecipeAmount(value),true,value);
 for(const value of ['domatas','xyz','orta boy','1abc','limon'])
  assert.equal(canTypeRecipeAmount(value),false,value);
 for(const value of ['abc','10001','0','0/2','5-2','1..2'])
  assert.ok(validateRecipeAmount(value),value);
});
test('Mobile edit remains blocked if authenticated owner status cannot be checked',()=>{
 const page=read('components/recipe/RecipeManualEditor.tsx');
 const gate=page.slice(page.indexOf('if (!editing || authLoading'),page.indexOf('}, [authLoading, editing'));
 assert.match(gate,/Number\(existing.author\?\.id\) !== Number\(user.id\)/);
 assert.match(gate,/await getRecipeEditReviewStatus\(token, Number\(recipeId\)\)/);
 assert.ok(gate.indexOf('await getRecipeEditReviewStatus(token, Number(recipeId))')<gate.indexOf('setDraft(draftFromRecipe(existing))'));
 assert.match(gate,/setError\('Düzenleme yetkin doğrulanamadı/);
 assert.match(page,/canTypeRecipeAmount\(text\)/);
});
