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

test('Xcode 27 installer chooses app scheme instead of Pods-TariftenDEV', () => {
  const shell = fs.readFileSync(path.join(root, 'scripts/ios-simulator-local-build.sh'), 'utf8');
  assert.match(shell, /apps=all\.filter\(s=>!\/\^Pods/);
  assert.match(shell, /\^TariftenDEV\$/);
  assert.match(shell, /process\.stdout\.write\(preferred\|\|""\)/, 'Never default to a Pods scheme');
  assert.match(shell, /node "\$PWD\/scripts\/ios-xcode27-pods-min-target\.cjs"/);
  assert.doesNotMatch(shell, /ios-xcode27-pods-min-target\.rb/, 'Ruby helper needed the xcodeproj gem outside CocoaPods');
  assert.match(shell, /pod install/);
  assert.match(shell, /CODE_SIGNING_ALLOWED=NO build/);
});

test('legacy CocoaPods targets are normalized only when lower than Xcode 27 iOS minimum', () => {
  const os = require('os');
  const { execFileSync } = require('child_process');
  const script = path.join(root, 'scripts/ios-xcode27-pods-min-target.cjs');
  const source = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /require\(['"]child_process|rmSync|unlinkSync|rimraf/);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pods-'));
  const proj = path.join(tmp, 'ios/Pods/Pods.xcodeproj');
  fs.mkdirSync(proj, { recursive: true });
  const pbx = path.join(proj, 'project.pbxproj');
  fs.writeFileSync(pbx, [
    'IPHONEOS_DEPLOYMENT_TARGET = 9.0;',
    'IPHONEOS_DEPLOYMENT_TARGET = "12.4";',
    'IPHONEOS_DEPLOYMENT_TARGET = 15.1;',
    'IPHONEOS_DEPLOYMENT_TARGET = 16.0;',
    'IPHONEOS_DEPLOYMENT_TARGET = 16.10;',
    'IPHONEOS_DEPLOYMENT_TARGET = 17.0;',
  ].join('\n'));
  const out = execFileSync(process.execPath, [script, proj], { encoding: 'utf8' });
  assert.match(out, /3 configurations updated to iOS 16\.0/);
  assert.deepEqual(fs.readFileSync(pbx, 'utf8').split('\n'), [
    'IPHONEOS_DEPLOYMENT_TARGET = 16.0;',
    'IPHONEOS_DEPLOYMENT_TARGET = 16.0;',
    'IPHONEOS_DEPLOYMENT_TARGET = 16.0;',
    'IPHONEOS_DEPLOYMENT_TARGET = 16.0;',
    'IPHONEOS_DEPLOYMENT_TARGET = 16.10;',
    'IPHONEOS_DEPLOYMENT_TARGET = 17.0;',
  ]);
  // Unchanged project is not rewritten; any other path is refused.
  const before = fs.statSync(pbx).mtimeMs;
  assert.match(execFileSync(process.execPath, [script, proj], { encoding: 'utf8' }), /0 configurations/);
  assert.equal(fs.statSync(pbx).mtimeMs, before);
  assert.throws(() => execFileSync(process.execPath, [script, path.join(tmp, 'ios/App.xcodeproj')], { stdio: 'pipe' }));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('build output goes to a log file and failures print the real compiler errors', () => {
  const os = require('os');
  const { execFileSync } = require('child_process');
  const shell = fs.readFileSync(path.join(root, 'scripts/ios-simulator-local-build.sh'), 'utf8');
  assert.match(shell, /LOG="\$DERIVED\/xcodebuild\.log"/);
  assert.equal((shell.match(/ build >> "\$LOG" 2>&1/g) || []).length, 2, 'both xcodebuild runs write to the log');
  // Only the build cache is cleared on rebuild, never ios/ or anything else.
  assert.match(shell, /TARIFTEN_REGENERATE_IOS:-0\}" == "1" && -d "\$DERIVED" && "\$DERIVED" == \*\/\.expo\/ios-local-build \]\]; then\n  rm -rf "\$DERIVED"/);
  assert.equal((shell.match(/rm -rf/g) || []).length, 1);

  const fn = shell.match(/show_build_errors\(\) \{[\s\S]*?\n\}/)[0];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xclog-'));
  const log = path.join(tmp, 'xcodebuild.log');
  fs.writeFileSync(log, [
    'CompileSwift normal arm64 -Werror=foo',
    '/x/LinkPreviewNativeView.swift:12:5: error: cannot find type \'UIFoo\' in scope',
    '/x/LinkPreviewNativeView.swift:12:5: error: cannot find type \'UIFoo\' in scope',
    'error: Sandbox: rsync deny',
    '** BUILD FAILED **',
  ].join('\n'));
  const run = (file) => execFileSync('bash', ['-c', `LOG="${file}"; ${fn}; show_build_errors 2>&1`], { encoding: 'utf8' });
  const out = run(log);
  assert.match(out, /İlk hatalar:/);
  assert.equal((out.match(/cannot find type 'UIFoo'/g) || []).length, 1, 'duplicates collapsed');
  assert.match(out, /error: Sandbox: rsync deny/);
  assert.doesNotMatch(out, /-Werror/);
  fs.writeFileSync(log, 'line a\nline b\n** BUILD FAILED **\n');
  assert.match(run(log), /son satırları:[\s\S]*BUILD FAILED/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('local simulator build compiles app, extension and pods for the same iOS 16 minimum', () => {
  const shell = fs.readFileSync(path.join(root, 'scripts/ios-simulator-local-build.sh'), 'utf8');
  const cjs = fs.readFileSync(path.join(root, 'scripts/ios-xcode27-pods-min-target.cjs'), 'utf8');
  assert.match(shell, /SIM_IOS_MIN="16\.0"/);
  assert.equal((shell.match(/IPHONEOS_DEPLOYMENT_TARGET="\$SIM_IOS_MIN"/g) || []).length, 2, 'both xcodebuild runs override the target');
  assert.match(cjs, /const MINIMUM = '16\.0';/, 'pods repair uses the same minimum');
  // Store builds use the same iOS 16 minimum (owner decision, 2026-10-22).
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const bp = app.expo.plugins.find(p => Array.isArray(p) && p[0] === 'expo-build-properties');
  assert.equal(bp && bp[1].ios.deploymentTarget, '16.0');
});

test('universal links: store app claims tariften.com/rehber, the DEV build does not', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  assert.deepEqual(app.ios.associatedDomains, ['applinks:tariften.com', 'applinks:www.tariften.com']);
  const filter = app.android.intentFilters[0];
  assert.equal(filter.autoVerify, true);
  assert.ok(filter.data.every(d => d.scheme === 'https' && d.pathPrefix === '/rehber'));
  const config = require(path.join(root, 'app.config.js'));
  const prev = process.env.APP_VARIANT;
  process.env.APP_VARIANT = 'development';
  try {
    const dev = config({ config: app });
    assert.equal(dev.ios.associatedDomains, undefined);
    assert.equal(dev.android.intentFilters, undefined);
    assert.equal(dev.ios.bundleIdentifier, 'com.tariften.app.dev');
  } finally {
    if (prev === undefined) delete process.env.APP_VARIANT; else process.env.APP_VARIANT = prev;
  }
  const saved = process.env.APP_VARIANT;
  delete process.env.APP_VARIANT; // earlier tests in this file may leave it set
  const prod = config({ config: app });
  if (saved !== undefined) process.env.APP_VARIANT = saved;
  assert.deepEqual(prod.ios.associatedDomains, app.ios.associatedDomains);
});
