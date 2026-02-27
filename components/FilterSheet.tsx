import React from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RecipeFilters } from '../lib/types';

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
}

const DIFFICULTY_OPTIONS: FilterOption[] = [
  { label: 'Kolay', value: 'kolay' },
  { label: 'Orta', value: 'orta' },
  { label: 'Zor', value: 'zor' },
];

const SORT_OPTIONS: FilterOption[] = [
  { label: 'En Yeni', value: 'date' },
  { label: 'En Popüler', value: 'popular' },
  { label: 'En Yüksek Puan', value: 'rating' },
];

export default function FilterSheet({ visible, onClose, filters, onFiltersChange, terms }: FilterSheetProps) {
  const toggleArrayFilter = (key: keyof RecipeFilters, value: string) => {
    const current = (filters[key] as string[]) || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onFiltersChange({ ...filters, [key]: updated });
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
      {options.filter((opt) => opt && opt.value != null).map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.chip, isSelected(key, opt.value) && styles.chipSelected]}
          onPress={() => toggleArrayFilter(key, opt.value)}
        >
          <Text style={[styles.chipText, isSelected(key, opt.value) && styles.chipTextSelected]}>
            {opt.label ?? opt.value}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Filtrele</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#1a1a1a" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {terms?.meal_type && terms.meal_type.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Öğün Tipi</Text>
              {renderOptions('mealType', terms.meal_type)}
            </View>
          )}

          {terms?.cuisine && terms.cuisine.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Mutfak</Text>
              {renderOptions('cuisine', terms.cuisine)}
            </View>
          )}

          {terms?.diet && terms.diet.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Diyet</Text>
              {renderOptions('diet', terms.diet)}
            </View>
          )}

          {(terms?.difficulty || DIFFICULTY_OPTIONS) && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Zorluk</Text>
              {renderOptions('difficulty', terms?.difficulty || DIFFICULTY_OPTIONS)}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sıralama</Text>
            <View style={styles.optionsRow}>
              {SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, filters.sort === opt.value && styles.chipSelected]}
                  onPress={() => onFiltersChange({ ...filters, sort: opt.value })}
                >
                  <Text style={[styles.chipText, filters.sort === opt.value && styles.chipTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
            <Text style={styles.clearButtonText}>Temizle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.applyButton} onPress={onClose}>
            <Text style={styles.applyButtonText}>Uygula</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#f9f9f9',
  },
  chipSelected: {
    backgroundColor: '#e74c3c',
    borderColor: '#e74c3c',
  },
  chipText: {
    fontSize: 13,
    color: '#666666',
  },
  chipTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  clearButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 15,
    color: '#666666',
    fontWeight: '600',
  },
  applyButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#e74c3c',
    alignItems: 'center',
  },
  applyButtonText: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '700',
  },
});
