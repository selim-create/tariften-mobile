import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Image,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { parseCookingCommand } from '../lib/cooking-commands';
import { extractCookingTranscript } from '../lib/native-cooking-transcript';
import { playTimerStartSound } from '../lib/timer-start-sound';

// Chirp voice playback and local/native fixed-command recognition are separate services.
import * as Speech from 'expo-speech';
import { createAudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../context/AuthContext';
import { CHIRP3_VOICES, getVoiceStatus, synthesizeRecipeStep, VoiceStatus } from '../lib/chirp3-voice';
import { VOICE_RATE_PRESETS, chooseTurkishVoiceId, getTurkishVoices } from '../lib/tts-voices';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Step {
  order?: number;
  content: string;
  timer_seconds?: number;
}

interface CookingAssistantProps {
  visible: boolean;
  onClose: () => void;
  recipeTitle: string;
  recipeId: number;
  steps: (Step | string)[];
  chefTip?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizeStep(step: Step | string): Step {
  if (typeof step === 'string') return { content: step };
  return step;
}

type SosKey = 'burnt' | 'salty' | 'watery' | 'other';

// One continuous capture: recognize interim Turkish words without stopping and
// restarting the microphone after each phrase. iOS short commands benefit from
// the 'confirmation' task hint. Only known fixed commands are actionable.
const COOKING_RECOGNITION_OPTIONS = {
  lang: 'tr-TR',
  continuous: true,
  interimResults: true,
  maxAlternatives: 1,
  iosTaskHint: 'confirmation',
  contextualStrings: [
    'sonraki', 'sonraki adım', 'önceki', 'ileri', 'geri', 'oku',
    'tekrar', 'devam', 'devam et', 'sayacı durdur', 'sayacı sürdür',
    'sayacı iptal et', 'beş dakika başlat',
  ],
};

const SOS_RESPONSES: Record<SosKey, string> = {
  burnt: 'Önce ocağı kapat. Yanmamış üst kısmı dibi kazımadan temiz bir kaba aktar; yanık kokusu veya tadı belirginse servis etme.',
  salty: 'Tarif uygunsa tuzsuz malzeme veya sıvıyla seyrelterek tadı tekrar kontrol et. Patatesin fazla tuzu seçici biçimde emdiği doğru değildir.',
  watery: 'Tarife uygunsa kapağı açık ve kontrollü şekilde biraz daha pişir. Kıvamı sık sık kontrol et; her yemek için yüksek ateş uygun değildir.',
  other: 'Malzeme değişimi her tarifte farklı sonuç verir. Alerjenleri ve tarifin yapısını kontrol ederek uygun alternatifi seç.',
};


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CookingAssistant({
  visible,
  onClose,
  recipeTitle,
  recipeId,
  steps,
  chefTip,
}: CookingAssistantProps) {
  const router = useRouter();
  const { token } = useAuth();
  const { height: viewportHeight } = useWindowDimensions();
  const compactViewport = viewportHeight < 790;

  const totalSteps = steps.length;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const speechGenerationRef = useRef(0);
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [voiceOptions, setVoiceOptions] = useState<Speech.Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [speechRate, setSpeechRate] = useState<number>(0.95);
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceFetchFailed, setVoiceFetchFailed] = useState(false);
  const [voiceRefresh, setVoiceRefresh] = useState(0);
  const [speechStatus, setSpeechStatus] = useState<'idle' | 'playing' | 'paused' | 'error'>('idle');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [cloudStatus, setCloudStatus] = useState<VoiceStatus | null>(null);
  const [cloudMode, setCloudMode] = useState(false);
  const [cloudVoice, setCloudVoice] = useState<string>(CHIRP3_VOICES[0].id);
  const [cloudBusy, setCloudBusy] = useState(false);
  const cloudPlayerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const cloudUriRef = useRef<string | null>(null);
  const cloudKeyRef = useRef('');
  const cloudControllerRef = useRef<AbortController | null>(null);
  const cloudGenerationRef = useRef(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [micListening, setMicListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(false);
  const [micError, setMicError] = useState('');
  const [lastSpokenCommand, setLastSpokenCommand] = useState('');
  const [micFeedback, setMicFeedback] = useState('');
  const [heardPhrase, setHeardPhrase] = useState('');
  const nativeRecognizerRef = useRef<{
    start: (config: {
      lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
      contextualStrings?: string[]; iosTaskHint?: string;
    }) => void;
    stop: () => void;
    abort: () => void;
    requestPermissionsAsync: () => Promise<{ granted: boolean }>;
    addListener: (name: string, callback: (event: any) => void) => { remove: () => void };
  } | null>(null);
  const voiceWantedRef = useRef(false);
  const voiceRestartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeRecognizingRef = useRef(false);
  const commandCooldownRef = useRef(0);
  const lastCommandKeyRef = useRef('');
  const recognizerRestartDelayRef = useRef(850);
  const consecutiveNoSpeechRef = useRef(0);

  // Timer
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerDeadlineRef = useRef<number | null>(null);

  // Alarm
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);

  // Modals
  const [isSOSOpen, setIsSOSOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFinishedOpen, setIsFinishedOpen] = useState(false);
  const [sosMessage, setSosMessage] = useState<string | null>(null);

  // Animations
  const ledPulse = useRef(new Animated.Value(0.4)).current;
  const alarmScale = useRef(new Animated.Value(1)).current;

  const isFirst = currentIndex === 0;
  const isLast = totalSteps > 0 && currentIndex === totalSteps - 1;
  const progress = totalSteps > 0 ? ((currentIndex + 1) / totalSteps) * 100 : 0;
  const currentStep = steps[currentIndex] ? normalizeStep(steps[currentIndex]) : { content: '' };

  // --- Animations ---
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(ledPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(ledPulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [ledPulse]);

  useEffect(() => {
    if (!isAlarmPlaying) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(alarmScale, { toValue: 1.1, duration: 400, useNativeDriver: true }),
        Animated.timing(alarmScale, { toValue: 0.9, duration: 400, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => { anim.stop(); alarmScale.setValue(1); };
  }, [isAlarmPlaying, alarmScale]);

  // --- Device-only Turkish voices: list dynamically, prefer enhanced, fallback safely. ---
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setVoiceLoading(true);
    setVoiceFetchFailed(false);
    void Speech.getAvailableVoicesAsync()
      .then((voices) => {
        if (!active) return;
        const turkishVoices = getTurkishVoices(voices, Speech.VoiceQuality.Enhanced);
        setVoiceOptions(turkishVoices);
        setSelectedVoiceId((existing) => (
          existing && !turkishVoices.some((voice) => voice.identifier === existing) ? null : existing
        ));
      })
      .catch(() => {
        if (!active) return;
        setVoiceOptions([]);
        setVoiceFetchFailed(true);
        setSelectedVoiceId(null);
      })
      .finally(() => {
        if (active) setVoiceLoading(false);
      });
    return () => { active = false; };
  }, [visible, voiceRefresh]);

  // Beta is disabled by default on Core. Never call synthesis unless enabled.
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setCloudMode(false);
    setCloudStatus(null);
    if (!token) return () => { active = false; };
    void getVoiceStatus(token)
      .then((status) => {
        if (!active) return;
        setCloudStatus(status);
        setCloudMode(Boolean(status.enabled));
      })
      .catch(() => {
        if (active) { setCloudStatus(null); setCloudMode(false); }
      });
    return () => { active = false; };
  }, [visible, token]);

  const clearCloud = useCallback(() => {
    ++cloudGenerationRef.current;
    cloudControllerRef.current?.abort();
    cloudControllerRef.current = null;
    cloudPlayerRef.current?.pause();
    cloudPlayerRef.current?.remove();
    cloudPlayerRef.current = null;
    cloudKeyRef.current = '';
    const oldUri = cloudUriRef.current;
    cloudUriRef.current = null;
    if (oldUri) void FileSystem.deleteAsync(oldUri, { idempotent: true }).catch(() => {});
    setCloudBusy(false);
  }, []);

  const speakCloud = useCallback(async (step: number, requestedVoice: string) => {
    if (!visibleRef.current || !token || !cloudStatus?.enabled || !Number.isSafeInteger(recipeId) || recipeId < 1) {
      setSpeechError('Doğal seslendirme şu anda kullanılamıyor. Cihaz sesini seçebilirsin.');
      return;
    }
    const key = `${recipeId}:${step}:${requestedVoice}`;
    if (cloudPlayerRef.current && cloudKeyRef.current === key) {
      try {
        await cloudPlayerRef.current.seekTo(0);
        cloudPlayerRef.current.play();
        setSpeechStatus('playing');
        setSpeechError(null);
      } catch {
        setSpeechStatus('error');
        setSpeechError('Ses tekrar oynatılamadı.');
      }
      return;
    }

    clearCloud();
    const requestGeneration = cloudGenerationRef.current;
    const controller = new AbortController();
    cloudControllerRef.current = controller;
    setCloudBusy(true);
    setSpeechStatus('idle');
    setSpeechError(null);
    let tempUri: string | null = null;
    try {
      await Speech.stop();
      if (requestGeneration !== cloudGenerationRef.current) return;
      const audioBase64 = await synthesizeRecipeStep(token, recipeId, step, requestedVoice, controller.signal);
      if (!visibleRef.current || requestGeneration !== cloudGenerationRef.current) return;
      if (!FileSystem.cacheDirectory) throw new Error('Ses önbelleği bulunamadı.');
      tempUri = `${FileSystem.cacheDirectory}tariften-voice-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
      await FileSystem.writeAsStringAsync(tempUri, audioBase64, { encoding: FileSystem.EncodingType.Base64 });
      if (!visibleRef.current || requestGeneration !== cloudGenerationRef.current) return;
      const player = createAudioPlayer({ uri: tempUri });
      player.setPlaybackRate(speechRate);
      cloudPlayerRef.current = player;
      cloudUriRef.current = tempUri;
      cloudKeyRef.current = key;
      player.addListener('playbackStatusUpdate', (status) => {
        if (requestGeneration === cloudGenerationRef.current && status.didJustFinish) {
          setSpeechStatus('idle');
        }
      });
      player.play();
      setSpeechStatus('playing');
      setCloudBusy(false);
    } catch (reason) {
      if (controller.signal.aborted || requestGeneration !== cloudGenerationRef.current) return;
      setSpeechStatus('error');
      setSpeechError(reason instanceof Error ? reason.message : 'Doğal ses oluşturulamadı. Cihaz sesini kullanabilirsin.');
      setCloudBusy(false);
    } finally {
      if (tempUri && cloudUriRef.current !== tempUri) {
        void FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(() => {});
      }
      if (cloudControllerRef.current === controller) cloudControllerRef.current = null;
    }
  }, [token, recipeId, cloudStatus?.enabled, speechRate, clearCloud]);

  const stopSpeech = useCallback(() => {
    clearCloud();
    ++speechGenerationRef.current;
    setSpeechStatus('idle');
    speechQueueRef.current = speechQueueRef.current.catch(() => {}).then(() => Speech.stop());
    void speechQueueRef.current.catch(() => {
      if (visibleRef.current) setSpeechError('Ses durdurulamadı. Lütfen tekrar deneyin.');
    });
  }, [clearCloud]);

  const speak = useCallback((text: string, voiceOverride?: string | null) => {
    if (cloudMode && voiceOverride === undefined) {
      void speakCloud(currentIndex, cloudVoice);
      return;
    }
    // An explicit offline voice preview must never overlap an existing MP3.
    if (cloudPlayerRef.current) clearCloud();
    if (!visibleRef.current) return;
    const words = text.trim();
    if (!words) {
      setSpeechStatus('idle');
      setSpeechError('Bu adımda okunacak metin bulunmuyor.');
      return;
    }
    const generation = ++speechGenerationRef.current;
    // null requests the recommended voice; undefined uses the user's current choice.
    const voiceId = voiceOverride === undefined
      ? chooseTurkishVoiceId(voiceOptions, selectedVoiceId, Speech.VoiceQuality.Enhanced)
      : voiceOverride === null
        ? chooseTurkishVoiceId(voiceOptions, null, Speech.VoiceQuality.Enhanced)
        : voiceOverride;
    setSpeechStatus('idle');
    setSpeechError(null);
    // Serialize stop/speak operations so an older async stop cannot cancel new audio.
    speechQueueRef.current = speechQueueRef.current.catch(() => {}).then(async () => {
      await Speech.stop();
      if (!visibleRef.current || generation !== speechGenerationRef.current) return;
      Speech.speak(words, {
        language: 'tr-TR',
        rate: speechRate,
        pitch: 1,
        voice: voiceId,
        onStart: () => {
          if (visibleRef.current && generation === speechGenerationRef.current) setSpeechStatus('playing');
        },
        onDone: () => {
          if (visibleRef.current && generation === speechGenerationRef.current) setSpeechStatus('idle');
        },
        onStopped: () => {
          if (visibleRef.current && generation === speechGenerationRef.current) setSpeechStatus('idle');
        },
        onError: () => {
          if (visibleRef.current && generation === speechGenerationRef.current) {
            setSpeechStatus('error');
            setSpeechError('Ses okunamadı. Cihazın Türkçe ses ayarlarını kontrol edin.');
          }
        },
      });
    });
    void speechQueueRef.current.catch(() => {
      if (visibleRef.current && generation === speechGenerationRef.current) {
        setSpeechStatus('error');
        setSpeechError('Ses başlatılamadı. Cihazın ses ayarlarını kontrol edin.');
      }
    });
  }, [voiceOptions, selectedVoiceId, speechRate, cloudMode, cloudVoice, currentIndex, speakCloud, clearCloud]);

  const pauseSpeech = useCallback(() => {
    if (speechStatus !== 'playing') return;
    if (cloudMode && cloudPlayerRef.current) {
      cloudPlayerRef.current.pause();
      setSpeechStatus('paused');
      return;
    }
    if (Platform.OS === 'ios' || Platform.OS === 'web') {
      const generation = speechGenerationRef.current;
      void Speech.pause().then(() => {
        if (visibleRef.current && generation === speechGenerationRef.current) setSpeechStatus('paused');
      }).catch(() => setSpeechError('Ses duraklatılamadı.'));
    } else {
      // expo-speech has no pause/resume API on Android; resume restarts the step.
      stopSpeech();
      setSpeechStatus('paused');
    }
  }, [speechStatus, stopSpeech, cloudMode]);

  const resumeSpeech = useCallback(() => {
    if (speechStatus !== 'paused') return;
    if (cloudMode && cloudPlayerRef.current) {
      cloudPlayerRef.current.play();
      setSpeechStatus('playing');
      return;
    }
    if (Platform.OS === 'ios' || Platform.OS === 'web') {
      const generation = speechGenerationRef.current;
      void Speech.resume().then(() => {
        if (visibleRef.current && generation === speechGenerationRef.current) setSpeechStatus('playing');
      }).catch(() => setSpeechError('Ses devam ettirilemedi.'));
    } else {
      speak(currentStep.content);
    }
  }, [speechStatus, speak, currentStep.content, cloudMode]);

  // --- Wall-clock timer (survives background JS timer suspension) ---
  const syncTimer = useCallback(() => {
    if (timerDeadlineRef.current === null) return;
    const remaining = Math.max(0, Math.ceil((timerDeadlineRef.current - Date.now()) / 1000));
    setTimerSeconds(remaining);
  }, []);

  useEffect(() => {
    if (!timerRunning || isTimerPaused) return;
    syncTimer();
    intervalRef.current = setInterval(syncTimer, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [timerRunning, isTimerPaused, syncTimer]);

  const stopTimer = useCallback(() => {
    timerDeadlineRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setTimerRunning(false);
    setIsTimerPaused(false);
  }, []);

  const startTimer = useCallback((minutes: number) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const seconds = Math.round(minutes * 60);
    timerDeadlineRef.current = Date.now() + seconds * 1000;
    setTimerSeconds(seconds);
    setTimerRunning(true);
    setIsTimerPaused(false);
    setIsAlarmPlaying(false);
    Vibration.cancel();
    Vibration.vibrate([0, 35, 90, 35]);
    void playTimerStartSound();
  }, []);

  const toggleTimerPause = useCallback(() => {
    if (!timerRunning) return;
    if (!isTimerPaused) {
      const remaining = timerDeadlineRef.current === null
        ? (timerSeconds ?? 0)
        : Math.max(0, Math.ceil((timerDeadlineRef.current - Date.now()) / 1000));
      setTimerSeconds(remaining);
      timerDeadlineRef.current = null;
      setIsTimerPaused(true);
    } else {
      timerDeadlineRef.current = Date.now() + (timerSeconds ?? 0) * 1000;
      setIsTimerPaused(false);
    }
  }, [timerRunning, isTimerPaused, timerSeconds]);

  useEffect(() => {
    if (timerRunning && !isTimerPaused && timerSeconds === 0) {
      stopTimer();
      if (visibleRef.current) {
        setIsAlarmPlaying(true);
        Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      }
    }
  }, [timerSeconds, timerRunning, isTimerPaused, stopTimer]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') syncTimer();
      else stopSpeech();
    });
    return () => sub.remove();
  }, [syncTimer, stopSpeech]);

  // --- Cleanup on close, hiding and unmount ---
  useEffect(() => {
    if (visible) return;
    stopSpeech();
    stopTimer();
    Vibration.cancel();
    setCurrentIndex(0);
    setIsSOSOpen(false);
    setIsHelpOpen(false);
    setIsFinishedOpen(false);
    setIsVoiceSettingsOpen(false);
    setSosMessage(null);
    setIsAlarmPlaying(false);
  }, [visible, stopSpeech, stopTimer]);

  useEffect(() => () => {
    visibleRef.current = false;
    ++speechGenerationRef.current;
    clearCloud();
    void Speech.stop().catch(() => {});
    if (intervalRef.current) clearInterval(intervalRef.current);
    Vibration.cancel();
  }, [clearCloud]);

  const closeAssistant = useCallback(() => {
    stopSpeech();
    onClose();
  }, [stopSpeech, onClose]);

  const openVoiceSettings = useCallback(() => {
    stopSpeech();
    setIsVoiceSettingsOpen(true);
  }, [stopSpeech]);

  const closeVoiceSettings = useCallback(() => {
    stopSpeech();
    setIsVoiceSettingsOpen(false);
  }, [stopSpeech]);

  const changeStep = useCallback((delta: number) => {
    stopSpeech();
    setCurrentIndex((index) => Math.max(0, Math.min(totalSteps - 1, index + delta)));
  }, [stopSpeech, totalSteps]);

  const handleNativeVoiceCommand = useCallback((transcript: string) => {
    const command = parseCookingCommand(transcript);
    if (!command) return;
    setLastSpokenCommand(transcript.trim());
    switch (command.type) {
      case 'next':
        if (isLast) { stopSpeech(); setIsFinishedOpen(true); }
        else changeStep(1);
        return;
      case 'previous': changeStep(-1); return;
      case 'read': speak(currentStep.content); return;
      case 'pause_voice': pauseSpeech(); return;
      case 'resume_voice':
        if (timerRunning && isTimerPaused) toggleTimerPause();
        else if (speechStatus === 'paused') resumeSpeech();
        else if (isLast) setIsFinishedOpen(true);
        else changeStep(1);
        return;
      case 'stop_voice': stopSpeech(); return;
      case 'start_timer': startTimer(command.minutes); return;
      case 'pause_timer': if (timerRunning && !isTimerPaused) toggleTimerPause(); return;
      case 'resume_timer': if (timerRunning && isTimerPaused) toggleTimerPause(); return;
      case 'cancel_timer': stopTimer(); setTimerSeconds(null); return;
      case 'help': setIsHelpOpen(true); return;
    }
  }, [isLast, changeStep, speak, currentStep.content, pauseSpeech, resumeSpeech, stopSpeech,
      speechStatus, startTimer, timerRunning, isTimerPaused, toggleTimerPause, stopTimer]);

  const handleCommandRef = useRef(handleNativeVoiceCommand);
  useEffect(() => { handleCommandRef.current = handleNativeVoiceCommand; }, [handleNativeVoiceCommand]);

  // Native iOS/Android speech recognition is not included in Expo Go.
  // Only use it inside an app-specific development/production build.
  useEffect(() => {
    if (!visible) return;
    setMicListening(false);
    setMicError('');
    setLastSpokenCommand('');
    setMicFeedback('Mikrofon hazırlanıyor…');
    setHeardPhrase('');
    if (Constants.appOwnership === 'expo') {
      setMicAvailable(false);
      setMicError('Sesli komutlar için Tariften development build gereklidir. Expo Go bu native modülü içermez.');
      return;
    }

    let disposed = false;
    let moduleApi: typeof nativeRecognizerRef.current = null;
    try {
      // Dynamic loading keeps Expo Go capable of testing the existing TTS UI.
      moduleApi = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
      if (!moduleApi?.start || !moduleApi?.addListener) throw new Error('native module unavailable');
    } catch {
      setMicAvailable(false);
      setMicError('Cihazın native konuşma tanıma modülü bulunamadı. Yeni bir development build gerekiyor.');
      return;
    }

    const api = moduleApi;
    nativeRecognizerRef.current = api;
    setMicAvailable(true);
    voiceWantedRef.current = true; // automatically listen while the cooking screen is open
    const startListening = () => {
      if (disposed || !voiceWantedRef.current || !visibleRef.current || nativeRecognizingRef.current) return;
      if (AppState.currentState !== 'active') return;
      try {
        nativeRecognizingRef.current = true;
        api.start(COOKING_RECOGNITION_OPTIONS);
      } catch {
        nativeRecognizingRef.current = false;
        setMicError('Mikrofon başlatılamadı. iOS mikrofon ve konuşma tanıma izinlerini kontrol et.');
      }
    };
    const subscriptions = [
      api.addListener('start', () => {
        if (disposed) return;
        nativeRecognizingRef.current = true;
        setMicListening(true);
        setMicFeedback('Mikrofon açık · Sonraki, Önceki veya Oku diyebilirsin.');
        setMicError('');
      }),
      api.addListener('audiostart', () => {
        if (disposed) return;
        setMicFeedback((value) => value.startsWith('Komut uygulandı:')
          ? value : 'Konuşmanı dinliyorum…');
      }),
      api.addListener('result', (event: any) => {
        if (disposed || !voiceWantedRef.current) return;
        const transcript = extractCookingTranscript(event);
        if (!transcript) return;
        setHeardPhrase(transcript);
        consecutiveNoSpeechRef.current = 0;
        recognizerRestartDelayRef.current = 850;
        const command = parseCookingCommand(transcript);
        if (!command) {
          setMicFeedback('Duyuldu; henüz bir komutla eşleşmedi.');
          return;
        }
        // Interim results commonly repeat or refine one phrase. Deduplicate
        // by action, not by globally muting all voice commands for 950ms.
        const actionKey = command.type === 'start_timer'
          ? 'start_timer:' + command.minutes : command.type;
        const now = Date.now();
        if (actionKey === lastCommandKeyRef.current && now - commandCooldownRef.current < 1750) return;
        lastCommandKeyRef.current = actionKey;
        commandCooldownRef.current = now;
        setMicFeedback('Komut uygulandı: ' + transcript);
        // Do not stop/restart iOS recognition after each command. Keep the
        // audio stream active, only reinitialize when the OS ends the session.
        handleCommandRef.current(transcript);
      }),
      api.addListener('nomatch', () => {
        // Native recognizers may emit nomatch after partial results.
        // No need to overwrite useful live transcript feedback.
      }),
      api.addListener('error', (event: any) => {
        if (disposed) return;
        const code = String(event.error || 'unknown');
        if (code === 'aborted') return;
        if (code === 'no-speech') {
          // Silence is normal in a kitchen. Do not show repeated error
          // banners; if iOS ends the session, onend will restart it.
          consecutiveNoSpeechRef.current += 1;
          recognizerRestartDelayRef.current = Math.min(
            8500, 1400 * Math.pow(1.65, Math.min(consecutiveNoSpeechRef.current - 1, 4))
          );
          if (consecutiveNoSpeechRef.current >= 3) {
            setMicFeedback('Ses algılanmadı. Mikrofon otomatik yeniden bağlanacak.');
          }
          return;
        }
        if (code === 'network' || code === 'busy' || code === 'audio-capture') {
          recognizerRestartDelayRef.current = 2400;
        }
        setMicError(code === 'not-allowed'
          ? 'Mikrofon veya konuşma tanıma izni reddedildi. Telefon ayarlarından izin ver.'
          : 'Konuşma tanıma hatası (' + code + ')' +
            (event.message ? ': ' + String(event.message).slice(0, 110) : '') +
            '. Dinleme yeniden denenecek.');
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          voiceWantedRef.current = false;
        }
      }),
      api.addListener('end', () => {
        if (disposed) return;
        nativeRecognizingRef.current = false;
        setMicListening(false);
        if (voiceRestartRef.current) clearTimeout(voiceRestartRef.current);
        if (voiceWantedRef.current && visibleRef.current) {
          voiceRestartRef.current = setTimeout(startListening, recognizerRestartDelayRef.current);
        }
      }),
    ];
    void api.requestPermissionsAsync()
      .then((result) => {
        if (disposed) return;
        if (!result.granted) {
          voiceWantedRef.current = false;
          setMicError('Sesli komutların otomatik başlaması için mikrofon ve konuşma tanıma izni gerekli.');
          return;
        }
        startListening();
      })
      .catch(() => {
        if (!disposed) setMicError('Mikrofon izni alınamadı. Telefon ayarlarını kontrol et.');
      });
    const lifecycle = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        if (voiceRestartRef.current) clearTimeout(voiceRestartRef.current);
        try { api.stop(); } catch { /* already stopped */ }
      } else if (voiceWantedRef.current && visibleRef.current) {
        voiceRestartRef.current = setTimeout(startListening, 700);
      }
    });

    return () => {
      disposed = true;
      voiceWantedRef.current = false;
      if (voiceRestartRef.current) clearTimeout(voiceRestartRef.current);
      try { api.abort(); } catch { /* ignore */ }
      subscriptions.forEach((item) => item.remove());
      lifecycle.remove();
      nativeRecognizerRef.current = null;
      nativeRecognizingRef.current = false;
    };
  }, [visible]);

  const toggleNativeMicrophone = useCallback(async () => {
    const api = nativeRecognizerRef.current;
    if (!api) { setMicError('Sesli komutlar için development build gerekli.'); return; }
    if (voiceWantedRef.current) {
      voiceWantedRef.current = false;
      if (voiceRestartRef.current) clearTimeout(voiceRestartRef.current);
      try { api.stop(); } catch { /* already stopped */ }
      setMicListening(false);
      return;
    }
    try {
      const grant = await api.requestPermissionsAsync();
      if (!grant.granted) { setMicError('Mikrofon izinleri reddedildi.'); return; }
      voiceWantedRef.current = true;
      setMicError('');
      if (!nativeRecognizingRef.current) {
        nativeRecognizingRef.current = true;
        api.start(COOKING_RECOGNITION_OPTIONS);
      }
    } catch {
      nativeRecognizingRef.current = false;
      setMicError('Sesli komutları başlatamadık. Telefon ayarlarını kontrol et.');
    }
  }, []);

  // Quick editorial tips; these are not responses generated by an AI model.
  const handleSOSAction = useCallback((problem: SosKey) => {
    setSosMessage(SOS_RESPONSES[problem]);
  }, []);

  // --- Format time ---
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeAssistant}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor="#0b111b" />
        <SafeAreaView style={styles.container}>
          <LinearGradient colors={['#151d2a', '#0a1019', '#090d16']} style={StyleSheet.absoluteFillObject} pointerEvents="none" />

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={closeAssistant} style={styles.backButton} accessibilityLabel="Tarife dön">
              <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <Image source={require('../assets/icon.png')} style={styles.brandLogo} resizeMode="cover" accessibilityLabel="Tariften logosu" />
            <View style={styles.headerTitleGroup}>
              <View style={styles.liveIndicator}>
                <Animated.View style={[styles.ledDot, { opacity: ledPulse }]} />
                <Text style={styles.liveText}>TARİFTEN · PİŞİRME</Text>
              </View>
              <Text style={styles.headerTitle} numberOfLines={1}>{recipeTitle}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => void toggleNativeMicrophone()} style={[styles.headerIconBtn, micListening && styles.micActive]}
              accessibilityLabel={micListening ? 'Sesli komutları kapat' : 'Sesli komutları aç'} accessibilityState={{ selected: micListening }}>
              <Ionicons name={micListening ? 'mic' : 'mic-off-outline'} size={20} color={micListening ? '#ffffff' : 'rgba(255,255,255,0.75)'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsHelpOpen(true)} style={styles.headerIconBtn}>
              <Ionicons name="help-circle-outline" size={22} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openVoiceSettings}
              style={styles.headerIconBtn}
              accessibilityLabel="Ses profilini değiştir"
            >
              <Ionicons name="swap-horizontal-outline" size={22} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── MAIN CONTENT ── */}
        <View style={styles.mainWrapper}>
          {!!speechError && (
            <Text style={styles.speechError} accessibilityRole="alert">{speechError}</Text>
          )}
          {!!micError && <Text style={styles.micErrorText}>{micError}</Text>}
          {micListening && <Text style={styles.micListeningText}>● SESLİ KOMUTLAR AÇIK</Text>}
          {micAvailable && (
            <View style={styles.micDiagnostics}>
              <Text style={styles.micDiagnosticsText} numberOfLines={1}>
                {heardPhrase ? 'Duyulan: ' + heardPhrase : micListening ? 'Henüz ifade algılanmadı' : 'Mikrofon yeniden bağlanıyor…'}
              </Text>
              {!!micFeedback && <Text style={styles.micDiagnosticsSubtext} numberOfLines={2}>{micFeedback}</Text>}
            </View>
          )}
          <ScrollView
            contentContainerStyle={[styles.mainContent, compactViewport && styles.mainContentCompact]}
            showsVerticalScrollIndicator={false}
          >
            {/* Premium editorial reading stage */}
            <View style={styles.stepCounterRow}>
              <View style={styles.phaseDot} />
              <Text style={styles.stepCounterText}>ŞİMDİ SIRADA</Text>
              <View style={styles.stepCounterLine} />
              <Text style={styles.stepCountLabel}>{currentIndex + 1} / {totalSteps}</Text>
            </View>
            {timerRunning && timerSeconds !== null ? (
              <View style={[styles.timerFocusCard, compactViewport && styles.timerFocusCompact]}>
                <Text style={styles.timerFocusEyebrow}>{isTimerPaused ? 'SAYAÇ DURAKLATILDI' : 'SAYAÇ ÇALIŞIYOR'}</Text>
                <Text style={[styles.timerFocusDigits, compactViewport && styles.timerFocusDigitsCompact]}>{formatTime(timerSeconds)}</Text>
                <Text style={styles.timerStepPreview} numberOfLines={2}>{currentStep.content}</Text>
                <View style={styles.timerActionRow}>
                  <TouchableOpacity style={styles.timerFocusButton} onPress={toggleTimerPause} accessibilityLabel={isTimerPaused ? 'Sayacı sürdür' : 'Sayacı duraklat'}>
                    <Ionicons name={isTimerPaused ? 'play' : 'pause'} size={18} color="#ffffff" />
                    <Text style={styles.timerFocusButtonText}>{isTimerPaused ? 'Sürdür' : 'Duraklat'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.timerFocusButtonSecondary} onPress={() => { stopTimer(); setTimerSeconds(null); }} accessibilityLabel="Sayacı iptal et">
                    <Text style={styles.timerFocusButtonText}>İptal</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={[styles.readingCard, compactViewport && styles.readingCardCompact]}>
                <LinearGradient colors={['rgba(219,76,63,0.12)', 'rgba(255,255,255,0.02)', 'transparent']}
                  style={StyleSheet.absoluteFillObject} pointerEvents="none" />
                <View style={styles.readingCardTop}>
                  <Text style={styles.readingEyebrow}>ADIM {String(currentIndex + 1).padStart(2, '0')}</Text>
                  <Text style={styles.readingWatermark} accessibilityElementsHidden>
                    {String(currentIndex + 1).padStart(2, '0')}
                  </Text>
                </View>
                <Text style={[styles.stepContent, compactViewport && styles.stepContentCompact]}>
                  {currentStep.content || 'Bu tarifte henüz hazırlanış adımı bulunmuyor.'}
                </Text>
                <TouchableOpacity onPress={openVoiceSettings} style={styles.readingCardFooter}
                  accessibilityRole="button" accessibilityLabel="Ses profilini değiştir">
                  <View style={styles.voiceStatusDot} />
                  <Ionicons name="volume-medium-outline" size={15} color="#f0a69c" />
                  <Text style={styles.readingVoiceText} numberOfLines={1}>
                    {cloudMode
                      ? 'CHIRP 3 HD · ' + (CHIRP3_VOICES.find((item) => item.id === cloudVoice)?.label.split(' · ')[0] || 'Enceladus')
                      : 'CİHAZ SESİ · TÜRKÇE'}
                  </Text>
                  <Ionicons name="swap-horizontal-outline" size={17} color="#ffffff" />
                </TouchableOpacity>
              </View>
            )}

            {/* Quick actions */}
            <View style={styles.quickActions}>
              {!timerRunning && (
                <TouchableOpacity
                  style={styles.quickBtn}
                  onPress={() => startTimer(10)}
                >
                  <Ionicons name="play" size={10} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.quickBtnText}>10dk Başlat</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.quickBtn} onPress={() => speak(currentStep.content)} disabled={!currentStep.content.trim() || cloudBusy}>
                <Ionicons name="volume-high" size={10} color="rgba(255,255,255,0.7)" />
                <Text style={styles.quickBtnText}>{speechStatus === 'idle' || speechStatus === 'error' ? 'Oku' : 'Tekrar'}</Text>
              </TouchableOpacity>
              {(speechStatus === 'playing' || speechStatus === 'paused') && (
                <TouchableOpacity style={styles.quickBtn} onPress={stopSpeech} accessibilityLabel="Okumayı durdur">
                  <Ionicons name="stop" size={10} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.quickBtnText}>Durdur</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.quickBtn, styles.quickBtnSOS]} onPress={() => setIsSOSOpen(true)}>
                <Ionicons name="warning" size={10} color="#f87171" />
                <Text style={[styles.quickBtnText, styles.quickBtnSOSText]}>Mutfak İpuçları</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* ── FOOTER ── */}
        <View style={styles.footer}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>PİŞİRME İLERLEMESİ</Text>
            <Text style={styles.progressFraction}>{totalSteps ? currentIndex + 1 : 0} / {totalSteps}</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <View style={styles.controls}>
            {/* Prev */}
            <TouchableOpacity
              style={[styles.navBtn, isFirst && styles.navBtnDisabled]}
              onPress={() => {
                if (!isFirst) changeStep(-1);
              }}
              disabled={isFirst || totalSteps === 0}
            >
              <Ionicons name="chevron-back" size={20} color={isFirst ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)'} />
              <Text style={[styles.navBtnText, isFirst && styles.navBtnTextDisabled]}>Önceki</Text>
            </TouchableOpacity>

            {/* Natural Chirp speech playback controls, separate from hands-free command recognition. */}
            <TouchableOpacity
              onPress={() => {
                if (speechStatus === 'playing') pauseSpeech();
                else if (speechStatus === 'paused') resumeSpeech();
                else speak(currentStep.content);
              }}
              disabled={!currentStep.content.trim() || cloudBusy}
              accessibilityLabel={speechStatus === 'playing' ? 'Okumayı duraklat' : speechStatus === 'paused' ? 'Okumaya devam et' : 'Tarif adımını oku'}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#db4c3f', '#b03d32']} style={styles.micFAB}>
                <Ionicons name={speechStatus === 'playing' ? 'pause' : 'volume-high'} size={28} color="#ffffff" />
                <Text style={styles.micFABText}>
                  {cloudBusy ? 'Hazırlanıyor' : speechStatus === 'playing' ? 'Duraklat' : speechStatus === 'paused' ? (!cloudMode && Platform.OS === 'android' ? 'Baştan Oku' : 'Devam') : 'Oku'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Next / Finish */}
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => {
                if (!totalSteps) return;
                if (!isLast) changeStep(1);
                else { stopSpeech(); setIsFinishedOpen(true); }
              }}
              disabled={totalSteps === 0}
            >
              <Text style={styles.nextBtnText}>{isLast ? 'Bitir' : 'Sonraki'}</Text>
              <Ionicons name={isLast ? 'checkmark' : 'chevron-forward'} size={20} color="#0f172a" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ══════════ MODALS ══════════ */}

        {/* Local voice comparison — no recorded audio or cloud calls. */}
        <Modal
          visible={visible && isVoiceSettingsOpen}
          transparent
          animationType="fade"
          onRequestClose={closeVoiceSettings}
        >
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={[styles.modalHeader, styles.helpHeader]}>
                <View style={styles.modalHeaderTitle}>
                  <Ionicons name="options-outline" size={21} color="#60a5fa" />
                  <Text style={styles.modalHeaderText}>Ses Profilini Değiştir</Text>
                </View>
                <TouchableOpacity
                  onPress={closeVoiceSettings}
                  accessibilityLabel="Ses ayarlarını kapat"
                  style={styles.voiceCloseButton}
                >
                  <Ionicons name="close" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalBody} showsVerticalScrollIndicator={false}>
                <Text style={styles.voiceDescription}>
                  Doğal Chirp 3 HD seslerini veya telefonundaki çevrimdışı Türkçe sesleri seç.
                  Doğal sesler kullanıcı kotasına tabidir.
                </Text>
                <Text style={styles.voiceHint}>
                  Cihaz sesleri ücretsizdir. Chirp 3 HD önizlemeleri Google üzerinden üretilir ve ses kotasından düşer.
                </Text>

                <Text style={styles.voiceSectionTitle}>OKUMA HIZI</Text>
                <View style={styles.voiceRatesRow}>
                  {VOICE_RATE_PRESETS.map((preset) => (
                    <TouchableOpacity
                      key={preset.id}
                      onPress={() => {
                        stopSpeech();
                        setSpeechRate(preset.rate);
                      }}
                      style={[styles.voiceRateButton, speechRate === preset.rate && styles.voiceSelected]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: speechRate === preset.rate }}
                    >
                      <Text style={styles.voiceRateText}>{preset.label}</Text>
                      <Text style={styles.voiceRateSubtext}>{preset.rate.toFixed(2)}×</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.voiceHint}>Hız değişikliği bir sonraki okumada uygulanır.</Text>

                {cloudStatus?.enabled ? (
                  <>
                    <Text style={styles.voiceSectionTitle}>GOOGLE CHIRP 3 HD · DOĞAL SESLER</Text>
                    <Text style={styles.voiceHint}>Her yeni adım/ses önizlemesi ücretli API isteği oluşturabilir. Aynı dosya açık kaldığı sürece tekrar dinleme ücretsizdir.</Text>
                    {CHIRP3_VOICES.map((item) => (
                      <View key={item.id} style={[styles.voiceItem, cloudMode && cloudVoice === item.id && styles.voiceSelected]}>
                        <TouchableOpacity
                          onPress={() => { stopSpeech(); setCloudMode(true); setCloudVoice(item.id); }}
                          style={styles.voiceChoice}
                          accessibilityRole="button"
                          accessibilityState={{ selected: cloudMode && cloudVoice === item.id }}
                        >
                          <Ionicons name={cloudMode && cloudVoice === item.id ? 'radio-button-on' : 'radio-button-off'} size={19} color="#db4c3f" />
                          <View style={styles.voiceItemText}>
                            <Text style={styles.voiceName}>{item.label}</Text>
                            <Text style={styles.voiceMeta}>Google · Türkçe doğal ses</Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.voicePreviewButton}
                          disabled={cloudBusy || !currentStep.content.trim()}
                          onPress={() => { stopSpeech(); setCloudMode(true); setCloudVoice(item.id); void speakCloud(currentIndex, item.id); }}
                          accessibilityLabel={item.label + ' doğal sesini dinle (kota kullanır)'}
                        >
                          <Text style={styles.voicePreviewText}>Dinle</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                ) : (
                  <Text style={styles.voiceHint}>Google doğal ses betası henüz kapalı veya hesabın için erişilemiyor. Cihaz seslerini kullanabilirsin.</Text>
                )}

                <Text style={styles.voiceSectionTitle}>ÇEVRİMDIŞI TÜRKÇE SESLER</Text>
                {voiceLoading ? <Text style={styles.voiceHint}>Cihazdaki sesler yükleniyor...</Text> : null}
                {voiceFetchFailed ? (
                  <View style={styles.voiceNotice}>
                    <Text style={styles.voiceHint}>Ses listesi alınamadı. Sistem sesiyle okumaya devam edebilirsin.</Text>
                    <TouchableOpacity onPress={() => setVoiceRefresh((n) => n + 1)} accessibilityLabel="Ses listesini tekrar yükle">
                      <Text style={styles.voiceRetryText}>Tekrar dene</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {!voiceLoading && !voiceFetchFailed && voiceOptions.length === 0 ? (
                  <Text style={styles.voiceHint}>
                    Cihazın listesinde Türkçe ses bulunamadı. Yine de varsayılan Türkçe sesle dinlemeyi deneyebilirsin.
                  </Text>
                ) : null}

                <View style={[styles.voiceItem, !cloudMode && selectedVoiceId === null && styles.voiceSelected]}>
                  <TouchableOpacity
                    onPress={() => { stopSpeech(); setCloudMode(false); setSelectedVoiceId(null); }}
                    style={styles.voiceChoice}
                    accessibilityRole="button"
                    accessibilityState={{ selected: selectedVoiceId === null }}
                  >
                    <Ionicons
                      name={selectedVoiceId === null ? 'radio-button-on' : 'radio-button-off'}
                      size={19}
                      color={selectedVoiceId === null ? '#db4c3f' : '#94a3b8'}
                    />
                    <View style={styles.voiceItemText}>
                      <Text style={styles.voiceName}>Otomatik seçim</Text>
                      <Text style={styles.voiceMeta}>Gelişmiş Türkçe ses varsa önce onu kullan</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.voicePreviewButton}
                    onPress={() => speak(currentStep.content, null)}
                    disabled={!currentStep.content.trim()}
                    accessibilityLabel="Otomatik sesi dinle"
                  >
                    <Ionicons name="play" size={14} color="#ffffff" />
                    <Text style={styles.voicePreviewText}>Dinle</Text>
                  </TouchableOpacity>
                </View>
                {voiceOptions.map((voice) => (
                  <View
                    key={voice.identifier}
                    style={[styles.voiceItem, !cloudMode && selectedVoiceId === voice.identifier && styles.voiceSelected]}
                  >
                    <TouchableOpacity
                      onPress={() => { stopSpeech(); setCloudMode(false); setSelectedVoiceId(voice.identifier); }}
                      style={styles.voiceChoice}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedVoiceId === voice.identifier }}
                    >
                      <Ionicons
                        name={selectedVoiceId === voice.identifier ? 'radio-button-on' : 'radio-button-off'}
                        size={19}
                        color={selectedVoiceId === voice.identifier ? '#db4c3f' : '#94a3b8'}
                      />
                      <View style={styles.voiceItemText}>
                        <Text style={styles.voiceName} numberOfLines={2}>{voice.name}</Text>
                        <Text style={styles.voiceMeta}>
                          {voice.language} · {voice.quality === Speech.VoiceQuality.Enhanced ? 'Gelişmiş' : 'Standart'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.voicePreviewButton}
                      onPress={() => speak(currentStep.content, voice.identifier)}
                      disabled={!currentStep.content.trim()}
                      accessibilityLabel={voice.name + ' sesini dinle'}
                    >
                      <Ionicons name="play" size={14} color="#ffffff" />
                      <Text style={styles.voicePreviewText}>Dinle</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <Text style={styles.voiceHint}>
                  {currentStep.content.trim()
                    ? 'Dinle, seçili sesin ve hızın mevcut tarif adımını nasıl okuduğunu gösterir.'
                    : 'Bu tarifte okunacak adım olmadığı için ses önizlemesi yapılamıyor.'}
                </Text>
                <View style={styles.voiceActionsRow}>
                  <TouchableOpacity
                    onPress={stopSpeech}
                    style={styles.voiceStopButton}
                    accessibilityLabel="Ses önizlemesini durdur"
                  >
                    <Ionicons name="stop" size={14} color="#ffffff" />
                    <Text style={styles.voiceStopText}>Durdur</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={closeVoiceSettings}
                    style={styles.voiceDoneButton}
                    accessibilityLabel="Ses seçimlerini uygula"
                  >
                    <Text style={styles.voiceDoneText}>Seçimi Kullan</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* SOS Modal */}
        <Modal
          visible={isSOSOpen}
          transparent
          animationType="fade"
          onRequestClose={() => { setIsSOSOpen(false); setSosMessage(null); }}
        >
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={[styles.modalHeader, styles.sosHeader]}>
                <View style={styles.modalHeaderTitle}>
                  <Ionicons name="warning" size={20} color="#f87171" />
                  <Text style={styles.modalHeaderText}>Mutfak Acil Servis</Text>
                </View>
                <TouchableOpacity onPress={() => { setIsSOSOpen(false); setSosMessage(null); }}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                {!sosMessage ? (
                  <View style={styles.sosGrid}>
                    {[
                      { key: 'burnt' as SosKey, emoji: '🔥', label: 'Yemek Yandı' },
                      { key: 'watery' as SosKey, emoji: '💧', label: 'Çok Sulandı' },
                      { key: 'salty' as SosKey, emoji: '🧪', label: 'Tuz/Baharat' },
                      { key: 'other' as SosKey, emoji: '❓', label: 'Diğer Sorun' },
                    ].map((item) => (
                      <TouchableOpacity key={item.key} style={styles.sosItem} onPress={() => handleSOSAction(item.key)}>
                        <Text style={styles.sosEmoji}>{item.emoji}</Text>
                        <Text style={styles.sosItemLabel}>{item.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <View style={styles.sosSolution}>
                    <View style={styles.sosSolutionIcon}>
                      <Ionicons name="sparkles" size={24} color="#db4c3f" />
                    </View>
                    <Text style={styles.sosSolutionTitle}>Genel Mutfak Önerisi</Text>
                    <Text style={styles.sosSolutionText}>{sosMessage}</Text>
                    <TouchableOpacity onPress={() => setSosMessage(null)}>
                      <Text style={styles.sosSolutionBack}>Geri Dön</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>

        {/* Help Modal */}
        <Modal
          visible={isHelpOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsHelpOpen(false)}
        >
          <View style={styles.overlay}>
            <View style={styles.modalCard}>
              <View style={[styles.modalHeader, styles.helpHeader]}>
                <View style={styles.modalHeaderTitle}>
                  <Ionicons name="list" size={20} color="#60a5fa" />
                  <Text style={styles.modalHeaderText}>Sesli Okuma Yardımı</Text>
                </View>
                <TouchableOpacity onPress={() => setIsHelpOpen(false)}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.6)" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBody}>
                <Text style={styles.helpCategory}>PİŞİRME REHBERİ</Text>
                <Text style={styles.helpDesc}>Adımı sesli okumak için Oku düğmesine dokunun. Önceki ve Sonraki düğmeleri mevcut sesi durdurur; tarif adımlarını değiştirmez.</Text>
                <Text style={[styles.helpCategory, { marginTop: 12 }]}>SES KONTROLÜ</Text>
                <Text style={styles.helpDesc}>iPhone'da Duraklat ve Devam desteklenir. Android'de devam etmek için mevcut adım baştan okunur. Uygulama arka plana geçtiğinde ses durur.</Text>
                <Text style={[styles.helpCategory, { marginTop: 12 }]}>ZAMANLAYICI</Text>
                <Text style={styles.helpDesc}>Zamanlayıcıya dokunarak duraklatabilir veya devam ettirebilirsiniz. Arka planda geçen süre, uygulamaya döndüğünüzde hesaba katılır.</Text>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Alarm Modal */}
        <Modal
          visible={isAlarmPlaying}
          transparent
          animationType="fade"
          onRequestClose={() => setIsAlarmPlaying(false)}
        >
          <View style={[styles.overlay, styles.alarmOverlay]}>
            <View style={styles.alarmContent}>
              <Animated.View style={[styles.alarmIconCircle, { transform: [{ scale: alarmScale }] }]}>
                <Ionicons name="volume-high" size={56} color="#ffffff" />
              </Animated.View>
              <Text style={styles.alarmTitle}>Süre Doldu!</Text>
              <Text style={styles.alarmSubtitle}>Yemeğinizi kontrol edin şefim.</Text>
              <TouchableOpacity style={styles.alarmButton} onPress={() => setIsAlarmPlaying(false)}>
                <Ionicons name="notifications-off" size={20} color="#0f172a" />
                <Text style={styles.alarmButtonText}>Alarmı Sustur</Text>
              </TouchableOpacity>
              <Text style={styles.alarmHint}>Alarmı kapatmak için yukarıdaki düğmeye dokunun.</Text>
            </View>
          </View>
        </Modal>

        {/* Finish Modal */}
        <Modal
          visible={isFinishedOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsFinishedOpen(false)}
        >
          <View style={styles.overlay}>
            <View style={styles.finishCard}>
              <LinearGradient
                colors={['#ef4444', '#eab308', '#22c55e']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.finishGradientLine}
              />
              <View style={styles.finishMedalCircle}>
                <Text style={styles.finishMedalEmoji}>🏅</Text>
              </View>
              <Text style={styles.finishTitle}>Tebrikler Şefim!</Text>
              <Text style={styles.finishSubtitle}>
                Bu tarifi başarıyla tamamladın. Eline sağlık, harika görünüyor!
              </Text>
              <TouchableOpacity
                style={styles.finishHomeBtn}
                onPress={() => { setIsFinishedOpen(false); closeAssistant(); try { router.replace('/(tabs)' as any); } catch { /* ignore */ } }}
              >
                <Text style={styles.finishHomeBtnText}>Ana Sayfaya Dön</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.finishCloseBtn} onPress={() => setIsFinishedOpen(false)}>
                <Text style={styles.finishCloseBtnText}>Pencereyi Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  brandLogo: { width: 34, height: 34, borderRadius: 10, marginRight: -3 },
  micActive: { backgroundColor: 'rgba(219,76,63,0.32)', borderColor: 'rgba(219,76,63,0.65)' },
  micErrorText: { paddingHorizontal: 14, paddingVertical: 5, fontSize: 11, color: '#ffd8d5', backgroundColor: '#441c1e' },
  micListeningText: { paddingHorizontal: 14, paddingVertical: 4, fontSize: 10, color: '#b6efc8', backgroundColor: 'rgba(24,95,60,0.18)', fontWeight: '800' },
  micDiagnostics: { backgroundColor: 'rgba(24,95,60,0.10)', paddingHorizontal: 14, paddingVertical: 5 },
  micDiagnosticsText: { fontSize: 11, color: '#e7efe9', lineHeight: 15 },
  micDiagnosticsSubtext: { fontSize: 10, color: '#b6c9c2', lineHeight: 14 },
  mainContentCompact: { paddingTop: 9, paddingBottom: 10 },
  readingCardCompact: { minHeight: 175, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 11 },
  stepContentCompact: { fontSize: 17.5, lineHeight: 25, marginVertical: 12 },
  timerFocusCard: {
    minHeight: 255, borderRadius: 25, borderWidth: 1,
    backgroundColor: '#1c2532', borderColor: 'rgba(219,76,63,0.45)',
    padding: 21, marginBottom: 16, justifyContent: 'space-between',
  },
  timerFocusCompact: { minHeight: 190, paddingVertical: 13, paddingHorizontal: 18 },
  timerFocusEyebrow: { fontSize: 10, fontWeight: '900', color: '#df8278', letterSpacing: 2.5 },
  timerFocusDigits: { fontSize: 76, fontWeight: '900', color: '#ffffff', fontVariant: ['tabular-nums'], letterSpacing: -3, textAlign: 'center' },
  timerFocusDigitsCompact: { fontSize: 56 },
  timerStepPreview: { color: '#b9c3cf', fontSize: 12, lineHeight: 17, textAlign: 'center', marginBottom: 11 },
  timerActionRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  timerFocusButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 42, backgroundColor: '#db4c3f', borderRadius: 12, paddingHorizontal: 18 },
  timerFocusButtonSecondary: { minHeight: 42, backgroundColor: 'rgba(255,255,255,0.09)', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  timerFocusButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },

  // Premium cooking canvas
  phaseDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#db4c3f' },
  stepCountLabel: { color: '#e9b9aa', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  readingCard: {
    width: '100%', minHeight: 285, justifyContent: 'space-between', overflow: 'hidden',
    borderRadius: 30, backgroundColor: '#1b2330', borderWidth: 1,
    borderColor: 'rgba(249,187,158,0.18)', paddingHorizontal: 26, paddingVertical: 27, marginBottom: 24,
  },
  readingCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 38 },
  readingEyebrow: { fontSize: 10, color: '#db4c3f', fontWeight: '800', letterSpacing: 3 },
  readingWatermark: { position: 'absolute', top: -27, right: -12, fontSize: 88, fontWeight: '900', color: 'rgba(255,255,255,0.035)' },
  readingCardFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.09)', paddingTop: 17, marginTop: 20,
  },
  voiceStatusDot: { width: 6, height: 6, backgroundColor: '#db4c3f', borderRadius: 3 },
  readingVoiceText: { color: '#d3bac0', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, flex: 1 },
  progressHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel: { color: '#9fa9b9', fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  progressFraction: { color: '#f8ded0', fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  container: {
    flex: 1, backgroundColor: '#090d16',
  },

  // HEADER
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 17, backgroundColor: 'rgba(9,14,23,0.38)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.09)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backButton: {
    width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.065)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitleGroup: {
    flex: 1,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 2,
  },
  ledDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  liveText: {
    fontSize: 9, fontWeight: '800', color: '#db4c3f', letterSpacing: 2.1,
  },
  headerTitle: {
    fontSize: 16, fontWeight: '700', color: '#f9f2eb', maxWidth: 220, letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.075)', justifyContent: 'center', alignItems: 'center',
  },
  listeningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  listeningDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#db4c3f',
  },
  listeningText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },

  // MAIN
  speechError: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    color: '#fecaca',
    backgroundColor: '#7f1d1d',
    fontSize: 13,
  },
  mainWrapper: {
    flex: 1,
    position: 'relative',
  },
  lastCommandPill: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 20,
  },
  lastCommandText: {
    fontSize: 12,
    color: 'rgba(156,163,175,1)',
  },
  mainContent: {
    flexGrow: 1, justifyContent: 'center', alignItems: 'stretch',
    paddingHorizontal: 20, paddingTop: 26, paddingBottom: 22,
  },
  stepCounterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 17,
  },
  stepCounterLine: {
    flex: 1, height: 1, backgroundColor: 'rgba(242,135,109,0.20)',
  },
  stepCounterText: {
    fontSize: 11, fontWeight: '800', color: '#db4c3f', letterSpacing: 2.2,
  },
  stepContent: {
    fontSize: 23, fontWeight: '700', color: '#fff7ed', textAlign: 'left',
    lineHeight: 35, letterSpacing: -0.65, marginVertical: 27,
  },

  // TIMER
  timerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1e293b',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 28,
  },
  timerCardPaused: {
    backgroundColor: 'rgba(234,179,8,0.15)',
    borderColor: 'rgba(234,179,8,0.4)',
  },
  timerDisplay: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 2,
  },
  timerPauseIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timerHint: {
    fontSize: 10,
    color: 'rgba(107,114,128,1)',
    marginLeft: 4,
  },

  // QUICK ACTIONS
  quickActions: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start',
    gap: 8, marginBottom: 5,
  },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)',
    paddingHorizontal: 15, paddingVertical: 12, borderRadius: 14, minHeight: 42,
  },
  quickBtnText: {
    fontSize: 12, fontWeight: '700', color: '#dce1e7',
  },
  quickBtnSOS: {
    backgroundColor: 'rgba(238,121,94,0.08)', borderColor: 'rgba(240,137,109,0.27)',
  },
  quickBtnSOSText: {
    color: '#f9a38c',
  },

  // FOOTER
  footer: {
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, backgroundColor: '#0c131e',
  },
  progressBarBg: {
    height: 5, backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 6, marginBottom: 17, overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%', backgroundColor: '#db4c3f', borderRadius: 6,
  },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  navBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, height: 56, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  navBtnDisabled: {
    opacity: 0.3,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
  },
  navBtnTextDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
  nextBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, height: 56, backgroundColor: '#f6eee5', borderRadius: 18,
  },
  nextBtnText: {
    fontSize: 14, fontWeight: '800', color: '#0e1725',
  },
  micFAB: {
    width: 73, height: 73, borderRadius: 23,
    justifyContent: 'center', alignItems: 'center', gap: 2,
    marginTop: -9, borderWidth: 3, borderColor: '#0c131e', overflow: 'hidden',
  },
  micRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: '#ffffff',
    borderRadius: 38,
  },
  micFABText: {
    fontSize: 10, fontWeight: '800', color: '#fff8f1', letterSpacing: 0.4,
  },

  // LOCAL VOICE SELECTOR
  voiceDescription: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
  },
  voiceHint: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  voiceSectionTitle: {
    color: '#db4c3f',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
    marginTop: 12,
    marginBottom: 10,
  },
  voiceRatesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  voiceRateButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
  },
  voiceRateText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  voiceRateSubtext: {
    color: '#cbd5e1',
    fontSize: 10,
    paddingTop: 3,
  },
  voiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 6,
  },
  voiceSelected: {
    backgroundColor: 'rgba(244,126,99,0.14)', borderColor: '#db4c3f',
  },
  voiceChoice: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  voiceItemText: {
    flex: 1,
    minWidth: 0,
  },
  voiceName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  voiceMeta: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  voicePreviewButton: {
    minHeight: 44,
    minWidth: 66,
    borderRadius: 11,
    backgroundColor: '#334155',
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voicePreviewText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  voiceNotice: {
    borderRadius: 12,
    padding: 10,
    backgroundColor: '#334155',
    marginBottom: 10,
  },
  voiceRetryText: {
    color: '#93c5fd',
    fontWeight: '700',
    fontSize: 13,
  },
  voiceCloseButton: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    marginBottom: 6,
  },
  voiceStopButton: {
    minHeight: 46,
    flex: 1,
    borderRadius: 12,
    backgroundColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  voiceStopText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  voiceDoneButton: {
    minHeight: 46,
    flex: 1.5,
    borderRadius: 12,
    backgroundColor: '#db4c3f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceDoneText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },

  // OVERLAY / MODAL SHARED
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%', maxWidth: 420, backgroundColor: '#1b2431', borderRadius: 28,
    borderWidth: 1, borderColor: 'rgba(249,184,149,0.18)', overflow: 'hidden', maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderBottomWidth: 1,
  },
  modalHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalHeaderText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalBody: {
    padding: 18,
  },
  sosHeader: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderBottomColor: 'rgba(239,68,68,0.2)',
  },
  helpHeader: {
    backgroundColor: 'rgba(96,165,250,0.08)',
    borderBottomColor: 'rgba(96,165,250,0.2)',
  },

  // SOS
  sosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  sosItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
  },
  sosEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  sosItemLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  sosSolution: {
    alignItems: 'center',
  },
  sosSolutionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(219,76,63,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  sosSolutionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 10,
  },
  sosSolutionText: {
    fontSize: 14,
    color: 'rgba(209,213,219,1)',
    lineHeight: 22,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 14,
    width: '100%',
  },
  sosSolutionBack: {
    fontSize: 13,
    color: 'rgba(107,114,128,1)',
    textDecorationLine: 'underline',
  },

  // HELP
  helpCategory: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(107,114,128,1)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  helpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 11,
    borderRadius: 10,
    marginBottom: 5,
  },
  helpCmd: {
    fontSize: 12,
    color: 'rgba(209,213,219,1)',
    flex: 1,
  },
  helpDesc: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },

  // ALARM
  alarmOverlay: {
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  alarmContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  alarmIconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  alarmTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 10,
  },
  alarmSubtitle: {
    fontSize: 16,
    color: 'rgba(156,163,175,1)',
    marginBottom: 32,
    textAlign: 'center',
  },
  alarmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 30,
    marginBottom: 18,
  },
  alarmButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  alarmHint: {
    fontSize: 12,
    color: 'rgba(107,114,128,1)',
    textAlign: 'center',
  },

  // FINISH
  finishCard: {
    width: '100%', maxWidth: 360, backgroundColor: '#1d2531', borderRadius: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', overflow: 'hidden',
    alignItems: 'center', paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24,
  },
  finishGradientLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  finishMedalCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(34,197,94,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  finishMedalEmoji: {
    fontSize: 40,
  },
  finishTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 8,
  },
  finishSubtitle: {
    fontSize: 14,
    color: 'rgba(156,163,175,1)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  finishHomeBtn: {
    width: '100%',
    backgroundColor: '#ffffff',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  finishHomeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  finishCloseBtn: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  finishCloseBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(156,163,175,1)',
  },
});
