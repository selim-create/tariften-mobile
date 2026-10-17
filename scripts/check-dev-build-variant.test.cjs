'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const base = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const config = require('../app.config.js');
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));

const previous = process.env.APP_VARIANT;
test.after(() => {
  if (previous === undefined) delete process.env.APP_VARIANT;
  else process.env.APP_VARIANT = previous;
});

test('production identity and scheme are untouched', () => {
  delete process.env.APP_VARIANT;
  const actual = config({ config: base });
  assert.deepEqual(actual, base);
  assert.equal(actual.ios.bundleIdentifier, 'com.tariften.app');
  assert.equal(actual.android.package, 'com.tariften.app');
  assert.equal(actual.scheme, 'tariften');
  assert.equal(actual.name, 'Tariften');
});

test('development variant uses independent identity, scheme and dev launcher', () => {
  process.env.APP_VARIANT = 'development';
  const actual = config({ config: base });
  assert.equal(actual.ios.bundleIdentifier, 'com.tariften.app.dev');
  assert.equal(actual.android.package, 'com.tariften.app.dev');
  assert.equal(actual.scheme, 'tariften-dev');
  assert.equal(actual.name, 'Tariften DEV');
  assert.ok(actual.plugins.some(item => Array.isArray(item) && item[0] === 'expo-dev-client'));
  assert.ok(actual.plugins.some(item => Array.isArray(item) && item[0] === 'expo-speech-recognition'));
  assert.equal(actual.extra.eas.projectId, base.extra.eas.projectId);
  assert.equal(base.ios.bundleIdentifier, 'com.tariften.app');
});

test('EAS development is isolated while production has no variant override', () => {
  assert.equal(eas.build.development.developmentClient, true);
  assert.equal(eas.build.development.env.APP_VARIANT, 'development');
  assert.equal(eas.build.production.env?.APP_VARIANT, undefined);
});

test('Xcode 27 Simulator.app incompatibility is bypassed by local install and Metro separation', () => {
  const pkg = require('../package.json');
  const metro = pkg.scripts['ios:sim'];
  assert.match(metro, /APP_VARIANT=development/);
  assert.match(metro, /expo start/);
  assert.match(metro, /--dev-client/);
  assert.match(metro, /--localhost/);
  assert.match(metro, /--port 8081/);
  assert.doesNotMatch(metro, /--ios(?:\s|$)|--lan|--tunnel/, 'Expo SDK 55 CLI must not attempt to locate removed Simulator.app');
  assert.equal(pkg.scripts['ios:sim:install'], 'bash scripts/ios-simulator-local-build.sh');
  assert.match(pkg.scripts['ios:sim:open'], /xcrun simctl openurl booted/);
  assert.match(pkg.scripts['ios:sim:open'], /tariften-dev:\/\/expo-development-client/);
});

test('simulator installation is a native local DEV build, never remote or production', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/ios-simulator-local-build.sh'), 'utf8');
  for (const expected of [
    /APP_VARIANT=development/, /expo prebuild --platform ios --no-install/,
    /pod install/, /xcodebuild -workspace/, /-sdk iphonesimulator/,
    /CODE_SIGNING_ALLOWED=NO build/, /simctl install/,
    /simctl launch/, /com\.tariften\.app\.dev/,
  ]) assert.match(script, expected);
  for (const forbidden of [/eas build/, /TestFlight/, /rm -rf ios/, /expo run:ios/, /--clean/]) {
    // A commented mention isn't executable, but no destructive build command
    // should ever be added to the checked-in installer.
    const actions = script.split('\n').filter(line => /^[^#]*\b(rm|npx|xcrun|xcodebuild|eas)\b/.test(line));
    assert.doesNotMatch(actions.join('\n'), forbidden);
  }
  assert.match(script, /BUNDLE_ID.*com\.tariften\.app\.dev/);
});
