'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const file = fs.readFileSync(path.join(__dirname, '..', 'lib/cooking-commands.ts'), 'utf8');
const transpiled = ts.transpileModule(file, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
Function('module', 'exports', transpiled)(mod, mod.exports);
const parse = mod.exports.parseCookingCommand;

test('Turkish hands-free navigation and reading commands', () => {
  assert.deepEqual(parse('Sonraki!'), { type: 'next' });
  assert.deepEqual(parse('Önceki adım.'), { type: 'previous' });
  assert.deepEqual(parse('Tekrar oku.'), { type: 'read' });
  assert.deepEqual(parse('Duraklat'), { type: 'pause_voice' });
  assert.deepEqual(parse('Devam et'), { type: 'resume_voice' });
  assert.deepEqual(parse('Sesi durdur'), { type: 'stop_voice' });
});

test('timer voice commands are bounded', () => {
  assert.deepEqual(parse('Beş dakika başlat'), { type: 'start_timer', minutes: 5 });
  assert.deepEqual(parse('10 dakika sayaç kur'), { type: 'start_timer', minutes: 10 });
  assert.deepEqual(parse('Süreyi durdur'), { type: 'pause_timer' });
  assert.deepEqual(parse('Süreyi sürdür'), { type: 'resume_timer' });
  assert.deepEqual(parse('Süreyi iptal et'), { type: 'cancel_timer' });
  assert.equal(parse('200 dakika başlat'), null);
});

test('long recipe prose and arbitrary audio cannot trigger commands', () => {
  assert.equal(parse('Şimdi sıradaki malzemeyi tencereye ekleyin ve karıştırın'), null);
  assert.equal(parse('Tarif tamamlandı harika görünüyor'), null);
  assert.equal(parse(''), null);
});

test('native module uses a real build, permission and visibility guards', () => {
  const assistant = fs.readFileSync(path.join(__dirname, '..', 'components/CookingAssistant.tsx'), 'utf8');
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8'));
  assert.match(assistant, /Constants\.appOwnership === 'expo'/);
  assert.match(assistant, /requestPermissionsAsync/);
  assert.match(assistant, /AppState\.currentState/);
  assert.match(assistant, /subscriptions\.forEach/);
  assert.match(assistant, /voiceWantedRef\.current = true/);
  assert.ok(app.expo.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-speech-recognition'));
});

test('native iOS direct and nested speech payloads yield immediate transcripts', () => {
  const input = fs.readFileSync(path.join(__dirname, '..', 'lib/native-cooking-transcript.ts'), 'utf8');
  const compiled = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const native = { exports: {} };
  Function('module', 'exports', compiled)(native, native.exports);
  const extract = native.exports.extractCookingTranscript;
  assert.equal(extract({ results: [{ transcript: 'Sonraki', isFinal: false }], isFinal: false }), 'Sonraki');
  assert.equal(extract({ results: [{ transcript: '  sayacı  durdur  ' }] }), 'sayacı durdur');
  assert.equal(extract({ resultIndex: 1, results: [[{ transcript: 'test' }], [{ transcript: 'Önceki' }]] }), 'Önceki');
  assert.equal(extract({ results: [] }), null);
  assert.equal(extract({ results: [{ unknown: true }] }), null);
  assert.equal(extract(null), null);
});

test('iOS recognition processes interim speech and restarts sessions after command', () => {
  const assistant = fs.readFileSync(path.join(__dirname, '..', 'components/CookingAssistant.tsx'), 'utf8');
  assert.match(assistant, /interimResults: true/);
  assert.doesNotMatch(assistant, /interimResults: false/);
  assert.match(assistant, /continuous: false/);
  assert.match(assistant, /api\.addListener\('result'/);
  assert.match(assistant, /extractCookingTranscript\(event\)/);
  assert.match(assistant, /segmentConsumedRef\.current = true/);
  assert.match(assistant, /try \{ api\.stop\(\); \} catch/);
  assert.match(assistant, /setHeardPhrase\(transcript\)/);
  assert.match(assistant, /setMicFeedback\('Komut uygulandı: '/);
  assert.match(assistant, /voiceRestartRef\.current = setTimeout\(startListening/);
});
