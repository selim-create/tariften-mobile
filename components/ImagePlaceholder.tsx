import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import LokmaIngredientIcon from './LokmaIngredientIcon';
import { lokmaDishName } from '../lib/lokma-emoji';
import { colors, fonts } from '../constants/theme';

interface ImagePlaceholderProps {
  title?: string;
  variant?: 'card' | 'detail';
  style?: StyleProp<ViewStyle>;
  /** Small thumbnails show only the illustration. */
  compact?: boolean;
}

export function isPlaceholderImage(url?: string | null): boolean {
  if (!url) return true;
  if (url.trim() === '') return true;
  if (url.includes('placehold.co')) return true;
  if (url.includes('placeholder')) return true;
  return false;
}

/**
 * Cover for a recipe without a photograph: the dish's own Lokma illustration
 * on the brand cream (same as the web). It states plainly that the photo is
 * pending; nothing else is implied.
 */
export default function ImagePlaceholder({
  title = 'Tarif',
  variant = 'card',
  style,
  compact = false,
}: ImagePlaceholderProps) {
  const dish = lokmaDishName(title);

  if (variant === 'detail') {
    return (
      <View style={[detailStyles.container, style]}>
        <View style={detailStyles.frame} pointerEvents="none" />
        <View style={detailStyles.art}>
          <LokmaIngredientIcon name={dish} size={96} />
        </View>
        <Text style={detailStyles.label}>Fotoğraf hazırlanıyor</Text>
      </View>
    );
  }

  return (
    <View style={[cardStyles.container, style]}>
      <LokmaIngredientIcon name={dish} size={compact ? 30 : 44} />
      {compact ? null : <Text style={cardStyles.label}>Görsel hazırlanıyor</Text>}
    </View>
  );
}

const detailStyles = StyleSheet.create({
  container: { width: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.cream },
  frame: { position: 'absolute', top: 64, left: 18, right: 18, bottom: 48, borderRadius: 24, borderWidth: 1, borderColor: colors.creamDeep },
  art: { transform: [{ scale: 1.1 }] },
  label: { position: 'absolute', bottom: 66, fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#a89a8d' },
});

const cardStyles = StyleSheet.create({
  container: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: colors.cream },
  label: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: '#a89a8d' },
});
