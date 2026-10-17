'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('recipe detail is a compact accessible Lokma ingredient checklist with honest progress', () => {
  const page = source('app/recipe/[slug].tsx');
  assert.match(page, /ingredientDone|ingredientsReady/);
  assert.match(page, /malzeme hazır/);
  assert.match(page, /<LokmaIngredientIcon name=\{ing\.name\} size=\{27\} \/>/);
  assert.match(page, /style=\{\[styles\.ingredientRow, checkedIngredients\.has\(idx\) && styles\.ingredientRowChecked\]\}/);
  assert.match(page, /accessibilityRole="checkbox"/);
  assert.match(page, /accessibilityState=\{\{ checked: checkedIngredients\.has\(idx\) \}\}/);
  assert.match(page, /onPress=\{\(\) => toggleIngredient\(idx\)\}/);
  assert.match(page, /ingredient\.note|ing\.note/);
  assert.match(page, /displayAmount\(ing\.amount\)/);
  assert.doesNotMatch(page, /<Text style=\{styles\.ingredientBullet\}>/);
});

test('steps have separate tap targets, completion counts and original instructions', () => {
  const page = source('app/recipe/[slug].tsx');
  assert.match(page, /stepsReady/);
  assert.match(page, /adım tamamlandı/);
  assert.match(page, /accessibilityState=\{\{ checked: completedSteps\.has\(idx\) \}\}/);
  assert.match(page, /onPress=\{\(\) => toggleStep\(idx\)\}/);
  assert.match(page, /style=\{\[styles\.stepRow, completedSteps\.has\(idx\) && styles\.stepRowDone\]\}/);
  assert.match(page, /requestCookingAssistant/);
  assert.match(page, /<Text\s+style=\{\[\s*styles\.stepText/);
  assert.match(page, /\{step\}/);
});

test('servings are never invented and only explicit numeric ingredient amounts are scaled', () => {
  const page = source('app/recipe/[slug].tsx');
  assert.match(page, /currentServings === null \|\| defaultServings === null/);
  assert.match(page, /Number\(String\(amount\)\.replace\(',', '\.'\)\)/);
  assert.match(page, /Kişi sayısı belirtilmemiş/);
  assert.match(page, /disabled=\{currentServings === null \|\| currentServings <= 1\}/);
  assert.match(page, /disabled=\{currentServings === null \|\| currentServings >= 36\}/);
  assert.match(page, /style=\{\[styles\.ingredientText, checkedIngredients\.has\(idx\) && styles\.ingredientTextChecked\]\}/);
});

test('import review remains source-grounded, has compact editorial overview and accessible edit rows', () => {
  const page = source('app/recipe/import.tsx');
  assert.match(page, /<LokmaIngredientIcon name=\{ingredient\.name\}/);
  assert.match(page, /editor\.ingredients\.length\} malzeme/);
  assert.match(page, /editor\.steps\.length\} adım/);
  assert.match(page, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(page, /styles\.amountPillMissing/);
  assert.match(page, /Miktar belirtilmemiş/);
  assert.match(page, /ingredient\.original_span/);
  assert.match(page, /step\.original_span/);
  assert.match(page, /Yayımlamak için kaç kişilik olduğunu seç/);
  assert.match(page, /withDeadline\(/);
  assert.match(page, /isPublishResultUncertain/);
  assert.match(page, /buildApprovedRecipe\(editor\)/);
  assert.doesNotMatch(page, /generateImage|generateAIRecipe|autoPublish/);
});

test('visual-only polish keeps interaction endpoints and rating contract intact', () => {
  const page = source('app/recipe/[slug].tsx');
  const emoji = source('lib/lokma-emoji.ts');
  assert.match(page, /submitRating\(token, recipe\.id, rating\)/);
  assert.match(page, /toggleInteraction\(token, recipe\.id, 'favorite'\)/);
  assert.match(page, /toggleInteraction\(token, recipe\.id, 'cooked'\)/);
  assert.match(page, /<CommentSection recipeId=\{recipe\.id\} \/>/);
  assert.match(emoji, /rating: 5/);
});
