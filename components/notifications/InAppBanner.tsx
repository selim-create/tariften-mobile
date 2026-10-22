import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow } from '../../constants/theme';

export type BannerContent = { key: string; title: string; body: string; data: unknown };

const VISIBLE_MS = 6000;

/**
 * Foreground push: a quiet card that slides in under the status bar instead
 * of a system alert. Tap opens the target; it hides itself after a few seconds.
 */
export default function InAppBanner({ content, onPress, onDismiss }: {
  content: BannerContent | null;
  onPress: (content: BannerContent) => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState<BannerContent | null>(content);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (content) {
      setShown(content);
      AccessibilityInfo.announceForAccessibility?.(`${content.title}. ${content.body}`);
      Animated.timing(progress, { toValue: 1, duration: 220, useNativeDriver: true }).start();
      const timer = setTimeout(onDismiss, VISIBLE_MS);
      return () => clearTimeout(timer);
    }
    Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true })
      .start(({ finished }) => { if (finished) setShown(null); });
    return undefined;
  }, [content, onDismiss, progress]);

  if (!shown) return null;
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  return (
    <Animated.View pointerEvents="box-none"
      style={[styles.wrap, { top: insets.top + 8, opacity: progress, transform: [{ translateY }] }]}>
      <Pressable onPress={() => onPress(shown)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
        accessibilityRole="button" accessibilityLabel={`${shown.title}. ${shown.body}. Açmak için dokun.`}>
        <View style={styles.icon}><Ionicons name="restaurant-outline" size={17} color={colors.brand} /></View>
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>{shown.title}</Text>
          {shown.body ? <Text style={styles.body} numberOfLines={2}>{shown.body}</Text> : null}
        </View>
        <TouchableOpacity onPress={onDismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel="Bildirimi kapat">
          <Ionicons name="close" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, zIndex: 100, elevation: 100 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, paddingRight: 14,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
    ...shadow.floating,
  },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted },
});
