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

test('ios:sim starts a fresh simulator session using the same localhost Metro URL', () => {
  const pkg = require('../package.json');
  const script = pkg.scripts['ios:sim'];
  assert.match(script, /expo start/);
  assert.match(script, /APP_VARIANT=development/, 'Metro must use installed TariftenDEV scheme, not the production tarften:// scheme');
  assert.match(script, /--ios(?:\s|$)/, 'Expo should open the simulator, not just leave an old dev-client link open');
  assert.match(script, /--localhost/);
  assert.match(script, /--port 8081/);
  assert.doesNotMatch(script, /--lan|--tunnel/, 'Physical-device host routing is deliberately not used in simulator command');
});
