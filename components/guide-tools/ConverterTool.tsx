import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  convertMeasure, converterRows, INGREDIENT_DENSITY, MEASURE_UNITS, type MeasureUnit,
} from '../../lib/guide-tools';
import { colors, fonts, radius } from '../../constants/theme';
import { ChipChoice, FieldLabel, Note, toolStyles } from './ToolUI';

const OTHER = 'diger';

/** Ölçü çevirici: one amount in one unit → every other sensible unit; grams only for known ingredients. */
export default function ConverterTool() {
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState<MeasureUnit>('su_bardagi');
  const [ingredient, setIngredient] = useState<string>('un');
  const known = ingredient !== OTHER ? ingredient : null;
  const unitShort = MEASURE_UNITS.find(u => u.key === unit)?.short || '';
  const ingredientLabel = INGREDIENT_DENSITY.find(i => i.key === known)?.label;

  const result = useMemo(() => converterRows(amount, unit, known), [amount, unit, known]);
  const reference = useMemo(() => {
    if (!known) return '';
    return (['su_bardagi', 'yemek_kasigi', 'cay_kasigi'] as MeasureUnit[]).map(u => {
      const r = convertMeasure('1', u, 'g', known);
      return r.ok ? `1 ${MEASURE_UNITS.find(m => m.key === u)?.short} ≈ ${r.text}` : '';
    }).filter(Boolean).join('  ·  ');
  }, [known]);

  return (
    <View style={toolStyles.stack}>
      <View style={toolStyles.field}>
        <FieldLabel>Miktar</FieldLabel>
        <View style={styles.amountRow}>
          <TextInput value={amount} onChangeText={t => setAmount(t.replace(/[^\d.,/ ½¼¾]/g, '').slice(0, 8))}
            keyboardType="numbers-and-punctuation" returnKeyType="done" maxLength={8} selectTextOnFocus
            placeholder="ör. 1,5" placeholderTextColor={colors.textFaint} style={styles.input}
            accessibilityLabel="Miktar" accessibilityHint="Ondalık için virgül, kesir için 1/2 yazabilirsin" />
          <Text style={styles.amountUnit} numberOfLines={2}>{unitShort}{ingredientLabel ? ` ${ingredientLabel.toLocaleLowerCase('tr-TR')}` : ''}</Text>
        </View>
      </View>
      <View style={toolStyles.field}>
        <FieldLabel>Ölçü</FieldLabel>
        <ChipChoice label="Ölçü birimi" value={unit} onChange={setUnit} options={MEASURE_UNITS.map(u => ({ key: u.key, label: u.label }))} />
      </View>
      <View style={toolStyles.field}>
        <FieldLabel hint="Gram için gerekli">Malzeme</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          style={styles.rail} contentContainerStyle={styles.railContent} accessibilityRole="radiogroup" accessibilityLabel="Malzeme">
          {[...INGREDIENT_DENSITY.map(i => ({ key: i.key, label: i.label })), { key: OTHER, label: 'Diğer' }].map(option => {
            const selected = option.key === ingredient;
            return (
              <Pressable key={option.key} onPress={() => setIngredient(option.key)}
                style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && !selected && { opacity: 0.7 }]}
                accessibilityRole="radio" accessibilityState={{ selected }}>
                <Text style={[styles.chipText, selected && styles.chipTextOn]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {result.error ? (
        <Note tone={result.gramsRefused ? 'safety' : 'info'}>{result.error}</Note>
      ) : (
        <View style={styles.results} accessibilityLabel="Sonuçlar">
          {result.rows.map((row, i) => (
            <View key={row.unit} style={[styles.row, i > 0 && styles.rowLine]} accessible accessibilityLabel={`${row.label}: ${row.text}`}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={[styles.rowValue, row.unit === 'g' && styles.rowValueStrong]}>{row.unit === 'g' ? `≈ ${row.text}` : row.text}</Text>
            </View>
          ))}
          {!result.rows.length ? <Text style={styles.empty}>Bu miktar için anlamlı bir karşılık yok.</Text> : null}
        </View>
      )}
      {!result.error && result.gramsRefused ? (
        <Note>Gram karşılığı için listeden malzemeyi seç. Listede olmayan malzemelerin ağırlığı değiştiği için gram hesaplamıyoruz.</Note>
      ) : null}
      {reference ? <Text style={styles.reference}>{`${ingredientLabel}: ${reference}`}</Text> : null}
      <Text style={styles.small}>Ölçüler silme kabul edilir: su bardağı 200 ml, çay bardağı 100 ml, yemek kaşığı 15 ml, tatlı kaşığı 10 ml, çay kaşığı 5 ml. Gramlar yaklaşıktır.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  input: {
    width: 108, height: 52, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong,
    backgroundColor: colors.surface, fontFamily: fonts.heading, fontSize: 20, color: colors.ink,
  },
  amountUnit: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.textMuted },
  rail: { marginHorizontal: -16 },
  railContent: { gap: 8, paddingHorizontal: 16 },
  chip: {
    minHeight: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  chipTextOn: { color: '#fff' },
  results: { borderRadius: radius.md, backgroundColor: colors.cream, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 46, paddingVertical: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.lineStrong },
  rowLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  rowValue: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink, textAlign: 'right', flexShrink: 1 },
  rowValueStrong: { fontFamily: fonts.heading, fontSize: 16 },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, paddingVertical: 14 },
  reference: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 19, color: colors.text },
  small: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted },
});
