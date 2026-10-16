'use strict';

// No network and no Google synthesis. Static guardrails for mobile cloud TTS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const api = fs.readFileSync(path.join(__dirname, '..', 'lib/chirp3-voice.ts'), 'utf8');
const assistant = fs.readFileSync(path.join(__dirname, '..', 'components/CookingAssistant.tsx'), 'utf8');

test('Core is the only paid TTS endpoint and never exposes gateway secrets', () => {
  assert.match(api, /https:\/\/api\.tariften\.com\/wp-json\/tariften\/v1\/voice/);
  assert.match(api, /\/synthesize/);
  assert.match(api, /authorization|Authorization/);
  assert.doesNotMatch(api, /googleapis\.com|cloud-run|hmac|secretmanager|service_account|private_key/i);
});

test('MP3 is temporary and removed on step changes and on close', () => {
  assert.match(assistant, /expo-audio/);
  assert.match(assistant, /expo-file-system\/legacy/);
  assert.match(assistant, /writeAsStringAsync/);
  assert.match(assistant, /deleteAsync/);
  assert.match(assistant, /cloudPlayerRef\.current\?\.remove\(\)/);
  assert.match(assistant, /stopSpeech\(\);/);
});

test('only enabled Core status unlocks natural synthesis; six voices are available', () => {
  assert.match(assistant, /cloudStatus\?\.enabled/);
  assert.match(assistant, /getVoiceStatus\(token\)/);
  const choices = api.match(/tr-TR-Chirp3-HD-/g) || [];
  assert.equal(choices.length, 6);
  assert.match(api, /tr-TR-Chirp3-HD-Enceladus/);
});

test('Expo Audio uses method-based rate updates and supported player cleanup', () => {
  assert.match(assistant, /player\.setPlaybackRate\(speechRate\)/);
  assert.doesNotMatch(assistant, /player\.playbackRate\s*=/);
  assert.match(assistant, /cloudPlayerRef\.current\?\.remove\(\)/);
});
