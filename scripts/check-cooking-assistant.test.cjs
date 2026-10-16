'use strict';

// Static regression checks for the local/offline cooking-assistant boundary.
// These do not replace native iOS/Android TTS and background-clock smoke tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'CookingAssistant.tsx'), 'utf8');

test('standard cooking assistant has no recognition loop or paid audio API', () => {
  assert.match(source, /import \* as Speech from 'expo-speech'/);
  assert.doesNotMatch(source, /ExpoSpeechRecognitionModule|SpeechRecognitionLib|module\.start\(|expo-speech-recognition/);
  assert.doesNotMatch(source, /gpt-live|ai\/generate|text-to-speech\/synthesize/i);
});

test('speech operations are serialized and session callbacks are guarded', () => {
  assert.match(source, /speechQueueRef\.current = speechQueueRef\.current\.catch/);
  assert.match(source, /await Speech\.stop\(\)/);
  assert.match(source, /generation === speechGenerationRef\.current/);
  assert.match(source, /onRequestClose=\{closeAssistant\}/);
  assert.match(source, /\+\+speechGenerationRef\.current/);
});

test('device voices and Android pause difference are explicit', () => {
  assert.match(source, /getAvailableVoicesAsync\(\)/);
  assert.match(source, /VoiceQuality\.Enhanced/);
  assert.match(source, /Platform\.OS === 'ios'/);
  assert.match(source, /Android'de devam etmek için mevcut adım baştan okunur/);
});

test('clock uses absolute deadline, not decrementing a stale JS interval', () => {
  assert.match(source, /timerDeadlineRef\.current - Date\.now\(\)/);
  assert.match(source, /AppState\.addEventListener\('change'/);
  assert.doesNotMatch(source, /setTimerSeconds\(\(prev\) =>/);
});

test('SOS tips do not impersonate a live AI response', () => {
  assert.doesNotMatch(source, /Yapay Zeka Şef düşünüyor|AI_RESPONSE_DELAY_MS|CANLI PİLOT/);
  assert.match(source, /Genel Mutfak Önerisi/);
});
