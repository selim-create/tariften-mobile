import React from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { QuickRecipeDraft } from '../../lib/quick-recipe-review';
import { validateQuickRecipe } from '../../lib/quick-recipe-review';
import { RECIPE_UNITS, canTypeRecipeAmount } from '../../lib/recipe-measurements';
import RecipePicker from './RecipePicker';
import { AccentText } from '../ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';

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
      placeholder={placeholder} placeholderTextColor={colors.textFaint}
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
              <Text style={styles.kicker}>AI Şef</Text>
              <AccentText style={styles.title}>{'Tarifin hazır. Son dokunuş *sende.*'}</AccentText>
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
                    if (!canTypeRecipeAmount(v)) return;
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
  flex: { flex: 1 },
  page: { flex: 1, backgroundColor: colors.canvas },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, flexDirection: 'row', gap: 12 },
  headerCopy: { flex: 1 },
  kicker: { fontFamily: fonts.bodySemi, color: colors.brand, letterSpacing: 2.2, fontSize: 11, textTransform: 'uppercase' },
  title: { fontFamily: fonts.headingBold, fontSize: 27, lineHeight: 33, letterSpacing: -0.7, color: colors.ink, marginTop: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted, marginTop: 8 },
  close: {
    height: 38, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: 'center', alignSelf: 'flex-start',
    backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  closeText: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 13 },
  body: { paddingHorizontal: 20, paddingTop: 6, gap: 16, paddingBottom: 45 },
  field: { gap: 6, flex: 1 },
  label: { fontFamily: fonts.bodySemi, color: colors.textMuted, fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase' },
  input: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface,
    minHeight: 50, paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, color: colors.ink, fontSize: 15,
  },
  longInput: { minHeight: 92, lineHeight: 22 },
  twoCol: { flexDirection: 'row', gap: 10 },
  col: { flex: 1, minWidth: 0 },
  hint: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10 },
  sectionTitle: { fontFamily: fonts.headingBold, color: colors.ink, fontSize: 21, letterSpacing: -0.4 },
  addText: {
    fontFamily: fonts.bodySemi, color: colors.brand, fontSize: 13, backgroundColor: colors.brandSoft,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, overflow: 'hidden',
  },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 12, ...shadow.card },
  removeText: { fontFamily: fonts.bodySemi, alignSelf: 'flex-end', color: '#c0564b', fontSize: 12 },
  notice: { backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 13 },
  noticeText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: '#835c2e' },
  footer: {
    backgroundColor: colors.canvas, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong,
    paddingHorizontal: 20, paddingVertical: 12, gap: 10,
  },
  footerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  secondary: {
    height: 52, paddingHorizontal: 16, borderRadius: radius.pill, justifyContent: 'center',
    borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface,
  },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  primary: { flex: 1, borderRadius: radius.pill, minHeight: 52, backgroundColor: colors.brand, justifyContent: 'center', alignItems: 'center' },
  primaryText: { fontFamily: fonts.bodySemi, color: '#fff', fontSize: 15 },
  disabled: { opacity: 0.5 },
  error: { fontFamily: fonts.bodySemi, color: '#b7473b', backgroundColor: colors.brandSoft, borderRadius: radius.md, padding: 11, fontSize: 12, lineHeight: 17, overflow: 'hidden' },
});
