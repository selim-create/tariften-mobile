import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

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
export const EASE_SETTLE = Easing.out(Easing.cubic);

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

/**
 * A one-time 0→1 entrance (the finished recipe card rising into place). With
 * Reduce Motion it is 1 from the start: everything is simply there.
 */
export function useEntrance(enabled: boolean, delay = 0, duration = 560): Animated.Value {
  const value = useRef(new Animated.Value(enabled ? 0 : 1)).current;
  useEffect(() => {
    if (!enabled) { value.setValue(1); return undefined; }
    value.setValue(0);
    const anim = Animated.timing(value, { toValue: 1, duration, delay, easing: EASE_SETTLE, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [enabled, delay, duration, value]);
  return value;
}
