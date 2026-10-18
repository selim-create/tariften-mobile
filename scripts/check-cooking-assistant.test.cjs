'use strict';

// Static regression checks for the local/offline cooking-assistant boundary.
// These do not replace native iOS/Android TTS and background-clock smoke tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '..', 'components', 'CookingAssistant.tsx'), 'utf8');

test('fixed-command recognition is native-only and never uses paid AI APIs', () => {
  assert.match(source, /import \* as Speech from 'expo-speech'/);
  assert.match(source, /Constants\.appOwnership === 'expo'/);
  assert.match(source, /require\('expo-speech-recognition'\)/);
  assert.match(source, /api\.requestPermissionsAsync\(\)/);
  assert.match(source, /voiceWantedRef\.current = true/);
  assert.match(source, /lang: 'tr-TR'/);
  assert.match(source, /subscriptions\.forEach\(\(item\) => item\.remove\(\)\)/);
  assert.doesNotMatch(source, /gpt-live|ai\/generate|text-to-speech\/synthesize/i);
});

test('speech operations are serialized and session callbacks are guarded', () => {
  assert.match(source, /speechQueueRef\.current = speechQueueRef\.current\.catch/);
  assert.match(source, /await Speech\.stop\(\)/);
  assert.match(source, /generation === speechGenerationRef\.current/);
  assert.match(source, /onRequestClose=\{closeAssistant\}/);
  assert.match(source, /\+\+speechGenerationRef\.current/);
});

test('local TTS and natural cloud audio cannot overlap on rapid play or replay', () => {
  const stopHelper = source.slice(
    source.indexOf('const stopDeviceSpeechForCloud = useCallback('),
    source.indexOf('const speakCloud = useCallback('),
  );
  assert.match(stopHelper, /\+\+speechGenerationRef\.current/);
  assert.match(stopHelper, /speechQueueRef\.current = speechQueueRef\.current\.catch/);
  assert.match(stopHelper, /await Speech\.stop\(\)/);

  const cloud = source.slice(source.indexOf('const speakCloud = useCallback('), source.indexOf('const stopSpeech = useCallback('));
  assert.equal((cloud.match(/await stopDeviceSpeechForCloud\(\)/g) || []).length, 2,
    'new cloud requests and same-step replay must both drain pending device speech');
  assert.match(cloud, /playbackGeneration !== cloudGenerationRef\.current/);
  assert.match(cloud, /cloudPlayerRef\.current !== player/);
  assert.match(cloud, /requestGeneration !== cloudGenerationRef\.current/);
  assert.match(source, /if \(cloudPlayerRef\.current \|\| cloudControllerRef\.current\) clearCloud\(\)/);
  assert.match(source, /if \(!text\.trim\(\)\)/);
});

test('device voices and Android pause difference are explicit', () => {
  assert.match(source, /getAvailableVoicesAsync\(\)/);
  assert.match(source, /VoiceQuality\.Enhanced/);
  assert.match(source, /Platform\.OS === 'ios'/);
  assert.match(source, /if \(Platform\.OS === 'ios' \|\| Platform\.OS === 'web'\)/);
  assert.match(source, /else \{\s+speak\(currentStep\.content\);/);
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
