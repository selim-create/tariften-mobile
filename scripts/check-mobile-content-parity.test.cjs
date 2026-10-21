'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('mobile quota UI follows the Core 1.0.24 identity and unlimited entitlements without backend IDs', () => {
  const quota = read('components/QuotaCard.tsx');
  const quotaApi = read('lib/quotas.ts');
  assert.match(quota, /Standart Üye/);
  assert.match(quota, /data\.tier === 'internal'/);
  assert.match(quota, /Dahili Hesap · Sınırsız/);
  assert.match(quota, /Premium \+ · Yakında/);
  assert.match(quota, /q\.limit === null \? 'Sınırsız'/);
  assert.match(quotaApi, /fetchAccountQuotas\(token/);
  assert.match(quotaApi, /'administrator' \| 'internal' \| 'standard'/);
  for (const forbidden of [/Ücretsiz üye/i, /WordPress kullanıcı/i, /\.account\?\.login/, /kullanıcı #/i, /küresel AI bütçe/i]) {
    assert.doesNotMatch(quota, forbidden);
  }
});

test('mobile recipe detail does not fabricate servings or scale unknown source quantities', () => {
  const detail = read('app/recipe/[slug].tsx');
  assert.match(detail, /Number\.isInteger\(servingCount\)/);
  assert.match(detail, /setCurrentServings\(parsedServings\)/);
  assert.match(detail, /setDefaultServings\(parsedServings\)/);
  assert.match(detail, /currentServings === null \|\| defaultServings === null/);
  assert.match(detail, /Kişi sayısı belirtilmemiş/);
  assert.match(detail, /disabled=\{currentServings === null/);
  // Macros appear only when checked; nothing is derived from calories.
  assert.match(detail, /recipe\.nutrition_status === 'verified'/);
  assert.doesNotMatch(detail, /calories \* 0\.(25|45|30)/);
  assert.doesNotMatch(detail, /parseInt\(String\(data\.servings\), 10\) \|\| 1/);
});

test('mobile profile never links to a non-existing recipe create route', () => {
  const profile = read('app/(tabs)/profile.tsx');
  const recipeListing = read('app/(tabs)/recipes.tsx');
  assert.doesNotMatch(profile, /router\.push\('\/recipe\/create'\)/);
  assert.match(profile, /router\.push\('\/recipes'\)/);
  assert.match(profile, /Tarifleri Keşfet/);
  assert.match(recipeListing, /AI ile Tarif Oluştur/);
});
