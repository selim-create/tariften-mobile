'use strict';
/**
 * P23 Mutfak Rehberi tools (mobile): egg doneness, pasta timer, drying guide
 * and measure converter. Pure logic in lib/guide-tools.ts (numbers mirrored
 * by the web), timestamp timers, the kitchen-timer notification route and
 * the screen/entry-point contracts. Roadmap rule: no result leaves its safe
 * range, unknown inputs are refused.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const localRequire = request => {
    if (request.startsWith('./')) return load(path.join(path.dirname(file), request.slice(2) + '.ts'));
    throw new Error('Unexpected import ' + request + ' in ' + file);
  };
  Function('module', 'exports', 'require', out)(mod, mod.exports, localRequire);
  cache.set(file, mod.exports);
  return mod.exports;
}
const t = load('lib/guide-tools.ts');
const guides = load('lib/guides.ts');
const notif = load('lib/notifications-core.ts');

// ---------------------------------------------------------------------------
// Tool keys

test('Core tool keys map to the four tools; anything else is ignored', () => {
  assert.deepEqual(t.GUIDE_TOOLS.map(x => x.key), ['egg_doneness', 'pasta_timer', 'drying_guide', 'measure_converter']);
  assert.deepEqual(t.GUIDE_TOOLS.map(x => x.slug), ['yumurta', 'makarna', 'kurutma', 'olcu']);
  for (const tool of t.GUIDE_TOOLS) {
    assert.equal(t.guideTool(tool.key), tool);
    assert.equal(t.guideToolBySlug(tool.slug), tool);
    assert.equal(t.guideToolBySlug(tool.key), tool);
  }
  for (const bad of [null, undefined, '', 'EGG_DONENESS', 'oven_timer', 42, {}]) assert.equal(t.guideTool(bad), null, String(bad));
  assert.equal(t.guideToolBySlug(['makarna']).key, 'pasta_timer', 'router params may be arrays');
  assert.equal(t.guideToolBySlug('../yumurta'), null);
});

test('the guide payload keeps `tool` as data for the screen to resolve', () => {
  const g = guides.parseGuideSummary({ id: 1, slug: 'yumurta-haslama', title: 'Yumurta', tool: 'egg_doneness' });
  assert.equal(t.guideTool(g.tool).slug, 'yumurta');
  const none = guides.parseGuideSummary({ id: 2, slug: 'bicak', title: 'Bıçak', tool: null });
  assert.equal(t.guideTool(none.tool), null);
  const unknown = guides.parseGuideSummary({ id: 3, slug: 'x', title: 'X', tool: 'future_tool' });
  assert.equal(t.guideTool(unknown.tool), null);
});

// ---------------------------------------------------------------------------
// 1. Egg

const SIZES = ['S', 'M', 'L', 'XL'];
const STARTS = ['fridge', 'room'];
const DONE = ['rafadan', 'kayisi', 'kati'];

test('egg: reference times from boiling water (fridge-cold M)', () => {
  assert.equal(t.eggTime({ size: 'M', start: 'fridge', doneness: 'rafadan' }).seconds, 360);
  assert.equal(t.eggTime({ size: 'M', start: 'fridge', doneness: 'kayisi' }).seconds, 480);
  assert.equal(t.eggTime({ size: 'M', start: 'fridge', doneness: 'kati' }).seconds, 660);
  assert.equal(t.eggTime({ size: 'XL', start: 'fridge', doneness: 'kati' }).seconds, 720);
  assert.equal(t.eggTime({ size: 'L', start: 'room', doneness: 'kayisi' }).seconds, 450);
  assert.equal(t.eggTime({ size: 'M', start: 'fridge', doneness: 'kayisi' }).label, '8 dk');
  assert.equal(t.eggTime({ size: 'S', start: 'fridge', doneness: 'rafadan' }).label, '5 dk 30 sn');
});

test('egg: every combination stays in its safe window; katı is never under 10 minutes', () => {
  for (const size of SIZES) for (const start of STARTS) for (const doneness of DONE) {
    const r = t.eggTime({ size, start, doneness });
    const [min, max] = t.EGG_RANGE[doneness];
    assert.ok(r.minutes >= min && r.minutes <= max, `${size}/${start}/${doneness} = ${r.minutes}`);
    assert.equal(r.seconds % 30, 0, 'half-minute steps');
    if (doneness === 'kati') assert.ok(r.seconds >= 600, `${size}/${start} katı ${r.seconds}`);
  }
  assert.equal(t.eggTime({ size: 'S', start: 'room', doneness: 'kati' }).seconds, 600, 'clamped up to the fully-set floor');
});

test('egg: bigger and colder take longer; softer is always shorter', () => {
  for (const start of STARTS) for (const doneness of DONE) {
    const times = SIZES.map(size => t.eggTime({ size, start, doneness }).seconds);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1], `${start}/${doneness}`);
  }
  for (const size of SIZES) for (const doneness of DONE) {
    assert.ok(t.eggTime({ size, start: 'fridge', doneness }).seconds >= t.eggTime({ size, start: 'room', doneness }).seconds);
  }
  for (const size of SIZES) for (const start of STARTS) {
    const [a, b, c] = DONE.map(doneness => t.eggTime({ size, start, doneness }).seconds);
    assert.ok(a < b && b < c, `${size}/${start}`);
  }
});

test('egg: runny yolks carry the safety note for children, pregnant and elderly; katı does not', () => {
  for (const doneness of ['rafadan', 'kayisi']) {
    const note = t.eggTime({ size: 'M', start: 'fridge', doneness }).safetyNote;
    assert.ok(note);
    for (const word of ['çocuk', 'hamile', 'yaşlı', 'katı']) assert.match(note, new RegExp(word));
  }
  assert.equal(t.eggTime({ size: 'M', start: 'fridge', doneness: 'kati' }).safetyNote, null);
  assert.match(t.eggTime({ size: 'M', start: 'fridge', doneness: 'kati' }).steps.join(' '), /soğuk suya/);
});

test('egg: unknown inputs are refused', () => {
  assert.equal(t.eggTime({ size: 'XXL', start: 'fridge', doneness: 'kati' }), null);
  assert.equal(t.eggTime({ size: 'M', start: 'freezer', doneness: 'kati' }), null);
  assert.equal(t.eggTime({ size: 'M', start: 'fridge', doneness: 'cig' }), null);
});

// ---------------------------------------------------------------------------
// 2. Pasta

test('pasta: water 1 L and salt 10 g per 100 g; 100 g per portion', () => {
  const r = t.pastaPlan({ shape: 'spagetti', texture: 'al_dente', portions: 2 });
  assert.equal(r.grams, 200);
  assert.equal(r.waterLiters, 2);
  assert.equal(r.saltGrams, 20);
  assert.equal(r.seconds, 8 * 60, 'spagetti 9 dk paket → al dente 8 dk');
  assert.equal(t.pastaPlan({ shape: 'spagetti', texture: 'yumusak', portions: 2 }).seconds, 10 * 60);
  for (let p = 1; p <= 10; p++) {
    const plan = t.pastaPlan({ shape: 'penne', texture: 'al_dente', portions: p });
    assert.equal(plan.waterLiters, p);
    assert.equal(plan.saltGrams, p * 10);
  }
  assert.match(r.saltHint, /^yaklaşık .*kaşığı$/);
  assert.match(r.steps.join(' '), /makarna suyu/);
});

test('pasta: package minutes override the shape and the timer stays within 2–20 minutes', () => {
  assert.equal(t.pastaPlan({ packageMinutes: 12, texture: 'al_dente', portions: 1 }).seconds, 11 * 60);
  assert.equal(t.pastaPlan({ packageMinutes: 7.5, texture: 'yumusak', portions: 1 }).seconds, 8.5 * 60);
  assert.equal(t.pastaPlan({ packageMinutes: 20, texture: 'yumusak', portions: 1 }).seconds, 20 * 60, 'clamped');
  assert.equal(t.pastaPlan({ packageMinutes: 2, texture: 'al_dente', portions: 1 }).seconds, 2 * 60, 'clamped');
  assert.equal(t.pastaPlan({ shape: 'taze', texture: 'al_dente', portions: 1 }).seconds, 2 * 60);
  assert.ok(t.pastaPlan({ shape: 'taze', texture: 'al_dente', portions: 1 }).note);
  for (const shape of t.PASTA_SHAPES) for (const texture of ['al_dente', 'yumusak']) {
    const plan = t.pastaPlan({ shape: shape.key, texture, portions: 3 });
    assert.ok(plan.minutes >= 2 && plan.minutes <= 20, shape.key);
    assert.ok(plan.seconds <= t.TIMER_MAX_SEC);
  }
});

test('pasta: out-of-range or unknown inputs are refused', () => {
  for (const packageMinutes of [0, 1, 1.5, 21, 90, NaN, -5]) {
    assert.equal(t.pastaPlan({ packageMinutes, texture: 'al_dente', portions: 2 }), null, String(packageMinutes));
  }
  for (const portions of [0, 11, -1, NaN]) assert.equal(t.pastaPlan({ shape: 'penne', texture: 'al_dente', portions }), null);
  assert.equal(t.pastaPlan({ shape: 'lazanya', texture: 'al_dente', portions: 2 }), null);
  assert.equal(t.pastaPlan({ shape: 'penne', texture: 'cig', portions: 2 }), null);
  assert.ok(t.pastaPlan({ shape: 'penne', texture: 'al_dente', portions: 8 }).note, 'large pots: split the batch');
});

// ---------------------------------------------------------------------------
// 3. Drying

test('drying: every food × method is a safe spec or an explicit "not recommended"', () => {
  assert.deepEqual(t.DRYING_FOODS.map(f => f.key), ['domates', 'biber', 'patlican', 'elma', 'armut', 'kayisi', 'mantar', 'nane', 'kekik']);
  for (const food of t.DRYING_FOODS) {
    for (const method of ['firin', 'makine', 'gunes']) {
      const plan = t.dryingPlan(food.key, method);
      assert.ok(plan, `${food.key}/${method}`);
      if (plan.status === 'not_recommended') {
        assert.ok(plan.reason.length > 20);
        assert.ok(plan.alternatives.length > 0);
        continue;
      }
      const [lo, hi] = t.DRYING_TEMP_LIMITS[food.group];
      if (plan.tempC) {
        assert.ok(plan.tempC[0] >= lo && plan.tempC[1] <= hi && plan.tempC[0] < plan.tempC[1], `${food.key}/${method} ${plan.tempC}`);
        if (method === 'makine' && food.group !== 'ot') assert.ok(plan.tempC[1] <= 60, 'dehydrator never above 60 °C');
      } else {
        assert.equal(method, 'gunes', 'only sun/shade drying has no oven temperature');
      }
      assert.ok(plan.time.min > 0 && plan.time.min < plan.time.max, `${food.key}/${method} time`);
      assert.equal(plan.time.unit, method === 'gunes' ? 'gün' : 'saat');
      for (const field of ['prep', 'conditions', 'ready', 'storage']) assert.ok(plan[field].length > 15, `${food.key}/${method} ${field}`);
      assert.match(plan.tempLabel, food.group === 'ot' && method === 'gunes' ? /^Gölgede/ : /°C/);
      assert.match(plan.timeLabel, /^\d+–\d+ (saat|gün)$/);
    }
  }
});

test('drying: low-acid vegetables are not sun-dried; sun-dried fruit is pasteurized; herbs dry in shade', () => {
  for (const key of ['biber', 'patlican', 'mantar']) assert.equal(t.dryingPlan(key, 'gunes').status, 'not_recommended', key);
  assert.deepEqual(t.dryingPlan('biber', 'gunes').alternatives, ['firin', 'makine']);
  for (const key of ['domates', 'elma', 'armut', 'kayisi']) {
    const plan = t.dryingPlan(key, 'gunes');
    assert.equal(plan.status, 'ok');
    assert.match(plan.conditions, /30 °C/);
    assert.ok(plan.notes.some(n => /dondurucu/.test(n) && /70 °C/.test(n)), `${key} pasteurization`);
  }
  for (const key of ['nane', 'kekik']) assert.match(t.dryingPlan(key, 'gunes').conditions, /gölge/i);
  assert.match(t.dryingPlan('domates', 'firin').storage, /buzdolabında/, 'tomatoes in oil are refrigerated');
  assert.ok(t.dryingPlan('domates', 'makine').notes.some(n => /botulizm/.test(n)));
  assert.ok(t.dryingPlan('mantar', 'makine').notes.some(n => /yabani/.test(n)));
});

test('drying: no meat or fish jerky, unknown foods and methods are refused', () => {
  for (const key of ['et', 'sigir', 'tavuk', 'balik', 'hindi', 'pastirma', 'jerky', 'muz', '', null]) assert.equal(t.dryingPlan(key, 'firin'), null, String(key));
  assert.equal(t.dryingPlan('domates', 'mikrodalga'), null);
  assert.ok(t.DRYING_GENERAL_NOTES.some(n => /jerky/.test(n) && /balık/.test(n)));
  assert.ok(t.DRYING_FOODS.every(f => ['sebze', 'meyve', 'ot'].includes(f.group)));
});

// ---------------------------------------------------------------------------
// 4. Converter

test('converter: household volumes (su bardağı 200, çay bardağı 100, kaşıklar 15/10/5 ml)', () => {
  const ml = Object.fromEntries(t.MEASURE_UNITS.map(u => [u.key, u.ml]));
  assert.deepEqual(ml, { su_bardagi: 200, cay_bardagi: 100, yemek_kasigi: 15, tatli_kasigi: 10, cay_kasigi: 5, ml: 1, g: null });
  const c = (a, f, to, i) => t.convertMeasure(a, f, to, i);
  assert.equal(c('1', 'su_bardagi', 'ml').text, '200 ml');
  assert.equal(c('1', 'su_bardagi', 'cay_bardagi').text, '2 çay bardağı');
  assert.equal(c('1', 'yemek_kasigi', 'cay_kasigi').text, '3 çay kaşığı');
  assert.equal(c('1,5', 'su_bardagi', 'ml').text, '300 ml');
  assert.equal(c('1/2', 'su_bardagi', 'yemek_kasigi').text, '6 ¾ yemek kaşığı');
  assert.equal(c('100', 'ml', 'su_bardagi').text, '½ su bardağı');
  assert.equal(c('2', 'tatli_kasigi', 'yemek_kasigi').text, '1 ¼ yemek kaşığı');
  assert.equal(c('1', 'su_bardagi', 'ml', 'bilinmeyen').ok, true, 'volume ↔ volume needs no ingredient');
});

test('converter: grams by density for known ingredients', () => {
  const g = (a, f, i) => t.convertMeasure(a, f, 'g', i);
  assert.equal(g('1', 'su_bardagi', 'un').text, '110 g');
  assert.equal(g('1', 'su_bardagi', 'seker').text, '170 g');
  assert.equal(g('1', 'su_bardagi', 'su').text, '200 g');
  assert.equal(g('1', 'su_bardagi', 'sut').text, '205 g');
  assert.equal(g('1', 'yemek_kasigi', 'tereyagi').text, '14 g');
  assert.equal(g('1', 'cay_kasigi', 'tuz').text, '6 g');
  assert.equal(g('1', 'yemek_kasigi', 'kakao').text, '6,5 g');
  assert.equal(t.convertMeasure('250', 'g', 'su_bardagi', 'un').text, '2 ¼ su bardağı');
  assert.equal(t.convertMeasure('100', 'g', 'ml', 'seker').text, '120 ml');
  assert.equal(g('1', 'su_bardagi', 'un').approximate, true);
  for (const item of t.INGREDIENT_DENSITY) assert.ok(item.density >= 0.3 && item.density <= 1.5, item.key);
  for (const name of ['un', 'şeker', 'pudra şekeri', 'pirinç', 'tuz', 'tereyağı', 'süt', 'su', 'yağ', 'kakao', 'irmik']) {
    assert.ok(t.ingredientDensity(name), name);
  }
});

test('converter: Turkish names match regardless of case; unknown ingredients never get grams', () => {
  assert.equal(t.ingredientDensity('Buğday Unu').key, 'un');
  assert.equal(t.ingredientDensity('TOZ ŞEKER').key, 'seker');
  assert.equal(t.ingredientDensity('İRMİK').key, 'irmik');
  assert.equal(t.ingredientDensity('SIVI YAĞ').key, 'sivi_yag');
  for (const unknown of ['kinoa', 'chia', 'diger', '', null, undefined]) {
    assert.equal(t.ingredientDensity(unknown), null, String(unknown));
    const r = t.convertMeasure('1', 'su_bardagi', 'g', unknown);
    assert.equal(r.ok, false);
    assert.match(r.error, /gram/i);
    assert.equal(t.convertMeasure('100', 'g', 'ml', unknown).ok, false);
  }
  assert.equal(t.convertMeasure('100', 'g', 'g', null).text, '100 g', 'g → g needs no density');
});

test('converter: invalid and huge amounts are refused; parsing accepts comma, fractions and ½', () => {
  for (const bad of ['', '0', '-1', 'abc', '1/0', '1..5', null]) assert.equal(t.convertMeasure(bad, 'su_bardagi', 'ml').ok, false, String(bad));
  assert.equal(t.convertMeasure('51', 'su_bardagi', 'ml').ok, false, '> 10 L');
  assert.equal(t.convertMeasure('20000', 'g', 'ml', 'su').ok, false, '> 10 kg');
  assert.equal(t.convertMeasure('50', 'su_bardagi', 'ml').text, '10000 ml');
  assert.equal(t.parseAmount('1,5'), 1.5);
  assert.equal(t.parseAmount('1.5'), 1.5);
  assert.equal(t.parseAmount('1/2'), 0.5);
  assert.equal(t.parseAmount('1 1/2'), 1.5);
  assert.equal(t.parseAmount('1½'), 1.5);
  assert.equal(t.parseAmount('¾'), 0.75);
  assert.equal(t.parseAmount('1/0'), null);
  assert.equal(t.parseAmount('2e3'), null);
});

test('converter: rounding is kitchen-friendly and rows skip silly amounts', () => {
  assert.equal(t.roundMeasure(3.26, 'g'), 3.5);
  assert.equal(t.roundMeasure(47.4, 'ml'), 47);
  assert.equal(t.roundMeasure(117.6, 'ml'), 120);
  assert.equal(t.roundMeasure(1234, 'g'), 1230);
  assert.equal(t.formatMeasure(1.5, 'su_bardagi'), '1 ½ su bardağı');
  assert.equal(t.formatMeasure(0.25, 'cay_kasigi'), '¼ çay kaşığı');
  assert.equal(t.formatMeasure(6.5, 'g'), '6,5 g');
  const litre = t.converterRows('1000', 'ml', 'su');
  assert.deepEqual(litre.rows.map(r => r.unit), ['su_bardagi', 'cay_bardagi', 'g'], '66 yemek kaşığı is not a useful answer');
  const spoon = t.converterRows('1', 'cay_kasigi', 'un');
  assert.deepEqual(spoon.rows.map(r => r.unit), ['yemek_kasigi', 'tatli_kasigi', 'ml', 'g']);
  const other = t.converterRows('1', 'su_bardagi', null);
  assert.equal(other.gramsRefused, true);
  assert.ok(!other.rows.some(r => r.unit === 'g'));
  const fromGrams = t.converterRows('100', 'g', null);
  assert.equal(fromGrams.rows.length, 0);
  assert.equal(fromGrams.gramsRefused, true);
  assert.ok(fromGrams.error);
});

test('spoon hints for salt', () => {
  assert.equal(t.spoonHint(10, 'tuz'), 'yaklaşık ¾ tatlı kaşığı');
  assert.equal(t.spoonHint(20, 'tuz'), 'yaklaşık 1 ¾ tatlı kaşığı');
  assert.equal(t.spoonHint(60, 'tuz'), 'yaklaşık 3 ¼ yemek kaşığı');
  assert.equal(t.spoonHint(10, 'kinoa'), '');
});

// ---------------------------------------------------------------------------
// Timers

test('timers are timestamp based: backgrounding just moves "now"', () => {
  const now = 1_800_000_000_000;
  const timer = t.startTimer('egg', 480, 'M boy · kayısı', now);
  assert.equal(timer.endsAt, now + 480_000);
  assert.deepEqual(t.timerSnapshot(timer, now), { remainingSec: 480, done: false, progress: 0 });
  assert.equal(t.timerSnapshot(timer, now + 1).remainingSec, 480, 'ceil: never shows 7:59 at the start');
  const back = t.timerSnapshot(timer, now + 300_000); // 5 minutes in the background
  assert.equal(back.remainingSec, 180);
  assert.equal(back.done, false);
  assert.ok(Math.abs(back.progress - 0.625) < 1e-9);
  const late = t.timerSnapshot(timer, now + 3_600_000);
  assert.deepEqual(late, { remainingSec: 0, done: true, progress: 1 });
  assert.equal(t.formatClock(480), '08:00');
  assert.equal(t.formatClock(59.2), '01:00');
  assert.equal(t.formatClock(3725), '1:02:05');
  assert.equal(t.minutesLabel(510), '8 dk 30 sn');
});

test('timers never start outside 1 s – 30 min', () => {
  const now = 1_800_000_000_000;
  for (const bad of [0, -5, NaN, Infinity]) assert.equal(t.startTimer('pasta', bad, '', now), null);
  assert.equal(t.startTimer('pasta', 99999, '', now).durationSec, t.TIMER_MAX_SEC);
  assert.equal(t.startTimer('egg', 10, 'x'.repeat(200), now).label.length, 80);
});

test('stored timers: malformed, foreign, forged or stale entries are dropped', () => {
  const now = 1_800_000_000_000;
  const ok = t.startTimer('pasta', 600, 'Penne', now - 60_000);
  assert.deepEqual(t.parseStoredTimer(JSON.stringify(ok), now), ok);
  assert.deepEqual(t.parseStoredTimer(ok, now), ok);
  assert.equal(t.parseStoredTimer('{bad json', now), null);
  assert.equal(t.parseStoredTimer({ ...ok, kind: 'oven' }, now), null);
  assert.equal(t.parseStoredTimer({ ...ok, durationSec: 99999 }, now), null);
  assert.equal(t.parseStoredTimer({ ...ok, endsAt: ok.endsAt + 3_600_000 }, now), null, 'end must match start + duration');
  assert.equal(t.parseStoredTimer({ ...ok, startedAt: now + 3_600_000, endsAt: now + 3_600_000 + 600_000 }, now), null, 'future start');
  assert.equal(t.parseStoredTimer(ok, ok.endsAt + 7 * 3600 * 1000), null, 'stale');
  assert.ok(t.parseStoredTimer(ok, ok.endsAt + 60_000), 'recently finished: still shows "Süre doldu"');
});

test('kitchen-timer notification taps route back to the tool, nothing else', () => {
  assert.equal(notif.routeForNotification({ type: 'kitchen_timer', url: '/rehber/araclar?arac=yumurta' }), '/rehber/araclar?arac=yumurta');
  assert.equal(notif.routeForNotification({ type: 'kitchen_timer', url: '/rehber/araclar?arac=makarna' }), '/rehber/araclar?arac=makarna');
  assert.equal(notif.routeForNotification({ type: 'kitchen_timer', url: '/rehber/araclar' }), '/rehber/araclar');
  for (const url of ['/rehber/araclar?arac=../login', '/rehber/araclar?arac=yumurta&x=1', '/rehber/baska', 'https://evil.test/rehber/araclar']) {
    assert.equal(notif.routeForNotification({ type: 'kitchen_timer', url }), notif.INBOX_PATH, url);
  }
});

// ---------------------------------------------------------------------------
// Source contracts

test('screens: tools screen registered, reachable from guide list, tool cards and Keşfet', () => {
  const layout = read('app/_layout.tsx');
  assert.ok(layout.includes('<Stack.Screen name="rehber/araclar" options={{ headerShown: false }} />'));
  const screen = read('app/rehber/araclar.tsx');
  assert.match(screen, /GUIDE_TOOLS\.map/);
  assert.match(screen, /guideToolBySlug\(params\.arac\)/);
  assert.match(screen, /automaticallyAdjustKeyboardInsets/);
  assert.match(screen, /insets\.bottom/);
  assert.match(read('app/rehber/index.tsx'), /router\.push\('\/rehber\/araclar'\)/);
  assert.match(read('app/(tabs)/index.tsx'), /router\.push\('\/rehber\/araclar'\)/);
  const article = read('app/rehber/[slug].tsx');
  assert.match(article, /const tool = guideTool\(guide\.tool\);/);
  assert.match(article, /<GuideToolCard tool=\{tool\}/);
  assert.match(article, /pathname: '\/rehber\/araclar', params: \{ arac: tool\.slug \}/);
  assert.match(article, /automaticallyAdjustKeyboardInsets/);
  assert.ok(article.indexOf('<GuideToolCard') < article.indexOf('<GuideArticle'), 'tool sits above the article body');
  assert.ok(article.indexOf('tocCard') < article.indexOf('<GuideToolCard'), 'after the table of contents');
});

test('timer feedback: never asks for notification permission; schedules only when already granted', () => {
  const store = read('lib/kitchen-timer-store.ts');
  assert.doesNotMatch(store, /requestPermissionsAsync|requestNotificationPermission/);
  assert.match(store, /permission\.status !== 'granted' \|\| preference === false\) return;/);
  assert.match(store, /notificationsModule\(\)/);
  assert.match(store, /cancelScheduledNotificationAsync/);
  assert.match(store, /type: 'kitchen_timer'/);
  assert.match(store, /SecureStore/);
  assert.match(store, /Vibration\.vibrate/);
  const provider = read('components/notifications/NotificationsProvider.tsx');
  assert.match(provider, /'kitchen_timer' && pathRef\.current\.startsWith\('\/rehber'\)/);
});

test('JS-only: tool code imports nothing native beyond the current build', () => {
  const pkg = JSON.parse(read('package.json'));
  const allowed = /^(react|react-native|expo-router|expo-secure-store|@expo\/vector-icons|react-native-safe-area-context|\.{1,2}\/.*)$/;
  const files = ['lib/guide-tools.ts', 'lib/kitchen-timer-store.ts', 'app/rehber/araclar.tsx',
    ...fs.readdirSync(path.join(root, 'components/guide-tools')).map(f => `components/guide-tools/${f}`)];
  for (const file of files) {
    for (const [, spec] of read(file).matchAll(/from '([^']+)'/g)) {
      assert.match(spec, allowed, `${file} imports ${spec}`);
      if (!spec.startsWith('.')) assert.ok(pkg.dependencies[spec] || spec === 'react-native' || spec === 'react', spec);
    }
    assert.doesNotMatch(read(file), /expo-haptics|expo-keep-awake/, file);
  }
  assert.doesNotMatch(read('lib/guide-tools.ts'), /from '/, 'pure module: no imports');
});

test('CI runs this suite', () => {
  assert.match(read('.github/workflows/mobile-ci.yml'), /node --test scripts\/check-guide-tools\.test\.cjs/);
});
