import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

// Standard assistant: local speech only. No microphone or paid AI integration.
import * as Speech from 'expo-speech';

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
  steps,
  chefTip,
}: CookingAssistantProps) {
  const router = useRouter();

  const totalSteps = steps.length;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const speechGenerationRef = useRef(0);
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());
  const preferredTurkishVoiceRef = useRef<string | undefined>(undefined);
  const [speechStatus, setSpeechStatus] = useState<'idle' | 'playing' | 'paused' | 'error'>('idle');
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);

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

  // --- On-device Turkish text-to-speech ---
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void Speech.getAvailableVoicesAsync().then((voices) => {
      if (!active) return;
      const turkish = voices.filter((voice) => voice.language.toLowerCase().startsWith('tr'));
      const enhanced = turkish.find((voice) => voice.quality === Speech.VoiceQuality.Enhanced);
      preferredTurkishVoiceRef.current = (enhanced || turkish[0])?.identifier;
    }).catch(() => { preferredTurkishVoiceRef.current = undefined; });
    return () => { active = false; };
  }, [visible]);

  const stopSpeech = useCallback(() => {
    ++speechGenerationRef.current;
    setSpeechStatus('idle');
    speechQueueRef.current = speechQueueRef.current.catch(() => {}).then(() => Speech.stop());
    void speechQueueRef.current.catch(() => {
      if (visibleRef.current) setSpeechError('Ses durdurulamadı. Lütfen tekrar deneyin.');
    });
  }, []);

  const speak = useCallback((text: string) => {
    if (!visibleRef.current) return;
    const words = text.trim();
    if (!words) {
      setSpeechStatus('idle');
      setSpeechError('Bu adımda okunacak metin bulunmuyor.');
      return;
    }
    const generation = ++speechGenerationRef.current;
    setSpeechStatus('idle');
    setSpeechError(null);
    // Serialize stop/speak operations so an older async stop cannot cancel new audio.
    speechQueueRef.current = speechQueueRef.current.catch(() => {}).then(async () => {
      await Speech.stop();
      if (!visibleRef.current || generation !== speechGenerationRef.current) return;
      Speech.speak(words, {
        language: 'tr-TR',
        rate: 0.95,
        pitch: 1,
        voice: preferredTurkishVoiceRef.current,
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
  }, []);

  const pauseSpeech = useCallback(() => {
    if (speechStatus !== 'playing') return;
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
  }, [speechStatus, stopSpeech]);

  const resumeSpeech = useCallback(() => {
    if (speechStatus !== 'paused') return;
    if (Platform.OS === 'ios' || Platform.OS === 'web') {
      const generation = speechGenerationRef.current;
      void Speech.resume().then(() => {
        if (visibleRef.current && generation === speechGenerationRef.current) setSpeechStatus('playing');
      }).catch(() => setSpeechError('Ses devam ettirilemedi.'));
    } else {
      speak(currentStep.content);
    }
  }, [speechStatus, speak, currentStep.content]);

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
    setSosMessage(null);
    setIsAlarmPlaying(false);
  }, [visible, stopSpeech, stopTimer]);

  useEffect(() => () => {
    visibleRef.current = false;
    ++speechGenerationRef.current;
    void Speech.stop().catch(() => {});
    if (intervalRef.current) clearInterval(intervalRef.current);
    Vibration.cancel();
  }, []);

  const closeAssistant = useCallback(() => {
    stopSpeech();
    onClose();
  }, [stopSpeech, onClose]);

  const changeStep = useCallback((delta: number) => {
    stopSpeech();
    setCurrentIndex((index) => Math.max(0, Math.min(totalSteps - 1, index + delta)));
  }, [stopSpeech, totalSteps]);

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
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
        <SafeAreaView style={styles.container}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={closeAssistant} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <View style={styles.headerTitleGroup}>
              <View style={styles.liveIndicator}>
                <Animated.View style={[styles.ledDot, { opacity: ledPulse }]} />
                <Text style={styles.liveText}>PİŞİRME REHBERİ</Text>
              </View>
              <Text style={styles.headerTitle} numberOfLines={1}>{recipeTitle}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setIsHelpOpen(true)} style={styles.headerIconBtn}>
              <Ionicons name="help-circle-outline" size={22} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => speak(currentStep.content)} style={styles.headerIconBtn} disabled={!currentStep.content.trim()}>
              <Ionicons name="volume-high-outline" size={22} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── MAIN CONTENT ── */}
        <View style={styles.mainWrapper}>
          {!!speechError && (
            <Text style={styles.speechError} accessibilityRole="alert">{speechError}</Text>
          )}
          <ScrollView
            contentContainerStyle={styles.mainContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Step counter */}
            <View style={styles.stepCounterRow}>
              <View style={styles.stepCounterLine} />
              <Text style={styles.stepCounterText}>Adım {totalSteps ? currentIndex + 1 : 0} / {totalSteps}</Text>
              <View style={styles.stepCounterLine} />
            </View>

            {/* Step text */}
            <Text style={styles.stepContent}>{currentStep.content || "Bu tarifte henüz hazırlanış adımı bulunmuyor."}</Text>

            {/* Active timer */}
            {timerRunning && timerSeconds !== null && (
              <TouchableOpacity
                style={[styles.timerCard, isTimerPaused && styles.timerCardPaused]}
                onPress={toggleTimerPause}
                activeOpacity={0.8}
              >
                <Text style={styles.timerDisplay}>{formatTime(timerSeconds)}</Text>
                <View style={styles.timerPauseIcon}>
                  <Ionicons name={isTimerPaused ? 'play' : 'pause'} size={14} color="rgba(255,255,255,0.8)" />
                </View>
                <Text style={styles.timerHint}>
                  {isTimerPaused ? 'Devam etmek için dokun' : 'Duraklatmak için dokun'}
                </Text>
              </TouchableOpacity>
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
              <TouchableOpacity style={styles.quickBtn} onPress={() => speak(currentStep.content)} disabled={!currentStep.content.trim()}>
                <Ionicons name="volume-high" size={10} color="rgba(255,255,255,0.7)" />
                <Text style={styles.quickBtnText}>Oku</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickBtn, styles.quickBtnSOS]} onPress={() => setIsSOSOpen(true)}>
                <Ionicons name="warning" size={10} color="#f87171" />
                <Text style={[styles.quickBtnText, styles.quickBtnSOSText]}>Mutfak İpuçları</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* ── FOOTER ── */}
        <View style={styles.footer}>
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
              disabled={isFirst}
            >
              <Ionicons name="chevron-back" size={20} color={isFirst ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)'} />
              <Text style={[styles.navBtnText, isFirst && styles.navBtnTextDisabled]}>Önceki</Text>
            </TouchableOpacity>

            {/* Explicit local TTS playback controls; no microphone or fake live session. */}
            <TouchableOpacity
              onPress={() => {
                if (speechStatus === 'playing') pauseSpeech();
                else if (speechStatus === 'paused') resumeSpeech();
                else speak(currentStep.content);
              }}
              disabled={!currentStep.content.trim()}
              accessibilityLabel={speechStatus === 'playing' ? 'Okumayı duraklat' : speechStatus === 'paused' ? 'Okumaya devam et' : 'Tarif adımını oku'}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#db4c3f', '#b03d32']} style={styles.micFAB}>
                <Ionicons name={speechStatus === 'playing' ? 'pause' : 'volume-high'} size={28} color="#ffffff" />
                <Text style={styles.micFABText}>
                  {speechStatus === 'playing' ? 'Duraklat' : speechStatus === 'paused' ? (Platform.OS === 'android' ? 'Baştan Oku' : 'Devam') : 'Oku'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Next / Finish */}
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => {
                if (!isLast) changeStep(1);
                else if (totalSteps > 0) { stopSpeech(); setIsFinishedOpen(true); }
              }}
            >
              <Text style={styles.nextBtnText}>{isLast ? 'Bitir' : 'Sonraki'}</Text>
              <Ionicons name={isLast ? 'checkmark' : 'chevron-forward'} size={20} color="#0f172a" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ══════════ MODALS ══════════ */}

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
                  <Text style={styles.modalHeaderText}>Sesli Komutlar</Text>
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
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },

  // HEADER
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
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
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(156,163,175,1)',
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    maxWidth: 200,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
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
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 52,
    paddingBottom: 24,
  },
  stepCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 28,
  },
  stepCounterLine: {
    width: 28,
    height: 1,
    backgroundColor: 'rgba(219,76,63,0.4)',
  },
  stepCounterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#db4c3f',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  stepContent: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 34,
    marginBottom: 28,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  quickBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(209,213,219,1)',
  },
  quickBtnSOS: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  quickBtnSOSText: {
    color: '#f87171',
  },

  // FOOTER
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    backgroundColor: 'rgba(15,23,42,0.95)',
  },
  progressBarBg: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginBottom: 20,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#db4c3f',
    borderRadius: 2,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 52,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 52,
    backgroundColor: '#ffffff',
    borderRadius: 14,
  },
  nextBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  micFAB: {
    width: 76,
    height: 76,
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
    marginTop: -14,
    borderWidth: 3,
    borderColor: '#0f172a',
    overflow: 'hidden',
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
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
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
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#1e293b',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    maxHeight: '85%',
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
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1e293b',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
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
