import React, { useCallback, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { lokmaArtUri } from '../../lib/lokma-svg-art';
import { demoRecipeImage } from '../../assets/onboarding';
import { EASE_SOFT, useLoop } from './motion';
import { colors } from '../../constants/theme';

/**
 * The food "video" of the onboarding demo: the real recipe photo
 * (assets/onboarding/demo-recipe.jpg, see assets/onboarding/index.ts) full
 * bleed with a slow Ken Burns pan/zoom, so a still reads as a playing video.
 * Until the photo is supplied: a warm brand gradient with the illustrated
 * plate (never a broken image). Purely decorative, hidden from screen readers.
 * Reduce Motion: a still frame.
 */
export type DemoMediaProps = {
  reduceMotion: boolean;
  /**
   * Readable dark scrims for white overlay text: 'video' darkens the top
   * (status bar, progress) and the bottom (handle, caption, rail); 'card' only
   * the bottom (source pill); 'none' leaves the picture as is.
   */
  scrim?: 'video' | 'card' | 'none';
  /** The short-video progress bar, in the parent's pixels. */
  progress?: { top: number; side: number; height: number } | null;
  style?: StyleProp<ViewStyle>;
};

/** Fallback plate: Lokma drawings (bundled, offline) on the brand cream. */
export function DishArt({ size }: { size: number }) {
  const item = (figure: string, s: number, left: number, top: number, rotate = '0deg') => (
    <Image key={figure + left} source={{ uri: lokmaArtUri(figure) }} contentFit="contain" cachePolicy="memory" accessible={false}
      style={{ position: 'absolute', width: size * s, height: size * s, left: size * left, top: size * top, transform: [{ rotate }] }} />
  );
  return (
    <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={[styles.plate, { width: size, height: size, borderRadius: size / 2 }]} />
      <View style={[styles.plateInner, { width: size * 0.74, height: size * 0.74, borderRadius: size * 0.37, left: size * 0.13, top: size * 0.13 }]} />
      {item('pasta', 0.5, 0.25, 0.24)}
      {item('tomato', 0.24, 0.12, 0.16, '-12deg')}
      {item('herb', 0.24, 0.62, 0.14, '18deg')}
      {item('garlic', 0.2, 0.18, 0.62, '-8deg')}
      {item('cheese', 0.2, 0.62, 0.6, '10deg')}
    </View>
  );
}

/** Warm, brand-tinted backdrop for the fallback (theme colours only). */
export const MEDIA_FALLBACK_GRADIENT = [colors.ink, colors.ink, colors.brandDark] as const;

export default function DemoMedia({ reduceMotion, scrim = 'video', progress = null, style }: DemoMediaProps) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox(prev => (prev && Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1 ? prev : { width, height }));
  }, []);

  // Ken Burns: one slow 18 s breath in and out, a few percent of pan. Seamless loop (ends where it starts).
  const drift = useLoop(18000, !reduceMotion, EASE_SOFT);
  const w = box?.width ?? 0;
  const h = box?.height ?? 0;
  const scale = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1.06, 1.14, 1.06] });
  const translateX = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-w * 0.018, w * 0.018, -w * 0.018] });
  const translateY = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [h * 0.012, -h * 0.012, h * 0.012] });
  const motion = reduceMotion ? { transform: [{ scale: 1.06 }] } : { transform: [{ scale }, { translateX }, { translateY }] };
  const plate = scrim === 'card' ? Math.min(w * 0.5, h * 0.66) : Math.min(w * 0.6, h * 0.5);

  return (
    <View style={[styles.wrap, style]} onLayout={onLayout} pointerEvents="none"
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View style={[StyleSheet.absoluteFill, motion]}>
        {demoRecipeImage ? (
          <Image source={demoRecipeImage as ImageProps['source']} style={StyleSheet.absoluteFill} contentFit="cover"
            transition={0} accessible={false} />
        ) : (
          <LinearGradient colors={MEDIA_FALLBACK_GRADIENT} locations={[0, 0.3, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }}
            style={[StyleSheet.absoluteFill, styles.center]}>
            {plate > 0 ? <View style={{ marginBottom: scrim === 'card' ? 0 : h * 0.08 }}><DishArt size={plate} /></View> : null}
          </LinearGradient>
        )}
      </Animated.View>
      {scrim === 'video' ? (
        <LinearGradient colors={['rgba(0,0,0,0.42)', 'rgba(0,0,0,0)']} style={[styles.top, { height: '24%' }]} />
      ) : null}
      {scrim !== 'none' ? (
        <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.28)', 'rgba(0,0,0,0.66)']} locations={[0, 0.45, 1]}
          style={[styles.bottom, { height: scrim === 'video' ? '48%' : '46%' }]} />
      ) : null}
      {progress && w > 0 ? <VideoProgress {...progress} width={w - progress.side * 2} reduceMotion={reduceMotion} /> : null}
    </View>
  );
}

/** The thin short-video progress bar; plays on a 7 s loop (static when motion is reduced). */
export function VideoProgress({ top, side, height, width, reduceMotion }: {
  top: number; side: number; height: number; width: number; reduceMotion: boolean;
}) {
  const play = useLoop(7000, !reduceMotion, Easing.linear);
  const fill = play.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });
  return (
    <View style={[styles.track, { top, left: side, right: side, height, borderRadius: height }]}>
      <Animated.View style={[styles.trackFill, { transform: [{ translateX: reduceMotion ? -width * 0.62 : fill }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, overflow: 'hidden', backgroundColor: colors.ink },
  center: { alignItems: 'center', justifyContent: 'center' },
  plate: { position: 'absolute', backgroundColor: colors.cream },
  plateInner: { position: 'absolute', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.creamDeep },
  top: { position: 'absolute', left: 0, right: 0, top: 0 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  track: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.32)', overflow: 'hidden' },
  trackFill: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff' },
});
