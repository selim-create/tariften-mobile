import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecipeSocialSource } from '../../lib/types';
import { PLATFORM_COPY } from '../../lib/social-format';
import { fonts, radius } from '../../constants/theme';

const ICON: Record<RecipeSocialSource['platform'], React.ComponentProps<typeof Ionicons>['name']> = {
  instagram: 'logo-instagram', tiktok: 'logo-tiktok', youtube: 'logo-youtube',
};

/** Small "came from a video" mark for photos: platform glyph and its short name. */
export default function SocialBadge({ platform, label, style }: {
  platform: RecipeSocialSource['platform']; label?: string; style?: ViewStyle;
}) {
  const text = label ?? PLATFORM_COPY[platform]?.short;
  if (!PLATFORM_COPY[platform]) return null;
  return (
    <View style={[styles.badge, style]} accessibilityLabel={`${PLATFORM_COPY[platform].from} aktarılan tarif`}>
      <Ionicons name={ICON[platform]} size={12} color="#fff" />
      {text ? <Text style={styles.text} numberOfLines={1}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 9,
    borderRadius: radius.pill, backgroundColor: 'rgba(31,26,23,0.72)',
  },
  text: { fontFamily: fonts.bodySemi, fontSize: 11, color: '#fff', maxWidth: 150 },
});
