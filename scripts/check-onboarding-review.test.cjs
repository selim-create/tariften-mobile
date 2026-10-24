'use strict';
/**
 * Post-sign-up "Sosyal medyadan tarif kaydetmeyi öğren" onboarding and the
 * native App Store / Google Play rating prompt.
 *
 * Onboarding: shown only to NEW accounts (e-mail sign-up, or Apple sign-in
 * with Core's is_new_user) after the kitchen profile step, once per account,
 * replayable from Profile; steps mirror the real Paylaş → Tariften path per
 * platform; the mock draws no platform names or logos; the demo never calls
 * the API.
 * Rating: expo-store-review only (no "do you like us?" pre-prompt, Apple
 * 5.6.1 / Google Play anti-gating); thresholds, 90-day gap, yearly cap,
 * onboarding exclusion, and the triggers wired at the real success points.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function loadTS(file, dependencies = {}) {
  const js = ts.transpileModule(read(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const mod = { exports: {} };
  const requireLocal = name => {
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
    throw new Error('Unexpected dependency ' + name);
  };
  new Function('module', 'exports', 'require', js)(mod, mod.exports, requireLocal);
  return mod.exports;
}

const review = loadTS('lib/review-prompt-core.ts');
const onb = loadTS('lib/onboarding-core.ts');
const notif = loadTS('lib/notifications-core.ts');

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);

const ONBOARDING_FILES = [
  'app/onboarding/social.tsx',
  'components/onboarding/DemoPhone.tsx',
  'components/onboarding/DemoMedia.tsx',
  'components/onboarding/DemoRecipeCard.tsx',
  'components/onboarding/motion.tsx',
  'lib/onboarding-core.ts',
  'lib/onboarding.ts',
  'assets/onboarding/index.ts',
];

// ===========================================================================
// Onboarding: who sees it

test('only a new account (welcome) sees it, once per account; replay always works', () => {
  assert.equal(onb.shouldShowSocialOnboarding({ entry: 'welcome', userId: 42, seen: false }), true);
  assert.equal(onb.shouldShowSocialOnboarding({ entry: 'welcome', userId: 42, seen: true }), false, 'once per account');
  assert.equal(onb.shouldShowSocialOnboarding({ entry: 'welcome', userId: null, seen: false }), false, 'needs an account');
  assert.equal(onb.shouldShowSocialOnboarding({ entry: 'welcome', userId: 0, seen: false }), false);
  assert.equal(onb.shouldShowSocialOnboarding({ entry: null, userId: 42, seen: false }), false, 'existing members are never forced');
  assert.equal(onb.shouldShowSocialOnboarding({ entry: 'replay', userId: 42, seen: true }), true, 'Profile → Nasıl kullanılır?');
  assert.equal(onb.parseEntry('welcome'), 'welcome');
  assert.equal(onb.parseEntry('anything'), 'replay');
  assert.equal(onb.parseEntry(undefined), 'replay');
});

test('the seen flag is per account, in SecureStore-safe keys', () => {
  assert.equal(onb.seenKey(42), 'tariften_onb_social_v1_42');
  assert.notEqual(onb.seenKey(42), onb.seenKey(43));
  assert.equal(onb.seenKey(0), null);
  assert.equal(onb.seenKey(-1), null);
  assert.equal(onb.seenKey(1.5), null);
  assert.match(onb.seenKey(987654), /^[A-Za-z0-9._-]+$/);
  const store = read('lib/onboarding.ts');
  assert.match(store, /expo-secure-store/);
  assert.match(store, /SecureStore\.setItemAsync\(key, String\(Date\.now\(\)\)\)/);
});

test('sign-up and new Apple accounts reach the kitchen step, then the onboarding', () => {
  const register = read('app/register.tsx');
  const login = read('app/login.tsx');
  const auth = read('context/AuthContext.tsx');
  const kitchen = read('app/profile/kitchen.tsx');
  assert.match(register, /router\.replace\(\{ pathname: '\/profile\/kitchen', params: \{ welcome: '1' \} \}\)/);
  assert.equal((auth.match(/isNewUser: data\?\.is_new_user === true/g) || []).length, 2, 'Apple + Google read Core is_new_user');
  for (const screen of [register, login]) {
    assert.match(screen, /const \{ isNewUser \} = await loginWithApple\(/);
    assert.match(screen, /if \(isNewUser\) router\.replace\(\{ pathname: '\/profile\/kitchen', params: \{ welcome: '1' \} \}\);/);
  }
  // Kitchen step: only welcome=1 and only when not yet seen for this account.
  assert.match(kitchen, /if \(isWelcome && user && await shouldOfferWelcomeOnboarding\(user\.id\)\)/);
  assert.match(kitchen, /router\.replace\(\{ pathname: '\/onboarding\/social', params: \{ from: 'welcome' \} \}\)/);
  assert.match(kitchen, /void afterWelcome\(\(\) => router\.dismissTo\('\/\(tabs\)\/profile'\)\)/, 'finishing the profile');
  assert.match(kitchen, /const exit = useCallback\(\(\) => \{\s*void afterWelcome\(/, 'leaving the profile step');
  assert.equal((kitchen.match(/onboarding\/social/g) || []).length, 1);
  // Nothing else opens it automatically.
  for (const file of ['app/_layout.tsx', 'app/(tabs)/index.tsx', 'context/AuthContext.tsx', 'components/notifications/NotificationsProvider.tsx']) {
    assert.doesNotMatch(read(file), /router\.(push|replace)\([^)]*onboarding/, file);
  }
});

test('the screen marks the account as seen on open and has a replay entry in Profile', () => {
  const screen = read('app/onboarding/social.tsx');
  const profile = read('app/(tabs)/profile.tsx');
  assert.match(screen, /if \(user\?\.id\) void markSocialOnboardingSeen\(user\.id\)/);
  assert.match(profile, /Nasıl kullanılır\?/);
  assert.match(profile, /router\.push\(\{ pathname: '\/onboarding\/social', params: \{ from: 'replay' \} \}\)/);
  assert.match(read('app/_layout.tsx'), /<Stack\.Screen name="onboarding\/social" options=\{\{ headerShown: false/);
});

// ===========================================================================
// Onboarding: steps per platform mirror the real share flow

test('iOS: Paylaş → Paylaş… → Daha Fazla → Tariften’e Aktar → Bağlantıdan tarif oluştur', () => {
  const steps = onb.demoSteps('ios');
  assert.deepEqual(steps.map(s => s.scene), ['video', 'appMenu', 'systemSheet', 'moreApps', 'aktar']);
  assert.deepEqual(steps.map(s => s.target), ['Paylaş', 'Paylaş…', 'Daha Fazla', "Tariften'e Aktar", 'Bağlantıdan tarif oluştur']);
  assert.match(steps[2].kicker, /Yalnızca ilk sefer/, '"Daha Fazla" is a first-time step');
});

test('Android: Paylaş → Tariften → Bağlantıdan tarif oluştur', () => {
  const steps = onb.demoSteps('android');
  assert.deepEqual(steps.map(s => s.scene), ['video', 'androidSheet', 'aktar']);
  assert.deepEqual(steps.map(s => s.target), ['Paylaş', 'Tariften', 'Bağlantıdan tarif oluştur']);
});

test('step labels match the real app: share extension name, app name and the Tarif Aktar button', () => {
  const app = JSON.parse(read('app.json')).expo;
  const share = app.plugins.find(p => Array.isArray(p) && p[0] === 'expo-share-intent')[1];
  assert.equal(onb.IOS_SHARE_TARGET, share.iosShareExtensionName);
  assert.equal(onb.ANDROID_SHARE_TARGET, app.name);
  assert.ok(share.androidIntentFilters.includes('text/*'), 'Android receives the shared link as text');
  assert.match(read('app/recipe/import.tsx'), new RegExp(`'${onb.AKTAR_BUTTON}'`));
  assert.match(read('app/share.tsx'), /router\.replace\(\{ pathname: '\/recipe\/aktar', params: \{ url \} \}\)/, 'the link lands in Tarif Aktar');
});

test('every step has Turkish copy, a target label and a VoiceOver hint; quick enough', () => {
  for (const platform of ['ios', 'android']) {
    const steps = onb.demoSteps(platform);
    assert.ok(steps.length >= 3 && steps.length <= 5, '~4–5 taps at most');
    for (const step of steps) {
      for (const key of ['kicker', 'title', 'hint', 'target', 'a11yHint']) assert.ok(step[key] && step[key].trim(), `${platform} ${step.scene} ${key}`);
      assert.match(step.title, /\*[^*]+\*/, 'one brand accent per title');
    }
  }
  assert.ok(onb.PREPARING_TICK_MS * onb.PREPARING_LINES.length <= 3000, '"hazırlanıyor" stays short');
  assert.equal(onb.COPY.skip, 'Atla');
  assert.equal(onb.COPY.next, 'Devam');
  assert.match(onb.COPY.doneTitle, /hazır/);
});

