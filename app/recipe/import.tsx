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
type Stage = 'source' | 'review';
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
  const [stage, setStage] = useState<Stage>('source');
  const scrollRef = useRef<ScrollView>(null);
  const servingsRef = useRef<TextInput>(null);
  const reviewCardY = useRef(0);
  const servingsY = useRef(0);
  const ingredientsY = useRef(0);
  const stepsY = useRef(0);
  const [fieldError, setFieldError] = useState<'servings' | null>(null);
  const [reviewNotesOpen, setReviewNotesOpen] = useState(false);
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
    setStage('source');
    setPreview(null);
    setEditor(null);
    setOpenIngredient(null);
    setOpenStep(null);
    setError('');
    setFieldError(null);
    setAccepted(true);
  };
  const updateEditor = (change: (value: ImportEditor) => ImportEditor) => {
    setEditor(old => old ? change(old) : null);
    setError('');
    setFieldError(null);
  };
  const scrollToSection = (section: 'servings' | 'ingredients' | 'steps') => {
    const y = section === 'servings' ? servingsY.current
      : section === 'ingredients' ? ingredientsY.current : stepsY.current;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, reviewCardY.current + y - 18),
        animated: true,
      });
    });
  };
  const checkBeforePublish = (): boolean => {
    if (!editor) return false;
    const invalid = publishValidation(editor);
    if (!invalid) return true;
    setError(invalid);
    if (!/^[1-9]\\d*$/.test(editor.servings.trim()) || Number(editor.servings) > 36) {
      setFieldError('servings');
      scrollToSection('servings');
      setTimeout(() => servingsRef.current?.focus(), 260);
    } else if (!editor.ingredients.length || editor.ingredients.some(i => !i.name.trim())) {
      const first = editor.ingredients.findIndex(i => !i.name.trim());
      if (first >= 0) setOpenIngredient(first);
      scrollToSection('ingredients');
    } else if (!editor.steps.length || editor.steps.some(item => !item.content.trim())) {
      const first = editor.steps.findIndex(item => !item.content.trim());
      if (first >= 0) setOpenStep(first);
      scrollToSection('steps');
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
    return false;
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
      setStage('review'); // Explicit next stage: never leave AI output below the source field.
      setAccepted(true);
      setReviewNotesOpen(false);
      setFieldError(null);
      setOpenIngredient(null);
      setOpenStep(null);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
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
    if (!checkBeforePublish()) return;
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
    if (!checkBeforePublish()) return;
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
        <View style={styles.ingredientMark}>
          <Ionicons name="leaf-outline" size={15} color="#af7055" />
        </View>
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

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {stage === 'source' ? <>
        <View style={styles.hero}>
          <Text style={styles.kicker}>TARİFTEN MUTFAK STÜDYOSU</Text>
          <Text style={styles.heading}>Sen anlat, biz düzenleyelim.</Text>
          <Text style={styles.subtitle}>Notlarını kendi kelimelerinle yaz. Tarifinin son sözü sende.</Text>
          <View style={styles.stageRow}>
            <Text style={styles.stageActive}>1 · Notların</Text>
            <Ionicons name="arrow-forward" size={15} color="#ad9c8f" />
            <Text style={styles.stageInactive}>2 · Tarifini kontrol et</Text>
          </View>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardHeading}>Senin mutfak notların</Text>
          <Text style={styles.subtitle}>Elinin alıştığı ölçüler, aileden kalan küçük sırlar...</Text>
          <EditorLabel>TARİFİNİ ANLAT</EditorLabel>
          <TextInput value={source} onChangeText={updateSource}
            placeholder="Örneğin: Önce soğanı rendele, üzerine domatesi ekle..."
            placeholderTextColor="#a59b95" multiline textAlignVertical="top" editable={!busy}
            style={styles.sourceInput} maxLength={20000} />
          <Text style={styles.small}>Notların yalnızca sen istersen yapay zekâyla düzenlenir. {source.length} karakter</Text>
          <View style={styles.quotaRow}>
            <Text style={styles.quotaLabel}>Bugünkü düzenleme hakkın</Text>
            <Text style={styles.quotaValue}>{quotaText(remainingAI)}</Text>
          </View>
          <Text style={styles.small}>Görsel oluşturulmaz. Önizleme denemesi AI hakkından düşebilir.</Text>
        </View>
      </> : editor && preview ? <>
        <View style={styles.reviewHero}>
          <View style={styles.reviewStep}><Ionicons name="checkmark" size={15} color="#25845e" />
            <Text style={styles.reviewStepText}>NOTLARIN DÜZENLENDİ</Text></View>
          <Text style={styles.heading}>Şimdi birlikte gözden geçirelim.</Text>
          <Text style={styles.subtitle}>Başlık, malzemeler ve yapılış hazır. Dilediğini değiştirebilirsin.</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.backToNotes} onPress={() => {
            setStage('source'); setError(''); setFieldError(null);
            requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
          }}>
            <Ionicons name="arrow-back" size={15} color={BRAND} />
            <Text style={styles.backToNotesText}>Mutfak notlarıma dön</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.card} onLayout={event => { reviewCardY.current = event.nativeEvent.layout.y; }}>
          <View style={styles.reviewHeading}>
            <Text style={styles.cardHeading}>Tarifinin son hâli</Text>
            <Text style={styles.reviewHint}>Değiştirilebilir önizleme · Henüz yayımlanmadı</Text>
          </View>
          <EditorLabel>TARİFİNİN ADI</EditorLabel>
          <SmallField value={editor.title} onChangeText={text => updateEditor(old => ({ ...old, title: text }))} />

          <View style={[styles.servingsBox, fieldError === 'servings' && styles.servingsInvalid]}
            onLayout={event => { servingsY.current = event.nativeEvent.layout.y; }}>
            <Text style={styles.servingsHeading}>Kaç kişilik?</Text>
            <Text style={styles.servingsDescription}>Bu bilgiyi sen belirlersin; malzeme miktarlarından tahmin etmiyoruz.</Text>
            <View style={styles.servingsChoices}>
              {[2, 4, 6, 8].map(count => <TouchableOpacity key={count}
                onPress={() => updateEditor(old => ({ ...old, servings: String(count) }))}
                accessibilityRole="button" accessibilityState={{ selected: editor.servings === String(count) }}
                style={[styles.servingsChoice, editor.servings === String(count) && styles.servingsChoiceSelected]}>
                <Text style={[styles.servingsChoiceText, editor.servings === String(count) && styles.servingsChoiceTextSelected]}>{count} kişilik</Text>
              </TouchableOpacity>)}
            </View>
            <Text style={styles.small}>Farklı bir kişi sayısı:</Text>
            <TextInput ref={servingsRef} value={editor.servings} keyboardType="number-pad"
              placeholder="1–36 arası" placeholderTextColor="#a79a91"
              onChangeText={text => updateEditor(old => ({ ...old, servings: text }))}
              style={[styles.input, fieldError === 'servings' && styles.invalidInput]}
              accessibilityLabel="Tarifin kaç kişilik olduğu" />
            {fieldError === 'servings' ? <Text accessibilityRole="alert" style={styles.inlineError}>
              Yayımlamadan önce kaç kişilik olduğunu seçmelisin (1–36).
            </Text> : null}
          </View>

          <EditorLabel>EDİTORYAL SPOT</EditorLabel>
          <SmallField value={editor.excerpt} multiline onChangeText={text => updateEditor(old => ({ ...old, excerpt: text }))} />

          {notes.length > 0 && <View style={styles.notice}>
            <TouchableOpacity style={styles.noticeToggle} accessibilityRole="button"
              accessibilityState={{ expanded: reviewNotesOpen }} onPress={() => setReviewNotesOpen(v => !v)}>
              <Ionicons name="information-circle-outline" size={18} color="#966335" />
              <Text style={styles.noticeTitle}>Tarifinde kontrol etmeni önerdiğimiz {notes.length} konu</Text>
              <Ionicons name={reviewNotesOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#966335" />
            </TouchableOpacity>
            {reviewNotesOpen && notes.map(note => <Text key={note} style={styles.noticeText}>• {note}</Text>)}
          </View>}

          <View style={styles.sectionRow} onLayout={event => { ingredientsY.current = event.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>Malzemeler · {editor.ingredients.length}</Text>
            <TouchableOpacity onPress={() => {
              if (editor.ingredients.length >= 40) return;
              updateEditor(old => ({ ...old, ingredients: [...old.ingredients, {
                name: '', amount: '', unit: '', original_span: '', source_verified: false, userEdited: true,
              }] }));
              setOpenIngredient(editor.ingredients.length);
            }}><Text style={styles.add}>+ Ekle</Text></TouchableOpacity>
          </View>
          {editor.ingredients.map(renderIngredient)}

          <View style={styles.sectionRow} onLayout={event => { stepsY.current = event.nativeEvent.layout.y; }}>
            <Text style={styles.sectionTitle}>Yapılışı · {editor.steps.length}</Text>
            <TouchableOpacity onPress={() => {
              if (editor.steps.length >= 40) return;
              updateEditor(old => ({ ...old, steps: [...old.steps, {
                content: '', original_span: '', source_verified: false, userEdited: true,
              }] }));
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
            <Text style={styles.sectionTitle}>Yayımlamaya hazır mısın?</Text>
            <Text style={styles.small}>Tarifin yalnızca sen onaylarsan herkese açık yayımlanır.</Text>
            <View style={styles.quotaRow}>
              <Text style={styles.quotaLabel}>Bugünkü tarif paylaşma hakkın</Text>
              <Text style={styles.quotaValue}>{quotaText(remainingPublish)}</Text>
            </View>
          </View>
        </View>
      </> : null}
    </ScrollView>

    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {error ? <Text accessibilityRole="alert" style={styles.footerError}>{error}</Text> : null}
      {stage === 'review' && editor && preview ? <>
        {!editor.servings.trim() && <TouchableOpacity style={styles.footerRequired}
          accessibilityRole="button" onPress={() => {
            scrollToSection('servings'); setTimeout(() => servingsRef.current?.focus(), 260);
          }}>
          <Ionicons name="alert-circle-outline" size={16} color="#b76b32" />
          <Text style={styles.footerRequiredText}>Yayımlamak için kaç kişilik olduğunu seç</Text>
          <Ionicons name="arrow-up" size={14} color="#b76b32" />
        </TouchableOpacity>}
        <View style={styles.footerConsentRow}>
          <Switch value={accepted} onValueChange={setAccepted}
            trackColor={{ true: '#8ccaae', false: '#e4dad3' }}
            thumbColor={accepted ? '#347d58' : '#fff'}
            accessibilityLabel="Herkese açık yayımlama onayı" />
          <Text style={styles.footerConsentText}>Tarifimi kontrol ettim. Herkese açık yayımlamayı onaylıyorum.</Text>
        </View>
      </> : null}
      <TouchableOpacity style={[styles.mainButton, (busy || quotas.loading) && styles.buttonDisabled]}
        disabled={!!busy || quotas.loading || (stage === 'review' && !accepted)}
        onPress={() => { if (stage === 'source') void requestPreview(); else confirmPublish(); }}
        accessibilityRole="button" accessibilityLabel={stage === 'source' ? 'Tarifimi güzelleştir' : 'Onayla ve yayımla'}>
        {busy ? <ActivityIndicator color="#fff" />
          : <Ionicons name={stage === 'source' ? 'sparkles' : 'checkmark-circle-outline'} size={19} color="#fff" />}
        <Text style={styles.mainButtonText}>{busy === 'preview' ? 'Tarifini düzenliyoruz…'
          : busy === 'publish' ? 'Tarifin yayımlanıyor…'
            : stage === 'source' ? 'Tarifimi güzelleştir' : 'Onayla ve yayımla'}</Text>
        {!busy && <Ionicons name="arrow-forward" size={17} color="#fff" />}
      </TouchableOpacity>
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  reviewHero: { borderRadius: 25, borderWidth: 1, borderColor: '#eaded5', backgroundColor: '#fff', padding: 20, gap: 9 },
  reviewStep: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewStepText: { fontSize: 10, color: '#25845e', fontWeight: '800', letterSpacing: 1 },
  backToNotes: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6, paddingVertical: 9 },
  backToNotesText: { color: BRAND, fontWeight: '700', fontSize: 12 },
  reviewHeading: { gap: 5, marginBottom: 5 },
  reviewHint: { color: '#96897e', fontSize: 11 },
  servingsHeading: { color: '#1f2f47', fontWeight: '900', fontSize: 17 },
  servingsDescription: { color: '#887f75', lineHeight: 18, fontSize: 11 },
  servingsChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 8 },
  servingsChoice: { borderRadius: 12, borderWidth: 1, borderColor: '#e8dbcf', paddingVertical: 9, paddingHorizontal: 11, backgroundColor: '#fff' },
  servingsChoiceSelected: { borderColor: BRAND, backgroundColor: '#fff0eb' },
  servingsChoiceText: { color: '#665c52', fontSize: 12, fontWeight: '700' },
  servingsChoiceTextSelected: { color: BRAND },
  servingsInvalid: { borderColor: '#dc7753', borderWidth: 2 },
  invalidInput: { borderColor: '#dc7753' },
  inlineError: { fontSize: 12, color: '#bd4d32', fontWeight: '700', lineHeight: 19 },
  ingredientMark: { width: 26, height: 26, borderRadius: 10, backgroundColor: '#fdf3ea', alignItems: 'center', justifyContent: 'center' },
  noticeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bottomBar: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderColor: '#f0e6dd', gap: 8 },
  footerConsentRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  footerConsentText: { flex: 1, fontSize: 11, color: '#49536a', lineHeight: 17 },
  footerRequired: { borderRadius: 11, backgroundColor: '#fff8ea', flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 10 },
  footerRequiredText: { flex: 1, color: '#a35d31', fontWeight: '700', fontSize: 11 },
  footerError: { color: '#b54237', fontSize: 12, lineHeight: 17, fontWeight: '700' },

  root: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, gap: 13, paddingBottom: 34 },
  hero: { borderRadius: 26, borderWidth: 1, borderColor: '#eee0d4', backgroundColor: '#fff', padding: 20 },
  kicker: { color: BRAND, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  heading: { color: '#152039', fontWeight: '900', fontSize: 23, lineHeight: 30, marginTop: 8, marginBottom: 4 },
  subtitle: { color: '#8f8277', fontSize: 12, lineHeight: 20 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' },
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
  servingsBox: { borderRadius: 16, borderWidth: 1, borderColor: '#f3dcc2', backgroundColor: '#fffbf4', padding: 13, gap: 6, marginVertical: 10 },
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
