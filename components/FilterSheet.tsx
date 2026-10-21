import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RecipeFilters } from '../lib/types';
import { colors, fonts, radius } from '../constants/theme';

interface TermsData {
  cuisine?: { label: string; value: string }[];
  diet?: { label: string; value: string }[];
  meal_type?: { label: string; value: string }[];
  difficulty?: { label: string; value: string }[];
}

type FilterOption = { label: string; value: string };

interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  filters: RecipeFilters;
  onFiltersChange: (filters: RecipeFilters) => void;
  terms?: TermsData;
  /** Recipes matching the current filters, as reported by the API. */
  resultCount?: number | null;
}

const DIFFICULTY_OPTIONS: FilterOption[] = [
  { label: 'Kolay', value: 'Kolay' },
  { label: 'Orta', value: 'Orta' },
  { label: 'Zor', value: 'Zor' },
];

/** Only the orders the Core search endpoint implements (orderby). */
export const SORT_OPTIONS: FilterOption[] = [
  { label: 'En yeniler', value: 'En Yeniler' },
  { label: 'En hızlılar', value: 'Hazırlama Süresi' },
];

export default function FilterSheet({ visible, onClose, filters, onFiltersChange, terms, resultCount }: FilterSheetProps) {
  const toggleArrayFilter = (key: keyof RecipeFilters, value: string) => {
    const current = (filters[key] as string[]) || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFiltersChange({ ...filters, [key]: updated.length > 0 ? updated : undefined });
  };

  const isSelected = (key: keyof RecipeFilters, value: string) => {
    const current = (filters[key] as string[]) || [];
    return current.includes(value);
  };

  const clearFilters = () => {
    onFiltersChange({ query: filters.query });
  };

  const renderOptions = (key: keyof RecipeFilters, options: FilterOption[]) => (
    <View style={styles.optionsRow}>
      {options.filter((opt) => opt && opt.value != null).map((opt) => {
        const selected = isSelected(key, opt.value);
        return (
          <Pressable
            key={opt.value}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => toggleArrayFilter(key, opt.value)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
          >
            {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {opt.label ?? opt.value}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const section = (title: string, children: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>Tarifler</Text>
            <Text style={styles.title}>Filtrele</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Kapat">
            <Ionicons name="close" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          {section('Sıralama', (
            <View style={styles.optionsRow}>
              {SORT_OPTIONS.map((opt) => {
                const selected = filters.sort === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.chip, selected && styles.chipSelected]}
                    onPress={() => onFiltersChange({ ...filters, sort: selected ? undefined : opt.value })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          {terms?.meal_type && terms.meal_type.length > 0 && section('Öğün', renderOptions('mealType', terms.meal_type))}
          {terms?.cuisine && terms.cuisine.length > 0 && section('Mutfak', renderOptions('cuisine', terms.cuisine))}
          {terms?.diet && terms.diet.length > 0 && section('Beslenme', renderOptions('diet', terms.diet))}
          {section('Zorluk', renderOptions('difficulty', terms?.difficulty?.length ? terms.difficulty : DIFFICULTY_OPTIONS))}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.clearButton} onPress={clearFilters} accessibilityRole="button">
            <Text style={styles.clearButtonText}>Temizle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyButton} onPress={onClose} accessibilityRole="button">
            <Text style={styles.applyButtonText}>
              {typeof resultCount === 'number' ? `${resultCount.toLocaleString('tr-TR')} tarifi göster` : 'Uygula'}
            </Text>
          </TouchableOpacity>
        </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 28, letterSpacing: -0.8, color: colors.ink, marginTop: 2 },
  close: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  body: { flex: 1, paddingHorizontal: 20 },
  section: { paddingVertical: 18, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink, marginBottom: 12 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 38, paddingHorizontal: 14, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  chipTextSelected: { color: '#ffffff' },
  footer: {
    flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong, backgroundColor: colors.canvas,
  },
  clearButton: {
    flex: 1, height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  clearButtonText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  applyButton: { flex: 2, height: 52, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  applyButtonText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#ffffff' },
});
