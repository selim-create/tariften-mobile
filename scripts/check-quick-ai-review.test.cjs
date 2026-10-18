'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const read = p => fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const helper = read('lib/quick-recipe-review.ts');
const js = ts.transpileModule(helper,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const local = {exports:{}};
const measureSource = read('lib/recipe-measurements.ts');
const measureJs = ts.transpileModule(measureSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const measures = {exports:{}};
new Function('module','exports',measureJs)(measures,measures.exports);
new Function('module','exports','require',js)(local,local.exports,id => {
 assert.equal(id,'./recipe-measurements');
 return measures.exports;
});
const {quickRecipeFromAI,validateQuickRecipe,approvedQuickRecipe} = local.exports;
const good=()=>({
 title:'Domatesli pilav', excerpt:'Evde kolay pilav.',
 servings:4,calories:270,prep_time:10,cook_time:20,chef_tip:'Altını kapatıp dinlendir.',
 image:'https://example.com/pilav.jpg', cuisine:['turk-mutfagi'], meal_type:['aksam-yemegi'],
 difficulty:['kolay'],diet:[],quality_check:{warnings:['nutrition_unverified']},
 ingredients:[{name:'Domates',amount:'2',unit:'adet'},{name:'Pirinç',amount:'1',unit:'su bardağı'}],
 steps:['Domatesleri yıka.','Pirinci kavur.'],
 seo:{title:'Evde Domatesli Pilav',description:'Domatesli pilav.',focus_keywords:['pilav','domates']}
});
test('Mobile AI candidate is auto-published after quota+validation, duplicate alone requires confirmation',()=>{
 const flow=read('app/(tabs)/recipes.tsx');
 const generate=flow.slice(flow.indexOf('const handleGenerateAI = useCallback('),flow.indexOf('const handlePublishQuickRecipe ='));
 const publish=flow.slice(flow.indexOf('const publishGeneratedRecipe = useCallback('),flow.indexOf('const handleGenerateAI = useCallback('));
 assert.match(generate,/await generateAIRecipe\(token, searchQuery\)/);
 assert.match(generate,/quickRecipeFromAI\(aiResponse\.recipe\)/);
 assert.match(generate,/if \(duplicateId\)/);
 assert.match(generate,/setReviewVisible\(true\)/);
 assert.match(generate,/await publishGeneratedRecipe\(draft, token\)/);
 assert.match(publish,/validateQuickRecipe\(draft\)/);
 assert.match(publish,/approvedQuickRecipe\(draft\)/);
 assert.match(publish,/await fetchAccountQuotas\(authToken\)/);
 assert.match(publish,/await createRecipe\(authToken, payload\)/);
 assert.ok(publish.indexOf('validateQuickRecipe(draft)') < publish.indexOf('await createRecipe(authToken, payload)'));
 assert.ok(publish.indexOf('await fetchAccountQuotas(authToken)') < publish.indexOf('await createRecipe(authToken, payload)'));
 assert.match(publish,/error instanceof RecipeCreateUnconfirmedError \|\| requestStarted/);
 assert.match(flow,/quickPublishInFlightRef\.current/);
 assert.match(flow,/setReviewUncertain\(true\)/);
 assert.doesNotMatch(flow,/<QuickRecipeReview/);
 const component=read('components/recipe/SimilarRecipeChoice.tsx');
 assert.match(component,/Mevcut tarifi görüntüle/);
 assert.match(component,/Yine de yeni tarif oluştur/);
});
test('AI draft retains real source fields, suggested serving and per-person estimates',()=>{
 const candidate=good();
 const copy=JSON.parse(JSON.stringify(candidate));
 const draft=quickRecipeFromAI(candidate);
 assert.equal(draft.title,'Domatesli pilav');
 assert.equal(draft.servings,'4');
 assert.equal(draft.calories,'270');
 assert.equal(draft.ingredients[0].name,'Domates');
 assert.equal(draft.steps[1],'Pirinci kavur.');
 assert.deepEqual(draft.cuisine,['turk-mutfagi']);
 assert.deepEqual(candidate,copy);
 assert.equal(validateQuickRecipe(draft),null);
 const payload=approvedQuickRecipe(draft);
 assert.equal(payload.servings,4);
 assert.equal(payload.calories,270);
 assert.equal(payload.image,candidate.image);
 assert.deepEqual(payload.steps,candidate.steps);
 assert.deepEqual(payload.quality_check,{warnings:['nutrition_unverified']});
 assert.deepEqual(payload.seo,{title:'Evde Domatesli Pilav',description:'Domatesli pilav.',focus_keywords:'pilav, domates'});
 assert.ok(!Object.hasOwn(payload,'existing_recipe_id'));
 assert.ok(!Object.hasOwn(payload,'source_text'));
});
test('AI must never invent unknown serving/calories or blindly save unsafe records',()=>{
 const zero=quickRecipeFromAI({...good(),servings:null,calories:0});
 assert.equal(zero.servings,'');assert.equal(zero.calories,'');
 assert.match(validateQuickRecipe(zero),/kaç kişilik/);
 const bad=quickRecipeFromAI({...good(),servings:99,calories:'five'});
 assert.equal(bad.servings,'');assert.equal(bad.calories,'');
 assert.equal(quickRecipeFromAI({...good(),image:'javascript:alert(1)'}).image,'');
 assert.throws(()=>quickRecipeFromAI({title:'boş'}));
 assert.throws(()=>quickRecipeFromAI({...good(),steps:new Array(41).fill('hazırla')}));
 assert.throws(()=>approvedQuickRecipe(zero));
});
test('AI generated draft fields are preserved when preparing a safe auto-publish payload',()=>{
 const draft=quickRecipeFromAI(good());
 draft.title='Çift domatesli pilav';
 draft.servings='6';draft.calories='';
 draft.ingredients[0].name='Cherry domates';
 draft.steps[0]='Cherry domatesleri ortadan ikiye böl.';
 draft.cuisine=['italyan-mutfagi'];
 assert.equal(validateQuickRecipe(draft),null);
 const sent=approvedQuickRecipe(draft);
 assert.equal(sent.title,'Çift domatesli pilav');assert.equal(sent.servings,6);
 assert.deepEqual(sent.cuisine,['italyan-mutfagi']);
 assert.equal(sent.ingredients[0].name,'Cherry domates');
 assert.equal(sent.steps[0],draft.steps[0]);
 assert.ok(!Object.hasOwn(sent,'calories'));
 for(const changed of [
  {...draft,title:''},{...draft,servings:'0'},
  {...draft,calories:'-1'},{...draft,steps:['']},
  {...draft,ingredients:[{name:'',amount:'2',unit:'adet'}]}
 ]){assert.ok(validateQuickRecipe(changed));assert.throws(()=>approvedQuickRecipe(changed));}
});

test('AI can publish grounded composite egg amounts without inventing whole eggs',()=> {
 const candidate=good();
 candidate.ingredients[0]={name:'Yumurta',amount:'1 bütün + 2 sarı',unit:'adet'};
 const draft=quickRecipeFromAI(candidate);
 assert.equal(validateQuickRecipe(draft),null);
 assert.equal(approvedQuickRecipe(draft).ingredients[0].amount,'1 bütün + 2 sarı');
 candidate.ingredients[0].amount='domatas';
 assert.ok(validateQuickRecipe(quickRecipeFromAI(candidate)));
});
test('Numeric recipe deep links and published duplicate choice retain safe navigation',()=> {
 const api=read('lib/api.ts');
 assert.ok(api.includes('id=${encodeURIComponent(slug)}'));
 assert.ok(api.includes('slug=${encodeURIComponent(slug)}'));
 const screen=read('app/(tabs)/recipes.tsx');
 assert.ok(screen.includes('existing_recipe_slug'));
 assert.ok(screen.includes('setReviewDraft(draft)'));
 assert.ok(screen.includes('await publishGeneratedRecipe(draft, token)'));
 assert.doesNotMatch(screen,/<QuickRecipeReview/);
 const decision=read('components/recipe/SimilarRecipeChoice.tsx');
 assert.match(decision,/Mevcut tarifi görüntüle/);
 assert.match(decision,/Yine de yeni tarif oluştur/);
});
