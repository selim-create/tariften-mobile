'use strict';
// P26 release prep guard: EAS profiles, store submit placeholders, share
// extension identity for the production bundle and accurate purpose strings.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const eas = JSON.parse(read('eas.json'));
const appJson = JSON.parse(read('app.json'));
const pkg = JSON.parse(read('package.json'));
const expo = appJson.expo;
const plugin = name => expo.plugins.find(p => (Array.isArray(p) ? p[0] : p) === name);

test('EAS keeps remote versioning with auto-incremented store builds', () => {
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.build.production.distribution, 'store');
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.developmentClient, undefined, 'preview is a release build, not a dev client');
});

test('no update channels while expo-updates is not installed', () => {
  assert.equal(pkg.dependencies['expo-updates'], undefined);
  for (const [name, profile] of Object.entries(eas.build)) {
    assert.equal(profile.channel, undefined, name + ' must not declare a channel without expo-updates');
  }
});

test('production and preview builds resolve to the shipped bundle id, never .dev', () => {
  const configFn = require(path.join(root, 'app.config.js'));
  const previous = process.env.APP_VARIANT;
  for (const profile of ['production', 'preview']) {
    const env = eas.build[profile].env || {};
    if (env.APP_VARIANT === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = env.APP_VARIANT;
    const config = configFn({ config: JSON.parse(JSON.stringify(expo)) });
    assert.equal(config.ios.bundleIdentifier, 'com.tariften.app', profile);
    assert.equal(config.android.package, 'com.tariften.app', profile);
  }
  if (previous === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = previous;
});

test('store submission placeholders are explicit and secrets stay out of git', () => {
  const ios = eas.submit.production.ios;
  assert.match(ios.ascAppId, /^(TODO_ASC_APP_ID|\d+)$/);
  assert.match(ios.appleTeamId, /^(TODO_APPLE_TEAM_ID|[0-9A-Z]{10})$/);
  const android = eas.submit.production.android;
  assert.equal(android.track, 'internal');
  assert.match(android.serviceAccountKeyPath, /^\$\{GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH:-\.\/secrets\/[^}]+\.json\}$/);
  assert.match(read('.gitignore'), /^\/secrets\/$/m);
});

test('share extension is derived from the production bundle id (Paylaş → Tariften)', () => {
  const [, options] = plugin('expo-share-intent');
  assert.equal(options.iosAppGroupIdentifier, undefined, 'group must follow the bundle id');
  assert.equal(options.iosShareExtensionBundleIdentifier, undefined);
  const c = require('expo-share-intent/plugin/build/ios/constants');
  assert.equal(c.getAppGroup(expo.ios.bundleIdentifier, options), 'group.com.tariften.app');
  assert.equal(c.getShareExtensionBundledIdentifier(expo.ios.bundleIdentifier, options), 'com.tariften.app.share-extension');
  assert.equal(c.getShareExtensionName(options), 'TarifteneAktar');
  // The extension needs its own privacy manifest (it reads UserDefaults).
  assert.match(read('node_modules/expo-share-intent/plugin/build/ios/writeIosShareExtensionFiles.js'), /NSPrivacyAccessedAPICategoryUserDefaults/);
});

test('microphone purpose string describes the real feature in every source', () => {
  const real = expo.ios.infoPlist.NSMicrophoneUsageDescription;
  assert.match(real, /Pişirme rehberinde/);
  assert.equal(plugin('expo-audio')[1].microphonePermission, real, 'expo-audio would otherwise overwrite the Info.plist string');
  assert.equal(plugin('expo-audio')[1].recordAudioAndroid, false);
  assert.equal(expo.ios.infoPlist.ITSAppUsesNonExemptEncryption, false);
});

test('release checklist covers the owner-only store steps', () => {
  const doc = read('docs/RELEASE_CHECKLIST.md');
  for (const expected of [
    /com\.tariften\.app\.share-extension/, /group\.com\.tariften\.app/, /eas credentials/,
    /eas build -p ios --profile production/, /eas submit -p ios/, /eas submit -p android/,
    /TestFlight/, /Data safety/, /delete-account/, /PrivacyInfo\.xcprivacy/, /16\.0/, /Xcode 27/,
    /apple-app-site-association/, /APPLE_TEAM_ID/,
  ]) assert.match(doc, expected);
});
