const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '..', 'lib/shopping-list.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports:{}};
Function('module','exports',compiled)(mod,mod.exports);
const {parseAmount, buildShoppingList, itemAmountText, shoppingListText} = mod.exports;

test('Turkish amounts parse exactly, never as their first digit', () => {
  assert.equal(parseAmount('1/2'), 0.5);
  assert.equal(parseAmount('1,5'), 1.5);
  assert.equal(parseAmount('1 1/2'), 1.5);
  assert.equal(parseAmount('300'), 300);
  assert.equal(parseAmount('2-3'), null);
  assert.equal(parseAmount('yarım'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('0'), null);
});

test('same ingredient and unit is summed across recipes; ids beat spelling', () => {
  const list = buildShoppingList([
    { title: 'Zeytinyağlı Enginar', ingredients: [
      { ingredient_id: 23, name: 'Zeytinyağı', amount: '1/2', unit: 'su bardağı' },
      { ingredient_id: 44, name: 'Su', amount: '1', unit: 'litre' },
    ] },
    { title: 'Çerkez Tavuğu', ingredients: [
      { ingredient_id: 23, name: 'zeytinyağı', amount: '1,5', unit: 'su bardağı' },
      { name: 'Tuz', amount: '1 tutam', unit: '' },
      { name: 'tuz', amount: '', unit: '' },
    ] },
  ]);
  const oil = list.find(i => i.key.startsWith('id:23'));
  assert.equal(oil.total, 2);
  assert.equal(itemAmountText(oil), '2 su bardağı');
  assert.deepEqual(oil.recipes, ['Zeytinyağlı Enginar', 'Çerkez Tavuğu']);
  const salt = list.find(i => i.name.toLowerCase() === 'tuz');
  assert.equal(salt.total, null);
  assert.equal(itemAmountText(salt), '1 tutam');
});

test('different units stay separate and non-numeric parts are kept as written', () => {
  const list = buildShoppingList([
    { title: 'A', ingredients: [{ name: 'Limon', amount: '2', unit: 'adet' }, { name: 'Limon', amount: '2-3', unit: 'adet' }] },
    { title: 'B', ingredients: [{ name: 'Limon', amount: '1', unit: 'yemek kaşığı' }] },
  ]);
  const adet = list.find(i => i.unit === 'adet');
  assert.equal(itemAmountText(adet), '2 adet + 2-3 adet');
  assert.equal(list.filter(i => i.name === 'Limon').length, 2);
});

test('copied text has no emoji and keeps every item', () => {
  const list = buildShoppingList([{ title: 'A', ingredients: [{ name: 'Un', amount: '200', unit: 'gram' }] }]);
  const text = shoppingListText('Meze Tadım Menüsü', list);
  assert.match(text, /^Meze Tadım Menüsü · Alışveriş listesi/);
  assert.match(text, /- 200 gram Un/);
  assert.doesNotMatch(text, /\p{Extended_Pictographic}/u);
});
