import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AccountQuotas, QuotaKind, resetDate } from '../lib/quotas';

const labels: Record<QuotaKind, string> = {
  menu_month: 'Bu ay menü',
  recipe_day: 'Bugün tarif ekleme',
  recipe_ai_day: 'Bugün AI tarif denemesi',
};

export default function QuotaCard({ data, error, loading, kinds = ['menu_month', 'recipe_day', 'recipe_ai_day'] }:
  { data: AccountQuotas | null; error?: string; loading?: boolean; kinds?: QuotaKind[] }) {
  if (!data && !loading && !error) return null;
  return (
    <View style={styles.card} accessibilityLabel="Kullanım haklarım">
      <View style={styles.head}>
        <Text style={styles.title}>Kullanım haklarım</Text>
        {data && <Text style={styles.badge}>{data.tier === 'administrator' ? 'Yönetici · Sınırsız' : 'Ücretsiz üye'}</Text>}
      </View>
      {loading && !data && <Text style={styles.small}>Hakların kontrol ediliyor…</Text>}
      {error && !data && <Text style={styles.warning}>{error} Son kontrol sunucuda yapılır.</Text>}
      {data && kinds.map(kind => {
        const q = data.quotas[kind];
        return (
          <View key={kind} style={styles.row}>
            <Text style={styles.label}>{labels[kind]}</Text>
            <Text style={styles.value}>{q.limit === null ? 'Sınırsız' : `${q.remaining} / ${q.limit} kaldı`}</Text>
            {q.limit !== null && q.remaining === 0 && <Text style={styles.reset}>Yenilenme: {resetDate(data, kind)}</Text>}
          </View>
        );
      })}
      {data && <Text style={styles.small}>Menünün tarifleri günlük bağımsız tarif kotasından düşmez.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderColor: '#e8ece8', borderWidth: 1, borderRadius: 18, padding: 16, marginVertical: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 6 },
  title: { color: '#202e25', fontSize: 17, fontWeight: '800' },
  badge: { fontSize: 11, fontWeight: '700', color: '#2b6746', backgroundColor: '#edf7ee', borderRadius: 8, overflow: 'hidden', padding: 7 },
  row: { borderTopColor: '#edf0ed', borderTopWidth: 1, paddingVertical: 10 },
  label: { fontSize: 12, color: '#78817e' },
  value: { fontSize: 18, color: '#202b28', fontWeight: '800', marginTop: 3 },
  reset: { fontSize: 11, color: '#925326', marginTop: 4 },
  warning: { fontSize: 13, color: '#925326', lineHeight: 20 },
  small: { fontSize: 11, color: '#8a9290', marginTop: 5, lineHeight: 17 },
});
