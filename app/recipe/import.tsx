import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { createRecipe } from '../../lib/api';
import { fetchAccountQuotas, reached, resetDate, useQuotas } from '../../lib/quotas';
import {
  EditableIngredient, EditableStep, GroundedImportPreview, ImportEditor,
  buildApprovedRecipe, editorFromPreview, importReviewNotes, publishValidation,
  validateRecipeSource,
} from '../../lib/recipe-import';
import { previewRecipeText } from '../../lib/recipe-import-api';

type Busy = 'preview' | 'publish' | null;
const BG = '#fffbf7';
const BRAND = '#db4c3f';

function EditorLabel({ children }: { children: string }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}
function SmallField({ value, onChangeText, placeholder, multiline = false, keyboardType }: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'number-pad' | 'default';
}) {
  return <TextInput
    value={value} onChangeText={onChangeText} placeholder={placeholder}
    placeholderTextColor="#a79a91" multiline={multiline}
    keyboardType={keyboardType || 'default'}
    textAlignVertical={multiline ? 'top' : 'center'}
    style={[styles.input, multiline && styles.multiInput]}
  />;
}

export default function RecipeTextImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const quotas = useQuotas(token);
  const [source, setSource] = useState('');
  const [preview, setPreview] = useState<GroundedImportPreview | null>(null);
  const [editor, setEditor] = useState<ImportEditor | null>(null);
  const [accepted, setAccepted] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [openIngredient, setOpenIngredient] = useState<number | null>(null);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [seoOpen, setSeoOpen] = useState(false);
  const requestLock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const updateSource = (text: string) => {
    setSource(text);
    setPreview(null);
    setEditor(null);
    setOpenIngredient(null);
    setOpenStep(null);
    setError('');
    setAccepted(true);
  };
  const updateEditor = (change: (value: ImportEditor) => ImportEditor) => {
    setEditor(old => old ? change(old) : null);
    setError('');
  };

  const requestPreview = async () => {
    if (!token) { router.push('/login'); return; }
    if (requestLock.current) return;
    const invalid = validateRecipeSource(source);
    if (invalid) { setError(invalid); return; }
    requestLock.current = true;
    setBusy('preview');
    setError('');
    try {
      // Fail closed if the quota endpoint is unreachable before a paid AI call.
      const rights = await fetchAccountQuotas(token);
      if (reached(rights, 'recipe_ai_day')) {
        setError('Bugünkü yapay zekâ hakkın doldu. Yenilenme: ' + resetDate(rights, 'recipe_ai_day'));
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const data = await previewRecipeText(token, source, controller.signal);
      setPreview(data);
      setEditor(editorFromPreview(data));
      setAccepted(true);
      setOpenIngredient(null);
      setOpenStep(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Önizleme hazırlanamadı.');
    } finally {
      abortRef.current = null;
      void quotas.refresh(); // Failed provider attempts may still count.
      setBusy(null);
      requestLock.current = false;
    }
  };

  const publishApproved = async () => {
    if (!token || !editor || !preview || !accepted || requestLock.current) return;
    const invalid = publishValidation(editor);
    if (invalid) { setError(invalid); return; }
    requestLock.current = true;
    setBusy('publish');
    setError('');
    try {
      const rights = await fetchAccountQuotas(token);
      if (reached(rights, 'recipe_day')) {
        setError('Bugünkü tarif paylaşma hakkın doldu. Yenilenme: ' + resetDate(rights, 'recipe_day'));
        return;
      }
      // This is the only action writing a PUBLIC recipe; never invoked by preview.
      const result = await createRecipe(token, buildApprovedRecipe(editor));
      const slug: unknown = result?.slug || result?.data?.slug;
      if (typeof slug === 'string' && slug.trim()) {
        router.replace('/recipe/' + encodeURIComponent(slug));
      } else {
        Alert.alert('Tarifin yayımlandı', 'Tarifini profilindeki Tariflerim bölümünde bulabilirsin.', [
          { text: 'Profilime git', onPress: () => router.replace('/(tabs)/profile') },
        ]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tarif yayımlanamadı.');
    } finally {
      requestLock.current = false;
      void quotas.refresh();
      setBusy(null);
    }
  };

  const confirmPublish = () => {
    if (!editor || !accepted || busy) return;
    const invalid = publishValidation(editor);
    if (invalid) { setError(invalid); return; }
    Alert.alert('Tarifini herkese açık yayımla', 'Malzemeleri ve adımları kontrol ettiğinden emin misin? Yayımladığında tarifin herkes tarafından görülebilir.', [
      { text: 'Bir kez daha bakacağım', style: 'cancel' },
      { text: 'Evet, yayımla', onPress: () => { void publishApproved(); } },
    ]);
  };

  const renderIngredient = (ingredient: EditableIngredient, index: number) => {
    if (!editor) return null;
    const open = index === openIngredient;
    return <View key={'i' + index} style={styles.item}>
      <TouchableOpacity onPress={() => setOpenIngredient(open ? null : index)} accessibilityRole="button"
        accessibilityLabel={(ingredient.name || 'Yeni malzeme') + ' düzenle'} style={styles.itemHeader}>
        <View style={styles.dot} />
        <View style={styles.itemContent}>
          <Text style={styles.itemTitle}>{ingredient.name || 'Yeni malzeme'}</Text>
          <Text style={[styles.itemNote, !ingredient.source_verified && styles.amber]}>
            {!ingredient.source_verified ? 'Sen ekledin · kontrol et' : ingredient.name_corrected ? 'Yazım önerisi · kontrol et' : 'Kaynakla karşılaştırıldı'}
          </Text>
        </View>
        <Text style={styles.itemAmount}>{[ingredient.amount, ingredient.unit].filter(Boolean).join(' ') || 'Miktar belirtilmemiş'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color="#a39589" />
      </TouchableOpacity>
      {open && <View style={styles.itemEdit}>
        <EditorLabel>Malzemenin adı</EditorLabel>
        <SmallField value={ingredient.name} onChangeText={text => updateEditor(old => ({
          ...old, ingredients: old.ingredients.map((it, n) => n === index ? { ...it, name: text, userEdited: true } : it),
        }))} />
        <View style={styles.inputRow}>
          <View style={styles.inputHalf}><EditorLabel>Miktar</EditorLabel>
            <SmallField value={ingredient.amount} placeholder="Örn. 2" onChangeText={text => updateEditor(old => ({
              ...old, ingredients: old.ingredients.map((it, n) => n === index ? { ...it, amount: text, userEdited: true } : it),
            }))} /></View>
          <View style={styles.inputHalf}><EditorLabel>Birim</EditorLabel>
            <SmallField value={ingredient.unit} placeholder="Örn. kaşık" onChangeText={text => updateEditor(old => ({
              ...old, ingredients: old.ingredients.map((it, n) => n === index ? { ...it, unit: text, userEdited: true } : it),
            }))} /></View>
        </View>
        {ingredient.original_span ? <Text style={styles.evidence}>Kaynağındaki ifade: {ingredient.original_span}</Text> : null}
        <TouchableOpacity onPress={() => { updateEditor(old => ({ ...old, ingredients: old.ingredients.filter((_, n) => n !== index) })); setOpenIngredient(null); }}>
          <Text style={styles.remove}>Malzemeyi kaldır</Text>
        </TouchableOpacity>
      </View>}
    </View>;
  };

  const renderStep = (step: EditableStep, index: number) => {
    if (!editor) return null;
    const open = openStep === index;
    return <View key={'s' + index} style={styles.item}>
      <TouchableOpacity style={styles.itemHeader} onPress={() => setOpenStep(open ? null : index)} accessibilityRole="button">
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
        <View style={styles.itemContent}>
          <Text style={styles.stepContent} numberOfLines={open ? undefined : 3}>{step.content || 'Yeni hazırlanış adımı'}</Text>
          <Text style={styles.itemNote}>{step.editorial_rewrite ? 'Editoryal öneri · kontrol et' : 'Kaynakla karşılaştırıldı'}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color="#a39589" />
      </TouchableOpacity>
      {open && <View style={styles.itemEdit}>
        <EditorLabel>Hazırlanış adımı</EditorLabel>
        <SmallField value={step.content} multiline onChangeText={text => updateEditor(old => ({
          ...old, steps: old.steps.map((item, n) => n === index ? { ...item, content: text, userEdited: true } : item),
        }))} />
        {step.original_span ? <Text style={styles.evidence}>Kaynağındaki ifade: {step.original_span}</Text> : null}
        <TouchableOpacity onPress={() => { updateEditor(old => ({ ...old, steps: old.steps.filter((_, n) => n !== index) })); setOpenStep(null); }}>
          <Text style={styles.remove}>Adımı kaldır</Text>
        </TouchableOpacity>
      </View>}
    </View>;
  };

  const notes = preview ? importReviewNotes(preview.warnings, preview.needs_confirmation) : [];
  const remainingAI = quotas.data?.quotas.recipe_ai_day;
  const remainingPublish = quotas.data?.quotas.recipe_day;
  const quotaText = (value: typeof remainingAI) =>
    !value ? 'Kontrol ediliyor' : value.limit === null ? 'Sınırsız' : String(value.remaining) + ' / ' + String(value.limit);

  return <KeyboardAvoidingView style={[styles.root, { paddingBottom: insets.bottom }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>TARİFTEN · MUTFAK STÜDYOSU</Text>
        <Text style={styles.heading}>Tarifin, en güzel hâline geliyor.</Text>
        <Text style={styles.subtitle}>Sen anlat, Tariften düzenlesin. Son söz her zaman senin.</Text>
        <View style={styles.stageRow}><Text style={styles.stageActive}>01 · Metin</Text><Text style={styles.stageArrow}>→</Text><Text style={styles.stageInactive}>02 · Kontrol</Text><Text style={styles.stageArrow}>→</Text><Text style={styles.stageInactive}>03 · Onay</Text></View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeading}>Senin mutfak notların</Text>
        <Text style={styles.subtitle}>Annenin kalma, elinin alıştığı, sana özel...</Text>
        <EditorLabel>HADİ, TARİFİNİ ANLAT</EditorLabel>
        <TextInput
          value={source} onChangeText={updateSource} placeholder="Malzemeleri ve pişirme adımlarını kendi kelimelerinle yaz..."
          placeholderTextColor="#a59b95" multiline textAlignVertical="top" editable={!busy}
          style={styles.sourceInput}
          maxLength={20000}
        />
        <Text style={styles.small}>Notlarının tamamı kaynağa bağlı kalınarak düzenlenir. Karakter: {source.length}</Text>
        <View style={styles.quotaRow}>
          <Text style={styles.quotaLabel}>Bugünkü AI düzenleme hakkın</Text>
          <Text style={styles.quotaValue}>{quotaText(remainingAI)}</Text>
        </View>
        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text></View> : null}
        <TouchableOpacity style={[styles.mainButton, busy && styles.buttonDisabled]} disabled={!!busy || quotas.loading}
          onPress={() => { void requestPreview(); }} accessibilityRole="button">
          {busy === 'preview' ? <ActivityIndicator color="#fff" /> : <Ionicons name="sparkles" size={18} color="#fff" />}
          <Text style={styles.mainButtonText}>{busy === 'preview' ? 'Tarifin düzenleniyor…' : preview ? 'Önizlemeyi yeniden oluştur' : 'Tarifimi güzelleştir'}</Text>
        </TouchableOpacity>
        <Text style={[styles.small, styles.center]}>Yalnızca istersen başlar. Görsel oluşturulmaz; AI denemesi kullanım hakkından düşebilir.</Text>
      </View>

      {editor && preview ? <View style={styles.card}>
        <Text style={styles.cardHeading}>Düzenlenmiş tarifin</Text>
        <Text style={styles.subtitle}>Kaynağın sana ait, tüm öneriler onayına bağlı.</Text>
        {notes.length > 0 && <View style={styles.notice}>
          <Text style={styles.noticeTitle}>Tarifine son kez birlikte bakalım</Text>
          {notes.map(note => <Text key={note} style={styles.noticeText}>• {note}</Text>)}
        </View>}

        <EditorLabel>TARİFİNİN ADI</EditorLabel>
        <SmallField value={editor.title} onChangeText={text => updateEditor(old => ({ ...old, title: text }))} />
        <View style={styles.servingsBox}>
          <EditorLabel>KAÇ KİŞİLİK? *</EditorLabel>
          <SmallField value={editor.servings} keyboardType="number-pad" placeholder="Örn. 4"
            onChangeText={text => updateEditor(old => ({ ...old, servings: text }))} />
          <Text style={styles.small}>Porsiyonu malzeme ağırlığından tahmin etmiyoruz. Kişi sayısını sen belirle.</Text>
        </View>
        <EditorLabel>EDİTORYAL SPOT</EditorLabel>
        <SmallField value={editor.excerpt} multiline onChangeText={text => updateEditor(old => ({ ...old, excerpt: text }))} />

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Malzemeler · {editor.ingredients.length}</Text>
          <TouchableOpacity onPress={() => {
            if (editor.ingredients.length >= 40) return;
            updateEditor(old => ({ ...old, ingredients: [...old.ingredients, { name: '', amount: '', unit: '', original_span: '', source_verified: false, userEdited: true }] }));
            setOpenIngredient(editor.ingredients.length);
          }}><Text style={styles.add}>+ Ekle</Text></TouchableOpacity>
        </View>
        {editor.ingredients.map(renderIngredient)}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Yapılışı · {editor.steps.length}</Text>
          <TouchableOpacity onPress={() => {
            if (editor.steps.length >= 40) return;
            updateEditor(old => ({ ...old, steps: [...old.steps, { content: '', original_span: '', source_verified: false, userEdited: true }] }));
            setOpenStep(editor.steps.length);
          }}><Text style={styles.add}>+ Ekle</Text></TouchableOpacity>
        </View>
        {editor.steps.map(renderStep)}

        <TouchableOpacity style={styles.seoRow} onPress={() => setSeoOpen(v => !v)} accessibilityRole="button">
          <Text style={styles.seoTitle}>Tarifin daha kolay bulunsun</Text>
          <Ionicons name={seoOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#93796e" />
        </TouchableOpacity>
        {seoOpen && <View style={styles.seoFields}>
          <EditorLabel>SEO BAŞLIĞI</EditorLabel>
          <SmallField value={editor.seoTitle} onChangeText={text => updateEditor(old => ({ ...old, seoTitle: text }))} />
          <EditorLabel>SEO AÇIKLAMASI</EditorLabel>
          <SmallField value={editor.seoDescription} multiline onChangeText={text => updateEditor(old => ({ ...old, seoDescription: text }))} />
          <EditorLabel>ANAHTAR KELİMELER</EditorLabel>
          <SmallField value={editor.seoKeywords} onChangeText={text => updateEditor(old => ({ ...old, seoKeywords: text }))} />
        </View>}

        <View style={styles.publishCard}>
          <Text style={styles.sectionTitle}>Son kontrol ve yayımlama</Text>
          <Text style={styles.small}>Bugünkü tarif paylaşma hakkın: {quotaText(remainingPublish)}</Text>
          <View style={styles.consentRow}>
            <Switch value={accepted} onValueChange={setAccepted} trackColor={{ true: '#9dc6af', false: '#ded9d3' }} thumbColor={accepted ? '#377c55' : '#fff'} accessibilityLabel="Herkese açık yayımlama onayı" />
            <Text style={styles.consentText}>Tarifimin herkese açık yayımlanacağını biliyorum. Malzeme ve adımları yayından önce kontrol edebilirim.</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" disabled={!accepted || !!busy || quotas.loading}
            onPress={confirmPublish} style={[styles.mainButton, (!accepted || busy) && styles.buttonDisabled]}>
            {busy === 'publish' ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
            <Text style={styles.mainButtonText}>{busy === 'publish' ? 'Tarifin yayımlanıyor…' : 'Onayla ve yayımla'}</Text>
          </TouchableOpacity>
          <Text style={[styles.small, styles.center]}>Otomatik yayına alınmaz, görsel üretilmez.</Text>
        </View>
      </View> : null}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 16, paddingVertical: 20, gap: 14, paddingBottom: 44 },
  hero: { borderRadius: 26, borderWidth: 1, borderColor: '#eee0d4', backgroundColor: '#fff', padding: 20 },
  kicker: { color: BRAND, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heading: { color: '#152039', fontWeight: '900', fontSize: 26, lineHeight: 33, marginTop: 9, marginBottom: 6 },
  subtitle: { color: '#8f8277', fontSize: 12, lineHeight: 20 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 17, flexWrap: 'wrap' },
  stageActive: { color: '#bf5140', backgroundColor: '#fff0e9', paddingVertical: 7, paddingHorizontal: 11, borderRadius: 30, fontSize: 11, fontWeight: '800', overflow: 'hidden' },
  stageInactive: { color: '#b09c90', fontSize: 11, fontWeight: '700' },
  stageArrow: { color: '#cbb8ad' },
  card: { borderRadius: 25, borderWidth: 1, borderColor: '#eee1d6', backgroundColor: '#fff', padding: 16, gap: 10 },
  cardHeading: { color: '#152039', fontSize: 20, fontWeight: '900' },
  fieldLabel: { color: '#657389', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 6 },
  input: { borderColor: '#e9dcd2', borderWidth: 1, borderRadius: 13, minHeight: 48, paddingHorizontal: 14, color: '#273245', backgroundColor: '#fffcfa', fontSize: 14 },
  multiInput: { minHeight: 82, paddingVertical: 12, lineHeight: 21 },
  sourceInput: { color: '#253246', fontSize: 14, lineHeight: 24, borderColor: '#e9dcd2', backgroundColor: '#fffcfa', borderWidth: 1, borderRadius: 15, minHeight: 210, maxHeight: 360, padding: 15 },
  quotaRow: { borderColor: '#ebece9', borderWidth: 1, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 12 },
  quotaLabel: { color: '#5b687a', fontSize: 11, fontWeight: '700' },
  quotaValue: { color: BRAND, fontSize: 12, fontWeight: '800' },
  mainButton: { minHeight: 49, borderRadius: 12, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, paddingHorizontal: 12 },
  mainButtonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  buttonDisabled: { opacity: 0.45 },
  small: { color: '#8c9aac', fontSize: 11, lineHeight: 18 },
  center: { textAlign: 'center' },
  error: { backgroundColor: '#fff1ef', borderColor: '#fecaca', borderWidth: 1, borderRadius: 13, padding: 13 },
  errorText: { color: '#ab3830', fontSize: 12, lineHeight: 19 },
  notice: { borderRadius: 14, borderWidth: 1, borderColor: '#f5dca5', backgroundColor: '#fffaf0', padding: 13, gap: 7 },
  noticeTitle: { color: '#95602c', fontSize: 12, fontWeight: '800' },
  noticeText: { color: '#9b6536', fontSize: 11, lineHeight: 18 },
  servingsBox: { borderRadius: 14, borderWidth: 1, borderColor: '#f3dcc2', backgroundColor: '#fffbf4', padding: 12, gap: 6 },
  sectionRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: '#16223a', fontSize: 15, fontWeight: '900' },
  add: { color: BRAND, fontWeight: '700', fontSize: 12 },
  item: { borderColor: '#eee0d7', borderRadius: 14, borderWidth: 1, backgroundColor: '#fff', marginVertical: 2, overflow: 'hidden' },
  itemHeader: { padding: 11, flexDirection: 'row', alignItems: 'center', gap: 9 },
  itemContent: { flex: 1, minWidth: 0 },
  itemTitle: { color: '#283041', fontSize: 13, fontWeight: '800' },
  itemAmount: { color: '#937c69', fontSize: 11, maxWidth: 78, textAlign: 'right' },
  itemNote: { color: '#6baa7c', fontSize: 10, marginTop: 3 },
  amber: { color: '#bf7955' },
  dot: { width: 16, height: 16, borderRadius: 10, backgroundColor: '#ffe8d5', borderWidth: 2, borderColor: '#dfa978' },
  stepNumber: { width: 24, height: 24, borderRadius: 9, backgroundColor: '#fff0ec', alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { color: BRAND, fontWeight: '800', fontSize: 11 },
  stepContent: { color: '#31415b', fontSize: 12, lineHeight: 19 },
  itemEdit: { paddingHorizontal: 12, paddingBottom: 13, borderTopColor: '#f6ede6', borderTopWidth: 1, gap: 6 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1, gap: 6 },
  evidence: { color: '#8e7765', fontSize: 11, lineHeight: 18, backgroundColor: '#fff8f0', padding: 10, borderRadius: 10 },
  remove: { color: '#c0564b', fontSize: 11, fontWeight: '700', marginVertical: 5 },
  seoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 14, padding: 12, borderColor: '#eee0d6', borderWidth: 1, marginTop: 15 },
  seoTitle: { color: '#334155', fontSize: 13, fontWeight: '800' },
  seoFields: { gap: 7 },
  publishCard: { backgroundColor: '#f7f9f8', borderColor: '#e1e9e6', borderWidth: 1, borderRadius: 15, padding: 13, gap: 12, marginTop: 16 },
  consentRow: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#fff', borderRadius: 11, padding: 10 },
  consentText: { flex: 1, color: '#334155', fontSize: 11, lineHeight: 18 },
});
