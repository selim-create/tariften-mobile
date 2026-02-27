import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

function normalizeStep(step: Step | string): Step {
  if (typeof step === 'string') return { content: step };
  return step;
}

export default function CookingAssistant({
  visible,
  onClose,
  recipeTitle,
  steps,
  chefTip,
}: CookingAssistantProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStep = normalizeStep(steps[currentIndex]);
  const totalSteps = steps.length;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === totalSteps - 1;

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTimerRunning(false);
  }, []);

  const startTimer = useCallback(() => {
    if (timerSeconds === null || timerSeconds <= 0) return;
    setTimerRunning(true);
    intervalRef.current = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev === null || prev <= 1) {
          stopTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timerSeconds, stopTimer]);

  useEffect(() => {
    stopTimer();
    const step = normalizeStep(steps[currentIndex]);
    setTimerSeconds(step.timer_seconds ?? null);
  }, [currentIndex, steps, stopTimer]);

  useEffect(() => {
    if (!visible) {
      stopTimer();
      setCurrentIndex(0);
      setCompleted(false);
    }
  }, [visible, stopTimer]);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  const goNext = () => {
    if (!isLast) setCurrentIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (!isFirst) setCurrentIndex((i) => i - 1);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>{recipeTitle}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={26} color="#1a1a1a" />
          </TouchableOpacity>
        </View>

        {completed ? (
          /* Completion Screen */
          <View style={styles.completionContainer}>
            <Text style={styles.completionEmoji}>🎉</Text>
            <Text style={styles.completionTitle}>Afiyet Olsun!</Text>
            <Text style={styles.completionSubtitle}>{recipeTitle} hazır!</Text>
            {chefTip ? (
              <View style={styles.chefTip}>
                <Text style={styles.chefTipIcon}>👨‍🍳</Text>
                <Text style={styles.chefTipText}>{chefTip}</Text>
              </View>
            ) : null}
            <TouchableOpacity style={styles.finishButton} onPress={onClose}>
              <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
              <Text style={styles.finishButtonText}>Kapat</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Progress */}
            <View style={styles.progressContainer}>
              <Text style={styles.progressText}>
                Adım {currentIndex + 1} / {totalSteps}
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((currentIndex + 1) / totalSteps) * 100}%` }]} />
              </View>
            </View>

            {/* Step content */}
            <View style={styles.stepContainer}>
              <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumberText}>{currentIndex + 1}</Text>
              </View>
              <Text style={styles.stepContent}>{currentStep.content}</Text>
            </View>

            {/* Timer */}
            {timerSeconds !== null && (
              <View style={styles.timerSection}>
                <Text style={styles.timerLabel}>⏱ Zamanlayıcı</Text>
                <Text style={styles.timerDisplay}>{formatTime(timerSeconds)}</Text>
                <TouchableOpacity
                  style={[styles.timerButton, timerRunning && styles.timerButtonStop]}
                  onPress={timerRunning ? stopTimer : startTimer}
                >
                  <Ionicons name={timerRunning ? 'pause' : 'play'} size={18} color="#ffffff" />
                  <Text style={styles.timerButtonText}>{timerRunning ? 'Durdur' : 'Başlat'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Chef tip on last step */}
            {chefTip && isLast && (
              <View style={styles.chefTip}>
                <Text style={styles.chefTipIcon}>👨‍🍳</Text>
                <Text style={styles.chefTipText}>{chefTip}</Text>
              </View>
            )}

            {/* Navigation */}
            <View style={styles.navigation}>
              <TouchableOpacity
                style={[styles.navButton, isFirst && styles.navButtonDisabled]}
                onPress={goPrev}
                disabled={isFirst}
              >
                <Ionicons name="chevron-back" size={22} color={isFirst ? '#cccccc' : '#1a1a1a'} />
                <Text style={[styles.navButtonText, isFirst && styles.navButtonTextDisabled]}>Geri</Text>
              </TouchableOpacity>

              {isLast ? (
                <TouchableOpacity style={styles.finishButton} onPress={() => setCompleted(true)}>
                  <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                  <Text style={styles.finishButtonText}>Tamamla 🎉</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.nextButton} onPress={goNext}>
                  <Text style={styles.nextButtonText}>İleri</Text>
                  <Ionicons name="chevron-forward" size={22} color="#ffffff" />
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginRight: 12,
  },
  closeButton: {
    padding: 4,
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  progressText: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '600',
    marginBottom: 6,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e74c3c',
    borderRadius: 2,
  },
  stepContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  stepNumberText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
  },
  stepContent: {
    fontSize: 20,
    color: '#1a1a1a',
    lineHeight: 32,
    textAlign: 'center',
    fontWeight: '400',
  },
  timerSection: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 8,
  },
  timerLabel: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '600',
  },
  timerDisplay: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1a1a1a',
    letterSpacing: 2,
  },
  timerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#27ae60',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  timerButtonStop: {
    backgroundColor: '#e74c3c',
  },
  timerButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  chefTip: {
    flexDirection: 'row',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 10,
    alignItems: 'flex-start',
  },
  chefTipIcon: {
    fontSize: 22,
  },
  chefTipText: {
    flex: 1,
    fontSize: 14,
    color: '#78350f',
    lineHeight: 20,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    gap: 12,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
  },
  navButtonDisabled: {
    borderColor: '#f0f0f0',
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  navButtonTextDisabled: {
    color: '#cccccc',
  },
  nextButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingVertical: 14,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  finishButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#27ae60',
    borderRadius: 12,
    paddingVertical: 14,
  },
  finishButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  completionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  completionEmoji: {
    fontSize: 72,
  },
  completionTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1a1a1a',
    textAlign: 'center',
  },
  completionSubtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 8,
  },
});
