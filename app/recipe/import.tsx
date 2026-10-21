import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '../../context/AuthContext';
import { createRecipe } from '../../lib/api';
import { isPublishResultUncertain, RequestDeadlineError, withDeadline } from '../../lib/recipe-publish';
import { fetchAccountQuotas, reached, resetDate, useQuotas } from '../../lib/quotas';
import {
  EditableIngredient, EditableStep, GroundedImportPreview, ImportEditor,
  buildApprovedRecipe, editorFromPreview, importReviewNotes, publishValidation,
  validateRecipeSource,
} from '../../lib/recipe-import';
import {
  previewRecipeSocial, previewRecipeText, resolveVideoSource, startVideoRecipeJob, getVideoRecipeJob, VideoAlreadyPublished,
} from '../../lib/recipe-import-api';
import {
  isInstagramReelLink, isTikTokShortLink, isVideoRecipeLink, needsRightsConfirmation, videoEditorFromJob,
} from '../../lib/video-recipe-import';
import { canonicalShareLink, expandShortLink } from '../../lib/share-link';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';

type Busy = 'preview' | 'publish' | null;
type Stage = 'source' | 'review';
const BG = colors.canvas;
const BRAND = colors.brand;

/** Which platform a pasted or shared link belongs to (label only). */
function linkPlatform(link: string): { name: string; icon: React.ComponentProps<typeof Ionicons>['name'] } | null {
  const value = link.trim();
  if (!value) return null;
  if (isInstagramReelLink(value) || /^https:\/\/(www\.)?instagram\.com\/p\//i.test(value)) return { name: 'Instagram videosu', icon: 'logo-instagram' };
  if (/^https:\/\/(www\.|m\.|vm\.|vt\.)?tiktok\.com\//i.test(value)) return { name: 'TikTok videosu', icon: 'logo-tiktok' };
  if (/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(value)) return { name: 'YouTube videosu', icon: 'logo-youtube' };
  if (/^https:\/\/\S+\.\S+/i.test(value)) return { name: 'Tarif sayfası', icon: 'globe-outline' };
  return null;
}

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
    placeholderTextColor={colors.textFaint} multiline={multiline}
    keyboardType={keyboardType || 'default'}
    textAlignVertical={multiline ? 'top' : 'center'}
    style={[styles.input, multiline && styles.multiInput]}
  />;
}

export default function RecipeTextImportScreen({ initialMethod = 'text', initialUrl }: { initialMethod?: 'social' | 'text'; initialUrl?: string } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const quotas = useQuotas(token);
  // A link or recipe text can arrive from "Paylaş → Tariften" (/share) or a deep link.
  const params = useLocalSearchParams<{ url?: string; text?: string }>();
  const sharedText = typeof params.text === 'string' ? params.text.slice(0, 20000) : '';
  const sharedUrl = (initialUrl || (typeof params.url === 'string' ? params.url : '')).trim().slice(0, 2048);
  const [source, setSource] = useState(sharedText);
  const [importMethod, setImportMethod] = useState<'social' | 'text'>(sharedText && !sharedUrl ? 'text' : initialMethod);
  const [socialUrl, setSocialUrl] = useState(sharedUrl);
  const [instagramRightsConfirmed, setInstagramRightsConfirmed] = useState(true);
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
  const [videoReview, setVideoReview] = useState(false);
  const [videoWarnings, setVideoWarnings] = useState<string[]>([]);
  const [videoStatus, setVideoStatus] = useState('');
  const videoRequestRef = useRef<{ url: string; id: string } | null>(null);
  const [editor, setEditor] = useState<ImportEditor | null>(null);
  const [accepted, setAccepted] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [publishUnknown, setPublishUnknown] = useState(false);
  const [publishSlow, setPublishSlow] = useState(false);
  const [error, setError] = useState('');
  const [usageNotice, setUsageNotice] = useState('');
  useEffect(() => {
    if (!usageNotice) return;
    const t = setTimeout(() => setUsageNotice(''), 3500);
    return () => clearTimeout(t);
  }, [usageNotice]);
  const [openIngredient, setOpenIngredient] = useState<number | null>(null);
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [seoOpen, setSeoOpen] = useState(false);
  const requestLock = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => {
    if (busy !== 'publish') { setPublishSlow(false); return; }
    const timer = setTimeout(() => setPublishSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [busy]);

  const updateSource = (text: string) => {
    setSource(text);
    setStage('source');
    setPreview(null);
    setVideoReview(false);
    setVideoWarnings([]);
    setVideoStatus('');
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
      setUsageNotice("AI düzenleme denemesi kullanıldı. Kalan haklarını Profil'de görebilirsin.");
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


  const requestVideoPreview = async (url: string) => {
    if (!token || requestLock.current) return;
    requestLock.current = true;
    setBusy('preview');
    setError('');
    setVideoReview(false);
    setVideoWarnings([]);
    setVideoStatus('queued');
    const previous = videoRequestRef.current;
    const requestId = previous && previous.url === url ? previous.id : randomUUID();
    videoRequestRef.current = { url, id: requestId };
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Free look-up first: an already published recipe opens, the user's own
      // earlier job resumes, and a paid analysis starts only when Core allows.
      const state = await resolveVideoSource(token, url, controller.signal);
      if (state.status === 'published') { router.push(`/recipe/${encodeURIComponent(state.slug)}`); return; }
      if (state.status === 'pending') throw new Error('Bu video için yayın işlemi sürüyor. Biraz sonra tekrar bak.');
      if (state.status === 'unsupported') throw new Error('Bu paylaşımın videosuna erişilemiyor. Fotoğraflar video olarak işlenmez.');
      const existing = state.status === 'existing' ? state.job : null;
      const retry = !!existing && existing.status === 'failed' && existing.retryable === true;
      if (!existing && !(state.status === 'new' && state.canStart)) {
        throw new Error('Şu anda yeni video analizi başlatılamıyor. Biraz sonra tekrar dene.');
      }
      let job = existing && !retry
        ? existing
        : await startVideoRecipeJob(token, url, requestId, controller.signal, instagramRightsConfirmed);
      for (let n = 0; n < 100 && !controller.signal.aborted; n++) {
        setVideoStatus(job.status);
        if (job.status === 'needs_review') {
          const checked = videoEditorFromJob(job);
          setEditor(checked.editor);
          setVideoWarnings(checked.warnings);
          setVideoReview(true);
          setPreview(null);
          setStage('review');
          setAccepted(true);
          setReviewNotesOpen(false);
          setFieldError(null);
          setOpenIngredient(null);
          setOpenStep(null);
          requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
          void quotas.refresh();
          return;
        }
        if (job.status === 'failed' || job.status === 'uncertain') {
          throw new Error(job.message || 'Video analiz sonucu doğrulanamadı.');
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
        if (controller.signal.aborted) return;
        job = await getVideoRecipeJob(token, job.id, controller.signal);
      }
      if (!controller.signal.aborted) {
        setError('Video hâlâ işleniyor olabilir. Aynı bağlantıyla tekrar kontrol edebilirsin; yeni ücretli işlem oluşturulmaz.');
      }
    } catch (cause) {
      if (cause instanceof VideoAlreadyPublished) { router.push(`/recipe/${encodeURIComponent(cause.slug)}`); return; }
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Video analiz durumu alınamadı.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      void quotas.refresh();
      setBusy(null);
      requestLock.current = false;
    }
  };

  const requestSocialPreview = async () => {
    if (!token) { router.push('/login'); return; }
    if (requestLock.current) return;
    let link = socialUrl.trim();
    if (isTikTokShortLink(link)) {
      // vm./vt.tiktok.com: open the short link on the device to learn the video's address.
      setBusy('preview');
      setError('');
      try {
        link = await expandShortLink(link);
        setSocialUrl(link);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'TikTok bağlantısı açılamadı.');
        return;
      } finally {
        setBusy(null);
      }
    }
    const canonical = canonicalShareLink(link);
    if (canonical && isVideoRecipeLink(canonical)) link = canonical;
    if (isVideoRecipeLink(link)) {
      if (needsRightsConfirmation(link) && !instagramRightsConfirmed) {
        setError('Bu videoyu analiz etmek için gerekli kullanım iznine sahip olduğunu onayla.');
        return;
      }
      await requestVideoPreview(link); return;
    }
    if (!/^https:\/\/[^\s]+$/i.test(link) || link.length > 2048) {
      setError('Geçerli bir HTTPS paylaşım bağlantısı gir.');
      return;
    }
    requestLock.current = true;
    setBusy('preview');
    setError('');
    try {
      const rights = await fetchAccountQuotas(token);
      if (reached(rights, 'recipe_ai_day')) {
        setError('Bugünkü yapay zekâ hakkın doldu. Yenilenme: ' + resetDate(rights, 'recipe_ai_day'));
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const data = await previewRecipeSocial(token, link, controller.signal);
      setSource(data.source_text);
      setPreview(data);
      setEditor(editorFromPreview(data));
      setStage('review');
      setAccepted(true);
      setReviewNotesOpen(false);
      setFieldError(null);
      setOpenIngredient(null);
      setOpenStep(null);
      setUsageNotice('Tarif düzenleme hakkından bir deneme kullanıldı.');
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bağlantı incelenemedi.');
    } finally {
      abortRef.current = null;
      void quotas.refresh();
      setBusy(null);
      requestLock.current = false;
    }
  };

  const publishApproved = async () => {
    if (!token || !editor || (!preview && !videoReview) || !accepted || requestLock.current || publishUnknown) return;
    if (!checkBeforePublish()) return;
    requestLock.current = true;
    setBusy('publish');
    setError('');
    let postStarted = false;
    try {
      // Quotas must be checked before sending the PUBLIC write. A quota
      // timeout cannot cause a duplicate recipe because no POST was sent.
      const rights = await withDeadline(signal => fetchAccountQuotas(token, signal), 15000);
      if (reached(rights, 'recipe_day')) {
        setError('Bugünkü tarif paylaşma hakkın doldu. Yenilenme: ' + resetDate(rights, 'recipe_day'));
        return;
      }
      // Save once. A timeout or network failure after POST is an UNKNOWN
      // outcome: the server might have published despite a missing response.
      postStarted = true;
      const result = await withDeadline(
        signal => createRecipe(token, buildApprovedRecipe(editor), signal),
        45000,
      );
      const slug: unknown = result?.slug || result?.data?.slug;
      if (typeof slug === 'string' && slug.trim()) {
        router.replace('/recipe/' + encodeURIComponent(slug));
      } else {
        Alert.alert('Tarifin yayımlandı', 'Tarifini profilindeki Tariflerim bölümünde bulabilirsin.', [
          { text: 'Profilime git', onPress: () => router.replace('/(tabs)/profile') },
        ]);
      }
    } catch (cause) {
      if (postStarted && isPublishResultUncertain(cause)) {
        setPublishUnknown(true);
        setError('Yayımlama sonucunu doğrulayamadık. Tarifin kaydedilmiş olabilir. Tekrar yayımlamadan önce Tariflerim bölümünü kontrol et.');
      } else if (cause instanceof RequestDeadlineError) {
        setError('Kullanım haklarını kontrol edemedik. Henüz tarif gönderilmedi; bağlantını kontrol edip tekrar deneyebilirsin.');
      } else {
        setError(cause instanceof Error ? cause.message : 'Tarif yayımlanamadı. Lütfen tekrar dene.');
      }
    } finally {
      requestLock.current = false;
      void quotas.refresh();
      setBusy(null);
    }
  };

  const confirmPublish = () => {
    if (!editor || !accepted || busy || publishUnknown) return;
    if (!checkBeforePublish()) return;
    Alert.alert('Tarifini herkese açık yayımla', 'Malzemeleri ve adımları kontrol ettiğinden emin misin? Yayımladığında tarifin herkes tarafından görülebilir.', [
      { text: 'Bir kez daha bakacağım', style: 'cancel' },
      { text: 'Evet, yayımla', onPress: () => { void publishApproved(); } },
    ]);
  };

  const renderIngredient = (ingredient: EditableIngredient, index: number) => {
    if (!editor) return null;
    const open = index === openIngredient;
    return <View key={'i' + index} style={[styles.item, open && styles.itemOpen]}>
      <TouchableOpacity onPress={() => setOpenIngredient(open ? null : index)} accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={(ingredient.name || 'Yeni malzeme') + ' düzenle'} style={styles.itemHeader}>
        <LokmaIngredientIcon name={ingredient.name} size={22} />
        <View style={styles.itemContent}>
          <Text style={styles.itemTitle}>{ingredient.name || 'Yeni malzeme'}</Text>
          <Text style={[styles.itemNote, !ingredient.source_verified && styles.amber]}>
            {ingredient.userEdited ? 'Sen ekledin · kontrol et' : videoReview ? 'AI önerisi · videoyla karşılaştır' : !ingredient.source_verified ? 'Kontrol et' : ingredient.name_corrected ? 'Yazım önerisi · kontrol et' : 'Kaynakla karşılaştırıldı'}
          </Text>
        </View>
        <View style={[styles.amountPill, !ingredient.amount.trim() && styles.amountPillMissing]}>
          <Text style={[styles.itemAmount, !ingredient.amount.trim() && styles.itemAmountMissing]}>
            {[ingredient.amount, ingredient.unit].filter(Boolean).join(' ') || 'Miktar belirtilmemiş'}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textFaint} />
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
    return <View key={'s' + index} style={[styles.item, open && styles.itemOpen]}>
      <TouchableOpacity style={styles.itemHeader} onPress={() => setOpenStep(open ? null : index)}
        accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={`Yapılış adımı ${index + 1} düzenle`}>
        <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
        <View style={styles.itemContent}>
          <Text style={styles.stepContent} numberOfLines={open ? undefined : 3}>{step.content || 'Yeni hazırlanış adımı'}</Text>
          <Text style={styles.itemNote}>{videoReview ? 'Videodan önerildi · kontrol et' : step.editorial_rewrite ? 'Editoryal öneri · kontrol et' : 'Kaynakla karşılaştırıldı'}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={17} color={colors.textFaint} />
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

  const notes = preview ? importReviewNotes(preview.warnings, preview.needs_confirmation) : videoWarnings;
  const detected = linkPlatform(socialUrl);
  const askRights = needsRightsConfirmation(socialUrl) || isTikTokShortLink(socialUrl);
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    {usageNotice ? <View style={styles.usageToast} accessibilityRole="alert">
      <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
      <Text style={styles.usageText}>{usageNotice}</Text>
    </View> : null}
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {stage === 'source' ? <>
        <View style={styles.hero}>
          <Text style={styles.kicker}>{importMethod === 'social' ? 'Reels · TikTok · Shorts' : 'Mutfak notların'}</Text>
          <AccentText style={styles.heading}>{importMethod === 'social' ? 'Videoyu *tarife* çevir.' : 'Notlarını *tarife* çevir.'}</AccentText>
          <Text style={styles.subtitle}>
            {importMethod === 'social'
              ? 'Bağlantıyı yapıştır ya da videoda Paylaş → Tariften\'e Aktar\'a dokun. Malzemeler ve adımlar hazırlanır; son kararı sen verirsin.'
              : 'Elinin alıştığı ölçüler, aileden kalan küçük sırlar… Yaz, düzenleyelim; son kararı sen ver.'}
          </Text>
          <View style={styles.stageRow}>
            <Text style={styles.stageActive}>1 · {importMethod === 'social' ? 'Bağlantın' : 'Notların'}</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
            <Text style={styles.stageInactive}>2 · Tarifini kontrol et</Text>
          </View>
        </View>

        <View style={styles.socialTabs} accessibilityRole="tablist">
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: importMethod === 'social' }}
            disabled={!!busy} onPress={() => { setImportMethod('social'); setError(''); }}
            style={[styles.socialTab, importMethod === 'social' && styles.socialTabActive]}>
            <Ionicons name="link-outline" size={16} color={importMethod === 'social' ? '#fff' : colors.text} />
            <Text style={[styles.socialTabText, importMethod === 'social' && styles.socialTabTextActive]}>Bağlantıyla</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: importMethod === 'text' }}
            disabled={!!busy} onPress={() => { setImportMethod('text'); setError(''); }}
            style={[styles.socialTab, importMethod === 'text' && styles.socialTabActive]}>
            <Ionicons name="document-text-outline" size={16} color={importMethod === 'text' ? '#fff' : colors.text} />
            <Text style={[styles.socialTabText, importMethod === 'text' && styles.socialTabTextActive]}>Tarif metni</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {importMethod === 'text' ? <>
          <EditorLabel>TARİFİNİ ANLAT</EditorLabel>
          <TextInput value={source} onChangeText={updateSource}
            placeholder="Örneğin: Önce soğanı rendele, üzerine domatesi ekle..."
            placeholderTextColor={colors.textFaint} multiline textAlignVertical="top" editable={!busy}
            style={styles.sourceInput} maxLength={20000} />
          <Text style={styles.small}>Notların yalnızca sen istersen yapay zekâyla düzenlenir. {source.length} karakter</Text>
          <Text style={styles.small}>Yalnızca sen başlattığında düzenlenir. Görsel oluşturulmaz.</Text>
          </> : <>
            <View style={styles.platformRow}>
              {(['logo-instagram', 'logo-tiktok', 'logo-youtube'] as const).map(icon => (
                <View key={icon} style={styles.platformDot}><Ionicons name={icon} size={17} color={colors.ink} /></View>
              ))}
              <Text style={styles.platformLine}>Instagram, TikTok, YouTube ve tarif siteleri</Text>
            </View>
            <EditorLabel>PAYLAŞIM BAĞLANTISI</EditorLabel>
            <TextInput value={socialUrl}
              onChangeText={url => { abortRef.current?.abort(); videoRequestRef.current = null; setInstagramRightsConfirmed(true); setSocialUrl(url); setPreview(null); setVideoReview(false); setVideoWarnings([]); setVideoStatus(''); setEditor(null); setError(''); }}
              placeholder="https://www.instagram.com/reel/…"
              placeholderTextColor={colors.textFaint} autoCapitalize="none" autoCorrect={false}
              keyboardType="url" editable={!busy} maxLength={2048} style={[styles.input, styles.linkInput]} />
            {detected ? (
              <View style={styles.detected}>
                <Ionicons name={detected.icon} size={14} color={colors.success} />
                <Text style={styles.detectedText}>{detected.name}</Text>
              </View>
            ) : null}
            <Text style={styles.socialHelp}>
              Instagram Reels, TikTok ve YouTube videolarında görüntü ve ses incelenir. Diğer bağlantılarda sayfadaki tarif metni kullanılır.
            </Text>
            {askRights ? (
               <TouchableOpacity onPress={() => setInstagramRightsConfirmed(value => !value)}
                 disabled={!!busy} accessibilityRole="checkbox"
                 accessibilityState={{ checked: instagramRightsConfirmed }}
                 style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 8, minHeight: 32 }}>
                 <Ionicons name={instagramRightsConfirmed ? 'checkbox' : 'square-outline'} size={17} color={BRAND} />
                 <Text style={[styles.socialHelp, { flex: 1, marginTop: 0, fontSize: 11, lineHeight: 16 }]}>
                   Bu videoyu analiz ettirmeye ve içeriğini tarif taslağına dönüştürmeye yetkim olduğunu onaylıyorum.
                 </Text>
               </TouchableOpacity>
             ) : null}
             {videoStatus && !videoReview ? (
               <View style={styles.statusRow}>
                 {busy === 'preview' ? <ActivityIndicator size="small" color={BRAND} /> : <Ionicons name="time-outline" size={16} color={colors.textMuted} />}
                 <Text style={styles.statusText} accessibilityRole="text">{busy === 'preview' ? (videoStatus === 'queued' ? 'Video analiz sırasına alındı…' : 'Video inceleniyor… Genellikle 1–2 dakika sürer.') : 'Analiz durumunu aynı bağlantıyla yeniden kontrol edebilirsin.'}</Text>
               </View>
             ) : null}
            {preview?.provenance.origin_type === 'social_creator_description' ? (
              <View style={styles.socialSourceBox}>
                <Text style={styles.socialSourceTitle}>Kaynak açıklaması</Text>
                <Text style={styles.socialSourceText} numberOfLines={6}>{preview.source_text}</Text>
              </View>
            ) : null}
          </>}
        </View>

        {importMethod === 'social' ? (
          <View style={styles.howTo}>
            <Text style={styles.howTitle}>Nasıl çalışır?</Text>
            {[
              { icon: 'share-outline' as const, text: 'Videoda Paylaş\'a dokun, Tariften\'e Aktar\'ı seç ya da bağlantıyı buraya yapıştır.' },
              { icon: 'sparkles-outline' as const, text: 'Video izlenir; malzemeler, ölçüler ve adımlar çıkarılır.' },
              { icon: 'create-outline' as const, text: 'Taslağı kontrol eder, istersen düzenler, sonra yayımlarsın.' },
            ].map((step, i) => (
              <View key={step.icon} style={styles.howRow}>
                <View style={styles.howNumber}><Text style={styles.howNumberText}>{i + 1}</Text></View>
                <Text style={styles.howText}>{step.text}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </> : editor && (preview || videoReview) ? <>
        <View style={styles.reviewHero}>
          <View style={styles.reviewStep}><Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={styles.reviewStepText}>NOTLARIN DÜZENLENDİ</Text></View>
          <AccentText style={styles.heading}>{'Şimdi birlikte *gözden geçirelim.*'}</AccentText>
          <View style={styles.reviewOverview}>
            <View style={styles.reviewOverviewItem}><Ionicons name="basket-outline" size={16} color={BRAND} />
              <Text style={styles.reviewOverviewText}>{editor.ingredients.length} malzeme</Text>
            </View>
            <View style={styles.reviewOverviewItem}><Ionicons name="list-outline" size={16} color={BRAND} />
              <Text style={styles.reviewOverviewText}>{editor.steps.length} adım</Text>
            </View>
          </View>
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
            <Text style={styles.servingsDescription}>AI kişi sayısı önermiş olabilir; tarife göre değiştirebilirsin.</Text>
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
              placeholder="1–36 arası" placeholderTextColor={colors.textFaint}
              onChangeText={text => updateEditor(old => ({ ...old, servings: text }))}
              style={[styles.input, fieldError === 'servings' && styles.invalidInput]}
              accessibilityLabel="Tarifin kaç kişilik olduğu" />
            {fieldError === 'servings' ? <Text accessibilityRole="alert" style={styles.inlineError}>
              Yayımlamadan önce kaç kişilik olduğunu seçmelisin (1–36).
            </Text> : null}
          </View>

          <View style={styles.metaBox}>
            <Text style={styles.metaHeading}>AI önerileri · Dilersen değiştir</Text>
            <EditorLabel>TAHMİNİ KALORİ · KİŞİ BAŞINA</EditorLabel>
            <SmallField keyboardType="number-pad" placeholder="Yeterli veri yok"
              value={editor.calories} onChangeText={text => updateEditor(old => ({ ...old, calories: text }))} />
            <Text style={styles.small}>Yaklaşık kcal. Miktarlar eksikse hesaplanmaz; beslenme analizi değildir.</Text>
            <EditorLabel>MUTFAK</EditorLabel>
            <SmallField placeholder="Örn. Türk Mutfağı" value={editor.cuisine}
              onChangeText={text => updateEditor(old => ({ ...old, cuisine: text }))} />
            <EditorLabel>ÖĞÜN TİPİ</EditorLabel>
            <SmallField placeholder="Örn. Akşam Yemeği" value={editor.mealType}
              onChangeText={text => updateEditor(old => ({ ...old, mealType: text }))} />
          </View>
          <EditorLabel>EDİTORYAL SPOT</EditorLabel>
          <SmallField value={editor.excerpt} multiline onChangeText={text => updateEditor(old => ({ ...old, excerpt: text }))} />

          {notes.length > 0 && <View style={styles.notice}>
            <TouchableOpacity style={styles.noticeToggle} accessibilityRole="button"
              accessibilityState={{ expanded: reviewNotesOpen }} onPress={() => setReviewNotesOpen(v => !v)}>
              <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
              <Text style={styles.noticeTitle}>Tarifinde kontrol etmeni önerdiğimiz {notes.length} konu</Text>
              <Ionicons name={reviewNotesOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.warning} />
            </TouchableOpacity>
            {reviewNotesOpen && notes.map(note => <Text key={note} style={styles.noticeText}>• {note}</Text>)}
          </View>}

          <View style={styles.sectionRow} onLayout={event => { ingredientsY.current = event.nativeEvent.layout.y; }}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionEyebrow}>MUTFAK LİSTESİ</Text>
              <Text style={styles.sectionTitle}>Malzemeler <Text style={styles.sectionCount}>{editor.ingredients.length}</Text></Text>
            </View>
            <TouchableOpacity onPress={() => {
              if (editor.ingredients.length >= 40) return;
              updateEditor(old => ({ ...old, ingredients: [...old.ingredients, {
                name: '', amount: '', unit: '', original_span: '', source_verified: false, userEdited: true,
              }] }));
              setOpenIngredient(editor.ingredients.length);
            }} style={styles.addButton}><Ionicons name="add" size={16} color={BRAND} /><Text style={styles.add}>Ekle</Text></TouchableOpacity>
          </View>
          {editor.ingredients.map(renderIngredient)}

          <View style={styles.sectionRow} onLayout={event => { stepsY.current = event.nativeEvent.layout.y; }}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionEyebrow}>HAZIRLANIŞ</Text>
              <Text style={styles.sectionTitle}>Adım adım <Text style={styles.sectionCount}>{editor.steps.length}</Text></Text>
            </View>
            <TouchableOpacity onPress={() => {
              if (editor.steps.length >= 40) return;
              updateEditor(old => ({ ...old, steps: [...old.steps, {
                content: '', original_span: '', source_verified: false, userEdited: true,
              }] }));
              setOpenStep(editor.steps.length);
            }} style={styles.addButton}><Ionicons name="add" size={16} color={BRAND} /><Text style={styles.add}>Ekle</Text></TouchableOpacity>
          </View>
          {editor.steps.map(renderStep)}

          <TouchableOpacity style={styles.seoRow} onPress={() => setSeoOpen(v => !v)} accessibilityRole="button">
            <Text style={styles.seoTitle}>Tarifin daha kolay bulunsun</Text>
            <Ionicons name={seoOpen ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
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
          </View>
        </View>
      </> : null}
    </ScrollView>

    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {error ? <Text accessibilityRole="alert" style={styles.footerError}>{error}</Text> : null}
      {busy === 'publish' && publishSlow ? <View style={styles.footerProgress}>
        <Ionicons name="cloud-upload-outline" size={15} color={colors.textMuted} />
        <Text style={styles.footerProgressText}>Sunucu yanıtını bekliyoruz. Tarifini yeniden göndermiyoruz.</Text>
      </View> : null}
      {stage === 'review' && editor && (preview || videoReview) ? <>
        {!editor.servings.trim() && <TouchableOpacity style={styles.footerRequired}
          accessibilityRole="button" onPress={() => {
            scrollToSection('servings'); setTimeout(() => servingsRef.current?.focus(), 260);
          }}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
          <Text style={styles.footerRequiredText}>Yayımlamak için kaç kişilik olduğunu seç</Text>
          <Ionicons name="arrow-up" size={14} color={colors.warning} />
        </TouchableOpacity>}
        <View style={styles.footerConsentRow}>
          <Switch value={accepted} onValueChange={setAccepted}
            trackColor={{ true: '#9fd3b8', false: colors.lineStrong }}
            thumbColor={accepted ? colors.success : '#fff'}
            accessibilityLabel="Herkese açık yayımlama onayı" />
          <Text style={styles.footerConsentText}>Tarifimi kontrol ettim. Herkese açık yayımlamayı onaylıyorum.</Text>
        </View>
      </> : null}
      <TouchableOpacity style={[styles.mainButton, (busy || (!publishUnknown && quotas.loading)) && styles.buttonDisabled]}
        disabled={!!busy || (!publishUnknown && quotas.loading) || (stage === 'review' && !accepted && !publishUnknown)}
        onPress={() => {
          if (publishUnknown) {
            router.push('/(tabs)/profile');
            return;
          }
          if (stage === 'review') { confirmPublish(); return; }
          if ((preview || videoReview) && editor) {
            setStage('review'); // Return to saved preview at no extra AI cost.
            setError('');
            requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
          } else {
            if (importMethod === 'social') { void requestSocialPreview(); }
            else { void requestPreview(); }
          }
        }}
        accessibilityRole="button" accessibilityLabel={publishUnknown ? 'Tariflerim bölümünde kontrol et' : stage === 'source' ? (importMethod === 'social' ? 'Bağlantıdan tarif oluştur' : 'Tarifimi güzelleştir') : 'Onayla ve yayımla'}>
        {busy ? <ActivityIndicator color="#fff" />
          : <Ionicons name={publishUnknown ? 'search-outline' : stage === 'source' ? 'sparkles' : 'checkmark-circle-outline'} size={19} color="#fff" />}
        <Text style={styles.mainButtonText}>{busy === 'preview' ? (importMethod === 'social' && (isVideoRecipeLink(socialUrl) || isTikTokShortLink(socialUrl)) ? 'Videon inceleniyor…' : 'Tarifini düzenliyoruz…')
          : busy === 'publish' ? 'Tarifin yayımlanıyor…'
            : publishUnknown ? 'Tariflerimde kontrol et'
            : stage === 'source'
              ? ((preview || videoReview) && editor ? 'Düzenlenmiş tarifime dön' : importMethod === 'social' ? 'Bağlantıdan tarif oluştur' : 'Tarifimi güzelleştir')
              : 'Onayla ve yayımla'}</Text>
        {!busy && <Ionicons name="arrow-forward" size={17} color="#fff" />}
      </TouchableOpacity>
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16, paddingBottom: 36 },

  hero: { paddingTop: 4, paddingBottom: 2 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: BRAND },
  heading: { fontFamily: fonts.headingBold, fontSize: 31, lineHeight: 37, letterSpacing: -0.9, color: colors.ink, marginTop: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 8 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  stageActive: { fontFamily: fonts.bodySemi, color: BRAND, backgroundColor: colors.brandSoft, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, fontSize: 12, overflow: 'hidden' },
  stageInactive: { fontFamily: fonts.bodyMedium, color: colors.textFaint, fontSize: 12 },

  socialTabs: { flexDirection: 'row', padding: 5, gap: 6, backgroundColor: colors.cream, borderRadius: radius.pill },
  socialTab: { flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderRadius: radius.pill, minHeight: 44, paddingHorizontal: 8 },
  socialTabActive: { backgroundColor: colors.ink },
  socialTabText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  socialTabTextActive: { color: '#fff' },

  card: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18, gap: 10, ...shadow.card },
  cardHeading: { fontFamily: fonts.headingBold, color: colors.ink, fontSize: 20, letterSpacing: -0.3 },
  fieldLabel: { fontFamily: fonts.bodySemi, color: colors.textMuted, fontSize: 10, letterSpacing: 1.4, marginTop: 6 },
  input: {
    borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, minHeight: 50, paddingHorizontal: 14,
    color: colors.ink, backgroundColor: colors.canvas, fontFamily: fonts.body, fontSize: 15,
  },
  linkInput: { minHeight: 56, fontSize: 15 },
  multiInput: { minHeight: 86, paddingVertical: 12, lineHeight: 22 },
  sourceInput: {
    fontFamily: fonts.body, color: colors.ink, fontSize: 15, lineHeight: 24, borderColor: colors.line, backgroundColor: colors.canvas,
    borderWidth: 1, borderRadius: radius.lg, minHeight: 220, maxHeight: 380, padding: 15,
  },
  platformRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  platformDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  platformLine: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginLeft: 4 },
  detected: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: colors.successSoft },
  detectedText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.success },
  socialHelp: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line },
  statusText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.text },
  socialSourceBox: { borderWidth: 1, borderColor: colors.line, padding: 12, borderRadius: radius.md, backgroundColor: colors.canvas, gap: 5 },
  socialSourceTitle: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.success },
  socialSourceText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 19 },

  howTo: { padding: 18, borderRadius: radius.xl, backgroundColor: '#f8f1ea', gap: 12 },
  howTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  howNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  howNumberText: { fontFamily: fonts.bodyBold, fontSize: 12, color: '#fff' },
  howText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text, marginTop: 2 },

  reviewHero: { paddingTop: 4, gap: 6 },
  reviewOverview: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 8 },
  reviewOverviewItem: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 12, height: 34, borderRadius: radius.pill, backgroundColor: colors.brandSoft },
  reviewOverviewText: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 13 },
  reviewStep: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reviewStepText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.success, letterSpacing: 1.4 },
  backToNotes: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6, paddingVertical: 9 },
  backToNotesText: { fontFamily: fonts.bodySemi, color: BRAND, fontSize: 14 },
  reviewHeading: { gap: 4, marginBottom: 4 },
  reviewHint: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12 },

  servingsBox: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, padding: 14, gap: 6, marginVertical: 10 },
  servingsHeading: { fontFamily: fonts.heading, color: colors.ink, fontSize: 17 },
  servingsDescription: { fontFamily: fonts.body, color: colors.textMuted, lineHeight: 18, fontSize: 12 },
  servingsChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  servingsChoice: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, height: 38, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: colors.surface },
  servingsChoiceSelected: { borderColor: colors.ink, backgroundColor: colors.ink },
  servingsChoiceText: { fontFamily: fonts.bodySemi, color: colors.text, fontSize: 13 },
  servingsChoiceTextSelected: { color: '#fff' },
  servingsInvalid: { borderColor: '#dc7753', borderWidth: 2 },
  invalidInput: { borderColor: '#dc7753' },
  inlineError: { fontFamily: fonts.bodySemi, fontSize: 12, color: '#bd4d32', lineHeight: 19 },

  metaBox: { borderRadius: radius.lg, borderWidth: 1, borderColor: '#f1dcc8', backgroundColor: '#fff9f1', padding: 14, gap: 8, marginVertical: 10 },
  metaHeading: { fontFamily: fonts.heading, color: colors.ink, fontSize: 14 },
  notice: { borderRadius: radius.md, borderWidth: 1, borderColor: '#f5dca5', backgroundColor: colors.warningSoft, padding: 13, gap: 7 },
  noticeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeTitle: { flex: 1, fontFamily: fonts.bodySemi, color: colors.warning, fontSize: 13 },
  noticeText: { fontFamily: fonts.body, color: '#8a5a1f', fontSize: 12, lineHeight: 18 },

  sectionRow: { marginTop: 22, marginBottom: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionHeading: { flex: 1, gap: 3 },
  sectionEyebrow: { fontFamily: fonts.bodySemi, color: BRAND, fontSize: 10, letterSpacing: 1.6 },
  sectionTitle: { fontFamily: fonts.headingBold, color: colors.ink, fontSize: 19, letterSpacing: -0.3 },
  sectionCount: { fontFamily: fonts.body, fontSize: 14, color: colors.textFaint },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.brandSoft },
  add: { fontFamily: fonts.bodySemi, color: BRAND, fontSize: 13 },

  item: { borderColor: colors.line, borderRadius: radius.md, borderWidth: 1, backgroundColor: colors.surface, marginVertical: 3, overflow: 'hidden' },
  itemOpen: { borderColor: '#e7c3b6', backgroundColor: '#fffdfb' },
  itemHeader: { paddingHorizontal: 12, paddingVertical: 12, minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemContent: { flex: 1, minWidth: 0 },
  itemTitle: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 14 },
  amountPill: { maxWidth: 100, paddingVertical: 6, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: colors.cream },
  amountPillMissing: { backgroundColor: colors.warningSoft },
  itemAmount: { fontFamily: fonts.bodyMedium, color: colors.text, fontSize: 11, textAlign: 'right', flexShrink: 1 },
  itemAmountMissing: { color: colors.warning },
  itemNote: { fontFamily: fonts.body, color: colors.success, fontSize: 11, marginTop: 3, lineHeight: 15 },
  amber: { color: colors.warning },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontFamily: fonts.bodyBold, color: '#fff', fontSize: 12 },
  stepContent: { fontFamily: fonts.body, color: colors.text, fontSize: 14, lineHeight: 21 },
  itemEdit: { paddingHorizontal: 12, paddingBottom: 14, paddingTop: 8, borderTopColor: colors.line, borderTopWidth: 1, gap: 7 },
  inputRow: { flexDirection: 'row', gap: 10 },
  inputHalf: { flex: 1, gap: 6 },
  evidence: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, backgroundColor: colors.cream, padding: 10, borderRadius: radius.sm },
  remove: { fontFamily: fonts.bodySemi, color: '#c0564b', fontSize: 12, marginVertical: 5 },
  seoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: radius.md, padding: 14, borderColor: colors.line, borderWidth: 1, marginTop: 16 },
  seoTitle: { fontFamily: fonts.bodySemi, color: colors.text, fontSize: 14 },
  seoFields: { gap: 7 },
  publishCard: { backgroundColor: colors.successSoft, borderColor: '#cfe9da', borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 6, marginTop: 16 },
  small: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12, lineHeight: 18 },

  usageToast: { position: 'absolute', top: 8, left: 20, right: 20, backgroundColor: colors.ink, borderRadius: radius.lg, padding: 13, zIndex: 20, flexDirection: 'row', gap: 8, alignItems: 'center', ...shadow.floating },
  usageText: { fontFamily: fonts.bodySemi, color: '#fff', fontSize: 12, flex: 1 },

  bottomBar: { backgroundColor: colors.canvas, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, gap: 8 },
  footerProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  footerProgressText: { flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  footerConsentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerConsentText: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.text, lineHeight: 17 },
  footerRequired: { borderRadius: radius.md, backgroundColor: colors.warningSoft, flexDirection: 'row', gap: 7, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  footerRequiredText: { flex: 1, fontFamily: fonts.bodySemi, color: colors.warning, fontSize: 12 },
  footerError: { fontFamily: fonts.bodySemi, color: '#b54237', fontSize: 13, lineHeight: 18 },
  mainButton: { minHeight: 54, borderRadius: radius.pill, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, paddingHorizontal: 16 },
  mainButtonText: { fontFamily: fonts.bodySemi, color: '#fff', fontSize: 15 },
  buttonDisabled: { opacity: 0.45 },
});
