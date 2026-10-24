import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { colors } from '../../constants/theme';

/** System "Reduce Motion" (iOS) / "Remove animations" (Android), kept live. */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setOn(value); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', value => setOn(!!value));
    return () => { alive = false; sub.remove(); };
  }, []);
  return on;
}

export const EASE_SOFT = Easing.inOut(Easing.quad);
export const EASE_OUT = Easing.out(Easing.quad);

/** A gentle repeating 0→1 value; stays at 0 when motion is reduced. */
export function useLoop(duration: number, enabled: boolean, easing: (t: number) => number = EASE_SOFT): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  // Read through a ref: an inline easing must not restart the loop on every render.
  const easingRef = useRef(easing);
  easingRef.current = easing;
  useEffect(() => {
    if (!enabled) { value.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: easingRef.current, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [enabled, duration, value]);
  return value;
}

const PALETTE = [colors.brand, '#f2a541', colors.success, '#f6c9b8', colors.ink, '#e9785f'];

// Deterministic pseudo-random so every burst looks the same and renders are stable.
function seeded(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A short, warm confetti burst from the top centre (~1.8 s, 26 pieces, no
 * loop). Decorative only: hidden from screen readers, never intercepts taps.
 * Render it only when Reduce Motion is off.
 */
export function ConfettiBurst({ pieces = 26 }: { pieces?: number }) {
  const { width, height } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const bits = useMemo(() => Array.from({ length: pieces }, (_, i) => ({
    dx: (seeded(i, 1) - 0.5) * width * 1.1,
    peak: 40 + seeded(i, 2) * height * 0.18,
    fall: height * (0.45 + seeded(i, 3) * 0.35),
    spin: (seeded(i, 4) > 0.5 ? 1 : -1) * (180 + seeded(i, 5) * 540),
    size: 6 + Math.round(seeded(i, 6) * 6),
    round: seeded(i, 7) > 0.6,
    color: PALETTE[i % PALETTE.length],
    delay: seeded(i, 8) * 0.15,
  })), [pieces, width, height]);

  useEffect(() => {
    const anim = Animated.timing(progress, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [progress]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bits.map((b, i) => {
        const start = b.delay;
        const translateX = progress.interpolate({ inputRange: [0, start, 1], outputRange: [0, 0, b.dx] });
        const translateY = progress.interpolate({
          inputRange: [0, start, start + (1 - start) * 0.3, 1],
          outputRange: [0, 0, -b.peak, b.fall],
        });
        const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${b.spin}deg`] });
        const opacity = progress.interpolate({ inputRange: [0, start, start + 0.02, 0.8, 1], outputRange: [0, 0, 1, 1, 0] });
        return (
          <Animated.View key={i} style={{
            position: 'absolute', left: width / 2 - b.size / 2, top: height * 0.22,
            width: b.size, height: b.round ? b.size : b.size * 1.6, borderRadius: b.round ? b.size / 2 : 2,
            backgroundColor: b.color, opacity, transform: [{ translateX }, { translateY }, { rotate }],
          }} />
        );
      })}
    </View>
  );
}