// ===========================================================================
// Onboarding: no brand names or logos in the mock, no API calls

test('the phone mock draws no platform names or logos', () => {
  const brands = /instagram|tiktok|youtube|facebook|reels|shorts|whatsapp|airdrop|messenger/i;
  for (const file of ONBOARDING_FILES) {
    const src = read(file);
    assert.doesNotMatch(src, /logo-[a-z]/, `${file}: no brand logo icons`);
    if (file === 'lib/onboarding-core.ts') continue;
    assert.doesNotMatch(src, brands, file);
  }
  // In the copy, platforms are named once, in plain text, on the first step's hint only.
  const core = read('lib/onboarding-core.ts');
  const lines = core.split('\n').filter(line => /Instagram|TikTok|YouTube/.test(line) && !/^\s*(\*|\/\/)/.test(line));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\s*hint: 'Instagram, TikTok veya YouTube’da/);
  assert.equal(onb.demoSteps('ios')[0].hint, onb.demoSteps('android')[0].hint);
});

test('the demo makes no API calls and uses only local demo data', () => {
  for (const file of ONBOARDING_FILES) {
    const src = read(file);
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|axios/, file);
    const imports = [...src.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const spec of imports) {
      assert.doesNotMatch(spec, /lib\/api$|-api$|recipe-import|quotas|video-recipe-import|photo-recipe|own-video/, `${file} imports ${spec}`);
    }
    assert.doesNotMatch(src, /maybeAskForReview/, `${file}: the demo never counts as a happy moment`);
  }
  assert.equal(typeof onb.DEMO_RECIPE.title, 'string');
  assert.ok(onb.DEMO_RECIPE.ingredients.length >= 4);
  assert.match(read('components/onboarding/DemoRecipeCard.tsx'), /DEMO_RECIPE/);
});

