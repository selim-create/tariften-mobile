import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../../constants/theme';

type Props = {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
};

/** Native-feeling selection sheet; shared by create, edit and AI recipe review. */
export default function RecipePicker({ label, value, options, onChange, placeholder = 'Seç', allowClear = true }: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const unique = useMemo(() => Array.from(new Set([...options, ...(value && !options.includes(value) ? [value] : [])])), [options, value]);
  const shown = unique.filter(item => item.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  const close = () => { setVisible(false); setQuery(''); };
  const choose = (next: string) => { onChange(next); close(); };
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label + ': ' + (value || placeholder)}
      accessibilityHint="Seçim listesini açar" onPress={() => setVisible(true)} style={styles.trigger}>
      <Text numberOfLines={1} style={[styles.value, !value && styles.placeholder]}>{value || placeholder}</Text>
      <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
    </TouchableOpacity>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{label}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Seçim listesini kapat"
              style={styles.close} onPress={close}><Ionicons name="close" size={20} color={colors.ink} /></TouchableOpacity>
          </View>
          {unique.length > 6 && <TextInput accessibilityLabel={label + ' seçeneklerinde ara'} value={query}
            onChangeText={setQuery} placeholder="Seçenek ara…" placeholderTextColor={colors.textFaint} style={styles.search} />}
          <ScrollView style={styles.list} contentContainerStyle={styles.options} keyboardShouldPersistTaps="handled">
            {allowClear && <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={() => choose('')}>
              <Text style={styles.empty}>Belirtilmemiş</Text></TouchableOpacity>}
            {shown.map(option => <TouchableOpacity accessibilityRole="button" key={option}
              style={[styles.option, value===option && styles.active]} onPress={() => choose(option)}>
              <Text style={[styles.optionText, value===option && styles.activeText]}>{option}</Text>
              {value===option && <Ionicons name="checkmark" size={20} color="#fff" />}
            </TouchableOpacity>)}
            {!shown.length && <Text style={styles.empty}>Sonuç bulunamadı.</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}
const styles=StyleSheet.create({
  field: { gap: 6, flex: 1, minWidth: 0 },
  label: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textMuted },
  trigger: {
    minHeight: 50, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  value: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  placeholder: { fontFamily: fonts.body, color: colors.textFaint },
  overlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: { maxHeight: '80%', minHeight: 320, backgroundColor: colors.canvas, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: fonts.headingBold, fontSize: 22, letterSpacing: -0.5, color: colors.ink },
  close: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  search: {
    backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.pill, height: 46,
    paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 15, color: colors.ink, marginBottom: 12,
  },
  list: { flexGrow: 0 },
  options: { paddingBottom: 25, gap: 6 },
  option: {
    minHeight: 50, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  active: { backgroundColor: colors.ink, borderColor: colors.ink },
  optionText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  activeText: { fontFamily: fonts.bodySemi, color: '#fff' },
  empty: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
});
