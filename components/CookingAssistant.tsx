import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

// ---------------------------------------------------------------------------
// Optional package imports (installed via: npx expo install expo-speech expo-speech-recognition)
// ---------------------------------------------------------------------------
let SpeechModule: { speak: (t: string, o?: object) => void; stop: () => void } | null = null;
try { SpeechModule = require('expo-speech'); } catch { /* not installed */ }

let SpeechRecognitionLib: any = null;
try { SpeechRecognitionLib = require('expo-speech-recognition'); } catch { /* not installed */ }

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

const NUMBER_WORD_MAP: { [key: string]: number } = {
  'bir': 1, 'iki': 2, 'üç': 3, 'dört': 4, 'beş': 5,
  'altı': 6, 'yedi': 7, 'sekiz': 8, 'dokuz': 9, 'on': 10,
  'on bir': 11, 'on iki': 12, 'on beş': 15, 'yirmi': 20,
  'yirmi beş': 25, 'otuz': 30, 'kırk': 40, 'elli': 50, 'altmış': 60,
  'yarım': 0.5, 'buçuk': 0.5,
};

const textToNumber = (text: string): number | null => {
  const digitMatch = text.match(/\d+/);
  if (digitMatch) return parseInt(digitMatch[0]);
  for (const [key, value] of Object.entries(NUMBER_WORD_MAP)) {
    if (text.includes(key)) return value;
  }
  return null;
};

type SosKey = 'burnt' | 'salty' | 'watery' | 'other';

const SOS_RESPONSES: Record<SosKey, string> = {
  burnt: 'Tencereyi hemen ocaktan al ve dibi tutmayan kısımları başka bir kaba aktar. İçine yarım dilim ekmek koyup kapağı kapat, yanık kokusunu alacaktır.',
  salty: 'Yemeğe bir adet soyulmuş bütün patates at ve biraz daha pişir. Patates fazla tuzu emecektir.',
  watery: 'Kapağı aç ve yüksek ateşte suyunu çektir. Veya ayrı bir yerde biraz nişastayı suyla açıp yemeğe ekle.',
  other: 'Eksik malzeme için alternatifler: Krema yerine yoğurt+un, yumurta yerine muz veya keten tohumu jeli kullanabilirsiniz.',
};