test('header has back, progress and Atla on every step; Devam fallback; accessible', () => {
  const screen = read('app/onboarding/social.tsx');
  const phone = read('components/onboarding/DemoPhone.tsx');
  assert.match(screen, /accessibilityLabel="Geri"/);
  assert.match(screen, /accessibilityLabel="Atla"/);
  assert.match(screen, /accessibilityRole="progressbar"/);
  assert.match(screen, /accessibilityLabel=\{COPY\.next\}/);
  assert.match(screen, /AccessibilityInfo\.announceForAccessibility\(/);
  assert.match(screen, /useSafeAreaInsets/);
  assert.match(phone, /accessibilityRole="button" accessibilityLabel=\{ctx\.target\} accessibilityHint=\{ctx\.a11yHint\}/);
  assert.match(phone, /accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/);
});

test('Reduce Motion: no pulse, no Ken Burns, no progress run, no card rise', () => {
  const screen = read('app/onboarding/social.tsx');
  const phone = read('components/onboarding/DemoPhone.tsx');
  const media = read('components/onboarding/DemoMedia.tsx');
  const card = read('components/onboarding/DemoRecipeCard.tsx');
  const motion = read('components/onboarding/motion.tsx');
  assert.match(motion, /AccessibilityInfo\.isReduceMotionEnabled\(\)/);
  assert.match(motion, /addEventListener\('reduceMotionChanged'/);
  assert.match(motion, /if \(!enabled\) \{ value\.setValue\(1\); return undefined; \}/, 'entrances are simply there');
  assert.match(phone, /useLoop\(1800, !reduceMotion, EASE_OUT\)/, 'ring pulse');
  assert.match(phone, /\{!reduceMotion \? \(\s*<Animated\.View pointerEvents="none" style=\{\[styles\.ringPulse/);
  assert.match(phone, /const bob = useLoop\(1200, !reduceMotion\)/, 'tag bob');
  assert.match(media, /useLoop\(18000, !reduceMotion, EASE_SOFT\)/, 'Ken Burns');
  assert.match(media, /const motion = reduceMotion \? \{ transform: \[\{ scale: 1\.06 \}\] \}/, 'still frame');
  assert.match(media, /useLoop\(7000, !reduceMotion, Easing\.linear\)/, 'video progress');
  assert.match(card, /useEntrance\(!reduceMotion, 60, 620\)/);
  assert.match(card, /useEntrance\(!reduceMotion, 560, 420\)/);
  assert.match(screen, /<DemoRecipeCard compact=\{compact\} reduceMotion=\{reduceMotion\} \/>/);
  assert.doesNotMatch(read('package.json'), /react-native-reanimated|lottie|confetti|expo-video|expo-av/, 'React Native Animated only, no new native module');
});

// ===========================================================================
// Onboarding polish (owner review 2026-10-24)

test('final screen: no confetti, no check badge; nothing is drawn over the header', () => {
  for (const file of ONBOARDING_FILES) {
    assert.doesNotMatch(read(file), /confetti/i, file);
  }
  const screen = read('app/onboarding/social.tsx');
  assert.doesNotMatch(screen, /name="checkmark"/, 'no generic check-in-a-circle');
  assert.doesNotMatch(screen, /doneBadge/);
  // The header comes first and is its own layer; no full-screen overlay is rendered after it.
  assert.match(screen, /header: \{[^}]*zIndex: 2/);
  assert.doesNotMatch(screen, /StyleSheet\.absoluteFill/, 'no overlay can cover the header');
  // Editorial headline, the app's brand accent, and the recipe the way the app shows one.
  assert.match(onb.COPY.doneTitle, /^Tarifin \*hazır\*$/);
  assert.equal(onb.COPY.doneRibbon, 'Defterine eklemeye hazır');
  assert.equal(onb.COPY.doneBadge, 'Videodan');
  const card = read('components/onboarding/DemoRecipeCard.tsx');
  assert.match(card, /<DemoMedia reduceMotion=\{reduceMotion\} scrim="card" \/>/, 'same media as the phone');
  assert.match(card, /COPY\.doneBadge/);
  assert.match(card, /COPY\.doneRibbon/);
  assert.match(card, /r\.minutes\} dk`\], \['people-outline', `\$\{r\.servings\} kişilik`\], \['list-outline', `\$\{r\.ingredients\.length\} malzeme`/);
  assert.match(card, /r\.firstStep/);
});

test('no green and no new colours in the onboarding: theme tokens only', () => {
  const theme = read('constants/theme.ts');
  for (const file of ONBOARDING_FILES) {
    const src = read(file);
    assert.doesNotMatch(src, /colors\.success|successSoft/, `${file}: no success green`);
    // Hex literals: only plain white for text/icons on photos and the brand button.
    const hexes = [...src.matchAll(/'#([0-9a-fA-F]{3,8})'/g)].map(m => m[1].toLowerCase());
    for (const hex of hexes) assert.ok(['fff', 'ffffff'].includes(hex), `${file}: #${hex} is not a theme colour`);
    // rgba(): black/ink/white scrims, or the brand red with alpha. Never a green channel lead.
    for (const m of src.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+)/g)) {
      const [r, g, b] = m.slice(1, 4).map(Number);
      assert.ok(!(g > r + 20 && g > b + 20), `${file}: rgba(${r},${g},${b}) is green`);
      const known = ['0,0,0', '255,255,255', '31,26,23', '219,76,63'];
      assert.ok(known.includes(`${r},${g},${b}`), `${file}: rgba(${r},${g},${b}) is not a theme colour`);
    }
  }
  assert.match(theme, /brand: '#db4c3f'/, 'the brand red the rgba halo is derived from');
  assert.match(theme, /ink: '#1f1a17'/, 'the ink the source pill is derived from');
});

test('real food media: DemoMedia shows the photo when supplied, a safe fallback until then', () => {
  const assets = loadTS('assets/onboarding/index.ts', { './demo-recipe.jpg': 4242 });
  const index = read('assets/onboarding/index.ts');
  const photo = path.join(root, 'assets/onboarding/demo-recipe.jpg');
  if (fs.existsSync(photo)) {
    assert.equal(assets.demoRecipeImage, 4242, 'photo added: wired with the one require line');
  } else {
    assert.equal(assets.demoRecipeImage, null, 'no photo yet: null, so the bundle never requires a missing file');
    assert.doesNotMatch(index.replace(/^\s*\*.*$/gm, ''), /require\(/, 'no live require without the file');
  }
  assert.match(index, /assets\/onboarding\/demo-recipe\.jpg/, 'the comment says where the photo goes');
  assert.match(index, /export const demoRecipeImage: ImageSourcePropType \| null = require\('\.\/demo-recipe\.jpg'\);/, 'and the exact line to enable it');
  const media = read('components/onboarding/DemoMedia.tsx');
  assert.match(media, /import \{ demoRecipeImage \} from '\.\.\/\.\.\/assets\/onboarding';/);
  assert.match(media, /\{demoRecipeImage \? \(\s*<Image source=\{demoRecipeImage/, 'photo when present');
  assert.match(media, /\) : \(\s*<LinearGradient colors=\{MEDIA_FALLBACK_GRADIENT\}[\s\S]{0,240}<DishArt/, 'brand gradient + plate fallback');
  assert.match(media, /contentFit="cover"/, 'full bleed');
  assert.match(media, /scrim === 'video' \? \(\s*<LinearGradient colors=\{\['rgba\(0,0,0,0\.42\)'/, 'top scrim for the status bar and progress');
  assert.match(media, /scrim !== 'none' \? \(\s*<LinearGradient colors=\{\['rgba\(0,0,0,0\)', 'rgba\(0,0,0,0\.28\)', 'rgba\(0,0,0,0\.66\)'\]/, 'bottom scrim for caption and rail');
  assert.match(media, /export const MEDIA_FALLBACK_GRADIENT = \[colors\.ink, colors\.ink, colors\.brandDark\] as const;/);
  const phone = read('components/onboarding/DemoPhone.tsx');
  assert.match(phone, /<DemoMedia reduceMotion=\{reduceMotion\} scrim="video" progress=\{/, 'the phone plays the same media with the progress bar');
  assert.doesNotMatch(read('package.json'), /expo-video/, 'no video module yet');
});

test('share sheets: the video overlay (rail, caption) is hidden under every sheet', () => {
  const phone = read('components/onboarding/DemoPhone.tsx');
  assert.match(phone, /const chrome = scene === 'video';/);
  const rail = phone.indexOf('Right rail');
  const gate = phone.lastIndexOf('{chrome ? (', rail);
  assert.ok(gate > 0 && rail > gate, 'the rail renders only on the video scene');
  assert.match(phone, /\{scene === 'aktar' \? <AktarScene \{\.\.\.ctx\} \/> : <VideoScene \{\.\.\.ctx\} \/>\}/);
  // iOS share sheet has no grabber; neutral tiles only (no third-party logos, no coloured app tiles).
  assert.match(phone, /<SlideUp ctx=\{ctx\} style=\{styles\.sheetGrouped\} handle=\{false\}>/);
  assert.doesNotMatch(phone, /tint="#/);
});

test('tag placement: inside the screen, clear of content, on the reserved side only', () => {
  const bounds = { x: 6, y: 34, width: 216, height: 440 };
  const tag = { width: 46, height: 22 };
  const base = { tag, bounds, gap: 6, caret: 5 };
  // Beside the rail's share button, vertically centred, fully inside.
  const share = { x: 170, y: 300, width: 44, height: 40 };
  const left = onb.placeTag({ ...base, target: share, prefer: 'left' });
  assert.equal(left.side, 'left');
  assert.equal(left.x + tag.width + 5 + 6, share.x, 'caret tip sits the gap away from the target');
  assert.equal(left.y + tag.height / 2, share.y + share.height / 2);
  assert.equal(left.caret, tag.height / 2);
  // A caption under the tag pushes it off that side (the step-1 collision).
  const caption = { x: 8, y: 300, width: 150, height: 60 };
  assert.equal(onb.placeTag({ ...base, target: share, prefer: 'left', avoid: [caption], sides: ['left'] }), null, 'never over the caption');
  const flipped = onb.placeTag({ ...base, target: share, prefer: 'left', avoid: [caption] });
  assert.ok(flipped && flipped.side !== 'left' && !onb.rectsOverlap({ x: flipped.x, y: flipped.y, ...tag }, caption));
  // Right edge: a tag under the last tile is pushed inside and its caret still points at the tile.
  const edgeTile = { x: 186, y: 380, width: 36, height: 44 };
  const below = onb.placeTag({ ...base, target: edgeTile, prefer: 'bottom', sides: ['bottom'] });
  assert.equal(below.side, 'bottom');
  assert.ok(below.x + tag.width <= bounds.x + bounds.width, 'not clipped on the right');
  assert.ok(Math.abs(below.x + below.caret - (edgeTile.x + edgeTile.width / 2)) < 0.01, 'caret under the tile centre');
  // No room below: reserved-side only means no tag at all, never a clipped one.
  const lowTile = { x: 100, y: 440, width: 36, height: 30 };
  assert.equal(onb.placeTag({ ...base, target: lowTile, prefer: 'bottom', sides: ['bottom'] }), null);
  // Large Dynamic Type: a wider tag still lands fully inside or not at all.
  for (const width of [46, 64, 90, 140, 230]) {
    for (const target of [share, edgeTile, { x: 6, y: 200, width: 40, height: 40 }]) {
      for (const prefer of ['left', 'top', 'bottom', 'right']) {
        const p = onb.placeTag({ ...base, tag: { width, height: 22 }, target, prefer });
        if (!p) continue;
        assert.ok(p.x >= bounds.x - 0.5 && p.x + width <= bounds.x + bounds.width + 0.5, `x in bounds (${width}, ${prefer})`);
        assert.ok(p.y >= bounds.y - 0.5 && p.y + 22 <= bounds.y + bounds.height + 0.5, `y in bounds (${width}, ${prefer})`);
        assert.ok(!onb.rectsOverlap({ x: p.x, y: p.y, width, height: 22 }, target), 'never on the target');
      }
    }
  }
  assert.equal(onb.placeTag({ ...base, tag: { width: 0, height: 0 }, target: share, prefer: 'left' }), null, 'not measured yet');
  // The phone uses it with the side it reserved room for, and only while waiting for the tap.
  const phone = read('components/onboarding/DemoPhone.tsx');
  assert.match(phone, /placeTag\(\{\s*target: info\.rect, tag: size, bounds, prefer: info\.prefer, sides: \[info\.prefer\]/);
  assert.match(phone, /\{target && waiting \? \(/, 'no tag while the sample is prepared');
  assert.match(phone, /node\.measureLayout\(screen,/, 'measured in the phone screen\'s coordinates');
  assert.match(phone, /<Text maxFontSizeMultiplier=\{1\.35\} numberOfLines=\{1\} style=\{\[styles\.tagText/, 'the tag text is measured, not a fixed box');
});

test('phone size never exceeds its stage; kickers uppercase in Turkish', () => {
  for (const stage of [{ width: 375, height: 300 }, { width: 375, height: 389 }, { width: 393, height: 520 }, { width: 430, height: 700 }, { width: 320, height: 200 }]) {
    const phone = onb.phoneSize(stage);
    assert.ok(phone, JSON.stringify(stage));
    assert.ok(phone.height <= stage.height - 12, 'leaves the stage padding');
    assert.ok(phone.width <= stage.width * 0.74 + 1);
    assert.ok(phone.height <= 600);
    assert.ok(Math.abs(phone.height / phone.width - onb.PHONE_RATIO) < 0.05);
  }
  assert.equal(onb.phoneSize({ width: 375, height: 60 }), null, 'too small: no phone rather than an overflowing one');
  assert.equal(onb.phoneSize({ width: 0, height: 0 }), null);
  assert.match(read('app/onboarding/social.tsx'), /const phone = useMemo\(\(\) => \(stage \? phoneSize\(stage\) : null\), \[stage\]\);/);
  assert.equal(onb.trUpper('Örnek tarif'), 'ÖRNEK TARİF');
  assert.equal(onb.trUpper('Adım 3 · Yalnızca ilk sefer'), 'ADIM 3 · YALNIZCA İLK SEFER');
  assert.equal(onb.trUpper('Neredeyse bitti'), 'NEREDEYSE BİTTİ');
  const screen = read('app/onboarding/social.tsx');
  assert.match(screen, /trUpper\(step \? step\.kicker : COPY\.preparingKicker\)/);
  assert.match(screen, /trUpper\(COPY\.doneKicker\)/);
  assert.doesNotMatch(screen, /textTransform: 'uppercase'/, 'not locale aware on iOS');
  assert.doesNotMatch(screen, /numberOfLines=\{3\}/, 'step hints are never truncated');
});

test('the optional notification card reuses the existing permission flow', () => {
  const base = { moment: 'onboarding', permission: 'undetermined', canAskAgain: true, preference: null, declinedAt: null, now: T0 };
  assert.equal(notif.promptDecision(base), 'sheet');
  assert.equal(notif.promptDecision({ ...base, permission: 'granted' }), 'none');
  assert.equal(notif.promptDecision({ ...base, permission: 'denied', canAskAgain: true }), 'none', 'already decided');
  assert.equal(notif.promptDecision({ ...base, preference: false }), 'none');
  assert.equal(notif.promptDecision({ ...base, preference: true }), 'none');
  assert.equal(notif.promptDecision({ ...base, declinedAt: T0 - DAY }), 'none', 'same "Şimdi değil" cooldown');
  assert.equal(notif.promptDecision({ ...base, permission: 'unavailable' }), 'none');
  const provider = read('components/notifications/NotificationsProvider.tsx');
  assert.match(provider, /moment: 'onboarding'/);
  assert.match(provider, /acceptNotifyOffer: acceptPrompt, declineNotifyOffer: declinePrompt/);
  assert.equal((provider.match(/requestNotificationPermission\(/g) || []).length, 2, 'no new OS prompt path');
  const screen = read('app/onboarding/social.tsx');
  assert.match(screen, /notifications\.canOfferFromOnboarding\(\)/);
  assert.match(screen, /if \(canNotify\) setPhase\(\{ kind: 'notify' \}\);\s*else leave\(\);/, 'never blocks');
});

// ===========================================================================
// Rating: pure rules

function state(over = {}) {
  return { ...review.EMPTY_REVIEW_STATE, requests: [], firstLaunchAt: T0, ...over };
}
function decide(s, over = {}) {
  return review.reviewDecision({ state: s, reason: 'recipe_cooked', now: T0 + 10 * DAY, available: true, onboardingActive: false, busy: false, ...over });
}

test('rules: the documented thresholds', () => {
  assert.equal(review.REVIEW_RULES.minDaysSinceStart, 3);
  assert.equal(review.REVIEW_RULES.minDaysBetweenRequests, 90);
  assert.equal(review.REVIEW_RULES.maxRequestsPerYear, 3);
  assert.equal(review.REVIEW_RULES.minSavedRecipes, 2);
  assert.ok(review.REVIEW_RULES.delayMs >= 1000 && review.REVIEW_RULES.delayMs <= 2500);
});

test('at least 3 days after first launch and after the first onboarding', () => {
  assert.deepEqual(decide(state({ firstLaunchAt: null })), { ask: false, why: 'too_early' });
  assert.deepEqual(decide(state(), { now: T0 + 3 * DAY - 1 }), { ask: false, why: 'too_early' });
  assert.deepEqual(decide(state(), { now: T0 + 3 * DAY }), { ask: true });
  assert.deepEqual(decide(state({ onboardingFinishedAt: T0 + 9 * DAY }), { now: T0 + 10 * DAY }), { ask: false, why: 'too_early' });
  assert.deepEqual(decide(state({ onboardingFinishedAt: T0 + 2 * DAY }), { now: T0 + 5 * DAY }), { ask: true });
});

test('never during the onboarding demo, nor right after it (also after a replay)', () => {
  assert.deepEqual(decide(state(), { onboardingActive: true }), { ask: false, why: 'onboarding' });
  const now = T0 + 20 * DAY;
  assert.deepEqual(decide(state({ demoEndedAt: now - 60 * 1000 }), { now }), { ask: false, why: 'demo_quiet' });
  assert.deepEqual(decide(state({ demoEndedAt: now - review.REVIEW_RULES.demoQuietMs }), { now }), { ask: true });
  let s = review.withDemoEnded(state(), T0 + DAY, true);
  assert.equal(s.onboardingFinishedAt, T0 + DAY);
  s = review.withDemoEnded(s, T0 + 30 * DAY, false);
  assert.equal(s.onboardingFinishedAt, T0 + DAY, 'a replay does not move the 3-day anchor');
  assert.equal(s.demoEndedAt, T0 + 30 * DAY);
});

test('saves ask from the 2nd recipe on; "Pişirdim" asks on its own', () => {
  let s = review.withSuccess(state(), 'recipe_saved');
  assert.equal(s.savedRecipes, 1);
  assert.deepEqual(decide(s, { reason: 'recipe_saved' }), { ask: false, why: 'needs_more_saves' });
  s = review.withSuccess(s, 'recipe_saved');
  assert.deepEqual(decide(s, { reason: 'recipe_saved' }), { ask: true });
  assert.equal(review.withSuccess(state(), 'recipe_cooked').savedRecipes, 0, 'cooking is not a save');
  assert.deepEqual(decide(state(), { reason: 'recipe_cooked' }), { ask: true });
});

test('90 days between requests and at most 3 per rolling year', () => {
  let s = state({ savedRecipes: 5 });
  let now = T0 + 10 * DAY;
  assert.deepEqual(decide(s, { now }), { ask: true });
  s = review.withRequest(s, now);
  assert.deepEqual(decide(s, { now: now + 89 * DAY }), { ask: false, why: 'too_soon' });
  assert.deepEqual(decide(s, { now: now + 90 * DAY }), { ask: true });
  // Three requests 120 days apart fit in a year only if spaced; force the cap with 91-day gaps.
  s = state({ savedRecipes: 5, requests: [now, now + 91 * DAY, now + 182 * DAY] });
  assert.deepEqual(decide(s, { now: now + 273 * DAY }), { ask: false, why: 'yearly_cap' });
  assert.deepEqual(decide(s, { now: now + 366 * DAY }), { ask: true }, 'the oldest request left the 365-day window');
  const pruned = review.withRequest(s, now + 400 * DAY);
  assert.ok(pruned.requests.every(t => t > now + 400 * DAY - 365 * DAY), 'only the last 365 days are kept');
});

test('unavailable (TestFlight, old binary) or busy (sheet open, app in background) never asks', () => {
  assert.deepEqual(decide(state(), { available: false }), { ask: false, why: 'unavailable' });
  assert.deepEqual(decide(state(), { busy: true }), { ask: false, why: 'busy' });
});

test('stored state is read defensively', () => {
  assert.deepEqual(review.parseReviewState(null), review.EMPTY_REVIEW_STATE);
  assert.deepEqual(review.parseReviewState('not json'), review.EMPTY_REVIEW_STATE);
  assert.deepEqual(review.parseReviewState('[1,2]').requests, []);
  const s = review.parseReviewState(JSON.stringify({ firstLaunchAt: T0, savedRecipes: -3, requests: [T0 + 5, 'x', -1, T0] }));
  assert.equal(s.firstLaunchAt, T0);
  assert.equal(s.savedRecipes, 0);
  assert.deepEqual(s.requests, [T0, T0 + 5]);
  const round = review.parseReviewState(review.serializeReviewState(state({ savedRecipes: 2, requests: [T0] })));
  assert.equal(round.savedRecipes, 2);
  assert.equal(review.withFirstLaunch(state({ firstLaunchAt: T0 }), T0 + DAY).firstLaunchAt, T0, 'first launch never moves');
  assert.equal(review.withFirstLaunch(state({ firstLaunchAt: null }), T0 + DAY).firstLaunchAt, T0 + DAY);
});

test('write-review page: only real store hosts; hidden when no store URL is configured', () => {
  assert.equal(review.writeReviewUrl('ios', 'https://apps.apple.com/tr/app/tariften/id1234567890'),
    'https://apps.apple.com/tr/app/tariften/id1234567890?action=write-review');
  assert.equal(review.writeReviewUrl('ios', 'https://evil.test/app/id1234567890'), null);
  assert.equal(review.writeReviewUrl('ios', 'http://apps.apple.com/app/id1234567890'), null);
  assert.equal(review.writeReviewUrl('ios', 'https://apps.apple.com/app/tariften'), null, 'needs a numeric App Store id');
  assert.equal(review.writeReviewUrl('android', 'https://play.google.com/store/apps/details?id=com.tariften.app'),
    'https://play.google.com/store/apps/details?id=com.tariften.app');
  assert.equal(review.writeReviewUrl('android', 'https://play.google.com/store/apps/details'), null);
  assert.equal(review.writeReviewUrl('ios', null), null);
  assert.equal(review.writeReviewUrl('web', 'https://apps.apple.com/app/id1234567890'), null);
  // No invented store ids: when present they must be real store URLs.
  const app = JSON.parse(read('app.json')).expo;
  if (app.ios.appStoreUrl !== undefined) assert.ok(review.writeReviewUrl('ios', app.ios.appStoreUrl));
  if (app.android.playStoreUrl !== undefined) assert.ok(review.writeReviewUrl('android', app.android.playStoreUrl));
  const profile = read('app/(tabs)/profile.tsx');
  assert.match(profile, /const reviewUrl = useMemo\(\(\) => storeReviewPageUrl\(\), \[\]\)/);
  assert.match(profile, /\{reviewUrl \? \(/);
  assert.match(profile, /Tariften'i değerlendir/);
  assert.match(read('lib/review-prompt.ts'), /writeReviewUrl\(Platform\.OS, module\.storeUrl\(\)\)/);
});

// ===========================================================================
// Rating: native module, no pre-prompt, wiring

test('expo-store-review: SDK 55 version, guarded native load, delayed request, recorded first', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.dependencies['expo-store-review'], /^~55\./);
  const src = read('lib/review-prompt.ts');
  assert.match(src, /requireOptionalNativeModule\('ExpoStoreReview'\)/);
  assert.match(src, /require\('expo-store-review'\)/);
  assert.doesNotMatch(src, /^import \* as StoreReview from 'expo-store-review'/m, 'no import-time native requirement');
  assert.match(src, /await module\.isAvailableAsync\(\)/);
  assert.match(src, /setTimeout\(resolve, REVIEW_RULES\.delayMs\)/);
  const record = src.indexOf('withRequest(state, Date.now())');
  const ask = src.indexOf('await module.requestReview()');
  assert.ok(record > 0 && ask > record, 'the request is recorded before the OS sheet');
  assert.match(src, /AppState\.currentState !== 'active'/);
  assert.match(src, /expo-secure-store/);
  assert.doesNotMatch(src, /from '\.\/api'/, 'kept out of lib/api.ts');
});

test('no custom "do you like us?" pre-prompt; requestReview lives in one helper', () => {
  const dirs = ['app', 'components', 'lib', 'context', 'hooks'];
  const files = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(rel);
    }
  };
  dirs.forEach(walk);
  for (const file of files) {
    const src = read(file);
    assert.doesNotMatch(src, /beğendin mi|seviyor musun|memnun musun|bizi değerlendir|kaç yıldız/i, file);
    if (file !== path.join('lib', 'review-prompt.ts')) {
      assert.doesNotMatch(src, /requestReview\(|expo-store-review/, file);
    }
  }
});

test('triggers are wired at the real success points', () => {
  const sites = {
    'app/recipe/import.tsx': /maybeAskForReview\('recipe_saved'\);\s*router\.replace\('\/recipe\/' \+ encodeURIComponent\(slug\)\);/,
    'app/(tabs)/recipes.tsx': /maybeAskForReview\('recipe_saved'\);\s*router\.push\(`\/recipe\/\$\{saved\.slug \|\| saved\.id\}`\);/,
    'app/(tabs)/pantry.tsx': /if \(saveResponse\?\.success\) \{\s*maybeAskForReview\('recipe_saved'\);/,
    'components/recipe/PhotoRecipeFlow.tsx': /await savePhotoRecipe\([\s\S]{0,260}maybeAskForReview\('recipe_saved'\);\s*router\.replace/,
    'components/recipe/RecipeManualEditor.tsx': /if \(!editing\) maybeAskForReview\('recipe_saved'\);/,
    'app/recipe/[slug].tsx': /await toggleInteraction\(token, recipe\.id, 'cooked'\);\s*if \(newStatus\) maybeAskForReview\('recipe_cooked'\);/,
  };
  for (const [file, pattern] of Object.entries(sites)) {
    const src = read(file);
    assert.match(src, pattern, file);
    assert.match(src, /import \{ maybeAskForReview \} from '\.\.\/\.\.\/lib\/review-prompt';/, file);
    assert.equal((src.match(/maybeAskForReview\(/g) || []).length, 1, `${file}: one call`);
  }
  // Own-video publishing shares import.tsx's publish path; photo and notebook share PhotoRecipeFlow.
  assert.match(read('app/recipe/import.tsx'), /publishOwnVideoRecipe\(token, ownVideoJobId/);
});

test('sheets and the onboarding hold the prompt; first launch is recorded', () => {
  assert.match(read('components/notifications/NotificationsProvider.tsx'), /promptVisible \? holdReviewPrompt\('sheet'\) : undefined/);
  const screen = read('app/onboarding/social.tsx');
  assert.match(screen, /holdReviewPrompt\('onboarding'\)/);
  assert.match(screen, /noteDemoEnded\(entry === 'welcome'\)/);
  assert.match(read('app/_layout.tsx'), /useEffect\(\(\) => \{ recordFirstLaunch\(\); \}, \[\]\);/);
});
