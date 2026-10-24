import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { getTerms } from '../../lib/api';
import { fetchAccountQuotas, reached, resetDate, useQuotas } from '../../lib/quotas';
import {
  NOTEBOOK_MAX_PAGES, PHOTO_NOTE_MAX, addPages, confidenceText, isLowConfidence, movePage,
  needsAllergenAcknowledgement, removePage, uncertainIngredientNote, uncertainStepNote,
  unresolvedUncertainCount, validatePhotoDraft,
  type PhotoMode, type PhotoPreview, type RecipeVisibility,
} from '../../lib/photo-recipe';
import { PhotoRecipeError, previewPhotoRecipe, savePhotoRecipe } from '../../lib/photo-recipe-api';
import { pickPhotos, preparePhoto, takePhoto, type LocalPhoto } from '../../lib/photo-recipe-image';
import type { QuickRecipeDraft } from '../../lib/quick-recipe-review';
import { isFeatureUnavailable, markFeatureAvailable, markFeatureUnavailable, useFeatureAvailability } from '../../lib/feature-availability';
import { afterModalDismiss } from '../../lib/allergen-alerts';
import { useKitchenProfile } from '../../lib/kitchen-profile';
import { joinTr } from '../../lib/allergen-ui';
import QuickRecipeReview from './QuickRecipeReview';
import AiEstimatedBadge from './AiEstimatedBadge';
import { AccentText } from '../ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { maybeAskForReview } from '../../lib/review-prompt';

type Busy = 'preview' | 'save' | null;

const COPY: Record<PhotoMode, {
  kicker: string; heading: string; subtitle: string; step: string; notePlaceholder: string; button: string; busy: string;
}> = {
  dish: {
    kicker: 'Fotoğraftan tarif',
    heading: 'Tabağı *tarife* çevir.',
    subtitle: 'Restoranda yediğin ya da evde gördüğün bir yemeğin fotoğrafını çek. Tahmini bir tarif hazırlayalım; son kararı sen ver.',
    step: 'Fotoğrafın',
    notePlaceholder: 'Örn. restoranda yedim, acılıydı',
    button: 'Tarifi hazırla',
    busy: 'Fotoğrafın inceleniyor…',
  },
  notebook: {
    kicker: 'Defterden tarif',
    heading: 'Defterini *dijitale* taşı.',
    subtitle: 'El yazısı ya da basılı tarif sayfalarının fotoğrafını çek. Yazılanı olduğu gibi aktaralım; emin olmadığımız yerleri işaretleriz.',
    step: 'Sayfaların',
    notePlaceholder: 'Örn. Anneannemin kurabiyesi',
    button: 'Sayfaları yazıya dök',
    busy: 'Sayfaların okunuyor…',
  },
};

function termNames(raw: unknown, key: 'cuisine' | 'meal_type'): string[] {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const items = Array.isArray(data[key]) ? data[key] as unknown[] : [];
  return [...new Set(items.map(item => typeof item === 'string' ? item
    : item && typeof item === 'object' ? String((item as { name?: string; label?: string }).name || (item as { label?: string }).label || '') : '')
    .filter(Boolean))].slice(0, 40);
}

/**
 * "+" → Fotoğraftan tarif (one dish photo) or Defterden tarif (1–4 pages).
 * Preview first (no recipe yet), then the shared AI recipe editor, then a
 * private-by-default save.
 */