const AI_RESPONSE_DELAY_MS = 1500;

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
  const [currentIndex, setCurrentIndex] = useState(0);

  // Timer
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Alarm
  const [isAlarmPlaying, setIsAlarmPlaying] = useState(false);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState('');
  const isListeningRef = useRef(false);

  // Modals
  const [isSOSOpen, setIsSOSOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isFinishedOpen, setIsFinishedOpen] = useState(false);
  const [sosMessage, setSosMessage] = useState<string | null>(null);

  // Animations
  const ledPulse = useRef(new Animated.Value(0.4)).current;
  const micScale = useRef(new Animated.Value(1)).current;
  const micRingOpacity = useRef(new Animated.Value(0)).current;
  const alarmScale = useRef(new Animated.Value(1)).current;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalSteps - 1;
  const progress = ((currentIndex + 1) / totalSteps) * 100;
  const currentStep = normalizeStep(steps[currentIndex]);

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
    let anim: Animated.CompositeAnimation;
    if (isListening) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(micRingOpacity, { toValue: 0.8, duration: 500, useNativeDriver: true }),
          Animated.timing(micRingOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]),
      );
      anim.start();
    } else {
      micRingOpacity.setValue(0);
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(micScale, { toValue: 1.05, duration: 1200, useNativeDriver: true }),
          Animated.timing(micScale, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ]),
      );
      anim.start();
    }
    return () => anim.stop();
  }, [isListening, micScale, micRingOpacity]);

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

  // --- TTS ---
  const speak = useCallback((text: string) => {
    if (!SpeechModule) return;
    SpeechModule.stop();
    SpeechModule.speak(text, { language: 'tr-TR', rate: 0.9, pitch: 1.0 });
  }, []);

  // --- Timer ---
  useEffect(() => {
    if (!timerRunning || isTimerPaused) {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev === null || prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [timerRunning, isTimerPaused]);

  useEffect(() => {
    if (timerRunning && !isTimerPaused && timerSeconds === 0) {
      setTimerRunning(false);
      setIsAlarmPlaying(true);
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);
    }
  }, [timerSeconds, timerRunning, isTimerPaused]);

  const startTimer = useCallback((minutes: number) => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setTimerSeconds(Math.round(minutes * 60));
    setTimerRunning(true);
    setIsTimerPaused(false);
    setIsAlarmPlaying(false);
  }, []);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    setTimerRunning(false);
    setIsTimerPaused(false);
  }, []);

  // --- Reset on close ---
  useEffect(() => {
    if (!visible) {
      stopTimer();
      setCurrentIndex(0);
      setIsSOSOpen(false);
      setIsHelpOpen(false);
      setIsFinishedOpen(false);
      setSosMessage(null);
      setLastCommand('');
      setIsAlarmPlaying(false);
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, [visible, stopTimer]);

  useEffect(() => {
    return () => {
      stopTimer();
      if (SpeechModule) SpeechModule.stop();
    };
  }, [stopTimer]);

  // --- Command handler ---
  const handleCommand = useCallback((command: string) => {
    const lowerCmd = command.toLowerCase().trim();
    setLastCommand(lowerCmd);

    // 1. Modal control
    if (lowerCmd.includes('kapat') || lowerCmd.includes('gizle')) {
      if (isHelpOpen) { setIsHelpOpen(false); speak('Yardım kapatıldı.'); return; }
      if (isSOSOpen) { setIsSOSOpen(false); speak('Acil durum kapatıldı.'); return; }
      if (isAlarmPlaying) { setIsAlarmPlaying(false); speak('Alarm susturuldu.'); return; }
    }

    // 2. Navigation
    if (lowerCmd.includes('ileri') || lowerCmd.includes('sonraki') || lowerCmd.includes('geç') || lowerCmd.includes('tamam')) {
      if (currentIndex < totalSteps - 1) {
        setCurrentIndex((prev) => prev + 1);
        speak('Sonraki adım.');
      } else {
        speak('Tebrikler şefim! Tarif tamamlandı.');
        setIsFinishedOpen(true);
      }
    } else if (lowerCmd.includes('geri') || lowerCmd.includes('önceki')) {
      if (currentIndex > 0) { setCurrentIndex((prev) => prev - 1); speak('Önceki adıma dönüldü.'); }
    } else if (lowerCmd.includes('oku') || lowerCmd.includes('tekrar')) {
      speak(normalizeStep(steps[currentIndex]).content);
    }

    // 3. Timer
    else if (lowerCmd.includes('süre') || lowerCmd.includes('başlat') || lowerCmd.includes('dakika')) {
      if (lowerCmd.includes('iptal')) {
        stopTimer(); setTimerSeconds(0); setIsAlarmPlaying(false);
        speak('Süre iptal edildi.');
      } else if (lowerCmd.includes('durdur')) {
        if (timerRunning && !isTimerPaused) { setIsTimerPaused(true); speak('Süre duraklatıldı.'); }
      } else if (lowerCmd.includes('devam')) {
        if (timerRunning && isTimerPaused) { setIsTimerPaused(false); speak('Süre devam ediyor.'); }
      } else {
        const minutes = textToNumber(lowerCmd);
        if (minutes) { startTimer(minutes); speak(`${minutes} dakika süre başlatıldı.`); }
      }
    }

    // 4. Alarm dismiss
    else if (isAlarmPlaying && (lowerCmd.includes('dur') || lowerCmd.includes('tamam') || lowerCmd.includes('sus') || lowerCmd.includes('kapat'))) {
      setIsAlarmPlaying(false); speak('Alarm kapatıldı.');
    }

    // 5. Help / SOS
    else if (lowerCmd.includes('yardım') || lowerCmd.includes('ne diyebilirim')) {
      setIsHelpOpen(true); speak('Yardım menüsü açıldı.');
    } else if (lowerCmd.includes('acil') || lowerCmd.includes('sos') || lowerCmd.includes('sorun')) {
      setIsSOSOpen(true); speak('Acil durum menüsü açıldı.');
    }
  }, [currentIndex, steps, totalSteps, speak, timerRunning, isTimerPaused, isAlarmPlaying, isHelpOpen, isSOSOpen, startTimer, stopTimer]);

  const handleCommandRef = useRef(handleCommand);
  useEffect(() => { handleCommandRef.current = handleCommand; }, [handleCommand]);

  // --- Speech Recognition (expo-speech-recognition) ---
  useEffect(() => {
    const lib = SpeechRecognitionLib;
    if (!lib?.ExpoSpeechRecognitionModule) return;
    const module = lib.ExpoSpeechRecognitionModule;
    const resultSub = module.addListener?.('result', (event: any) => {
      const transcript: string = event.results?.[0]?.[0]?.transcript || '';
      if (transcript) handleCommandRef.current(transcript);
    });
    const endSub = module.addListener?.('end', () => {
      if (isListeningRef.current) {
        try { module.start({ lang: 'tr-TR', continuous: false }); } catch { /* ignore */ }
      }
    });
    return () => { resultSub?.remove?.(); endSub?.remove?.(); };
  }, []);

  const toggleListening = useCallback(() => {
    const lib = SpeechRecognitionLib;
    if (!lib?.ExpoSpeechRecognitionModule) {
      speak('Sesli komutlar için expo-speech-recognition kurulumu gerekiyor.');
      return;
    }
    const module = lib.ExpoSpeechRecognitionModule;
    if (isListening) {
      isListeningRef.current = false;
      setIsListening(false);
      try { module.stop(); } catch { /* ignore */ }
      speak('Sesli asistan kapatıldı.');
    } else {
      isListeningRef.current = true;
      setIsListening(true);
      speak('Sizi dinliyorum şefim.');
      try { module.start({ lang: 'tr-TR', continuous: false }); } catch { /* ignore */ }
    }
  }, [isListening, speak]);

  // --- SOS Action ---
  const handleSOSAction = useCallback((problem: SosKey) => {
    setSosMessage('Yapay Zeka Şef düşünüyor...');
    setTimeout(() => {
      const msg = SOS_RESPONSES[problem];
      setSosMessage(msg);
      speak(msg);
    }, AI_RESPONSE_DELAY_MS);
  }, [speak]);

  // --- Format time ---
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <SafeAreaView style={styles.container}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
            <View style={styles.headerTitleGroup}>
              <View style={styles.liveIndicator}>
                <Animated.View style={[styles.ledDot, { opacity: ledPulse }]} />
                <Text style={styles.liveText}>CANLI PİLOT</Text>
              </View>
              <Text style={styles.headerTitle} numberOfLines={1}>{recipeTitle}</Text>
            </View>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={() => setIsHelpOpen(true)} style={styles.headerIconBtn}>
              <Ionicons name="help-circle-outline" size={22} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            {isListening ? (
              <View style={styles.listeningBadge}>
                <View style={styles.listeningDot} />
                <Text style={styles.listeningText}>Dinliyor...</Text>
              </View>
            ) : (
              <TouchableOpacity onPress={toggleListening} style={styles.headerIconBtn}>
                <Ionicons name="volume-high-outline" size={22} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── MAIN CONTENT ── */}
        <View style={styles.mainWrapper}>
          {/* Last command pill */}
          {!!lastCommand && (
            <View style={styles.lastCommandPill}>
              <Text style={styles.lastCommandText}>"{lastCommand}"</Text>
            </View>
          )}
          <ScrollView
            contentContainerStyle={styles.mainContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Step counter */}
            <View style={styles.stepCounterRow}>
              <View style={styles.stepCounterLine} />
              <Text style={styles.stepCounterText}>Adım {currentIndex + 1} / {totalSteps}</Text>
              <View style={styles.stepCounterLine} />
            </View>

            {/* Step text */}
            <Text style={styles.stepContent}>"{currentStep.content}"</Text>

            {/* Active timer */}
            {timerRunning && timerSeconds !== null && (
              <TouchableOpacity
                style={[styles.timerCard, isTimerPaused && styles.timerCardPaused]}
                onPress={() => setIsTimerPaused((p) => !p)}
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
                  onPress={() => { startTimer(10); speak('10 dakika süre başlatıldı.'); }}
                >
                  <Ionicons name="play" size={10} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.quickBtnText}>10dk Başlat</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.quickBtn} onPress={() => speak(currentStep.content)}>
                <Ionicons name="volume-high" size={10} color="rgba(255,255,255,0.7)" />
                <Text style={styles.quickBtnText}>Oku</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.quickBtn, styles.quickBtnSOS]} onPress={() => setIsSOSOpen(true)}>
                <Ionicons name="warning" size={10} color="#f87171" />
                <Text style={[styles.quickBtnText, styles.quickBtnSOSText]}>Acil Durum / SOS</Text>
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
                if (!isFirst) { setCurrentIndex((i) => i - 1); speak('Önceki adıma dönüldü.'); }
              }}
              disabled={isFirst}
            >
              <Ionicons name="chevron-back" size={20} color={isFirst ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)'} />
              <Text style={[styles.navBtnText, isFirst && styles.navBtnTextDisabled]}>Önceki</Text>
            </TouchableOpacity>

            {/* Mic FAB */}
            <Animated.View style={{ transform: [{ scale: micScale }] }}>
              <TouchableOpacity onPress={toggleListening} activeOpacity={0.85}>
                <LinearGradient
                  colors={isListening ? ['#dc2626', '#991b1b'] : ['#db4c3f', '#b03d32']}
                  style={styles.micFAB}
                >
                  <Animated.View
                    style={[styles.micRing, { opacity: micRingOpacity }]}
                    pointerEvents="none"
                  />
                  <Ionicons name="mic" size={28} color="#ffffff" />
                  <Text style={styles.micFABText}>{isListening ? '...' : 'Sesli'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>

            {/* Next / Finish */}
            <TouchableOpacity
              style={styles.nextBtn}
              onPress={() => {
                if (!isLast) { setCurrentIndex((i) => i + 1); speak('Sonraki adım.'); }
                else { speak('Tebrikler şefim! Tarif tamamlandı.'); setIsFinishedOpen(true); }
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
                    <Text style={styles.sosSolutionTitle}>Çözüm Önerisi</Text>
                    <Text style={styles.sosSolutionText}>{sosMessage}</Text>
                    {sosMessage !== 'Yapay Zeka Şef düşünüyor...' && (
                      <TouchableOpacity onPress={() => setSosMessage(null)}>
                        <Text style={styles.sosSolutionBack}>Geri Dön</Text>
                      </TouchableOpacity>
                    )}
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
                <Text style={styles.helpCategory}>NAVİGASYON</Text>
                {[
                  { cmd: '"İleri / Sonraki"', desc: 'Sonraki Adım' },
                  { cmd: '"Geri / Önceki"', desc: 'Önceki Adım' },
                  { cmd: '"Oku / Tekrar Et"', desc: 'Adımı Oku' },
                ].map((r) => (
                  <View key={r.cmd} style={styles.helpRow}>
                    <Text style={styles.helpCmd}>{r.cmd}</Text>
                    <Text style={styles.helpDesc}>{r.desc}</Text>
                  </View>
                ))}
                <Text style={[styles.helpCategory, { marginTop: 12 }]}>ARAÇLAR</Text>
                {[
                  { cmd: '"5 Dakika Başlat"', desc: 'Sayaç Kur' },
                  { cmd: '"Süreyi Durdur"', desc: 'Duraklat' },
                  { cmd: '"Süreyi İptal Et"', desc: 'Sıfırla' },
                  { cmd: '"Devam"', desc: 'Devam Et' },
                  { cmd: '"Kapat / Gizle"', desc: 'Menüleri Kapat' },
                  { cmd: '"Acil / SOS"', desc: 'SOS Aç' },
                  { cmd: '"Yardım"', desc: 'Bu Menüyü Aç' },
                ].map((r) => (
                  <View key={r.cmd} style={styles.helpRow}>
                    <Text style={styles.helpCmd}>{r.cmd}</Text>
                    <Text style={styles.helpDesc}>{r.desc}</Text>
                  </View>
                ))}
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
              <Text style={styles.alarmHint}>"Tamam" veya "Sus" diyerek de kapatabilirsiniz.</Text>
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
                onPress={() => { setIsFinishedOpen(false); onClose(); try { router.replace('/(tabs)' as any); } catch { /* ignore */ } }}
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
