import React, { useEffect, useReducer, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatClock, minutesLabel, timerSnapshot, type TimerKind } from '../../lib/guide-tools';
import {
  clearKitchenTimer, getKitchenTimer, hydrateKitchenTimers, isKitchenTimersHydrated, signalKitchenTimerDone,
  startKitchenTimer, subscribeKitchenTimers,
} from '../../lib/kitchen-timer-store';
import { colors, fonts, radius } from '../../constants/theme';

/** Small uppercase field label. */
export function FieldLabel({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={styles.labelRow}>
      <Text style={styles.label}>{children}</Text>
      {hint ? <Text style={styles.labelHint}>{hint}</Text> : null}
    </View>
  );
}

/** Equal-width segmented choice (2–4 options). */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: readonly { key: T; label: string; sub?: string }[];
  value: T;
  onChange: (key: T) => void;
  label: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(option => {
        const selected = option.key === value;
        return (
          <Pressable key={option.key} onPress={() => onChange(option.key)}
            style={({ pressed }) => [styles.segment, selected && styles.segmentOn, pressed && !selected && { opacity: 0.7 }]}
            accessibilityRole="radio" accessibilityState={{ selected }}
            accessibilityLabel={option.sub ? `${option.label}, ${option.sub}` : option.label}>
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]} numberOfLines={2}>{option.label}</Text>
            {option.sub ? <Text style={[styles.segmentSub, selected && styles.segmentSubOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{option.sub}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wrapping pill choices for longer lists. */
export function ChipChoice<T extends string>({ options, value, onChange, label, style }: {
  options: readonly { key: T; label: string }[];
  value: T | null;
  onChange: (key: T) => void;
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.chips, style]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map(option => {
        const selected = option.key === value;
        return (
          <Pressable key={option.key} onPress={() => onChange(option.key)} hitSlop={{ top: 3, bottom: 3 }}
            style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && !selected && { opacity: 0.7 }]}
            accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={option.label}>
            <Text style={[styles.chipText, selected && styles.chipTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** − value + stepper. */
export function Stepper({ value, min, max, onChange, format, label }: {
  value: number; min: number; max: number; onChange: (next: number) => void; format: (n: number) => string; label: string;
}) {
  return (
    <View style={styles.stepper} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + 1));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - 1));
      }}>
      <Pressable onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} hitSlop={6}
        style={({ pressed }) => [styles.stepBtn, value <= min && styles.stepBtnOff, pressed && { opacity: 0.7 }]}
        importantForAccessibility="no" accessibilityElementsHidden>
        <Ionicons name="remove" size={20} color={value <= min ? colors.textFaint : colors.ink} />
      </Pressable>
      <Text style={styles.stepValue}>{format(value)}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} hitSlop={6}
        style={({ pressed }) => [styles.stepBtn, value >= max && styles.stepBtnOff, pressed && { opacity: 0.7 }]}
        importantForAccessibility="no" accessibilityElementsHidden>
        <Ionicons name="add" size={20} color={value >= max ? colors.textFaint : colors.ink} />
      </Pressable>
    </View>
  );
}

/** Quiet note: info (cream) or safety (warm amber). */
export function Note({ tone = 'info', title, children }: { tone?: 'info' | 'safety'; title?: string; children: string }) {
  const safety = tone === 'safety';
  return (
    <View style={[styles.note, safety ? styles.noteSafety : styles.noteInfo]} accessible accessibilityRole="text"
      accessibilityLabel={title ? `${title}. ${children}` : children}>
      <Ionicons name={safety ? 'alert-circle-outline' : 'information-circle-outline'} size={17}
        color={safety ? colors.warning : colors.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? <Text style={styles.noteTitle}>{title}</Text> : null}
        <Text style={styles.noteText}>{children}</Text>
      </View>
    </View>
  );
}

