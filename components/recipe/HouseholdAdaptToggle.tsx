import React from 'react';
import { StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../../constants/theme';
import { useKitchenProfile } from '../../lib/kitchen-profile';
import { householdAdaptLabel, householdAdaptSize } from '../../lib/household-adapt';

/**
 * The member's household size from the kitchen profile (1–12), or null for
 * guests, while loading, or when no size is saved. Reads the shared session
 * cache, so it never adds a request on top of the recipe allergen band.
 */
export function useHouseholdAdaptSize(token: string | null | undefined): number | null {
  const snapshot = useKitchenProfile(token || null);
  return householdAdaptSize(snapshot?.profile.household_size);
}

/**
 * "Evime göre uyarla (N kişi)" — off by default; the screen sends
 * adapt_household only while this is on. Renders nothing without a size.
 */
export default function HouseholdAdaptToggle({ size, value, onValueChange, disabled, style }: {
  size: number | null;
  value: boolean;
  onValueChange: (on: boolean) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (size === null) return null;
  const label = householdAdaptLabel(size);
  return (
    <View style={[styles.row, style]}>
      <View style={styles.icon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Ionicons name="people-outline" size={17} color={colors.ink} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>
          {value ? 'Tarif hanendeki kişi sayısına göre yazılacak.' : 'Kapalıyken tarifler standart olarak 4 kişilik yazılır.'}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: colors.brand, false: colors.lineStrong }}
        accessibilityLabel={label}
        accessibilityHint="Açıksa tarif mutfak profilindeki kişi sayısına göre yazılır"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 19, color: colors.ink },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 1 },
});
