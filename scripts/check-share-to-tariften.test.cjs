'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file, deps = {}) => {
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  Function('module', 'exports', 'require', out)(mod, mod.exports, name => deps[name] || {});
  return mod.exports;
};
const video = load('lib/video-recipe-import.ts');
const share = load('lib/share-link.ts', { './video-recipe-import': video });

test('shared links are reduced to canonical platform addresses', () => {
  const { canonicalShareLink, firstLink, sharedContent } = share;
  assert.equal(canonicalShareLink('https://www.instagram.com/reel/C5ToOyqIZvb/?igsh=MWZ0'), 'https://www.instagram.com/reel/C5ToOyqIZvb/');
  assert.equal(canonicalShareLink('https://instagram.com/reels/C5ToOyqIZvb'), 'https://www.instagram.com/reel/C5ToOyqIZvb/');
  assert.equal(canonicalShareLink('https://www.tiktok.com/@mob.kitchen/video/7083514528025136386?is_from_webapp=1&_r=1'), 'https://www.tiktok.com/@mob.kitchen/video/7083514528025136386');
  assert.equal(canonicalShareLink('https://youtu.be/dQw4w9WgXcQ?si=abc'), 'https://youtu.be/dQw4w9WgXcQ');
  assert.equal(canonicalShareLink('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.equal(canonicalShareLink('https://www.instagram.com/mobkitchen/'), null, 'a profile is not a recipe video');
  assert.equal(canonicalShareLink('https://user:pw@instagram.com/reel/C5ToOyqIZvb/'), null);
  assert.equal(canonicalShareLink('http://example.com/tarif'), null, 'plain http pages are not imported');
  assert.equal(firstLink('Şuna bak 👉 https://vm.tiktok.com/ZMabc123/ çok iyi!'), 'https://vm.tiktok.com/ZMabc123/');
  assert.deepEqual(sharedContent({ text: 'Bunu dene: https://www.instagram.com/reel/C5ToOyqIZvb/?igsh=x', webUrl: null }),
    { url: 'https://www.instagram.com/reel/C5ToOyqIZvb/', text: null });
  assert.deepEqual(sharedContent({ text: 'Mercimek çorbası: 1 su bardağı kırmızı mercimek, 1 soğan, 1 havuç…', webUrl: null }).url, null);
});

test('TikTok and Instagram posts follow the web and Core rules', () => {
  assert.equal(video.isTikTokVideoLink('https://www.tiktok.com/@sef/video/7083514528025136386'), true);
  assert.equal(video.isTikTokVideoLink('https://www.tiktok.com.evil.test/@sef/video/7083514528025136386'), false);
  assert.equal(video.isTikTokShortLink('https://vm.tiktok.com/ZMabc123/'), true);
  assert.equal(video.isInstagramPostLink('https://www.instagram.com/p/C5ToOyqIZvb/'), true);
  assert.equal(video.isInstagramReelLink('https://www.instagram.com/p/C5ToOyqIZvb/'), false);
  assert.equal(video.needsRightsConfirmation('https://www.tiktok.com/@sef/video/7083514528025136386'), true);
  assert.equal(video.needsRightsConfirmation('https://www.youtube.com/shorts/dQw4w9WgXcQ'), false);
  assert.equal(video.isVideoRecipeLink('https://www.tiktok.com/@sef/video/7083514528025136386'), true);
  const api = read('lib/recipe-import-api.ts');
  assert.match(api, /const social = needsRightsConfirmation\(sourceUrl\)/);
  assert.match(api, /VIDEO_BASE \+ '\/resolve'/);
});

test('a share never starts a paid analysis by itself', () => {
  const screen = read('app/share.tsx');
  assert.match(screen, /router\.replace\(\{ pathname: '\/recipe\/aktar', params: \{ url \} \}\)/);
  assert.doesNotMatch(screen, /startVideoRecipeJob|previewRecipe|generateAI/);
  const intent = read('app/+native-intent.tsx');
  assert.match(intent, /path\.includes\('dataUrl='\)\) return '\/share'/);
  const importer = read('app/recipe/import.tsx');
  assert.match(importer, /const state = await resolveVideoSource\(token, url, controller\.signal\)/);
  assert.ok(importer.indexOf('resolveVideoSource(token, url') < importer.indexOf('await startVideoRecipeJob('), 'free look-up before any start');
  assert.match(importer, /state\.status === 'published'\) \{ router\.push/);
  assert.match(importer, /await expandShortLink\(link\)/);
  assert.match(read('app/recipe/aktar.tsx'), /initialUrl=/);
  const layout = read('app/_layout.tsx');
  assert.ok(layout.indexOf('<ShareIntentProvider') < layout.indexOf('<AuthProvider'), 'provider sits above the others');
  assert.match(read('app/login.tsx'), /if \(router\.canGoBack\(\)\) router\.back\(\)/);
});

test('native config: share extension, icon set, splash and safe rebuild', () => {
  const app = JSON.parse(read('app.json')).expo;
  const plugin = app.plugins.find(p => Array.isArray(p) && p[0] === 'expo-share-intent');
  assert.ok(plugin, 'share plugin configured');
  assert.equal(plugin[1].iosShareExtensionName, "Tariften'e Aktar");
  assert.notEqual(plugin[1].iosShareExtensionName.replace(/[^a-zA-Z0-9]/g, ''), 'Tariften', 'extension target must not collide with the app target');
  assert.deepEqual(plugin[1].androidIntentFilters, ['text/*']);
  assert.equal(app.scheme, 'tariften');
  assert.deepEqual(Object.keys(app.ios.icon).sort(), ['dark', 'light', 'tinted']);
  for (const file of Object.values(app.ios.icon)) assert.ok(fs.existsSync(path.join(root, file)), file);
  assert.ok(app.plugins.some(p => Array.isArray(p) && p[0] === 'expo-splash-screen'));
  assert.equal(app.splash, undefined, 'one splash definition (the plugin)');
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.dependencies['expo-share-intent'], /^~6\./, 'expo-share-intent 6.x is the SDK 55 line');
  assert.equal(pkg.scripts['ios:sim:rebuild'], 'TARIFTEN_REGENERATE_IOS=1 bash scripts/ios-simulator-local-build.sh');
  const script = read('scripts/ios-simulator-local-build.sh');
  assert.match(script, /mv ios "\$BACKUP"/, 'old ios/ is moved, never deleted');
  assert.doesNotMatch(script, /rm -rf ios|prebuild[^\n]*--clean/);
  process.env.APP_VARIANT = 'development';
  const dev = require('../app.config.js')({ config: JSON.parse(read('app.json')).expo });
  delete process.env.APP_VARIANT;
  const devPlugin = dev.plugins.find(p => Array.isArray(p) && p[0] === 'expo-share-intent');
  assert.equal(devPlugin[1].iosShareExtensionName, "DEV Tariften'e Aktar");
  assert.equal(dev.ios.icon.light, './assets/icon-dev.png');
});