/** Numbered steps. */
export function Steps({ steps }: { steps: string[] }) {
  return (
    <View style={styles.steps}>
      {steps.map((step, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepNum}>{i + 1}</Text>
          <Text style={styles.stepText}>{step}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Timer

/** True while a timer of this kind exists (running or finished, not yet dismissed). No ticking. */
export function useKitchenTimerActive(kind: TimerKind | null): boolean {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsubscribe = subscribeKitchenTimers(rerender);
    void hydrateKitchenTimers();
    return unsubscribe;
  }, []);
  return kind ? !!getKitchenTimer(kind) : false;
}

function useKitchenTimer(kind: TimerKind) {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const unsubscribe = subscribeKitchenTimers(rerender);
    void hydrateKitchenTimers();
    return unsubscribe;
  }, []);
  const timer = getKitchenTimer(kind);
  const [now, setNow] = useState(() => Date.now());
  const endsAt = timer?.endsAt ?? 0;
  useEffect(() => {
    if (!endsAt) return;
    const tick = () => setNow(Date.now());
    tick();
    // Wall-clock based: the interval only refreshes the view; backgrounding pauses it harmlessly.
    const id = setInterval(() => {
      tick();
      if (Date.now() >= endsAt) clearInterval(id);
    }, 500);
    const sub = AppState.addEventListener('change', next => { if (next === 'active') tick(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [endsAt]);
  const snapshot = timer ? timerSnapshot(timer, now) : null;
  const done = !!snapshot?.done;
  useEffect(() => {
    if (done) signalKitchenTimerDone(kind);
  }, [done, kind, endsAt]);
  return { timer, snapshot, hydrated: isKitchenTimersHydrated() };
}

/**
 * Big duration, then a countdown. Shows the running timer for this kind even
 * if the choices above changed (its label says what it is timing).
 */
export function TimerPanel({ kind, durationSec, label, notice, doneText, startLabel = 'Zamanlayıcıyı başlat' }: {
  kind: TimerKind;
  durationSec: number | null;
  label: string;
  notice: { title: string; body: string };
  doneText: string;
  startLabel?: string;
}) {
  const { timer, snapshot } = useKitchenTimer(kind);

  if (timer && snapshot && snapshot.done) {
    return (
      <View style={[styles.timer, styles.timerDone]} accessibilityLiveRegion="polite">
        <View style={styles.doneIcon}><Ionicons name="checkmark" size={22} color="#fff" /></View>
        <Text style={styles.doneTitle} accessibilityRole="header">Süre doldu</Text>
        {timer.label ? <Text style={styles.timerLabel}>{timer.label}</Text> : null}
        <Text style={styles.doneText}>{doneText}</Text>
        <Pressable onPress={() => clearKitchenTimer(kind)} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.88 }]}
          accessibilityRole="button">
          <Text style={styles.primaryText}>Tamam</Text>
        </Pressable>
      </View>
    );
  }

  if (timer && snapshot) {
    const remaining = minutesLabel(snapshot.remainingSec);
    return (
      <View style={styles.timer}>
        <Text style={styles.timerKicker}>Zamanlayıcı çalışıyor</Text>
        <Text style={styles.clock} accessibilityLabel={`Kalan süre ${remaining}`}>{formatClock(snapshot.remainingSec)}</Text>
        {timer.label ? <Text style={styles.timerLabel}>{timer.label}</Text> : null}
        <View style={styles.track} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={[styles.fill, { width: `${Math.round(snapshot.progress * 1000) / 10}%` }]} />
        </View>
        <Text style={styles.timerHint}>Uygulamadan çıksan da süre işlemeye devam eder.</Text>
        <Pressable onPress={() => clearKitchenTimer(kind)} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}
          accessibilityRole="button" accessibilityLabel="Zamanlayıcıyı iptal et">
          <Text style={styles.secondaryText}>İptal et</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable disabled={!durationSec} onPress={() => { if (durationSec) startKitchenTimer(kind, durationSec, label, notice); }}
      style={({ pressed }) => [styles.primary, styles.primaryWide, !durationSec && styles.primaryOff, pressed && { opacity: 0.88 }]}
      accessibilityRole="button" accessibilityState={{ disabled: !durationSec }}
      accessibilityLabel={durationSec ? `${startLabel}, ${minutesLabel(durationSec)}` : startLabel}>
      <Ionicons name="play" size={16} color="#fff" />
      <Text style={styles.primaryText}>{startLabel}</Text>
    </Pressable>
  );
}

/** The big "8 dk" figure with a caption. */
export function BigResult({ value, caption }: { value: string; caption?: string }) {
  return (
    <View style={styles.big} accessible accessibilityLabel={caption ? `${value}, ${caption}` : value}>
      <Text style={styles.bigValue}>{value}</Text>
      {caption ? <Text style={styles.bigCaption}>{caption}</Text> : null}
    </View>
  );
}

export const toolStyles = StyleSheet.create({
  stack: { gap: 18 },
  field: { gap: 8 },
  divider: { height: 1, backgroundColor: colors.line },
});

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  label: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textMuted },
  labelHint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, flexShrink: 1, textAlign: 'right' },
  segmented: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: colors.cream },
  segment: { flex: 1, minHeight: 44, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segmentOn: {
    backgroundColor: colors.surface, shadowColor: '#3b2a20', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  segmentText: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 17, color: colors.textMuted, textAlign: 'center' },
  segmentTextOn: { fontFamily: fonts.bodySemi, color: colors.ink },
  segmentSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 1 },
  segmentSubOn: { color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  chipTextOn: { color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, padding: 4, borderRadius: radius.pill, backgroundColor: colors.cream },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepBtnOff: { backgroundColor: 'transparent' },
  stepValue: { minWidth: 76, textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: radius.md },
  noteInfo: { backgroundColor: colors.cream },
  noteSafety: { backgroundColor: colors.warningSoft },
  noteTitle: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, color: colors.ink, marginBottom: 2 },
  noteText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.ink },
  steps: { gap: 10 },
  step: { flexDirection: 'row', gap: 10 },
  stepNum: {
    width: 22, height: 22, borderRadius: 11, overflow: 'hidden', backgroundColor: colors.brandSoft, color: colors.brandDark,
    textAlign: 'center', lineHeight: 22, fontFamily: fonts.bodySemi, fontSize: 12,
  },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  big: { alignItems: 'center', paddingVertical: 6 },
  bigValue: { fontFamily: fonts.headingBold, fontSize: 44, lineHeight: 52, letterSpacing: -1.2, color: colors.ink },
  bigCaption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  timer: { alignItems: 'center', gap: 6, paddingVertical: 18, paddingHorizontal: 16, borderRadius: radius.lg, backgroundColor: colors.brandSoft },
  timerDone: { backgroundColor: colors.successSoft },
  timerKicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.brandDark },
  clock: { fontFamily: fonts.headingBold, fontSize: 52, lineHeight: 60, letterSpacing: -1, color: colors.ink, fontVariant: ['tabular-nums'] },
  timerLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  track: { alignSelf: 'stretch', height: 4, borderRadius: 2, backgroundColor: 'rgba(219,76,63,0.15)', overflow: 'hidden', marginTop: 8 },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.brand },
  timerHint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, textAlign: 'center', marginTop: 4 },
  doneIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  doneTitle: { fontFamily: fonts.headingBold, fontSize: 24, lineHeight: 30, color: colors.ink },
  doneText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text, textAlign: 'center' },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, paddingHorizontal: 24,
    borderRadius: radius.pill, backgroundColor: colors.ink, marginTop: 8,
  },
  primaryWide: { alignSelf: 'stretch', marginTop: 0 },
  primaryOff: { opacity: 0.35 },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  secondary: {
    minHeight: 44, paddingHorizontal: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, marginTop: 8,
  },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
});
