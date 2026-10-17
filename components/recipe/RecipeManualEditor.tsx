import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { createRecipe, getRecipeById, getTerms, updateRecipe } from '../../lib/api';
import { fetchAccountQuotas, reached, resetDate, useQuotas } from '../../lib/quotas';
import { RequestDeadlineError, isPublishResultUncertain, withDeadline } from '../../lib/recipe-publish';
import { approvedManualPayload, draftFromRecipe, emptyRecipeDraft, EMPTY_INGREDIENT,
  validateManualDraft, type ManualField, type RecipeManualDraft } from '../../lib/manual-recipe';
import { prepareManualRecipePhoto, uploadManualRecipePhoto } from '../../lib/manual-recipe-image';
import LokmaIngredientIcon from '../LokmaIngredientIcon';

const RED = '#df5043', INK = '#1a283e';
type CategoryKey = 'cuisine' | 'meal_type' | 'difficulty' | 'diet';
const CATEGORY_LABELS: Record<CategoryKey, string> = {
  cuisine: 'Mutfak', meal_type: 'Öğün', difficulty: 'Zorluk', diet: 'Beslenme',
};
const CATEGORIES: CategoryKey[] = ['cuisine', 'meal_type', 'difficulty', 'diet'];
type Photo = Awaited<ReturnType<typeof prepareManualRecipePhoto>>;

function categoriesFromApi(raw: unknown): Record<CategoryKey, string[]> {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return Object.fromEntries(CATEGORIES.map(key => {
    const items = Array.isArray(data[key]) ? data[key] as unknown[] : [];
    const labels = items.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const entry = item as { name?: string; label?: string };
        return entry.name || entry.label || '';
      }
      return '';
    }).filter(Boolean);
    return [key, [...new Set(labels)].slice(0, 40)];
  })) as Record<CategoryKey, string[]>;
}

const stages = ['Tarif bilgileri', 'Malzemeler & yapılış', 'Son kontrol'];

