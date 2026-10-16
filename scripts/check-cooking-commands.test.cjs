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

test('iOS recognition is continuous with interim actions and no forced stop on commands', () => {
  const assistant = fs.readFileSync(path.join(__dirname, '..', 'components/CookingAssistant.tsx'), 'utf8');
  assert.match(assistant, /continuous: true/);
  assert.doesNotMatch(assistant, /continuous: false/);
  assert.match(assistant, /interimResults: true/);
  assert.match(assistant, /iosTaskHint: 'confirmation'/);
  assert.match(assistant, /api\.start\(COOKING_RECOGNITION_OPTIONS\)/);
  assert.match(assistant, /api\.addListener\('result'/);
  assert.match(assistant, /extractCookingTranscript\(event\)/);
  assert.match(assistant, /setHeardPhrase\(pending\)/);
  assert.match(assistant, /setMicFeedback\('Komut uygulandı: ' \+ label\)/);
  assert.match(assistant, /actionKey === lastCommandKeyRef\.current/);
  assert.doesNotMatch(assistant, /segmentConsumedRef/);
  assert.match(assistant, /if \(code === 'no-speech'\)/);
  assert.match(assistant, /voiceRestartRef\.current = setTimeout\(startListening/);
  const onResult = assistant.split("api.addListener('result', (event: any) => {")[1].split("api.addListener('nomatch'")[0];
  assert.doesNotMatch(onResult, /api\.(stop|abort)\(\)/);
});

test('common short natural Turkish commands are not rejected', () => {
  assert.deepEqual(parse('devam'), { type: 'resume_voice' });
  assert.deepEqual(parse('Sonraki adım'), { type: 'next' });
  assert.deepEqual(parse('Bir sonraki'), { type: 'next' });
  assert.deepEqual(parse('ileri git'), { type: 'next' });
  assert.deepEqual(parse('geri git'), { type: 'previous' });
  assert.deepEqual(parse('tekrar'), { type: 'read' });
  assert.equal(parse('sıradaki malzemeyi ekle'), null);
});

const streamInput = fs.readFileSync(path.join(__dirname, '..', 'lib/cooking-command-stream.ts'), 'utf8');
const compiledStream = ts.transpileModule(streamInput, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const streamMod = { exports: {} };
Function('module', 'exports', 'require', compiledStream)(
  streamMod, streamMod.exports, (name) => {
    if (name === './cooking-commands') return { parseCookingCommand: parse };
    throw new Error('Unexpected import ' + name);
  }
);
const Stream = streamMod.exports.CookingCommandStream;

test('iOS cumulative results produce distinct repeated and different commands', () => {
  const stream = new Stream();
  assert.deepEqual(stream.accept('sonraki', 100).commands, [{ type: 'next' }]);
  assert.deepEqual(stream.accept('sonraki', 150).commands, []);
  assert.deepEqual(stream.accept('sonraki sonraki', 600).commands, [{ type: 'next' }]);
  assert.deepEqual(stream.accept('sonraki sonraki önceki', 900).commands, [{ type: 'previous' }]);
  assert.deepEqual(stream.accept('sonraki sonraki önceki oku', 1250).commands, [{ type: 'read' }]);
});

test('each command clears pending phrase immediately without restarting native recognition', () => {
  const stream = new Stream();
  assert.deepEqual(stream.accept('sayacı', 100).commands, []);
  assert.equal(stream.accept('sayacı', 150).pending, 'sayacı');
  const result = stream.accept('sayacı durdur', 300);
  assert.deepEqual(result.commands, [{ type: 'pause_timer' }]);
  assert.equal(result.pending, '');
  assert.deepEqual(stream.accept('sayacı durdur sayacı sürdür', 500).commands, [{ type: 'resume_timer' }]);
});

test('non-command noises discard pending words and cannot block later commands', () => {
  const stream = new Stream();
  assert.deepEqual(stream.accept('çatal', 100).commands, []);
  assert.equal(stream.accept('çatal', 120).pending, '');
  const r = stream.accept('çatal sonraki', 450);
  assert.deepEqual(r.commands, [{ type: 'next' }]);
  assert.equal(r.pending, '');
});

test('silence clears unfinished phrases but retains consumed native transcript baseline', () => {
  const stream = new Stream();
  assert.equal(stream.accept('sayacı', 100).pending, 'sayacı');
  stream.clearPending(); // called by the UI after 1100ms of inactivity
  assert.equal(stream.accept('sayacı durdur', 1800).pending, '');
  assert.deepEqual(stream.accept('sayacı durdur', 1810).commands, []);
  assert.deepEqual(stream.accept('sayacı durdur sonraki', 2200).commands, [{ type: 'next' }]);
});

test('revised interim words preserve number/duration prefix until command complete', () => {
  const stream = new Stream();
  assert.equal(stream.accept('5 dakika ba', 100).pending, '5 dakika ba');
  assert.deepEqual(stream.accept('5 dakika başlat', 180).commands, [{ type: 'start_timer', minutes: 5 }]);
  assert.deepEqual(stream.accept('5 dakika başlat', 250).commands, []);
});

test('batched native interim phrases are bounded and processed in sequence', () => {
  const stream = new Stream();
  assert.deepEqual(stream.accept('sonraki önceki oku', 100).commands, [
    { type: 'next' }, { type: 'previous' }, { type: 'read' }
  ]);
  assert.deepEqual(stream.accept('sonraki önceki oku', 150).commands, []);
});

test('diagnostic UI shows a temporary phrase, clears it on silence and explains guest voice fallback', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'components/CookingAssistant.tsx'), 'utf8');
  assert.match(source, /voiceStreamRef\.current\.accept\(transcript\)/);
  assert.match(source, /voiceStreamRef\.current\.clearPending\(\)/);
  assert.match(source, /setHeardPhrase\(''\)/);
  assert.match(source, /}, 1100\)/);
  assert.match(source, /Misafir modunda cihaz sesi kullanılır/);
});