export default function PhotoRecipeFlow({ mode }: { mode: PhotoMode }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const quotas = useQuotas(token);
  const kitchen = useKitchenProfile(user ? token : null);
  useFeatureAvailability();
  const copy = COPY[mode];
  const feature = mode === 'dish' ? 'photo' : 'notebook';
  const maxPhotos = mode === 'dish' ? 1 : NOTEBOOK_MAX_PAGES;

  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(isFeatureUnavailable(feature));
  const [preview, setPreview] = useState<PhotoPreview | null>(null);
  const [draft, setDraft] = useState<QuickRecipeDraft | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [visibility, setVisibility] = useState<RecipeVisibility>('private');
  const [useCover, setUseCover] = useState(true);
  const [allergenAck, setAllergenAck] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [options, setOptions] = useState<{ cuisine: string[]; meal: string[] }>({ cuisine: [], meal: [] });
  const lock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => {
    let mounted = true;
    getTerms().then(terms => {
      if (mounted) setOptions({ cuisine: termNames(terms, 'cuisine'), meal: termNames(terms, 'meal_type') });
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  /** Any change to the photos makes an old preview stale. */
  const changePhotos = (next: LocalPhoto[]) => {
    setPhotos(next);
    setPreview(null);
    setDraft(null);
    setError('');
  };

  const addFromCamera = async () => {
    if (busy || (mode === 'notebook' && photos.length >= maxPhotos)) return;
    try {
      const photo = await takePhoto();
      if (photo) changePhotos(mode === 'dish' ? [photo] : addPages(photos, [photo]));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kamera açılamadı.');
    }
  };
  const addFromLibrary = async () => {
    if (busy) return;
    const room = mode === 'dish' ? 1 : maxPhotos - photos.length;
    if (room < 1) return;
    try {
      const picked = await pickPhotos(room);
      if (picked.length) changePhotos(mode === 'dish' ? picked.slice(0, 1) : addPages(photos, picked));
    } catch {
      setError('Galeri açılamadı. Tekrar dene.');
    }
  };

  const requestPreview = async () => {
    if (!token) { router.push('/login'); return; }
    if (lock.current || !photos.length) return;
    if (note.trim().length > PHOTO_NOTE_MAX) { setError(`Not en fazla ${PHOTO_NOTE_MAX} karakter olabilir.`); return; }
    lock.current = true;
    setBusy('preview');
    setError('');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Fail closed before a paid AI call when the quota endpoint is unreachable.
      const rights = await fetchAccountQuotas(token, controller.signal);
      if (reached(rights, 'recipe_ai_day')) {
        setError('Bugünkü yapay zekâ tarif hakkını kullandın. Yenilenme: ' + resetDate(rights, 'recipe_ai_day'));
        return;
      }
      const prepared = [];
      for (const [index, photo] of photos.entries()) prepared.push(await preparePhoto(photo, index));
      const result = await previewPhotoRecipe(token, mode, prepared, note, controller.signal);
      markFeatureAvailable(feature);
      setPreview(result);
      setDraft(result.draft);
      setVisibility(result.defaultVisibility);
      setUseCover(result.coverAvailable);
      setAllergenAck(false);
      setSaveError('');
      setReviewVisible(true);
    } catch (cause) {
      if (controller.signal.aborted && !(cause instanceof PhotoRecipeError)) return;
      if (cause instanceof PhotoRecipeError && cause.unavailable) {
        markFeatureUnavailable(feature);
        setUnavailable(true);
      }
      setError(cause instanceof Error ? cause.message : 'Tarif hazırlanamadı.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      void quotas.refresh();
      setBusy(null);
      lock.current = false;
    }
  };

  const ackNeeded = preview ? needsAllergenAcknowledgement(preview) : false;
  const validate = (value: QuickRecipeDraft) => validatePhotoDraft(value)
    || (ackNeeded && !allergenAck ? 'Kaydetmeden önce alerjen uyarısını okuduğunu onayla.' : null);

  const save = async () => {
    if (!token || !preview || !draft || lock.current) return;
    lock.current = true;
    setBusy('save');
    setSaveError('');
    try {
      const result = await savePhotoRecipe(token, preview.previewToken, draft, {
        mode, visibility, useCover, coverAvailable: preview.coverAvailable,
      });
      setReviewVisible(false);
      await afterModalDismiss();
      maybeAskForReview('recipe_saved');
      router.replace('/recipe/' + encodeURIComponent(result.slug));
    } catch (cause) {
      if (cause instanceof PhotoRecipeError && cause.unavailable) markFeatureUnavailable(feature);
      setSaveError(cause instanceof Error ? cause.message : 'Tarifin kaydedilemedi. Tekrar dene.');
    } finally {
      void quotas.refresh();
      setBusy(null);
      lock.current = false;
    }
  };

  const confirmSave = () => {
    if (!preview || !draft || busy) return;
    const problem = validate(draft);
    if (problem) { setSaveError(problem); return; }
    const confirmPublic = () => {
      if (visibility !== 'public') { void save(); return; }
      Alert.alert('Tarifin herkese açık olsun mu?', mode === 'dish'
        ? 'Tarifin herkes tarafından görülebilir ve "AI Tahmini Tarif" etiketini taşır. Daha sonra yeniden gizleyebilirsin.'
        : 'Tarifin herkes tarafından görülebilir. Daha sonra yeniden gizleyebilirsin.', [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'Evet, yayımla', onPress: () => { void save(); } },
      ]);
    };
    const open = unresolvedUncertainCount(preview, draft);
    if (open > 0 || preview.illegible.length > 0) {
      Alert.alert('Sayfayla karşılaştırdın mı?', open > 0
        ? `${open} belirsiz okuma hâlâ değiştirilmedi. Doğru olduklarından eminsen kaydedebilirsin.`
        : 'Sayfada okunamayan kısımlar vardı. Eksik bir şey kalmadığından eminsen kaydedebilirsin.', [
        { text: 'Kontrol edeceğim', style: 'cancel' },
        { text: 'Doğru, kaydet', onPress: confirmPublic },
      ]);
      return;
    }
    confirmPublic();
  };

  const startOver = () => {
    setReviewVisible(false);
    setPreview(null);
    setDraft(null);
    setPhotos([]);
    setError('');
    setSaveError('');
  };

  const allergenLabels = useMemo(() => {
    const labels = kitchen?.options?.allergens ?? [];
    const keys = preview?.allergens.contains ?? [];
    const names = keys.map(key => labels.find(option => option.value === key)?.label?.trim() || '');
    return names.length && names.every(Boolean) ? names : [];
  }, [kitchen, preview]);

  const reviewHeader = preview ? <View style={styles.reviewHeader}>
    {preview.aiEstimated ? <AiEstimatedBadge /> : (
      <View style={styles.notebookPill}>
        <Ionicons name="book-outline" size={12} color={colors.ink} />
        <Text style={styles.notebookPillText}>Defterden aktarıldı · Sayfayla karşılaştır</Text>
      </View>
    )}
    {preview.detected ? <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>FOTOĞRAFTAKİ YEMEK</Text>
      <Text style={styles.detectedDish}>{preview.detected.dish}</Text>
      <View style={styles.confidenceTrack} accessibilityLabel={`Tanıma güveni ${confidenceText(preview.detected.confidence)}`}>
        <View style={[styles.confidenceFill, { width: `${Math.round(preview.detected.confidence * 100)}%` },
          isLowConfidence(preview) && styles.confidenceLow]} />
      </View>
      <Text style={styles.infoMeta}>{confidenceText(preview.detected.confidence)}</Text>
      {isLowConfidence(preview) ? <Text style={styles.warnText} accessibilityRole="alert">
        Emin olamadık: Bu yemek gerçekten {preview.detected.dish} mi? Değilse başlığı ve malzemeleri düzelt ya da başka bir fotoğraf dene.
      </Text> : null}
      {preview.detected.alternatives.length ? <Text style={styles.infoMeta}>
        Benzer olabilir: {joinTr(preview.detected.alternatives)}
      </Text> : null}
    </View> : null}
    {preview.aiEstimated ? <Text style={styles.hint}>
      Ölçüler, süreler ve kalori fotoğraftan tahmin edildi. Pişirmeden önce kontrol et.
    </Text> : null}
    {preview.assumptions.length ? <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>TAHMİN EDİLENLER</Text>
      {preview.assumptions.map(item => <Text key={item} style={styles.listText}>• {item}</Text>)}
    </View> : null}
    {mode === 'notebook' && draft && unresolvedUncertainCount(preview, draft) > 0 ? <View style={styles.warnCard}>
      <Ionicons name="eye-outline" size={17} color={colors.warning} />
      <Text style={styles.warnCardText}>
        {unresolvedUncertainCount(preview, draft)} belirsiz okuma sarıyla işaretlendi. Sayfayla karşılaştırıp gerekirse düzelt.
      </Text>
    </View> : null}
    {preview.illegible.length ? <View style={styles.infoCard}>
      <Text style={[styles.infoLabel, { color: colors.warning }]}>OKUNAMAYAN KISIMLAR</Text>
      {preview.illegible.map(item => <Text key={item} style={styles.listText}>• {item}</Text>)}
      <Text style={styles.infoMeta}>Bu kısımları sayfaya bakarak kendin ekleyebilirsin.</Text>
    </View> : null}
    {preview.sourceNotes ? <View style={styles.infoCard}>
      <Text style={styles.infoLabel}>SAYFADAKİ NOT</Text>
      <Text style={styles.listText}>“{preview.sourceNotes}”</Text>
      {draft && !draft.excerpt.trim() ? <TouchableOpacity accessibilityRole="button"
        onPress={() => setDraft(old => old ? { ...old, excerpt: preview.sourceNotes } : old)}>
        <Text style={styles.linkText}>Açıklamaya ekle</Text>
      </TouchableOpacity> : null}
    </View> : null}
    {allergenLabels.length ? <Text style={styles.hint}>Bu tarifte bulunan alerjenler: {joinTr(allergenLabels)}.</Text> : null}
    {ackNeeded ? <View style={styles.allergenCard}>
      <View style={styles.allergenTitleRow}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.warning} />
        <Text style={styles.allergenTitle}>Alerji listene dikkat</Text>
      </View>
      {preview.allergenConflicts.map(item => <Text key={'c' + item.key} style={styles.listText}>
        • {item.label || 'Alerjen'}{item.ingredients.length ? `: ${item.ingredients.join(', ')}` : ''}
      </Text>)}
      {preview.allergenCautions.map(item => <Text key={'w' + item.key} style={styles.listText}>
        • {item.label || 'Alerjen'} içerebilir{item.ingredients.length ? `: ${item.ingredients.join(', ')}` : ''}
      </Text>)}
      {preview.allergenWarning ? <Text style={styles.listText}>{preview.allergenWarning}</Text> : null}
      <Text style={styles.infoMeta}>Tarif değiştirilmedi. İstersen sorunlu malzemeyi değiştir.</Text>
      <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: allergenAck }}
        onPress={() => { setAllergenAck(value => !value); setSaveError(''); }} style={styles.checkRow}>
        <Ionicons name={allergenAck ? 'checkbox' : 'square-outline'} size={20} color={colors.brand} />
        <Text style={styles.checkText}>Alerjen uyarısını okudum, malzemeleri kontrol ettim.</Text>
      </TouchableOpacity>
    </View> : null}
  </View> : null;

  const reviewFooter = preview ? <View style={styles.footerBox}>
    <Text style={styles.footerTitle}>Kimler görsün?</Text>
    <View style={styles.segment} accessibilityRole="radiogroup">
      {([
        { value: 'private', label: 'Sadece ben', icon: 'lock-closed-outline' },
        { value: 'public', label: 'Herkese açık', icon: 'globe-outline' },
      ] as const).map(option => <TouchableOpacity key={option.value} accessibilityRole="radio"
        accessibilityState={{ selected: visibility === option.value }}
        onPress={() => setVisibility(option.value)}
        style={[styles.segmentItem, visibility === option.value && styles.segmentActive]}>
        <Ionicons name={option.icon} size={16} color={visibility === option.value ? '#fff' : colors.text} />
        <Text style={[styles.segmentText, visibility === option.value && styles.segmentTextActive]}>{option.label}</Text>
      </TouchableOpacity>)}
    </View>
    <Text style={styles.hint}>{visibility === 'private'
      ? 'Tarifin yalnızca sana görünür. İstediğin zaman yayımlayabilirsin.'
      : preview.aiEstimated ? 'Herkes görebilir. "AI Tahmini Tarif" etiketi tarifte kalır.' : 'Herkes görebilir. İstediğin zaman yeniden gizleyebilirsin.'}</Text>
    {preview.coverAvailable ? <View style={styles.switchRow}>
      <View style={styles.switchCopy}>
        <Text style={styles.switchTitle}>Fotoğrafı kapak yap</Text>
        <Text style={styles.hint}>Konum ve cihaz bilgileri silinmiş hâli kullanılır.</Text>
      </View>
      <Switch value={useCover} onValueChange={setUseCover} accessibilityLabel="Fotoğrafı kapak yap"
        trackColor={{ true: '#9fd3b8', false: colors.lineStrong }} thumbColor={useCover ? colors.success : '#fff'} />
    </View> : null}
  </View> : null;

  if (unavailable) {
    return <View style={[styles.root, styles.soon]}>
      <View style={styles.soonIcon}><Ionicons name={mode === 'dish' ? 'camera-outline' : 'book-outline'} size={30} color={colors.brand} /></View>
      <Text style={styles.soonKicker}>Yakında</Text>
      <Text style={styles.soonTitle}>{copy.kicker} çok yakında burada.</Text>
      <Text style={styles.soonText}>Şimdilik tarifini yazarak ya da bir bağlantıdan aktararak ekleyebilirsin.</Text>
      <TouchableOpacity style={styles.soonButton} accessibilityRole="button"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}>
        <Text style={styles.soonButtonText}>Geri dön</Text>
      </TouchableOpacity>
    </View>;
  }

  const remainingAi = quotas.data?.quotas.recipe_ai_day;
  const canAdd = photos.length < maxPhotos && !busy;
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>{copy.kicker}</Text>
        <AccentText style={styles.heading}>{copy.heading}</AccentText>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>
        <View style={styles.stageRow}>
          <Text style={styles.stageActive}>1 · {copy.step}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
          <Text style={styles.stageInactive}>2 · Tarifini kontrol et</Text>
        </View>
      </View>

      <View style={styles.card}>
        {mode === 'dish' && photos[0] ? <>
          <Image source={{ uri: photos[0].uri }} style={styles.dishPhoto} contentFit="cover" accessibilityLabel="Seçtiğin yemek fotoğrafı" />
          <View style={styles.inlineActions}>
            <TouchableOpacity style={styles.smallButton} onPress={addFromCamera} disabled={!!busy} accessibilityRole="button">
              <Ionicons name="camera-outline" size={16} color={colors.ink} /><Text style={styles.smallButtonText}>Yeniden çek</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={addFromLibrary} disabled={!!busy} accessibilityRole="button">
              <Ionicons name="images-outline" size={16} color={colors.ink} /><Text style={styles.smallButtonText}>Galeriden seç</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.smallButton} onPress={() => changePhotos([])} disabled={!!busy}
              accessibilityRole="button" accessibilityLabel="Fotoğrafı kaldır">
              <Ionicons name="trash-outline" size={16} color="#c0564b" />
            </TouchableOpacity>
          </View>
        </> : null}

        {mode === 'notebook' && photos.length ? <>
          <Text style={styles.fieldLabel}>SAYFALAR · {photos.length} / {NOTEBOOK_MAX_PAGES}</Text>
          {photos.map((photo, index) => <View key={photo.key} style={styles.pageRow}>
            <Image source={{ uri: photo.uri }} style={styles.pageThumb} contentFit="cover" />
            <Text style={styles.pageLabel}>Sayfa {index + 1}</Text>
            <TouchableOpacity style={styles.iconButton} disabled={index === 0 || !!busy}
              onPress={() => changePhotos(movePage(photos, index, index - 1))}
              accessibilityRole="button" accessibilityLabel={`Sayfa ${index + 1}'i yukarı taşı`}>
              <Ionicons name="chevron-up" size={18} color={index === 0 ? colors.lineStrong : colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} disabled={index === photos.length - 1 || !!busy}
              onPress={() => changePhotos(movePage(photos, index, index + 1))}
              accessibilityRole="button" accessibilityLabel={`Sayfa ${index + 1}'i aşağı taşı`}>
              <Ionicons name="chevron-down" size={18} color={index === photos.length - 1 ? colors.lineStrong : colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} disabled={!!busy}
              onPress={() => changePhotos(removePage(photos, index))}
              accessibilityRole="button" accessibilityLabel={`Sayfa ${index + 1}'i kaldır`}>
              <Ionicons name="trash-outline" size={17} color="#c0564b" />
            </TouchableOpacity>
          </View>)}
        </> : null}

        {(mode === 'notebook' ? photos.length < NOTEBOOK_MAX_PAGES : !photos.length) ? <View style={styles.pickRow}>
          <TouchableOpacity style={[styles.pickTile, !canAdd && styles.disabled]} onPress={addFromCamera} disabled={!canAdd} accessibilityRole="button">
            <View style={styles.pickIcon}><Ionicons name="camera" size={22} color={colors.brand} /></View>
            <Text style={styles.pickTitle}>{mode === 'dish' ? 'Fotoğraf çek' : photos.length ? 'Sayfa çek' : 'İlk sayfayı çek'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pickTile, !canAdd && styles.disabled]} onPress={addFromLibrary} disabled={!canAdd} accessibilityRole="button">
            <View style={styles.pickIcon}><Ionicons name="images" size={22} color={colors.brand} /></View>
            <Text style={styles.pickTitle}>Galeriden seç</Text>
          </TouchableOpacity>
        </View> : null}

        {mode === 'notebook' ? <Text style={styles.hint}>
          Sayfaları tarifteki sırayla ekle; okları kullanarak sıralayabilirsin. En fazla {NOTEBOOK_MAX_PAGES} sayfa.
        </Text> : <Text style={styles.hint}>Tabağın tamamı net ve aydınlık görünsün. Tek fotoğraf yeterli.</Text>}

        <Text style={styles.fieldLabel}>NOT · İSTEĞE BAĞLI</Text>
        <TextInput value={note} onChangeText={setNote} placeholder={copy.notePlaceholder}
          placeholderTextColor={colors.textFaint} maxLength={PHOTO_NOTE_MAX} editable={!busy}
          style={styles.input} accessibilityLabel="İsteğe bağlı not" />
      </View>

      <View style={styles.privacy}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
        <Text style={styles.privacyText}>
          {mode === 'dish'
            ? 'Fotoğrafın yalnızca tarifi hazırlamak için kullanılır; konum bilgisi silinir. Tarifin önce yalnızca sana görünür.'
            : 'Sayfaların yalnızca yazıya dökmek için kullanılır ve saklanmaz. Tarifin önce yalnızca sana görünür.'}
        </Text>
      </View>
      {remainingAi && remainingAi.available && remainingAi.remaining !== null ? <Text style={styles.quota}>
        Bugün kalan yapay zekâ tarif hakkın: {remainingAi.remaining}
      </Text> : null}
    </ScrollView>

    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {error ? <Text accessibilityRole="alert" style={styles.footerError}>{error}</Text> : null}
      {busy === 'preview' ? <Text style={styles.footerProgress}>Bu işlem genellikle 10–60 saniye sürer. Ekrandan ayrılma.</Text> : null}
      <TouchableOpacity style={[styles.mainButton, (!photos.length || !!busy) && styles.disabled]}
        disabled={!photos.length || !!busy}
        onPress={() => { if (preview && draft) setReviewVisible(true); else void requestPreview(); }}
        accessibilityRole="button" accessibilityLabel={preview ? 'Tarif önizlemesine dön' : copy.button}>
        {busy === 'preview' ? <ActivityIndicator color="#fff" /> : <Ionicons name={preview ? 'create-outline' : 'sparkles'} size={19} color="#fff" />}
        <Text style={styles.mainButtonText}>{busy === 'preview' ? copy.busy : preview ? 'Tarif önizlemesine dön' : copy.button}</Text>
      </TouchableOpacity>
    </View>

    {preview && draft ? <QuickRecipeReview
      visible={reviewVisible}
      draft={draft}
      onChange={updater => { setDraft(old => old ? updater(old) : old); setSaveError(''); }}
      existingRecipeId={null}
      cuisineOptions={options.cuisine}
      mealOptions={options.meal}
      saving={busy === 'save'}
      uncertain={false}
      error={saveError}
      onClose={() => { if (busy !== 'save') setReviewVisible(false); }}
      onNew={startOver}
      onPublish={confirmSave}
      kicker={preview.aiEstimated ? 'AI Tahmini Tarif' : 'Defterden tarif'}
      heading={preview.aiEstimated ? 'Tahmini tarifin *hazır.*' : 'Sayfaların *yazıya döküldü.*'}
      subtitle={preview.aiEstimated
        ? 'Fotoğraftan tahmin ettik. Malzemeleri ve adımları kendi damak tadına göre düzelt; tarif henüz kaydedilmedi.'
        : 'Sarıyla işaretli yerleri sayfayla karşılaştır. Tarif henüz kaydedilmedi.'}
      header={reviewHeader}
      footer={reviewFooter}
      validate={validate}
      primaryLabel={visibility === 'public' ? 'Kaydet ve yayımla' : 'Tarifimi kaydet'}
      savingLabel="Kaydediliyor…"
      secondaryLabel={mode === 'dish' ? 'Yeni fotoğraf' : 'Baştan başla'}
      ingredientNote={row => uncertainIngredientNote(preview, row)}
      stepNote={step => uncertainStepNote(preview, step)}
    /> : null}
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16, paddingBottom: 36 },
  hero: { paddingTop: 4 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  heading: { fontFamily: fonts.headingBold, fontSize: 31, lineHeight: 37, letterSpacing: -0.9, color: colors.ink, marginTop: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 8 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  stageActive: { fontFamily: fonts.bodySemi, color: colors.brand, backgroundColor: colors.brandSoft, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, fontSize: 12, overflow: 'hidden' },
  stageInactive: { fontFamily: fonts.bodyMedium, color: colors.textFaint, fontSize: 12 },
  card: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18, gap: 12, ...shadow.card },
  fieldLabel: { fontFamily: fonts.bodySemi, color: colors.textMuted, fontSize: 10, letterSpacing: 1.4, marginTop: 4 },
  input: {
    borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, minHeight: 50, paddingHorizontal: 14,
    color: colors.ink, backgroundColor: colors.canvas, fontFamily: fonts.body, fontSize: 15,
  },
  dishPhoto: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg, backgroundColor: colors.cream },
  inlineActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallButton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface },
  smallButtonText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas },
  pageThumb: { width: 48, height: 62, borderRadius: 8, backgroundColor: colors.cream },
  pageLabel: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  pickRow: { flexDirection: 'row', gap: 10 },
  pickTile: { flex: 1, minHeight: 112, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: '#e7c3b6', backgroundColor: '#fffaf7', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 },
  pickIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  pickTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink, textAlign: 'center' },
  hint: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  privacy: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 14, borderRadius: radius.lg, backgroundColor: colors.successSoft },
  privacyText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  quota: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  bottomBar: { backgroundColor: colors.canvas, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, gap: 8 },
  footerError: { fontFamily: fonts.bodySemi, color: '#b54237', fontSize: 13, lineHeight: 18 },
  footerProgress: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, textAlign: 'center' },
  mainButton: { minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, paddingHorizontal: 16 },
  mainButtonText: { fontFamily: fonts.bodySemi, color: '#fff', fontSize: 15 },
  disabled: { opacity: 0.45 },

  reviewHeader: { gap: 12 },
  notebookPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.cream },
  notebookPillText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.ink },
  infoCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 14, gap: 6 },
  infoLabel: { fontFamily: fonts.bodySemi, color: colors.brand, fontSize: 10, letterSpacing: 1.5 },
  infoMeta: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  detectedDish: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.ink, letterSpacing: -0.3 },
  confidenceTrack: { height: 8, borderRadius: 4, backgroundColor: colors.cream, overflow: 'hidden', marginTop: 4 },
  confidenceFill: { height: 8, borderRadius: 4, backgroundColor: colors.success },
  confidenceLow: { backgroundColor: '#e0a33a' },
  warnText: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 19, color: colors.warning },
  listText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.brand, paddingVertical: 4 },
  warnCard: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 13, borderRadius: radius.md, backgroundColor: '#fffaeb', borderWidth: 1, borderColor: '#f3cf7a' },
  warnCardText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 19, color: colors.warning },
  allergenCard: { borderRadius: radius.lg, borderWidth: 1, borderColor: '#f5dca5', backgroundColor: colors.warningSoft, padding: 14, gap: 7 },
  allergenTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  allergenTitle: { fontFamily: fonts.heading, fontSize: 15, color: colors.warning },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 40, marginTop: 4 },
  checkText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, color: colors.ink },

  footerBox: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 14, gap: 10, marginTop: 6 },
  footerTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink },
  segment: { flexDirection: 'row', padding: 4, gap: 6, backgroundColor: colors.cream, borderRadius: radius.pill },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  segmentActive: { backgroundColor: colors.ink },
  segmentText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  segmentTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.line },
  switchCopy: { flex: 1, gap: 2 },
  switchTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },

  soon: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  soonIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  soonKicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  soonTitle: { fontFamily: fonts.headingBold, fontSize: 22, lineHeight: 28, color: colors.ink, textAlign: 'center' },
  soonText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  soonButton: { marginTop: 10, height: 48, paddingHorizontal: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: 'center', backgroundColor: colors.surface },
  soonButtonText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
});
