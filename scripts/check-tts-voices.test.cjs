'use strict';

// Runtime tests for pure offline TTS selection helpers (compiled with existing TypeScript).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const input = fs.readFileSync(path.join(__dirname, '..', 'lib', 'tts-voices.ts'), 'utf8');
const js = ts.transpileModule(input, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const localModule = { exports: {} };
new Function('module', 'exports', js)(localModule, localModule.exports);
const { VOICE_RATE_PRESETS, getTurkishVoices, chooseTurkishVoiceId } = localModule.exports;

const all = [
  { identifier: 'en', name: 'English', language: 'en-US', quality: 'Enhanced' },
  { identifier: 'tr-basic', name: 'Zeynep', language: 'tr-TR', quality: 'Default' },
  { identifier: 'tr-enhanced', name: 'Ayşe', language: 'tr_TR', quality: 'Enhanced' },
  { identifier: 'tr-short', name: 'Türkçe', language: 'tr', quality: 'Default' },
  { identifier: 'trash', name: 'Not Turkish', language: 'troll', quality: 'Enhanced' },
];

test('filters only Turkish locales and ranks enhanced voices first', () => {
  assert.deepEqual(
    getTurkishVoices(all, 'Enhanced').map((voice) => voice.identifier),
    ['tr-enhanced', 'tr-basic', 'tr-short'],
  );
});

test('explicit chosen Turkish voice overrides enhanced default', () => {
  assert.equal(chooseTurkishVoiceId(all, 'tr-basic', 'Enhanced'), 'tr-basic');
  assert.equal(chooseTurkishVoiceId(all, null, 'Enhanced'), 'tr-enhanced');
});

test('missing or stale selection falls back to available enhanced/system voice', () => {
  assert.equal(chooseTurkishVoiceId(all, 'en', 'Enhanced'), 'tr-enhanced');
  assert.equal(chooseTurkishVoiceId(all, 'missing', 'Enhanced'), 'tr-enhanced');
  assert.equal(chooseTurkishVoiceId([], null, 'Enhanced'), undefined);
});

test('speaking rate presets are explicit, unique, and within Expo supported range', () => {
  const rates = VOICE_RATE_PRESETS.map((item) => item.rate);
  assert.deepEqual(rates, [0.82, 0.95, 1.08]);
  assert.equal(new Set(rates).size, rates.length);
  assert.ok(rates.every((rate) => rate >= 0.1 && rate <= 2));
});

test('voice selection helper stays offline and without stored audio', () => {
  assert.doesNotMatch(input, /fetch\(|https?:\/\/|openai|chirp|writeFile|mp3|audio\/mpeg|storage/i);
  const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'CookingAssistant.tsx'), 'utf8');
  assert.match(source, /chooseTurkishVoiceId/);
  assert.match(source, /Sesleri Karşılaştır/);
  assert.doesNotMatch(source, /ExpoSpeechRecognitionModule|SpeechRecognitionLib/);
});
