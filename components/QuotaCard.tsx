import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AccountQuotas, QuotaKind, resetDate } from '../lib/quotas';
import { colors, fonts, radius } from '../constants/theme';

const labels: Record<QuotaKind, string> = {
  menu_month: 'Bu ay menü',
  recipe_day: 'Bugün tarif ekleme',
  recipe_ai_day: 'Bugün AI tarif denemesi',
};

const icons: Record<QuotaKind, React.ComponentProps<typeof Ionicons>['name']> = {
  menu_month: 'restaurant-outline',
  recipe_day: 'create-outline',
  recipe_ai_day: 'sparkles-outline',
};

/**
 * Membership rights exactly as the API reports them: remaining / limit, or
 * "Sınırsız" when the limit is null. Nothing here is estimated.
 */
export default function QuotaCard({ data, error, loading, kinds = ['menu_month', 'recipe_day', 'recipe_ai_day'] }:
  { data: AccountQuotas | null; error?: string; loading?: boolean; kinds?: QuotaKind[] }) {
  if (!data && !loading && !error) return null;
  return (
    <View style={styles.card} accessibilityLabel="Kullanım haklarım">
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>Üyelik</Text>
          <Text style={styles.title}>Kullanım haklarım</Text>
        </View>
        {data && <Text style={styles.badge}>{data.tier === 'administrator' ? 'Yönetici · Sınırsız' : data.tier === 'internal' ? 'Dahili Hesap · Sınırsız' : 'Standart Üye'}</Text>}
      </View>
      {loading && !data && <Text style={styles.small}>Hakların kontrol ediliyor…</Text>}
      {error && !data && <Text style={styles.warning}>{error} Son kontrol sunucuda yapılır.</Text>}
      {data && kinds.map(kind => {
        const q = data.quotas[kind];
        const empty = q.limit !== null && q.remaining === 0;
        return (
          <View key={kind} style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name={icons[kind]} size={17} color={colors.ink} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.label}>{labels[kind]}</Text>
              {q.limit !== null && q.remaining === 0 && <Text style={styles.reset}>Yenilenme: {resetDate(data, kind)}</Text>}
            </View>
            <Text style={[styles.value, empty && styles.valueEmpty]}>{q.limit === null ? 'Sınırsız' : `${q.remaining} / ${q.limit} kaldı`}</Text>
          </View>
        );
      })}
      {data && <View style={styles.tierRow} accessibilityLabel="Yakında sunulacak üyelik seçenekleri">
        <Text style={styles.futureTier}>Premium · Yakında</Text>
        <Text style={styles.futureTier}>Premium + · Yakında</Text>
      </View>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.xl,
    padding: 18, marginHorizontal: 20, marginTop: 22,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, color: colors.ink, fontSize: 19, marginTop: 2 },
  badge: {
    fontFamily: fonts.bodySemi, fontSize: 12, color: '#fff', backgroundColor: colors.ink,
    borderRadius: radius.pill, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 7,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopColor: colors.line, borderTopWidth: 1, paddingVertical: 12 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  value: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.ink },
  valueEmpty: { color: colors.brand },
  reset: { fontFamily: fonts.body, fontSize: 12, color: colors.warning, marginTop: 2 },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  futureTier: {
    fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint, backgroundColor: colors.canvas,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6, overflow: 'hidden',
  },
  warning: { fontFamily: fonts.body, fontSize: 13, color: colors.warning, lineHeight: 20 },
  small: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 5, lineHeight: 17 },
});
