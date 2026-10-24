import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../components/notifications/NotificationsProvider';
import DemoPhone from '../../components/onboarding/DemoPhone';
import DemoRecipeCard from '../../components/onboarding/DemoRecipeCard';
import { useReduceMotion } from '../../components/onboarding/motion';
import { AccentText } from '../../components/ui/ScreenTitle';
import {
  COPY, PREPARING_LINES, PREPARING_TICK_MS, demoSteps, parseEntry, phoneSize, showNotifyCard, trUpper,
} from '../../lib/onboarding-core';
import { markSocialOnboardingSeen } from '../../lib/onboarding';
import { holdReviewPrompt, noteDemoEnded } from '../../lib/review-prompt';
import { colors, fonts, radius } from '../../constants/theme';

type Phase = { kind: 'tap'; index: number } | { kind: 'preparing' } | { kind: 'done' } | { kind: 'notify' };

const plain = (text: string) => text.replace(/\*/g, '');

/**
 * "Sosyal medyadan tarif kaydetmeyi öğren": a ~30 second, tap-along
 * walkthrough of Paylaş → Tariften on a self-drawn phone, then a local demo
 * recipe. Shown once to a new account after the kitchen profile step
 * (?from=welcome) and from Profile → "Nasıl kullanılır?" (?from=replay).
 * No network call, no quota: every recipe here is static demo data.
 */
