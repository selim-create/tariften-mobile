import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DRYING_FOODS, DRYING_GENERAL_NOTES, DRYING_METHODS, dryingPlan, type DryingFood, type DryingMethod,
} from '../../lib/guide-tools';
import { colors, fonts, radius } from '../../constants/theme';
import { ChipChoice, FieldLabel, Note, Segmented, toolStyles } from './ToolUI';

/** Kurutma rehberi: food × method → prep, °C, time, readiness test, storage. */
export default function DryingTool() {
  const [food, setFood] = useState<DryingFood>('domates');
  const [method, setMethod] = useState<DryingMethod>('firin');
  const plan = useMemo(() => dryingPlan(food, method), [food, method]);
  const methodLabel = (key: DryingMethod) => DRYING_METHODS.find(m => m.key === key)?.label || key;

  return (
    <View style={toolStyles.stack}>
      <View style={toolStyles.field}>
        <FieldLabel>Ne kurutacaksın?</FieldLabel>
        <ChipChoice label="Kurutulacak ürün" value={food} onChange={setFood} options={DRYING_FOODS.map(f => ({ key: f.key, label: f.label }))} />
      </View>
      <View style={toolStyles.field}>
        <FieldLabel>Yöntem</FieldLabel>
        <Segmented label="Kurutma yöntemi" value={method} onChange={setMethod}
          options={DRYING_METHODS.map(m => ({ key: m.key, label: m.key === 'makine' ? 'Makine' : m.label }))} />
      </View>

      {plan?.status === 'ok' ? (
        <>
          <View style={styles.stats}>
            <Stat icon="thermometer-outline" label="Isı" value={plan.tempLabel} />
            <Stat icon="time-outline" label="Süre" value={plan.timeLabel} />
          </View>
          <Text style={styles.small}>Süre dilim kalınlığına, nem ve cihaza göre değişir; ilk kontrolü en kısa sürede yap.</Text>
          <Section title="Hazırlık" text={plan.prep} />
          <Section title={plan.method === 'firin' ? 'Fırında' : plan.method === 'makine' ? 'Makinede' : plan.food.group === 'ot' ? 'Gölgede' : 'Güneşte'} text={plan.conditions} />
          <Section title="Hazır mı?" text={plan.ready} />
          <Section title="Saklama" text={plan.storage} />
          {plan.notes.map(note => <Note key={note} tone="safety">{note}</Note>)}
        </>
      ) : plan?.status === 'not_recommended' ? (
        <View style={toolStyles.stack}>
          <Note tone="safety" title={`${plan.food.label}: ${methodLabel(plan.method).toLocaleLowerCase('tr-TR')} önerilmiyor`}>{plan.reason}</Note>
          {plan.alternatives.length ? (
            <View style={styles.altRow}>
              {plan.alternatives.map(alt => (
                <Pressable key={alt} onPress={() => setMethod(alt)} style={({ pressed }) => [styles.alt, pressed && { opacity: 0.75 }]}
                  accessibilityRole="button" accessibilityLabel={`${methodLabel(alt)} ile kurut`}>
                  <Text style={styles.altText}>{methodLabel(alt)} ile kurut</Text>
                  <Ionicons name="arrow-forward" size={15} color={colors.ink} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.general}>
        {DRYING_GENERAL_NOTES.map(note => (
          <View key={note} style={styles.bulletRow}>
            <View style={styles.bullet} />
            <Text style={styles.bulletText}>{note}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Stat({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.statHead}>
        <Ionicons name={icon} size={14} color={colors.brand} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, padding: 14, borderRadius: radius.md, backgroundColor: colors.cream, gap: 6 },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textMuted },
  statValue: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: -8 },
  section: { gap: 4 },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 21, color: colors.ink },
  sectionText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.text },
  altRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  alt: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface,
  },
  altText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  general: { gap: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.line },
  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textFaint, marginTop: 8 },
  bulletText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textMuted },
});
