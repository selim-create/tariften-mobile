import React from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { QuickRecipeDraft } from '../../lib/quick-recipe-review';
import { validateQuickRecipe } from '../../lib/quick-recipe-review';
import { RECIPE_UNITS } from '../../lib/recipe-measurements';
import RecipePicker from './RecipePicker';

type Props = {
  visible: boolean;
  draft: QuickRecipeDraft;
  onChange: (updater: (value: QuickRecipeDraft) => QuickRecipeDraft) => void;
  existingRecipeId: number | null;
  cuisineOptions: string[];
  mealOptions: string[];
  saving: boolean;
  uncertain: boolean;
  error: string;
  onClose: () => void;
  onNew: () => void;
  onPublish: () => void;
};

function FormField({ label, value, onChange, numeric, multiline, placeholder }: {
  label: string; value: string; onChange: (value: string) => void;
  numeric?: boolean; multiline?: boolean; placeholder?: string;
}) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange}
      keyboardType={numeric ? 'number-pad' : 'default'}
      multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'}
      placeholder={placeholder} placeholderTextColor="#b3a599"
      style={[styles.input, multiline && styles.longInput]} />
  </View>;
}

export default function QuickRecipeReview({
  visible, draft, onChange, existingRecipeId, cuisineOptions, mealOptions, saving, uncertain, error,
  onClose, onNew, onPublish,
}: Props) {
  const patch = (fields: Partial<QuickRecipeDraft>) => onChange(current => ({ ...current, ...fields }));
  const validation = validateQuickRecipe(draft);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => { if (!saving) onClose(); }}>
      <SafeAreaView style={styles.page}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.kicker}>TARİFTEN · AI ŞEF</Text>
              <Text accessibilityRole="header" style={styles.title}>Tarifin hazır. Son dokunuş sende.</Text>
              <Text style={styles.subtitle}>Malzemeleri ve adımları kontrol et. Tarif henüz yayımlanmadı.</Text>
            </View>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Tarif önizlemesini kapat"
              onPress={onClose} disabled={saving} style={styles.close}>
              <Text style={styles.closeText}>Kapat</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {existingRecipeId ? <View style={styles.notice}>
              <Text style={styles.noticeText}>Benzer isimli bir tarif zaten var. İstersen kendi tarifini ayrıca yayımlayabilirsin.</Text>
            </View> : null}
            <FormField label="Tarifin adı *" value={draft.title} onChange={v => patch({ title: v })} />
            <FormField label="Editoryal spot" value={draft.excerpt} multiline onChange={v => patch({ excerpt: v })} />
            <View style={styles.twoCol}>
              <View style={styles.col}><FormField label="Kaç kişilik? *" numeric value={draft.servings} onChange={v => { if (Number(v) <= 36) patch({ servings: v }); }} /></View>
              <View style={styles.col}><FormField label="Kişi başına yaklaşık kcal" numeric value={draft.calories}
                placeholder="Bilinmiyor" onChange={v => { if (Number(v) <= 3000) patch({ calories: v }); }} /></View>
            </View>
            <Text style={styles.hint}>Kalori AI tahminidir; beslenme analizi değildir. Bilinmiyorsa boş kalabilir.</Text>
            <View style={styles.twoCol}>
              <View style={styles.col}><RecipePicker label="Mutfak" value={draft.cuisine[0] || ''}
                options={[...new Set([...draft.cuisine, ...cuisineOptions])]}
                onChange={v => patch({ cuisine: v ? [v] : [] })} /></View>
              <View style={styles.col}><RecipePicker label="Öğün türü" value={draft.meal_type[0] || ''}
                options={[...new Set([...draft.meal_type, ...mealOptions])]}
                onChange={v => patch({ meal_type: v ? [v] : [] })} /></View>
            </View>
            <View style={styles.twoCol}>
              <View style={styles.col}><FormField label="Hazırlama · dk" numeric value={draft.prep_time}
                onChange={v => { if (Number(v) <= 720) patch({ prep_time: v }); }} /></View>
              <View style={styles.col}><FormField label="Pişirme · dk" numeric value={draft.cook_time}
                onChange={v => { if (Number(v) <= 720) patch({ cook_time: v }); }} /></View>
            </View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Malzemeler</Text>
              <TouchableOpacity accessibilityRole="button" disabled={draft.ingredients.length >= 40}
                onPress={() => patch({ ingredients: [...draft.ingredients, { name: '', amount: '', unit: '' }] })}>
                <Text style={styles.addText}>+ Malzeme ekle</Text>
              </TouchableOpacity>
            </View>
            {draft.ingredients.map((row, i) => <View key={i} style={styles.card}>
              <FormField label={`${i + 1}. malzeme`} value={row.name}
                onChange={v => patch({ ingredients: draft.ingredients.map((r, j) => j === i ? { ...r, name: v } : r) })} />
              <View style={styles.twoCol}>
                <View style={styles.col}><FormField label="Miktar" value={row.amount}
                  onChange={v => {
                    if (/[a-zA-ZğüşıöçĞÜŞİÖÇ]/.test(v) &&
                      !['yarım','çeyrek'].some(word => word.startsWith(v.toLocaleLowerCase('tr-TR')))) return;
                    patch({ ingredients: draft.ingredients.map((r, j) => j === i ? { ...r, amount: v } : r) });
                  }} /></View>
                <View style={styles.col}><RecipePicker label="Ölçü birimi" value={row.unit} options={RECIPE_UNITS}
                  onChange={v => patch({ ingredients: draft.ingredients.map((r, j) => j === i ? { ...r, unit: v } : r) })} /></View>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${i + 1}. malzemeyi kaldır`}
                onPress={() => patch({ ingredients: draft.ingredients.filter((_, j) => j !== i) })}>
                <Text style={styles.removeText}>Malzemeyi kaldır</Text>
              </TouchableOpacity>
            </View>)}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Hazırlanış</Text>
              <TouchableOpacity accessibilityRole="button" disabled={draft.steps.length >= 40}
                onPress={() => patch({ steps: [...draft.steps, ''] })}><Text style={styles.addText}>+ Adım ekle</Text></TouchableOpacity>
            </View>
            {draft.steps.map((step, i) => <View key={i} style={styles.card}>
              <FormField label={`${i + 1}. adım`} multiline value={step}
                onChange={v => patch({ steps: draft.steps.map((r, j) => j === i ? v : r) })} />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${i + 1}. adımı kaldır`}
                onPress={() => patch({ steps: draft.steps.filter((_, j) => j !== i) })}>
                <Text style={styles.removeText}>Adımı kaldır</Text>
              </TouchableOpacity>
            </View>)}
            <FormField label="Şefin ipucu" multiline value={draft.chef_tip} onChange={v => patch({ chef_tip: v })} />
          </ScrollView>
          <View style={styles.footer}>
            {!!(error || validation) && <Text accessibilityRole="alert" style={styles.error}>{error || validation}</Text>}
            {uncertain && <Text accessibilityRole="alert" style={styles.error}>
              Tarif kaydedilmiş olabilir. Yeniden göndermeden önce Profil &gt; Tariflerim bölümünü kontrol et.
            </Text>}
            <View style={styles.footerActions}>
              <TouchableOpacity accessibilityRole="button" onPress={onNew} disabled={saving || uncertain} style={styles.secondary}>
                <Text style={styles.secondaryText}>Yeni tarif yaz</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={onPublish} disabled={saving || uncertain || !!validation}
                style={[styles.primary, (saving || uncertain || !!validation) && styles.disabled]}>
                <Text style={styles.primaryText}>{saving ? 'Yayımlanıyor…' : 'Kontrol ettim, yayımla'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, page: { flex: 1, backgroundColor: '#fffaf6' },
  header: { backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 18,
    borderBottomColor: '#f0e4d8', borderBottomWidth: 1, flexDirection: 'row', gap: 9 },
  headerCopy: { flex: 1 }, kicker: { color: '#b84b40', letterSpacing: 2, fontSize: 10, fontWeight: '900' },
  title: { fontSize: 23, lineHeight: 28, fontWeight: '900', color: '#20333a', marginTop: 8 },
  subtitle: { fontSize: 12, lineHeight: 18, color: '#82736a', marginTop: 8 },
  close: { borderWidth: 1, borderColor: '#edddd0', borderRadius: 15, padding: 9, alignSelf: 'flex-start' },
  closeText: { fontWeight: '800', color: '#866c5e', fontSize: 11 },
  body: { paddingHorizontal: 20, paddingVertical: 22, gap: 18, paddingBottom: 45 },
  field: { gap: 7, flex: 1 }, label: { color: '#77675f', fontSize: 11, fontWeight: '800' },
  input: { borderRadius: 13, borderWidth: 1, borderColor: '#e9ded4', backgroundColor: '#fff',
    minHeight: 46, padding: 12, color: '#27383d', fontSize: 14 },
  longInput: { minHeight: 90 },
  twoCol: { flexDirection: 'row', gap: 11 }, col: { flex: 1, minWidth: 0 },
  hint: { color: '#8b7c72', fontSize: 11, lineHeight: 17 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 },
  sectionTitle: { color: '#22343a', fontSize: 20, fontWeight: '900' },
  addText: { color: '#c35041', fontWeight: '900', fontSize: 11 },
  card: { backgroundColor: '#fff', borderColor: '#eee0d5', borderWidth: 1, borderRadius: 18, padding: 13, gap: 12 },
  removeText: { alignSelf: 'flex-end', color: '#c04e41', fontSize: 11, fontWeight: '800' },
  notice: { backgroundColor: '#fff1d9', borderRadius: 15, padding: 13 },
  noticeText: { fontSize: 12, lineHeight: 18, color: '#835c2e' },
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0e4d8',
    paddingHorizontal: 17, paddingVertical: 13, gap: 10 },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secondary: { padding: 12, borderRadius: 12 }, secondaryText: { fontSize: 11, fontWeight: '800', color: '#7b675c' },
  primary: { flex: 1, borderRadius: 15, minHeight: 50, backgroundColor: '#db4c3f', justifyContent: 'center', alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '900' }, disabled: { opacity: 0.5 },
  error: { color: '#b7473b', backgroundColor: '#fff0e8', borderRadius: 12, padding: 10, fontSize: 11, fontWeight: '700' },
});
