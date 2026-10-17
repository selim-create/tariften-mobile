'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('recipe hero replaces the empty native navigation header with full-bleed image and native safe-area back action', () => {
  const layout = read('app/_layout.tsx');
  const detail = read('app/recipe/[slug].tsx');
  const section = layout.match(/name="recipe\/\[slug\]"[\s\S]*?\/>/);
  assert.ok(section, 'recipe detail must have its own route configuration');
  assert.match(section[0], /headerShown: false/);
  assert.match(detail, /contentInsetAdjustmentBehavior="never"/);
  assert.match(detail, /automaticallyAdjustContentInsets=\{false\}/);
  assert.match(detail, /<StatusBar style="light" \/>/);
  assert.match(detail, /<View style=\{styles\.hero\}>/);
  assert.match(detail, /<LinearGradient[^>]*colors=/);
  assert.match(detail, /top: Math\.max\(insets\.top \+ 8, 20\)/);
  assert.match(detail, /onPress=\{handleBack\}/);
  assert.match(detail, /accessibilityLabel="Tariflere geri dön"/);
  assert.match(detail, /router\.canGoBack\(\)/);
  assert.match(detail, /router\.replace\('\/recipes'\)/);
  assert.match(detail, /<ImagePlaceholder title=\{recipe\.title\} variant="detail" style=\{styles\.image\} \/>/);
  assert.match(detail, /source=\{\{ uri: recipe\.image \}\}/);
  assert.doesNotMatch(detail, /navigation\.setOptions\(\{ title: data\.title \}\)/);
});

test('all five rating choices are equal-width vector icon cards in one native row', () => {
  const detail = read('app/recipe/[slug].tsx');
  const ratings = read('lib/lokma-emoji.ts');
  assert.match(detail, /LOKMA_RATINGS\.map\(\(\{ rating, label \}\)/);
  assert.match(detail, /RATING_ICONS\[rating - 1\]/);
  assert.match(detail, /accessibilityState=\{\{ selected: userRating === rating \}\}/);
  assert.match(detail, /onPress=\{\(\) => handleRate\(rating\)\}/);
  assert.match(detail, /lokmaRatingRow:[\s\S]*?flexWrap: 'nowrap'/);
  assert.match(detail, /lokmaRatingOption:[\s\S]*?flex: 1, minWidth: 0/);
  assert.match(detail, /numberOfLines=\{1\}/);
  assert.match(detail, /adjustsFontSizeToFit minimumFontScale=\{0\.85\}/);
  assert.match(detail, /RATING_DISPLAY_LABELS\[rating - 1\]/);
  assert.match(detail, /height: 80, borderRadius: 13/);
  assert.match(detail, /justifyContent: 'space-between', gap: 5/);
  assert.match(detail, /lokmaRatingLabel:[\s\S]*?textAlign: 'center'/);
  assert.match(detail, /lokmaRatingLabel:[\s\S]*?height: 16/);
  const captions = detail.match(/const RATING_DISPLAY_LABELS = \[(.*?)\] as const;/);
  assert.ok(captions, 'Five purpose-built short captions are needed for narrow phones');
  const labels = [...captions[1].matchAll(/'([^']+)'/g)].map(value => value[1]);
  assert.deepEqual(labels, ['Sevmedim', 'Pek değil', 'Fena değil', 'Lezzetli', 'Bayıldım']);
  assert.ok(labels.every(label => label.length <= 10 && !label.includes('\\n')),
    'Captions must fit single-line five-column layout without word breaks');
  assert.doesNotMatch(detail, /styles\.lokmaRatingEmoji|\{emoji\}<\/Text>/);
  assert.match(detail, /submitRating\(token, recipe\.id, rating\)/);
  const entries = ratings.slice(ratings.indexOf('export const LOKMA_RATINGS'), ratings.indexOf('type FoodSymbol'));
  const values = [...entries.matchAll(/\{ rating: (\d),/g)].map(match => Number(match[1]));
  assert.deepEqual(values, [1, 2, 3, 4, 5]);
});

test('comment reaction pills and glyphs are centered without changing inserted emoji contracts', () => {
  const comments = read('components/CommentSection.tsx');
  assert.match(comments, /lokmaReactionRow:[\s\S]*?justifyContent: 'center'/);
  assert.match(comments, /lokmaReactionRow:[\s\S]*?alignItems: 'center'/);
  assert.match(comments, /lokmaReactionButton:[\s\S]*?alignItems: 'center', justifyContent: 'center'/);
  assert.match(comments, /lokmaReactionEmoji:[\s\S]*?textAlign: 'center'/);
  assert.match(comments, /LOKMA_REACTIONS\.map\(\(\{ id, emoji, label \}\)/);
  assert.match(comments, /current \+ \(current && !current\.endsWith\(' '\) \? ' ' : ''\) \+ emoji/);
  assert.match(comments, /disabled=\{!newComment\.trim\(\) \|\| submitting\}/);
});
