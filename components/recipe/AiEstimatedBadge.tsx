import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AI_ESTIMATED_LABEL } from '../../lib/recipe-visibility';
import { colors, fonts, radius } from '../../constants/theme';

/**
 * "AI Tahmini Tarif": the recipe was estimated from a dish photo. Calm amber
 * pill; `onPhoto` is the variant that sits on top of a photograph.
 */
export default function AiEstimatedBadge({ onPhoto = false, compact = false }: { onPhoto?: boolean; compact?: boolean }) {
  return (
    <View style={[styles.pill, onPhoto && styles.onPhoto]} accessible accessibilityRole="text"
      accessibilityLabel={`${AI_ESTIMATED_LABEL}. Fotoğraftan tahmin edildi; ölçüleri kontrol et.`}>
      <Ionicons name="sparkles" size={compact ? 10 : 12} color={colors.warning} />
      {compact ? null : <Text style={styles.text}>{AI_ESTIMATED_LABEL}</Text>}
    </View>
  );
}

/** Lock pill for a private recipe the owner sees in lists. */
export function PrivateBadge({ onPhoto = false, label = 'Sadece sen' }: { onPhoto?: boolean; label?: string }) {
  return (
    <View style={[styles.pill, styles.private, onPhoto && styles.onPhoto]} accessible accessibilityRole="text"
      accessibilityLabel="Özel tarif. Sadece sen görüyorsun.">
      <Ionicons name="lock-closed" size={11} color={colors.ink} />
      {label ? <Text style={[styles.text, styles.privateText]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    height: 26, paddingHorizontal: 9, borderRadius: radius.pill,
    backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: '#f5dca5',
  },
  onPhoto: { backgroundColor: 'rgba(255,255,255,0.95)', borderColor: 'transparent' },
  text: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.warning },
  private: { backgroundColor: colors.cream, borderColor: colors.lineStrong },
  privateText: { color: colors.ink },
});