export default function SocialOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ from?: string }>();
  const entry = parseEntry(params.from);
  const { user } = useAuth();
  const notifications = useNotifications();
  const reduceMotion = useReduceMotion();

  const steps = useMemo(() => demoSteps(Platform.OS), []);
  const total = steps.length + 1; // the taps + the finished recipe
  const [phase, setPhase] = useState<Phase>({ kind: 'tap', index: 0 });
  const [prepared, setPrepared] = useState(0);
  const [nudge, setNudge] = useState(0);
  const [missHint, setMissHint] = useState(false);
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null);
  const [canNotify, setCanNotify] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const ended = useRef(false);
  const compact = windowHeight < 700;

  // Shown = seen: once per account, however the member leaves (Atla, back, swipe, app closed).
  useEffect(() => { if (user?.id) void markSocialOnboardingSeen(user.id); }, [user?.id]);
  // No store rating prompt while the demo is open, nor right after it.
  useEffect(() => {
    const release = holdReviewPrompt('onboarding');
    return () => {
      release();
      if (!ended.current) { ended.current = true; noteDemoEnded(entry === 'welcome'); }
    };
  }, [entry]);
  // The optional notification card only when the member has never decided.
  useEffect(() => {
    let alive = true;
    notifications.canOfferFromOnboarding().then(value => { if (alive) setCanNotify(showNotifyCard(value)); }).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = useCallback(() => {
    if (!ended.current) { ended.current = true; noteDemoEnded(entry === 'welcome'); }
    if (entry === 'welcome') {
      // Where the kitchen profile step would have gone: Profile, with its short confirmation.
      router.dismissTo('/(tabs)/profile');
    } else if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }, [entry, router]);

  const step = phase.kind === 'tap' ? steps[phase.index] : null;
  const position = phase.kind === 'tap' ? phase.index + 1 : phase.kind === 'preparing' ? steps.length : total;

  // VoiceOver / TalkBack: read each new instruction once.
  useEffect(() => {
    const text = phase.kind === 'tap' && step ? `${plain(step.title)}. ${step.hint}`
      : phase.kind === 'preparing' ? plain(COPY.preparingTitle)
        : phase.kind === 'done' ? `${plain(COPY.doneTitle)} ${COPY.doneHint}`
          : plain(COPY.notifyTitle);
    AccessibilityInfo.announceForAccessibility(text);
  }, [phase, step]);

  // "Tarifin hazırlanıyor…": ticks locally, then the finished demo recipe.
  useEffect(() => {
    if (phase.kind !== 'preparing') return undefined;
    setPrepared(0);
    const timers = PREPARING_LINES.map((_, i) => setTimeout(() => setPrepared(i + 1), PREPARING_TICK_MS * (i + 1)));
    timers.push(setTimeout(() => setPhase({ kind: 'done' }), PREPARING_TICK_MS * PREPARING_LINES.length + 450));
    return () => timers.forEach(clearTimeout);
  }, [phase.kind]);

  useEffect(() => {
    if (!missHint) return undefined;
    const t = setTimeout(() => setMissHint(false), 2600);
    return () => clearTimeout(t);
  }, [missHint, nudge]);

  const lastTap = useRef(0);
  const advance = useCallback(() => {
    // A quick double tap must not skip the next step unseen.
    const now = Date.now();
    if (now - lastTap.current < 350) return;
    lastTap.current = now;
    setMissHint(false);
    setPhase(current => {
      if (current.kind === 'tap') {
        return current.index < steps.length - 1 ? { kind: 'tap', index: current.index + 1 } : { kind: 'preparing' };
      }
      if (current.kind === 'preparing') return { kind: 'done' };
      return current;
    });
  }, [steps.length]);

  const back = useCallback(() => {
    setMissHint(false);
    if (phase.kind === 'tap' && phase.index === 0) { leave(); return; }
    if (phase.kind === 'tap') { setPhase({ kind: 'tap', index: phase.index - 1 }); return; }
    if (phase.kind === 'notify') { setPhase({ kind: 'done' }); return; }
    setPhase({ kind: 'tap', index: steps.length - 1 });
  }, [phase, leave, steps.length]);

  const miss = useCallback(() => { setNudge(n => n + 1); setMissHint(true); }, []);

  const afterDone = useCallback(() => {
    if (canNotify) setPhase({ kind: 'notify' });
    else leave();
  }, [canNotify, leave]);

  const acceptNotify = useCallback(async () => {
    if (notifyBusy) return;
    setNotifyBusy(true);
    try { await notifications.acceptNotifyOffer(); } finally { setNotifyBusy(false); leave(); }
  }, [notifyBusy, notifications, leave]);

  const declineNotify = useCallback(() => { notifications.declineNotifyOffer(); leave(); }, [notifications, leave]);

  const onStage = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStage(prev => (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }));
  }, []);

  // Never taller than the space between the copy and the footer (see phoneSize).
  const phone = useMemo(() => (stage ? phoneSize(stage) : null), [stage]);

  const lastLabel = entry === 'replay' ? COPY.replayFinishCta : COPY.finishCta;

  return (
    <View style={styles.screen}>
      {/* Header (as the kitchen profile step): back, title, Atla; then the segments and "n / 6".
          Nothing is ever drawn over it: it sits above the content in its own layer. */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          <Pressable style={({ pressed }) => [styles.circle, pressed && styles.pressed]} onPress={back}
            accessibilityRole="button" accessibilityLabel="Geri">
            <Ionicons name="chevron-back" size={21} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.2} accessibilityRole="header">
            {COPY.progressLabel}
          </Text>
          <Pressable style={({ pressed }) => [styles.skip, pressed && styles.pressed]} onPress={leave} hitSlop={6}
            accessibilityRole="button" accessibilityLabel="Atla" accessibilityHint="Tanıtımı kapatır">
            <Text style={styles.skipText} maxFontSizeMultiplier={1.2}>{COPY.skip}</Text>
          </Pressable>
        </View>
        <View style={styles.progressRow}>
          <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={`Adım ${position}, toplam ${total}`}
            accessibilityValue={{ min: 1, max: total, now: position }}>
            {Array.from({ length: total }, (_, i) => (
              <View key={i} style={[styles.segment, i < position && styles.segmentDone]} />
            ))}
          </View>
          <Text style={styles.stepCount} maxFontSizeMultiplier={1.2} importantForAccessibility="no" accessibilityElementsHidden>
            {position} / {total}
          </Text>
        </View>
      </View>

      {phase.kind === 'tap' || phase.kind === 'preparing' ? (
        <>
          <View style={[styles.copy, compact && styles.copyCompact]}>
            <Text style={styles.kicker} maxFontSizeMultiplier={1.3}>{trUpper(step ? step.kicker : COPY.preparingKicker)}</Text>
            <AccentText style={StyleSheet.flatten([styles.title, compact && styles.titleCompact])} accentStyle={styles.titleAccent} maxFontSizeMultiplier={1.25}>
              {step ? step.title : COPY.preparingTitle}
            </AccentText>
            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>{step ? step.hint : COPY.preparingHint}</Text>
          </View>

          <View style={styles.stage} onLayout={onStage}>
            {phone ? (
              <DemoPhone
                scene={step ? step.scene : 'aktar'}
                width={phone.width}
                height={phone.height}
                target={step ? step.target : ''}
                a11yHint={step ? step.a11yHint : ''}
                onTarget={advance}
                onMiss={step ? miss : () => undefined}
                reduceMotion={reduceMotion}
                nudge={nudge}
                prepared={phase.kind === 'preparing' ? prepared : null}
              />
            ) : null}
          </View>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Text style={[styles.missHint, !missHint && styles.hidden]} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.3}>
              {missHint ? COPY.wrongTap : ' '}
            </Text>
            {phase.kind === 'tap' ? (
              <Pressable onPress={advance} style={({ pressed }) => [styles.next, pressed && styles.pressed]}
                accessibilityRole="button" accessibilityLabel={COPY.next} accessibilityHint="Dokunmadan sonraki adıma geçer">
                <Text style={styles.nextText} maxFontSizeMultiplier={1.3}>{COPY.next}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ) : (
              <View style={styles.next} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <ActivityIndicator size="small" color={colors.brand} />
              </View>
            )}
          </View>
        </>
      ) : phase.kind === 'done' ? (
        <>
          {/* The finished sample recipe, as the app shows a recipe; a calm moment: the card settles in. */}
          <ScrollView style={styles.flex} contentContainerStyle={[styles.doneContent, compact && styles.doneContentCompact]}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.kicker} maxFontSizeMultiplier={1.3}>{trUpper(COPY.doneKicker)}</Text>
            <AccentText style={StyleSheet.flatten([styles.title, styles.doneTitle, compact && styles.titleCompact])} accentStyle={styles.titleAccent} maxFontSizeMultiplier={1.25}>
              {COPY.doneTitle}
            </AccentText>
            <Text style={styles.hint} maxFontSizeMultiplier={1.3}>{COPY.doneHint}</Text>
            <View style={styles.cardWrap}><DemoRecipeCard compact={compact} reduceMotion={reduceMotion} /></View>
          </ScrollView>
          <View style={[styles.footer, styles.footerLine, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable onPress={afterDone} style={({ pressed }) => [styles.primary, pressed && styles.pressed]} accessibilityRole="button">
              <Text style={styles.primaryText} maxFontSizeMultiplier={1.3}>{canNotify ? COPY.doneCta : lastLabel}</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <ScrollView style={styles.flex} contentContainerStyle={styles.notifyContent} showsVerticalScrollIndicator={false}>
            <View style={styles.notifyIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Ionicons name="notifications-outline" size={26} color={colors.brand} />
            </View>
            <AccentText style={StyleSheet.flatten([styles.title, styles.center, compact && styles.titleCompact])} accentStyle={styles.titleAccent} maxFontSizeMultiplier={1.25}>
              {COPY.notifyTitle}
            </AccentText>
            <Text style={[styles.hint, styles.center]} maxFontSizeMultiplier={1.3}>{COPY.notifyBody}</Text>
            <Text style={[styles.note, styles.center]} maxFontSizeMultiplier={1.3}>{COPY.notifyNote}</Text>
          </ScrollView>
          <View style={[styles.footer, styles.footerLine, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <Pressable onPress={() => { void acceptNotify(); }} disabled={notifyBusy}
              style={({ pressed }) => [styles.primary, (pressed || notifyBusy) && styles.pressed]}
              accessibilityRole="button" accessibilityState={{ busy: notifyBusy }}>
              {notifyBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText} maxFontSizeMultiplier={1.3}>{COPY.notifyAccept}</Text>}
            </Pressable>
            <Pressable onPress={declineNotify} disabled={notifyBusy} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
              accessibilityRole="button">
              <Text style={styles.secondaryText} maxFontSizeMultiplier={1.3}>{COPY.notifyDecline}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  center: { textAlign: 'center' },
  hidden: { opacity: 0 },
  header: { paddingHorizontal: 20, paddingBottom: 10, backgroundColor: colors.canvas, zIndex: 2, elevation: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  circle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontFamily: fonts.heading, fontSize: 15, color: colors.ink },
  skip: { minWidth: 44, height: 44, paddingHorizontal: 10, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textMuted },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.creamDeep },
  segmentDone: { backgroundColor: colors.brand },
  stepCount: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textMuted, letterSpacing: 0.4, minWidth: 34, textAlign: 'right' },
  copy: { paddingHorizontal: 24, paddingTop: 14, minHeight: 136 },
  copyCompact: { paddingTop: 8, minHeight: 112 },
  // Kickers are uppercased in code (trUpper): textTransform is not Turkish-aware on iOS.
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.6, color: colors.ink, marginTop: 8 },
  titleCompact: { fontSize: 22, lineHeight: 27 },
  doneTitle: { fontSize: 30, lineHeight: 35, letterSpacing: -0.8 },
  titleAccent: { fontFamily: fonts.headingBoldItalic, color: colors.brand },
  hint: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 8 },
  note: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: colors.textFaint, marginTop: 12 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4, overflow: 'hidden' },
  footer: { paddingHorizontal: 20, paddingTop: 6, alignItems: 'stretch', backgroundColor: colors.canvas },
  footerLine: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  missHint: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.brandDark, textAlign: 'center', minHeight: 18 },
  next: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 18 },
  nextText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textMuted },
  doneContent: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 28 },
  doneContentCompact: { paddingTop: 8 },
  cardWrap: { width: '100%', maxWidth: 420, alignSelf: 'center', marginTop: 22 },
  notifyContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 24 },
  notifyIcon: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 54, borderRadius: radius.pill,
    backgroundColor: colors.brand, alignSelf: 'stretch',
  },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 16, color: '#fff' },
  secondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textMuted },
});
