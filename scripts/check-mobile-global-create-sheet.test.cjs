'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = pathName => fs.readFileSync(path.join(root, pathName), 'utf8');

test('create button lives in the centre of the floating tab bar and opens the shared sheet', () => {
  const layout = read('app/(tabs)/_layout.tsx');
  const bar = read('components/navigation/FloatingTabBar.tsx');
  assert.match(layout, /tabBar=\{props => <FloatingTabBar \{\.\.\.props\} onCreate=\{\(\) => setCreateOpen\(true\)\} createOpen=\{createOpen\} \/>\}/);
  assert.match(layout, /<GlobalCreateAction visible=\{createOpen\} onClose=\{\(\) => setCreateOpen\(false\)\} \/>/);
  // Hidden routes stay real (deep links, pushes) but are not tabs.
  for (const tab of ['recipes', 'pantry', 'menus', 'profile']) {
    assert.match(layout, new RegExp("name: '"+tab+"'"));
  }
  assert.match(layout, /href: null/);
  const visible = [...bar.matchAll(/\{ name: '([^']+)', label: '([^']+)'/g)].map(m => m[2]);
  assert.deepEqual(visible, ['Keşfet', 'Defterim', 'Bu Hafta', 'Alışveriş']);
  for (const screen of ['defterim', 'bu-hafta', 'alisveris']) {
    assert.ok(fs.existsSync(path.join(root, 'app/(tabs)/' + screen + '.tsx')), screen + ' screen exists');
  }
  assert.match(bar, /accessibilityLabel="Tarif veya menü ekle"/);
  assert.match(bar, /accessibilityState=\{\{ expanded: createOpen \}\}/);
  assert.match(bar, /accessibilityRole="tab"/);
  assert.match(bar, /pointerEvents="box-none"/);
  assert.match(bar, /bottom: Math\.max\(insets\.bottom, BAR_GAP\)/);
  assert.match(bar, /export function useTabBarSpace/);
});

test('sheet uses a native dimmed bottom modal with accessible close and navigation actions', () => {
  const component = read('components/navigation/GlobalCreateAction.tsx');
  assert.match(component, /<Modal/);
  assert.match(component, /transparent/);
  assert.match(component, /animationType="slide"/);
  assert.match(component, /onRequestClose=\{close\}/);
  assert.match(component, /<Pressable[\s\S]+onPress=\{close\}/);
  assert.match(component, /accessibilityViewIsModal/);
  assert.match(component, /Math\.max\(insets\.bottom, 16\)/);
  assert.match(component, /clearTimeout\(navigationTimer\.current\)/);
  assert.match(component, /router\.push\(user && token \? route : '\/login'\)/);
  assert.match(component, /const close = \(\) => onClose\(\)/);
});

test('global create sheet exposes only real manual, import and menu create destinations', () => {
  const component = read('components/navigation/GlobalCreateAction.tsx');
  const destinations = [...component.matchAll(/route: '(\/[^']+)'/g)].map(x => x[1]);
  assert.deepEqual(destinations, ['/recipe/aktar', '/(tabs)/recipes?quick=1', '/recipe/create', '/menu/create']);
  for(const [route, file] of [
    ['/recipe/create', 'app/recipe/create.tsx'],
    ['/recipe/aktar', 'app/recipe/aktar.tsx'],
    ['/recipe/import', 'app/recipe/import.tsx'],
    ['/menu/create', 'app/menu/create.tsx']
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), route + ' should have a real screen');
  }
  assert.match(component, /Tarif Aktar/);
  assert.match(read('app/recipe/aktar.tsx'), /RecipeTextImportScreen initialMethod="social"/);
  assert.match(read('app/recipe/import.tsx'), /Tarif metni/);
  assert.match(read('app/_layout.tsx'), /name="recipe\/aktar"/);
  assert.doesNotMatch(component, /camera\/import|AI fotoğraf/i);
});

test('Recipes screen returns directly to discovery list without full-width promo cards', () => {
  const recipes = read('app/(tabs)/recipes.tsx');
  assert.doesNotMatch(recipes, /Tarifini kendin yaz|Kendi tarifini ekle/);
  assert.doesNotMatch(recipes, /router\.push\('\/recipe\/create'\)|router\.push\('\/recipe\/import'\)/);
  assert.match(recipes, /<SearchBar/);
  assert.match(recipes, /<FilterSheet/);
  assert.match(recipes, /<ResponsiveGrid/);
  assert.match(recipes, /activeChips\.length > 0/);
  const searchIndex = recipes.indexOf('<SearchBar');
  const filterIndex = recipes.indexOf('{activeChips.length > 0 ?');
  const listingIndex = recipes.indexOf('<ResponsiveGrid');
  assert.ok(searchIndex >= 0 && filterIndex > searchIndex && listingIndex > filterIndex);
});

test('create modal leaves existing create/import APIs, quotas and menu job intact', () => {
  const manual = read('components/recipe/RecipeManualEditor.tsx');
  const imported = read('app/recipe/import.tsx');
  const menus = read('app/menu/create.tsx');
  assert.match(manual, /fetchAccountQuotas/);
  assert.match(manual, /approvedManualPayload/);
  assert.match(manual, /createRecipe\(token, values, signal\)/);
  assert.match(imported, /buildApprovedRecipe/);
  assert.match(imported, /Alert\.alert\('Tarifini herkese açık yayımla'/);
  assert.match(menus, /beginMenu\(token, form, requestId\)/);
});
