const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '..', 'lib/lokma-emoji.ts'), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const shim = {exports:{}};
Function('module','exports',compiled)(shim,shim.exports);
const {lokmaIngredient} = shim.exports;
const key = name => { const r = lokmaIngredient(name); return r.art || r.emoji; };

test('Turkish compound names resolve to their head noun', () => {
  const cases = [
    ['Patates gnocchi', '🍝'],
    ['Gnocchi haşlama suyu', '🫗'],
    ['Makarna haşlama suyu', '🫗'],
    ['Tavuk suyu', '🫗'],
    ['Domates salçası', 'paste'],
    ['Pirinç unu', 'flour'],
    ['Mısır nişastası', 'flour'],
    ['Tavuk göğsü', '🍗'],
    ['Yumurta sarısı', '🥚'],
  ];
  for (const [name, expected] of cases) assert.equal(key(name), expected, name);
});

test('the juice of a food keeps the food, plain water stays water', () => {
  assert.equal(key('Limon suyu'), '🍋');
  assert.equal(key('Yarım limonun suyu'), '🍋');
  assert.equal(key('Portakal suyu'), '🍊');
  assert.equal(key('Su'), '🫗');
  assert.equal(key('Ilık su'), '🫗');
  assert.equal(key('Maden suyu'), '🫗');
});

test('alternatives in parentheses never replace the ingredient; descriptors still help', () => {
  assert.equal(key('Parmesan peyniri (veya Grana Padano / Pecorino)'), '🧀');
  assert.equal(key('Tereyağı (veya zeytinyağı)'), '🧈');
  assert.equal(key('Kuru domates (yağda veya yumuşatılmış)'), '🍅');
  assert.equal(key('Kırmızı acı biber (chili)'), 'pepper');
  assert.equal(key('kırmızı biber (baharat)'), 'paprikaspice');
});

test('missing Turkish characters and inflections still match', () => {
  assert.equal(key('Taze feslegen yaprakları'), '🌿');
  assert.equal(key('Taze fesleğen yaprakları'), '🌿');
  assert.equal(key('cig badem'), 'almond');
  assert.equal(key('Bademler'), 'almond');
  assert.equal(key('Kültür mantarı'), '🍄');
  assert.equal(key('Labne peyniri'), 'creamcheese');
});

test('variety names beat the generic family noun', () => {
  assert.equal(key('Çarliston biber'), 'carliston');
  assert.equal(key('Sivri biber'), 'sivri');
  assert.equal(key('Kapya biber'), 'kapiapepper');
  assert.equal(key('Bal kabağı'), 'pumpkin');
  assert.equal(key('Taze fasulye'), 'greenbean');
  assert.equal(key('Karabiber'), 'blackpepper', 'black pepper is peppercorns, never a pepper pod');
});

test('this recipe: Kuru Domates ve Badem Pestolu Gnocchi has no wrong icon', () => {
  const recipe = {
    'Kuru domates (yağda veya yumuşatılmış)': '🍅', 'Çiğ badem': 'almond', 'Kırmızı acı biber (chili)': 'pepper',
    'Parmesan peyniri (veya Grana Padano / Pecorino)': '🧀', 'Tuz': 'salt', 'Taze çekilmiş karabiber': 'blackpepper',
    'Zeytinyağı': 'oliveoil', 'Patates gnocchi': '🍝', 'Tereyağı': '🧈', 'Gnocchi haşlama suyu': '🫗',
    'Taze feslegen yaprakları': '🌿',
  };
  for (const [name, expected] of Object.entries(recipe)) assert.equal(key(name), expected, name);
});

test('unknown words never become food by accident', () => {
  assert.equal(key('bilinmeyen gurme malzeme'), '🍽️');
  assert.equal(key('unlu mamul'), '🍽️', '"un" must not match inside unrelated words');
  assert.equal(key('suşi pirinci'), '🍚');
});

test('dish titles pick an illustration for photo-less recipe cards', () => {
  const {lokmaDishName} = shim.exports;
  const dish = title => key(lokmaDishName(title));
  assert.equal(dish('Kuru Domates ve Badem Pestolu Gnocchi'), '🍝');
  assert.equal(dish('Parmesanlı Mantarlı Risotto'), '🍚');
  assert.equal(dish('Çikolatalı Sufle'), '🍫');
  assert.equal(dish('Fırında Karnıyarık'), '🍆');
  assert.equal(dish('Menemen'), '🥚');
  assert.equal(key('Tuzlu tereyağı'), '🧈', 'the -lı fallback never applies to ingredient lists');
});

test('wave 2: everyday Turkish pantry items get their own illustration', () => {
  const cases = [
    ['Patlıcan', '🍆'], ['Salatalık', '🥒'], ['Yeşil biber', 'sweetpepper'], ['Dolmalık biber', 'bellpepper'],
    ['Ispanak', 'spinach'], ['Taze soğan', 'greenonion'], ['Kuru nane', 'mint'], ['Kekik', 'thyme'],
    ['Biberiye', 'rosemary'], ['Defne yaprağı', 'bayleaf'], ['Zencefil', 'ginger'],
    ['Nar', 'pomegranate'], ['Nar ekşisi', 'pomsauce'], ['Kuru incir', 'fig'], ['Kuru kayısı', 'apricot'],
    ['Erik', 'plum'], ['Hurma', 'date'], ['Ayva', 'quince'], ['Antep fıstığı', 'pistachio'], ['Yer fıstığı', '🥜'],
    ['Hindistan cevizi rendesi', 'coconut'], ['Haşlanmış nohut', 'chickpea'], ['Kuru fasulye', '🫘'],
    ['Köftelik bulgur', 'bulgur'], ['Yulaf ezmesi', 'oats'], ['Zerdeçal', 'turmeric'], ['Sumak', 'sumac'],
    ['Pul biber', 'chiliflakes'], ['Kakao', 'cocoa'], ['Esmer şeker', 'brownsugar'], ['Toz şeker', '🍬'],
    ['Dana kıyma', 'mince'], ['Kuzu pirzola', 'lamb'], ['Dana eti', '🥩'], ['Ton balığı', 'tuna'],
    ['Somon fileto', 'salmon'], ['Levrek', '🐟'], ['Midye', 'mussel'],
    ['Beyaz peynir', 'whitecheese'], ['Kaşar peyniri', '🧀'], ['Labne', 'creamcheese'], ['Sıvı krema', 'cream'],
    ['Süt', '🥛'], ['Elma sirkesi', 'vinegar'], ['Soya sosu', 'soysauce'], ['Üzüm pekmezi', 'molasses'],
    ['Bal', '🍯'], ['Hardal', 'mustard'], ['Ketçap', 'ketchup'], ['Mayonez', 'mayonnaise'], ['Tahin', 'sauce'],
    ['Kuru maya', 'yeast'], ['Kabartma tozu', 'baking'], ['Turşu', 'pickle'], ['Lavaş', 'flatbread'], ['Ekmek', '🍞'],
  ];
  for (const [name, expected] of cases) assert.equal(key(name), expected, name);
});