export default function RecipeManualEditor({ recipeId }: { recipeId?: number }) {
  const editing = Number.isInteger(recipeId) && Number(recipeId) > 0;
  const { token, user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const quotas = useQuotas(token);
  const scrollRef = useRef<ScrollView>(null);
  const titleRef = useRef<TextInput>(null);
  const servingsRef = useRef<TextInput>(null);
  const busyRef = useRef(false);
  const finishedRef = useRef(false);
  const uploadedPhotoRef = useRef<{ uri: string; id: number } | null>(null);
  const [stage, setStage] = useState(0);
  const [draft, setDraft] = useState<RecipeManualDraft>(emptyRecipeDraft);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [options, setOptions] = useState<Record<CategoryKey, string[]>>({
    cuisine: [], meal_type: [], difficulty: [], diet: [],
  });
  const [loading, setLoading] = useState(editing);
  const [busy, setBusy] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [slow, setSlow] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<ManualField | null>(null);

  useEffect(() => {
    let mounted = true;
    getTerms().then(terms => { if (mounted) setOptions(categoriesFromApi(terms)); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!editing || authLoading || !token || !user) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      const existing = await getRecipeById(Number(recipeId));
      if (!mounted) return;
      if (!existing) { setError('Tarif bulunamadı.'); return; }
      // Backend enforces permissions too. Never expose edit actions on another
      // author's public recipe from this user-facing editor.
      if (Number(existing.author?.id) !== Number(user.id)) {
        setError('Yalnızca kendi tarifini düzenleyebilirsin.');
        return;
      }
      setDraft(draftFromRecipe(existing));
    })().catch(err => {
      if (mounted) setError(err instanceof Error ? err.message : 'Tarif yüklenemedi.');
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [authLoading, editing, recipeId, token, user?.id]);

  useEffect(() => {
    if (!busy) { setSlow(false); return; }
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [busy]);

  const setField = <K extends keyof RecipeManualDraft>(field: K, value: RecipeManualDraft[K]) => {
    setDraft(prev => ({ ...prev, [field]: value }));
    setError(''); setInvalidField(null);
  };
  const jump = (next: number) => {
    setStage(next);
    setError(''); setInvalidField(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  };
  const requireField = (field: ManualField, message: string) => {
    setInvalidField(field); setError(message);
    if (field === 'title' || field === 'servings' || field === 'prep_time' || field === 'cook_time' || field === 'calories') {
      jump(0); // jump clears errors, so restore the actionable message afterward.
      setInvalidField(field); setError(message);
      if (field === 'title') setTimeout(() => titleRef.current?.focus(), 250);
      if (field === 'servings') setTimeout(() => servingsRef.current?.focus(), 250);
    } else {
      jump(1); setInvalidField(field); setError(message);
    }
  };
  const goNext = () => {
    if (stage === 0) {
      if (!draft.title.trim()) { requireField('title', 'Önce tarifine bir isim ver.'); return; }
      if (draft.title.length > 180) { requireField('title', 'Tarif adını biraz kısalt.'); return; }
      if (!/^[1-9]\d*$/.test(draft.servings.trim()) || Number(draft.servings) > 36) {
        requireField('servings', 'Kaç kişilik olduğunu seç (1–36).'); return;
      }
      jump(1); return;
    }
    const validation = validateManualDraft(draft);
    if (validation) { requireField(validation.field, validation.message); return; }
    jump(2);
  };

  const pickImage = async () => {
    if (busy) return;
    try {
      const permissions = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissions.granted) {
        Alert.alert('Fotoğraf izni', 'Tarifine görsel eklemek için fotoğraf kitaplığına izin vermelisin.');
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images', allowsEditing: true, aspect: [4, 3], quality: 0.85,
      });
      if (picked.canceled || !picked.assets[0]) return;
      const processed = await prepareManualRecipePhoto(picked.assets[0]);
      setPhoto(processed); setPhotoPreview(processed.uri);
      uploadedPhotoRef.current = null; setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Fotoğraf seçilemedi.');
    }
  };

  const save = async () => {
    if (!token || !user || busyRef.current || finishedRef.current || uncertain) return;
    const issue = validateManualDraft(draft);
    if (issue) { requireField(issue.field, issue.message); return; }
    busyRef.current = true; setBusy(true); setError('');
    let writeStarted = false;
    try {
      // A new recipe consumes the Core recipe_day quota; editing doesn't.
      if (!editing) {
        const rights = await withDeadline(signal => fetchAccountQuotas(token, signal), 15000);
        if (reached(rights, 'recipe_day')) {
          setError('Bugünkü tarif paylaşma hakkın doldu. Yenilenme: ' + resetDate(rights, 'recipe_day'));
          return;
        }
      }
      let image: number | string = draft.image;
      if (photo) {
        const already = uploadedPhotoRef.current;
        if (already?.uri === photo.uri) image = already.id;
        else {
          setSavingImage(true);
          const asset = await withDeadline(() => uploadManualRecipePhoto(token, photo), 60000);
          uploadedPhotoRef.current = { uri: photo.uri, id: asset.id };
          image = asset.id;
          setSavingImage(false);
        }
      }
      const values = approvedManualPayload(draft, image);
      writeStarted = true;
      const result = editing
        ? await withDeadline(signal => updateRecipe(token, { ...values, id: recipeId }, signal), 45000)
        : await withDeadline(signal => createRecipe(token, values, signal), 45000);
      const slug = result?.slug;
      finishedRef.current = true;
      void quotas.refresh();
      if (typeof slug === 'string' && slug.trim()) router.replace('/recipe/' + encodeURIComponent(slug));
      else Alert.alert('Tarifin kaydedildi', 'Tarifini profilindeki Tariflerim bölümünde bulabilirsin.', [
        { text: 'Profilime git', onPress: () => router.replace('/(tabs)/profile') },
      ]);
    } catch (cause) {
      if (writeStarted && isPublishResultUncertain(cause)) {
        setUncertain(true);
        setError('Sunucudan kayıt yanıtı alamadık. Tarifin kaydedilmiş olabilir; yeniden kaydetmeden önce Tariflerim bölümünü kontrol et.');
      } else if (cause instanceof RequestDeadlineError && !writeStarted) {
        setError('Bağlantı zaman aşımına uğradı. Henüz tarif gönderilmedi. Fotoğraf yüklemen sonuçlanmış olabilir.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Tarif kaydedilemedi.');
      }
    } finally {
      setSavingImage(false); setBusy(false); busyRef.current = false;
    }
  };

  const confirmSave = () => {
    const issue = validateManualDraft(draft);
    if (issue) { requireField(issue.field, issue.message); return; }
    Alert.alert(editing ? 'Değişiklikler kaydedilsin mi?' : 'Tarifin yayımlansın mı?',
      editing ? 'Tarifinin mevcut sayfası yeni bilgilerle güncellenecek.'
        : 'Tarifin herkese açık olarak yayımlanacak. Son sözü sen söylersin.',
      [{ text: 'Vazgeç', style: 'cancel' },
        { text: editing ? 'Kaydet' : 'Onayla ve yayımla', onPress: () => { void save(); } }]);
  };

  const ingredientEdit = (index: number, field: 'name'|'amount'|'unit', value: string) => {
    setField('ingredients', draft.ingredients.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };
  const input = (label: string, value: string, onChange: (value: string) => void,
    opts: { placeholder?: string; multiline?: boolean; numeric?: boolean; inputRef?: React.Ref<TextInput>; error?: boolean } = {}) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput ref={opts.inputRef} style={[styles.input, opts.multiline && styles.multiline, opts.error && styles.inputError]}
        value={value} onChangeText={onChange}
        placeholder={opts.placeholder} placeholderTextColor="#aaa09a"
        keyboardType={opts.numeric ? 'number-pad' : 'default'}
        multiline={opts.multiline} textAlignVertical="top"
        editable={!busy} accessibilityLabel={label} />
    </View>
  );
  const subtitle = editing ? 'Tarifinin bilgilerini dilediğin gibi güncelle.' : 'Tarifini kendi kelimelerinle oluştur. AI kullanımı gerekmez.';

  if (authLoading || loading) return <View style={styles.loading}><ActivityIndicator color={RED} size="large" /></View>;
  if (!token || !user) return <View style={styles.loading}>
    <Text style={styles.empty}>Tarif oluşturmak için giriş yapmalısın.</Text>
    <TouchableOpacity style={styles.action} onPress={() => router.push('/login')}><Text style={styles.actionText}>Giriş yap</Text></TouchableOpacity>
  </View>;
  if (editing && error && !draft.title) return <View style={styles.loading}>
    <Text style={styles.error}>{error}</Text>
    <TouchableOpacity style={styles.action} onPress={() => router.replace('/(tabs)/profile')}><Text style={styles.actionText}>Tariflerime dön</Text></TouchableOpacity>
  </View>;

  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>TARİFTEN MUTFAK STÜDYOSU</Text>
        <Text style={styles.heading}>{editing ? 'Tarifini düzenle.' : 'Kendi tarifini oluştur.'}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.stages}>
          {stages.map((text, index) => <View key={text} style={[styles.stepPill, index === stage && styles.stepActive]}>
            <Text style={[styles.stepText, index === stage && styles.stepActiveText]}>{index + 1} · {text}</Text>
          </View>)}
        </View>
      </View>

      {stage === 0 ? <View style={styles.card}>
        <Text style={styles.section}>Tarifinin hikâyesi</Text>
        <Text style={styles.hint}>Önce temel bilgileri tamamlayalım.</Text>
        {input('Tarifin adı *', draft.title, value => setField('title', value),
          { placeholder: 'Örn. Anne usulü taze fasulye', inputRef: titleRef, error: invalidField === 'title' })}
        {input('Kısa açıklama', draft.excerpt, value => setField('excerpt', value),
          { multiline: true, placeholder: 'Bu tarifi özel yapan ne?' })}
        <View style={[styles.servingsCard, invalidField === 'servings' && styles.inputError]}>
          <Text style={styles.servingsTitle}>Kaç kişilik? *</Text>
          <Text style={styles.hint}>Bu bilgiyi sen belirlersin; malzemelerden tahmin etmiyoruz.</Text>
          <View style={styles.servingsRow}>{[2,4,6,8].map(value =>
            <TouchableOpacity key={value} onPress={() => setField('servings', String(value))}
              style={[styles.servingChip, draft.servings === String(value) && styles.chipSelected]}>
              <Text style={[styles.chipText, draft.servings === String(value) && styles.selectedText]}>{value} kişilik</Text>
            </TouchableOpacity>)}</View>
          {input('Farklı bir sayı', draft.servings, value => setField('servings', value),
            { numeric: true, placeholder: '1–36', inputRef: servingsRef, error: invalidField === 'servings' })}
        </View>
        <View style={styles.twoColumns}>
          {(['prep_time', 'cook_time', 'calories'] as const).map((field, i) =>
            <View key={field} style={styles.col}>
              {input(['Hazırlık (dk)', 'Pişirme (dk)', 'Kalori'][i], draft[field],
                value => setField(field, value), { numeric: true })}
            </View>)}
        </View>

        <View style={styles.photoHeader}>
          <Text style={styles.section}>Tarif fotoğrafı</Text>
          <Text style={styles.hint}>İsteğe bağlı · JPG, PNG veya HEIC seçebilirsin.</Text>
        </View>
        <TouchableOpacity onPress={() => { void pickImage(); }} style={styles.photoCard}
          accessibilityRole="button" accessibilityLabel="Tarif fotoğrafı seç veya değiştir">
          {(photoPreview || draft.image && typeof draft.image === 'string') ?
            <Image source={{ uri: photoPreview || String(draft.image) }} style={styles.photo} contentFit="cover" /> :
            <View style={styles.photoEmpty}><Ionicons name="camera-outline" size={28} color="#d75e4c" />
              <Text style={styles.photoEmptyText}>Galeriden fotoğraf seç</Text></View>}
          <View style={styles.photoBadge}><Ionicons name="camera" size={14} color={RED} /><Text style={styles.photoBadgeText}>Fotoğrafı {photoPreview || draft.image ? 'değiştir' : 'ekle'}</Text></View>
        </TouchableOpacity>
        <Text style={styles.hint}>Fotoğrafın kaydetme sırasında güvenli biçimde yüklenir. Yapay zekâyla görsel üretilmez.</Text>

        {CATEGORIES.map(key => options[key].length ? <View key={key} style={styles.field}>
          <Text style={styles.label}>{CATEGORY_LABELS[key]}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
            <TouchableOpacity style={[styles.category, !draft[key].length && styles.categoryActive]}
              onPress={() => setField(key, [])}><Text style={styles.categoryText}>Belirtilmemiş</Text></TouchableOpacity>
            {[...new Set([...draft[key], ...options[key]])].map(term =>
              <TouchableOpacity key={term} style={[styles.category, draft[key].includes(term) && styles.categoryActive]}
                onPress={() => setField(key, draft[key].includes(term) ? [] : [term])}>
                <Text style={styles.categoryText}>{term}</Text>
              </TouchableOpacity>)}
          </ScrollView>
        </View> : null)}
      </View> : null}

      {stage === 1 ? <View style={styles.card}>
        <View style={styles.cardTop}><View><Text style={styles.section}>Malzemeler</Text>
          <Text style={styles.hint}>Ne kadar kullanıyorsan öyle yaz.</Text></View>
          <Text style={styles.counter}>{draft.ingredients.length} malzeme</Text></View>
        {draft.ingredients.map((item, index) => <View key={'ingredient-'+index} style={styles.ingredientCard}>
          <View style={styles.ingredientHeader}>
            <LokmaIngredientIcon name={item.name} size={26} />
            <Text style={styles.ingredientNumber}>Malzeme {index+1}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Malzeme ${index+1} sil`}
              disabled={draft.ingredients.length < 2} onPress={() =>
                setField('ingredients', draft.ingredients.filter((_, i) => i !== index))}>
              <Ionicons name="trash-outline" size={19} color="#b18b78" />
            </TouchableOpacity>
          </View>
          {input('Malzeme adı', item.name, text => ingredientEdit(index, 'name', text), { placeholder: 'Örn. Domates' })}
          <View style={styles.twoColumns}>
            <View style={styles.col}>{input('Miktar (isteğe bağlı)', item.amount, text => ingredientEdit(index, 'amount', text), { placeholder: 'Örn. 2' })}</View>
            <View style={styles.col}>{input('Birim', item.unit, text => ingredientEdit(index, 'unit', text), { placeholder: 'Örn. adet' })}</View>
          </View>
          {!item.amount.trim() ? <Text style={styles.unknown}>Miktar belirtmedin; tahmin etmiyoruz.</Text> : null}
        </View>)}
        <TouchableOpacity style={styles.add} onPress={() => draft.ingredients.length < 40 &&
          setField('ingredients', [...draft.ingredients, EMPTY_INGREDIENT()])}>
          <Ionicons name="add-circle-outline" size={18} color={RED} /><Text style={styles.addText}>Malzeme ekle</Text>
        </TouchableOpacity>
        <View style={styles.divider} />
        <Text style={styles.section}>Adım adım yapılış</Text>
        <Text style={styles.hint}>Her adımı ayrı yaz. Söylemediğin süreleri eklemiyoruz.</Text>
        {draft.steps.map((step, index) => <View key={'step-'+index} style={styles.ingredientCard}>
          <View style={styles.ingredientHeader}><Text style={styles.stepNumber}>{index+1}</Text>
            <Text style={styles.ingredientNumber}>Adım {index+1}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Adım ${index+1} sil`}
              disabled={draft.steps.length < 2}
              onPress={() => setField('steps', draft.steps.filter((_, i) => i !== index))}>
              <Ionicons name="trash-outline" size={19} color="#b18b78" />
            </TouchableOpacity></View>
          {input('Hazırlanış', step,
            text => setField('steps', draft.steps.map((value, i) => i === index ? text : value)),
            { multiline: true, placeholder: 'Örn. Soğanları ince ince doğra.' })}
        </View>)}
        <TouchableOpacity style={styles.add} onPress={() => draft.steps.length < 40 &&
          setField('steps', [...draft.steps, ''])}>
          <Ionicons name="add-circle-outline" size={18} color={RED} /><Text style={styles.addText}>Yeni adım ekle</Text>
        </TouchableOpacity>
        {input('Şefin ipucu (isteğe bağlı)', draft.chef_tip, text => setField('chef_tip', text),
          { multiline: true, placeholder: 'Bu tarifi yaparken öğrendiğin küçük bir sır...' })}
      </View> : null}

      {stage === 2 ? <View style={styles.card}>
        <View style={styles.ready}><Ionicons name="checkmark-circle" size={26} color="#329268" />
          <View style={styles.col}><Text style={styles.section}>Son kez birlikte bakalım</Text>
            <Text style={styles.hint}>Tarifin yalnızca sen onaylayınca kaydedilir.</Text></View></View>
        {photoPreview || typeof draft.image === 'string' && draft.image ?
          <Image style={styles.photoReview} source={{ uri: photoPreview || String(draft.image) }} contentFit="cover" /> : null}
        <Text style={styles.reviewTitle}>{draft.title.trim()}</Text>
        <Text style={styles.reviewExcerpt}>{draft.excerpt.trim() || 'Kısa açıklama eklenmedi.'}</Text>
        <View style={styles.reviewStats}><Text style={styles.stat}>{draft.servings} kişilik</Text>
          <Text style={styles.stat}>{draft.ingredients.length} malzeme</Text>
          <Text style={styles.stat}>{draft.steps.length} adım</Text></View>
        <Text style={styles.section}>Malzemeler</Text>
        {draft.ingredients.map((item,i) => <View key={i} style={styles.reviewRow}>
          <LokmaIngredientIcon name={item.name} size={23} />
          <Text style={styles.reviewCopy}>{[item.amount, item.unit, item.name].filter(Boolean).join(' ')}</Text></View>)}
        <Text style={[styles.section,{marginTop:14}]}>Yapılışı</Text>
        {draft.steps.map((step,i) => <View key={i} style={styles.reviewRow}>
          <Text style={styles.stepNumber}>{i+1}</Text><Text style={styles.reviewCopy}>{step}</Text></View>)}
        <TouchableOpacity style={styles.reviewBack} onPress={() => jump(1)}><Text style={styles.addText}>Malzemeleri ve adımları düzenle</Text></TouchableOpacity>
        <Text style={styles.publishNote}>{editing ?
          'Kaydettiğinde tarifin mevcut herkese açık sayfası güncellenir.' :
          'Tarifin herkese açık yayımlanacak. Son kontrol ve onay senin elinde.'}</Text>
        {!editing ? <Text style={styles.hint}>Bugünkü tarif hakkın: {quotas.data?.quotas?.recipe_day?.remaining === null ? 'Sınırsız' : quotas.data?.quotas?.recipe_day?.remaining ?? 'Kontrol ediliyor'}</Text> : null}
      </View> : null}
    </ScrollView>
    <View style={[styles.footer,{ paddingBottom: Math.max(insets.bottom,12) }]}>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {slow && busy ? <Text style={styles.hint}>Sunucunun yanıtını bekliyoruz; yeniden göndermiyoruz.</Text> : null}
      {uncertain ? <TouchableOpacity style={styles.action} onPress={() => router.replace('/(tabs)/profile')}>
        <Text style={styles.actionText}>Tariflerimde kontrol et</Text></TouchableOpacity> : <>
        <View style={styles.footerButtons}>
          {stage > 0 ? <TouchableOpacity style={styles.secondary} disabled={busy} onPress={() => jump(stage-1)}>
            <Ionicons name="arrow-back" size={18} color={INK} /><Text style={styles.secondaryText}>Geri</Text>
          </TouchableOpacity> : null}
          <TouchableOpacity style={[styles.action, busy && styles.disabled]} disabled={busy}
            onPress={stage === 2 ? confirmSave : goNext}>
            {busy ? <ActivityIndicator color="#ffffff" /> : <Ionicons name={stage === 2 ? 'checkmark-circle-outline' : 'arrow-forward'} size={18} color="#ffffff" />}
            <Text style={styles.actionText}>{busy ? savingImage ? 'Fotoğraf yükleniyor…' : 'Tarifin kaydediliyor…'
              : stage === 2 ? editing ? 'Değişiklikleri kaydet' : 'Onayla ve yayımla' : 'Devam et'}</Text>
          </TouchableOpacity>
        </View>
      </>}
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root:{ flex:1, backgroundColor:'#fffbf7' }, loading:{ flex:1, backgroundColor:'#fffbf7',justifyContent:'center',alignItems:'center',padding:24,gap:20 },
  scroll:{ padding:15, paddingTop:18, paddingBottom:35, gap:14 },
  hero:{ borderRadius:23,backgroundColor:'#fff',borderWidth:1,borderColor:'#f0e2d8',padding:20,gap:8 },
  kicker:{color:RED,fontSize:10,fontWeight:'900',letterSpacing:1.2},
  heading:{fontSize:26,lineHeight:33,fontWeight:'900',color:INK,letterSpacing:-0.4},
  subtitle:{fontSize:13,color:'#918077',lineHeight:20},
  stages:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:12},
  stepPill:{paddingHorizontal:9,paddingVertical:7,borderRadius:10,backgroundColor:'#faf4ee',borderWidth:1,borderColor:'#f1e4dc'},
  stepActive:{backgroundColor:'#fceae5',borderColor:'#e7b8aa'},
  stepText:{fontSize:10,color:'#977e6f',fontWeight:'700'},
  stepActiveText:{color:RED,fontWeight:'900'},
  card:{backgroundColor:'#fff',borderRadius:22,borderWidth:1,borderColor:'#eee2da',padding:15,gap:13},
  cardTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
  section:{fontSize:18,fontWeight:'900',color:INK,letterSpacing:-0.3},
  hint:{fontSize:11,color:'#99887a',lineHeight:17},
  field:{gap:6,flexShrink:1},
  label:{fontSize:11,fontWeight:'800',color:'#59647a'},
  input:{borderRadius:13,borderColor:'#ecdcd1',borderWidth:1,backgroundColor:'#fffcfa',paddingHorizontal:13,paddingVertical:11,minHeight:44,fontSize:14,color:INK},
  multiline:{minHeight:85},
  inputError:{borderColor:'#e2654a',borderWidth:1.5},
  servingsCard:{borderRadius:18,padding:13,backgroundColor:'#fff9f2',borderWidth:1,borderColor:'#f1e1cc',gap:9},
  servingsTitle:{fontSize:16,color:INK,fontWeight:'900'},
  servingsRow:{flexDirection:'row',flexWrap:'wrap',gap:7},
  servingChip:{paddingVertical:10,paddingHorizontal:11,borderWidth:1,borderColor:'#ead8ca',borderRadius:10,backgroundColor:'#fff'},
  chipSelected:{borderColor:RED,backgroundColor:'#fff0eb'},
  chipText:{fontSize:12,fontWeight:'700',color:'#7b645a'},
  selectedText:{color:RED},
  twoColumns:{flexDirection:'row',gap:10},
  col:{flex:1,minWidth:0},
  photoHeader:{gap:5,marginTop:6},
  photoCard:{borderRadius:18,overflow:'hidden',backgroundColor:'#fff8f3',borderWidth:1,borderColor:'#efddd0',height:190},
  photo:{width:'100%',height:'100%'},
  photoEmpty:{flex:1,justifyContent:'center',alignItems:'center',gap:8},
  photoEmptyText:{color:'#bc6a57',fontSize:13,fontWeight:'800'},
  photoBadge:{position:'absolute',right:10,bottom:10,borderRadius:12,padding:9,backgroundColor:'#fff',flexDirection:'row',gap:6,alignItems:'center'},
  photoBadgeText:{color:RED,fontWeight:'800',fontSize:11},
  categories:{paddingVertical:3,gap:7},
  category:{borderRadius:11,borderWidth:1,borderColor:'#ecddd1',paddingVertical:8,paddingHorizontal:12,backgroundColor:'#fff9f3'},
  categoryActive:{borderColor:RED,backgroundColor:'#ffede6'},
  categoryText:{fontSize:11,color:'#665448',fontWeight:'700'},
  counter:{fontSize:11,color:'#bb7766',fontWeight:'800'},
  ingredientCard:{padding:11,borderRadius:16,borderWidth:1,borderColor:'#f0e3d8',gap:9,backgroundColor:'#fffcfa'},
  ingredientHeader:{flexDirection:'row',gap:9,alignItems:'center'},
  ingredientNumber:{flex:1,fontSize:12,color:INK,fontWeight:'900'},
  unknown:{fontSize:10,color:'#bd8747'},
  stepNumber:{fontSize:12,color:RED,fontWeight:'900',backgroundColor:'#ffede5',overflow:'hidden',minWidth:27,height:27,textAlign:'center',textAlignVertical:'center',lineHeight:27,borderRadius:9},
  add:{borderRadius:13,borderWidth:1,borderColor:'#ecd3c9',borderStyle:'dashed',minHeight:42,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8},
  addText:{fontSize:12,color:RED,fontWeight:'900'},
  divider:{height:1,backgroundColor:'#f0e3db',marginVertical:6},
  ready:{flexDirection:'row',gap:10,alignItems:'center'},
  photoReview:{width:'100%',height:175,borderRadius:16},
  reviewTitle:{fontSize:20,fontWeight:'900',color:INK},
  reviewExcerpt:{fontSize:13,lineHeight:21,color:'#86796e'},
  reviewStats:{flexDirection:'row',flexWrap:'wrap',gap:7},
  stat:{color:'#b06455',fontWeight:'800',fontSize:11,backgroundColor:'#fff3ee',paddingHorizontal:9,paddingVertical:6,borderRadius:10},
  reviewRow:{minHeight:39,flexDirection:'row',alignItems:'center',gap:9,paddingVertical:5},
  reviewCopy:{flex:1,color:'#364255',lineHeight:19,fontSize:12},
  reviewBack:{paddingVertical:10},
  publishNote:{fontSize:12,lineHeight:18,color:'#7e766e',backgroundColor:'#fff8ed',padding:12,borderRadius:12},
  footer:{paddingHorizontal:15,paddingTop:10,backgroundColor:'#fff',borderTopWidth:1,borderColor:'#f1e3d9',gap:8},
  footerButtons:{flexDirection:'row',gap:9},
  action:{backgroundColor:RED,flex:1,minHeight:49,borderRadius:13,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,paddingHorizontal:13},
  actionText:{color:'#fff',fontSize:13,fontWeight:'900'},
  disabled:{opacity:0.5},
  secondary:{borderRadius:13,backgroundColor:'#f6f1ed',paddingHorizontal:15,minHeight:49,flexDirection:'row',alignItems:'center',gap:5},
  secondaryText:{fontSize:12,fontWeight:'800',color:INK},
  error:{color:'#b53d30',fontSize:12,lineHeight:17,fontWeight:'700',textAlign:'center'},
  empty:{color:INK,fontSize:15,fontWeight:'700'},
});
