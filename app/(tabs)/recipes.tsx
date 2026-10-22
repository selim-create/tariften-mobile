import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createRecipe, generateAIRecipe, getRecipes, getTerms } from '../../lib/api';
import { RecipeCreateUnconfirmedError } from '../../lib/recipe-publish';
import SimilarRecipeChoice from '../../components/recipe/SimilarRecipeChoice';
import { quickRecipeFromAI, validateQuickRecipe, approvedQuickRecipe, type QuickRecipeDraft } from '../../lib/quick-recipe-review';
import { Recipe, RecipeFilters } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import { useTabBarSpace } from '../../components/navigation/FloatingTabBar';
import SearchBar from '../../components/SearchBar';
import FilterSheet from '../../components/FilterSheet';
import LoadingSpinner from '../../components/LoadingSpinner';
import ResponsiveGrid from '../../components/ResponsiveGrid';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { SORT_OPTIONS } from '../../components/FilterSheet';
import { useResponsive } from '../../hooks/useResponsive';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fetchAccountQuotas, reached, resetDate, useQuotas } from '../../lib/quotas';
import { AIAllergenConflictError, allergenWarningFrom } from '../../lib/allergen-ui';
import { afterModalDismiss, confirmAllergenWarning, showAllergenConflict } from '../../lib/allergen-alerts';
import HouseholdAdaptToggle, { useHouseholdAdaptSize } from '../../components/recipe/HouseholdAdaptToggle';
import { shouldAdaptHousehold } from '../../lib/household-adapt';

const AI_LOADING_MESSAGES = [
  'Şef malzemeleri kokluyor... 👃',
  'Eski tarif defterleri karıştırılıyor... 📖',
  'Yapay zeka mutfağa giriyor... 🤖',
  'Tarifler harmanlıyor... 🥘',
  'Son dokunuşlar yapılıyor... ✨',
];

export default function RecipesScreen() {
  const tabSpace = useTabBarSpace();
  const params = useLocalSearchParams<{
    query?: string;
    cuisine?: string;
    diet?: string;
    difficulty?: string;
    mealType?: string;
    collection?: string;
    quick?: string;
  }>();
  const router = useRouter();
  const { token, user } = useAuth();
  const quotas = useQuotas(token);
  // "Evime göre uyarla (N kişi)": members with a household size only; off by default.
  const householdSize = useHouseholdAdaptSize(user ? token : null);
  const [adaptHousehold, setAdaptHousehold] = useState(false);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState<RecipeFilters>({});
  const [filterVisible, setFilterVisible] = useState(false);
  const [terms, setTerms] = useState<{
    cuisine?: { label: string; value: string }[];
    diet?: { label: string; value: string }[];
    meal_type?: { label: string; value: string }[];
    difficulty?: { label: string; value: string }[];
  } | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState(params.query || '');
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [quickPromptVisible, setQuickPromptVisible] = useState(false);
  const [quickPromptText, setQuickPromptText] = useState('');
  const [usageNotice, setUsageNotice] = useState('');
  useEffect(() => {
    if (params.quick === '1') {
      setQuickPromptVisible(true);
      router.setParams({ quick: undefined });
    }
  }, [params.quick, router]);
  useEffect(() => {
    if (!usageNotice) return;
    const timer = setTimeout(() => setUsageNotice(''), 3200);
    return () => clearTimeout(timer);
  }, [usageNotice]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingMessage, setAiLoadingMessage] = useState(AI_LOADING_MESSAGES[0]);
  const aiMsgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const duplicateDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quickCreateInFlightRef = useRef(false);
  const quickPublishInFlightRef = useRef(false);
  const [reviewDraft, setReviewDraft] = useState<QuickRecipeDraft | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewExistingId, setReviewExistingId] = useState<number | null>(null);
  const [reviewExistingSlug, setReviewExistingSlug] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [reviewUncertain, setReviewUncertain] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);

  const loadRecipes = useCallback(
    async (pageNum: number = 1, currentFilters: RecipeFilters = filters, append = false) => {
      try {
        if (pageNum === 1 && !append) setLoading(true);
        else setLoadingMore(true);

        const data = await getRecipes({ ...currentFilters, page: pageNum });
        const newRecipes = data.data || [];

        if (append) {
          setRecipes((prev) => [...prev, ...newRecipes]);
        } else {
          setRecipes(newRecipes);
          const found = Number(data.count);
          setTotal(data.source !== 'error' && Number.isFinite(found) && found >= 0 ? found : null);
        }

        setHasMore(pageNum < (data.pages || 1));
        setPage(pageNum);
      } catch (error) {
        console.error('Recipes load error:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  useEffect(() => {
    getTerms().then((data) => {
      if (!data) return;
      const transform = (arr: unknown): { label: string; value: string }[] => {
        if (!Array.isArray(arr)) return [];
        return arr.map((item: unknown) => {
          if (typeof item === 'string') return { label: item, value: item };
          if (item && typeof item === 'object' && 'name' in item) {
            const o = item as { name: string; slug?: string };
            return { label: o.name, value: o.slug || o.name };
          }
          if (item && typeof item === 'object' && 'label' in item && 'value' in item) return item as { label: string; value: string };
          return { label: String(item), value: String(item) };
        });
      };
      const termsData = data as Record<string, unknown>;
      setTerms({
        meal_type: transform(termsData.meal_type),
        cuisine: transform(termsData.cuisine),
        diet: transform(termsData.diet),
        difficulty: transform(termsData.difficulty),
      });
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const newFilters: RecipeFilters = {};
    if (params.query) newFilters.query = params.query;
    if (params.cuisine) newFilters.cuisine = [params.cuisine];
    if (params.diet) newFilters.diet = [params.diet];
    if (params.difficulty) newFilters.difficulty = [params.difficulty];
    if (params.mealType) newFilters.mealType = [params.mealType];
    if (params.collection) newFilters.collection = [params.collection];
    if (Object.keys(newFilters).length > 0) {
      if (params.query) setQuery(params.query);
      setFilters(newFilters);
    }
  }, [params.query, params.cuisine, params.diet, params.difficulty, params.mealType, params.collection]);

  useEffect(() => {
    loadRecipes(1, filters, false);
  }, [filters]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRecipes(1, filters, false);
  }, [filters, loadRecipes]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingMore || loading) return;
    loadRecipes(page + 1, filters, true);
  }, [hasMore, loadingMore, loading, page, filters, loadRecipes]);

  const handleSearch = useCallback(() => {
    const newFilters = { ...filters, query };
    setFilters(newFilters);
  }, [filters, query]);

  const handleFiltersChange = useCallback((newFilters: RecipeFilters) => {
    setFilters(newFilters);
  }, []);

  // Automatic publication — only a confirmed published title match prompts a decision.
  // Protect ambiguous writes: a retry after network timeout could publish twice.
  const publishGeneratedRecipe = useCallback(async (draft: QuickRecipeDraft, authToken: string) => {
    if (quickPublishInFlightRef.current || reviewUncertain) return;
    const issue = validateQuickRecipe(draft);
    if (issue) { setReviewError('AI tarifinde eksik bilgi var: ' + issue); return; }
    quickPublishInFlightRef.current = true;
    setReviewSaving(true);
    setReviewError('');
    let requestStarted = false;
    try {
      let rights;
      try { rights = await fetchAccountQuotas(authToken); }
      catch { setReviewError('Tarif yayınlama hakkın kontrol edilemiyor. Oluşturulan tarif korunuyor.'); return; }
      if (reached(rights, 'recipe_day')) {
        setReviewError('Bugünkü tarif yayımlama hakkın doldu. Yeni hak: ' + resetDate(rights, 'recipe_day'));
        return;
      }
      const payload = approvedQuickRecipe(draft);
      requestStarted = true;
      const saved = await createRecipe(authToken, payload);
      if (!saved?.success || !(saved.slug || saved.id)) {
        setReviewError(saved?.message || 'Tarif kaydedilemedi.');
        return;
      }
      void quotas.refresh();
      setReviewDraft(null);
      setReviewVisible(false);
      setReviewExistingId(null);
      setReviewExistingSlug(null);
      setQuickPromptText('');
      router.push(`/recipe/${saved.slug || saved.id}`);
    } catch (error: unknown) {
      if (error instanceof RecipeCreateUnconfirmedError || requestStarted) {
        setReviewUncertain(true);
        setReviewError('Tarif kaydedilmiş olabilir. Tekrar göndermeden önce Profil > Tariflerim bölümünü kontrol et.');
      } else setReviewError(error instanceof Error ? error.message : 'Tarif yayımlanamadı.');
    } finally {
      quickPublishInFlightRef.current = false;
      setReviewSaving(false);
    }
  }, [reviewUncertain, router, quotas.refresh]);

  const handleGenerateAI = useCallback(async (overridePrompt?: string) => {
    if (quickCreateInFlightRef.current || quickPublishInFlightRef.current || reviewSaving) return;
    if (!token) { router.push('/login'); return; }
    if (reviewDraft) {
      if (reviewExistingId) setReviewVisible(true);
      else if (!reviewUncertain) await publishGeneratedRecipe(reviewDraft, token);
      return; // Reuse paid AI output without paying twice.
    }
    const searchQuery = (overridePrompt?.trim() || filters.query || query).trim();
    if (!searchQuery) {
      Alert.alert('Bir tarif yaz', 'Tarif adı veya elindeki malzemeleri yazabilirsin.');
      return;
    }

    quickCreateInFlightRef.current = true;
    setAiLoading(true);
    setReviewError('');
    try {
      let fresh;
      try { fresh = await fetchAccountQuotas(token); }
      catch {
        Alert.alert('Şu anda oluşturulamıyor', 'Kullanım hakların kontrol edilemiyor. Lütfen tekrar dene.');
        return;
      }
      if (reached(fresh, 'recipe_ai_day') || reached(fresh, 'recipe_day')) {
        const key = reached(fresh, 'recipe_ai_day') ? 'recipe_ai_day' : 'recipe_day';
        Alert.alert('Kullanım hakkın doldu', 'Yeni hak: ' + resetDate(fresh, key));
        return;
      }

      setAiModalVisible(true);
      setAiLoadingMessage(AI_LOADING_MESSAGES[0]);
      let msgIdx = 0;
      aiMsgIntervalRef.current = setInterval(() => {
        msgIdx = (msgIdx + 1) % AI_LOADING_MESSAGES.length;
        setAiLoadingMessage(AI_LOADING_MESSAGES[msgIdx]);
      }, 2000);

      const aiResponse = await generateAIRecipe(token, searchQuery, {
        adaptHousehold: shouldAdaptHousehold(householdSize, adaptHousehold),
      });
      setUsageNotice("AI tarif oluşturma denemen kullanıldı. Kalan hakların Profil'de.");
      void quotas.refresh();
      if (!aiResponse.success || !aiResponse.recipe) {
        Alert.alert('Hata', aiResponse.message || 'Tarif hazırlanamadı. Lütfen tekrar dene.');
        return;
      }

      // 'possible' hits on the member's allergens: ask before anything is published.
      const allergenWarning = allergenWarningFrom(aiResponse);
      if (allergenWarning) {
        setAiModalVisible(false);
        await afterModalDismiss();
        if (!(await confirmAllergenWarning(allergenWarning, 'Yayımla'))) return;
        setAiModalVisible(true);
      }

      const draft = quickRecipeFromAI(aiResponse.recipe);
      setReviewDraft(draft);
      const existingId = aiResponse.existing_recipe_id;
      const duplicateId = typeof existingId === 'number' && Number.isSafeInteger(existingId) && existingId > 0
        ? existingId : null;
      setReviewExistingId(duplicateId);
      setReviewExistingSlug(typeof aiResponse.existing_recipe_slug === 'string'
        && aiResponse.existing_recipe_slug.trim() ? aiResponse.existing_recipe_slug.trim() : null);
      setReviewUncertain(false);
      if (duplicateId) {
        // The loading modal must close before opening another native Modal,
        // otherwise iOS can lose or flash the second presentation.
        setAiModalVisible(false);
        if (duplicateDelayRef.current) clearTimeout(duplicateDelayRef.current);
        duplicateDelayRef.current = setTimeout(() => setReviewVisible(true), 320);
      } else {
        await publishGeneratedRecipe(draft, token);
      }
    } catch (error: unknown) {
      if (error instanceof AIAllergenConflictError) {
        // Refused by Core: nothing to save. The attempt still counted.
        void quotas.refresh();
        setAiModalVisible(false);
        await afterModalDismiss();
        showAllergenConflict(error, () => router.push('/profile/kitchen'));
        return;
      }
      Alert.alert('Hata', error instanceof Error ? error.message : 'AI tarif oluşturulamadı.');
    } finally {
      if (aiMsgIntervalRef.current) {
        clearInterval(aiMsgIntervalRef.current);
        aiMsgIntervalRef.current = null;
      }
      setAiModalVisible(false);
      setAiLoading(false);
      quickCreateInFlightRef.current = false;
    }
  }, [token, filters.query, query, router, quotas.refresh, reviewDraft, reviewExistingId,
      reviewSaving, reviewUncertain, publishGeneratedRecipe, householdSize, adaptHousehold]);

  const handlePublishQuickRecipe = useCallback(async () => {
    if (!reviewDraft || !token) return;
    await publishGeneratedRecipe(reviewDraft, token);
  }, [reviewDraft, token, publishGeneratedRecipe]);

  const handleNewQuickRecipe = useCallback(() => {
    if (reviewSaving || quickCreateInFlightRef.current) return;
    setReviewDraft(null);
    setReviewExistingId(null);
    setReviewExistingSlug(null);
    setReviewUncertain(false);
    setReviewError('');
    setReviewVisible(false);
    setQuickPromptText('');
    setQuickPromptVisible(true);
  }, [reviewSaving]);

  useEffect(() => {
    return () => {
      if (aiMsgIntervalRef.current) {
        clearInterval(aiMsgIntervalRef.current);
      }
      if (duplicateDelayRef.current) clearTimeout(duplicateDelayRef.current);
    };
  }, []);

  const activeFilterCount = [
    filters.cuisine?.length,
    filters.diet?.length,
    filters.mealType?.length,
    filters.difficulty?.length,
    filters.sort,
  ].filter(Boolean).length;

  const removeFilter = useCallback((type: string, value?: string) => {
    if (type === 'query') {
      setQuery('');
      setFilters((prev) => { const f = { ...prev }; delete f.query; return f; });
    } else if (type === 'sort') {
      setFilters((prev) => { const f = { ...prev }; delete f.sort; return f; });
    } else if (value) {
      setFilters((prev) => {
        const key = type as keyof RecipeFilters;
        const current = (prev[key] as string[]) || [];
        const updated = current.filter((v) => v !== value);
        return { ...prev, [key]: updated.length > 0 ? updated : undefined };
      });
    }
  }, []);

  const SORT_LABELS: Record<string, string> = Object.fromEntries(SORT_OPTIONS.map((o) => [o.value, o.label]));

  const activeChips: { id: string; label: string; type: string; value?: string }[] = [];
  if (filters.query) activeChips.push({ id: 'query', label: `“${filters.query}”`, type: 'query' });
  filters.mealType?.forEach((v) => activeChips.push({ id: `mealType-${v}`, label: v, type: 'mealType', value: v }));
  filters.cuisine?.forEach((v) => activeChips.push({ id: `cuisine-${v}`, label: v, type: 'cuisine', value: v }));
  filters.diet?.forEach((v) => activeChips.push({ id: `diet-${v}`, label: v, type: 'diet', value: v }));
  filters.difficulty?.forEach((v) => activeChips.push({ id: `difficulty-${v}`, label: v, type: 'difficulty', value: v }));
  filters.collection?.forEach((v) => activeChips.push({ id: `collection-${v}`, label: v, type: 'collection', value: v }));
  if (filters.sort) activeChips.push({ id: 'sort', label: SORT_LABELS[filters.sort] || filters.sort, type: 'sort' });

  // Two photo tiles per row on phones; tablets keep their wider grid.
  const { width } = useWindowDimensions();
  const { columns: baseColumns } = useResponsive();
  const columns = Math.max(2, baseColumns);
  const GAP = 14;
  const SIDE = 20;
  const tileWidth = Math.floor((width - SIDE * 2 - GAP * (columns - 1)) / columns);
  const mealTypes = (terms?.meal_type || []).slice(0, 10);
  const activeMeal = filters.mealType?.length === 1 ? filters.mealType[0] : null;
  const searchedFor = (filters.query || '').trim();
  const countLabel = total !== null ? `${total.toLocaleString('tr-TR')} tarif` : null;

  const householdToggle = (
    <HouseholdAdaptToggle size={householdSize} value={adaptHousehold} onValueChange={setAdaptHousehold}
      disabled={aiLoading} />
  );
  const aiCard = (
    <View style={styles.aiCardWrap}>
    <Pressable
      style={({ pressed }) => [styles.aiCard, pressed && { opacity: 0.92 }]}
      accessibilityRole="button"
      onPress={() => { if (searchedFor || query.trim()) void handleGenerateAI(); else setQuickPromptVisible(true); }}>
      <View style={styles.aiCardHeader}>
        <View style={styles.aiCardIcon}><Ionicons name="sparkles" size={18} color={colors.ink} /></View>
        <Text style={styles.aiCardKicker}>AI Şef</Text>
      </View>
      <Text style={styles.aiCardTitle}>AI ile Tarif Oluştur</Text>
      <Text style={styles.aiCardDesc}>
        {searchedFor || query.trim()
          ? `“${searchedFor || query.trim()}” için sana özel bir tarif hazırlayalım.`
          : 'Tarif adını ya da elindeki malzemeleri yaz; AI Şef senin için yazsın.'}
      </Text>
    </Pressable>
    {householdToggle}
    </View>
  );

  const header = (
    <View style={styles.head}>
      <View style={styles.topRow}>
        <TouchableOpacity style={styles.circle} onPress={() => router.navigate('/')} accessibilityRole="button" accessibilityLabel="Keşfet'e dön">
          <Ionicons name="chevron-back" size={21} color={colors.ink} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.circle, activeFilterCount > 0 && styles.circleActive]}
          onPress={() => setFilterVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={activeFilterCount > 0 ? `Filtreler, ${activeFilterCount} etkin` : 'Filtrele ve sırala'}
        >
          <Ionicons name="options-outline" size={20} color={activeFilterCount > 0 ? '#ffffff' : colors.ink} />
          {activeFilterCount > 0 && <View style={styles.filterCount}><Text style={styles.filterCountText}>{activeFilterCount}</Text></View>}
        </TouchableOpacity>
      </View>

      <Text style={styles.kicker}>Tarifler{countLabel ? ` · ${countLabel}` : ''}</Text>
      <AccentText style={styles.title}>{searchedFor ? 'Aradığın *tarifler*' : 'Tüm *tarifler*'}</AccentText>
      <Text style={styles.subtitle}>Tarif adı ya da malzeme yaz, mutfağa ve öğüne göre daralt.</Text>

      <View style={styles.searchRow}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={handleSearch}
          placeholder="Tarif veya malzeme ara..."
        />
      </View>

      {mealTypes.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.meals} style={styles.mealsScroll}>
          <Pressable onPress={() => setFilters((prev) => ({ ...prev, mealType: undefined }))}
            style={[styles.meal, !filters.mealType?.length && styles.mealActive]}
            accessibilityRole="tab" accessibilityState={{ selected: !filters.mealType?.length }}>
            <Text style={[styles.mealText, !filters.mealType?.length && styles.mealTextActive]}>Tümü</Text>
          </Pressable>
          {mealTypes.map((meal) => {
            const selected = activeMeal === meal.value;
            return (
              <Pressable key={meal.value}
                onPress={() => setFilters((prev) => ({ ...prev, mealType: selected ? undefined : [meal.value] }))}
                style={[styles.meal, selected && styles.mealActive]}
                accessibilityRole="tab" accessibilityState={{ selected }}>
                <Text style={[styles.mealText, selected && styles.mealTextActive]}>{meal.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {activeChips.length > 0 ? (
        <View style={styles.activeFiltersRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersContent}>
            {activeChips.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                style={styles.activeChip}
                onPress={() => removeFilter(chip.type, chip.value)}
                accessibilityRole="button"
                accessibilityLabel={`${chip.label} filtresini kaldır`}
              >
                <Text style={styles.activeChipText}>{chip.label}</Text>
                <Ionicons name="close" size={14} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
            {activeChips.length > 1 && (
              <TouchableOpacity
                style={styles.clearAllChip}
                onPress={() => { setFilters({}); setQuery(''); }}
              >
                <Text style={styles.clearAllChipText}>Temizle</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      ) : null}
      {!loading && activeChips.length > 0 && countLabel ? (
        <Text style={styles.resultLine}>{total === 0 ? 'Eşleşen tarif yok' : `${countLabel} bulundu`}</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {loading && recipes.length === 0 ? (
        <View style={{ flex: 1 }}>
          {header}
          <LoadingSpinner />
        </View>
      ) : (
        <ResponsiveGrid
          data={recipes}
          minColumns={2}
          gap={GAP}
          keyExtractor={(item) => (item as Recipe).id.toString()}
          renderItem={({ item }) => (
            <View style={{ width: tileWidth }}>
              <RecipeCard recipe={item as Recipe} variant="tile" />
            </View>
          )}
          ListHeaderComponent={header}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SIDE, paddingTop: 0, paddingBottom: tabSpace }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyArt}>
                {['domates', 'yumurta', 'fesleğen'].map((name) => <LokmaIngredientIcon key={name} name={name} size={30} />)}
              </View>
              <Text style={styles.emptyText}>Tarif bulunamadı.</Text>
              <Text style={styles.emptySubtext}>Farklı bir kelime ya da daha az filtre dene.</Text>
              {(filters.query || query) ? aiCard : null}
            </View>
          }
          ListFooterComponent={
            loadingMore ? <LoadingSpinner /> : (!hasMore && recipes.length > 0 ? (
              <View style={styles.footer}>
                <Text style={styles.footerLine}>Aradığın tam olarak bu değil mi?</Text>
                {aiCard}
              </View>
            ) : null)
          }
        />
      )}

      <FilterSheet
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        terms={terms ?? undefined}
        resultCount={loading ? null : total}
      />

      {/* One global + shortcut. An explicit user-submitted prompt starts AI. */}
      <Modal visible={quickPromptVisible} transparent animationType="slide" onRequestClose={() => setQuickPromptVisible(false)}>
        <View style={styles.aiModalOverlay}>
          <View style={styles.quickCard}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pencereyi kapat"
              style={styles.quickClose} onPress={() => setQuickPromptVisible(false)}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={styles.quickIcon}><Ionicons name="sparkles" size={22} color={colors.brand} /></View>
            <Text style={styles.quickTitle}>Hızlı tarif oluştur</Text>
            <Text style={styles.quickDesc}>Tarif adını veya elindeki malzemeleri yaz. AI Şef senin için hazırlasın.</Text>
            <TextInput value={quickPromptText} onChangeText={setQuickPromptText}
              accessibilityLabel="Tarif adı veya malzemeler" multiline
              placeholder="Örn. Fırında tavuk veya patates, biber, peynir..."
              placeholderTextColor={colors.textFaint} style={styles.quickInput} />
            {!reviewDraft ? householdToggle : null}
            <TouchableOpacity accessibilityRole="button" style={styles.quickAction}
              disabled={!reviewDraft && !quickPromptText.trim()} onPress={() => {
                const prompt = quickPromptText.trim();
                setQuickPromptVisible(false);
                void handleGenerateAI(prompt);
              }}>
              <Ionicons name="sparkles-outline" size={18} color="#fff" />
              <Text style={styles.quickActionText}>{reviewDraft ? 'Tarifini kaydetmeye devam et' : 'Tarifimi oluştur'}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" onPress={() => {
              setQuickPromptVisible(false);
              router.push('/(tabs)/pantry');
            }}>
              <Text style={styles.quickPantry}>Dolabımdaki malzemeleri kullan →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {usageNotice ? <View style={styles.quickToast} accessibilityRole="alert"><Text style={styles.quickToastText}>{usageNotice}</Text></View> : null}
      {reviewError && !reviewVisible ? (
        <TouchableOpacity accessibilityRole="button" style={styles.quickToast}
          disabled={reviewUncertain}
          onPress={() => { if (reviewDraft && !reviewUncertain) void handlePublishQuickRecipe(); }}>
          <Text accessibilityRole="alert" style={styles.quickToastText}>
            {reviewError}{reviewDraft && !reviewUncertain ? '  ·  Kaydı tekrar dene' : ''}
          </Text>
        </TouchableOpacity>
      ) : null}
      <SimilarRecipeChoice
        visible={reviewVisible && !!reviewDraft && !!reviewExistingId}
        title={reviewDraft?.title || ''}
        saving={reviewSaving}
        uncertain={reviewUncertain}
        error={reviewError}
        onClose={() => { if (!reviewSaving) setReviewVisible(false); }}
        onCreate={() => { void handlePublishQuickRecipe(); }}
        onViewExisting={() => {
          if (!reviewExistingId) return;
          setReviewVisible(false);
          router.push(`/recipe/${reviewExistingSlug || reviewExistingId}`);
        }}
      />
      {/* AI Loading Modal */}
      <Modal visible={aiModalVisible} transparent animationType="fade">
        <View style={styles.aiModalOverlay}>
          <View style={styles.aiModalCard}>
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={styles.aiModalTitle}>{reviewSaving ? 'Tarif Yayımlanıyor...' : 'Tarif Hazırlanıyor...'}</Text>
            <Text style={styles.aiModalMessage}>{aiLoadingMessage}</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  head: { paddingBottom: 18 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, marginBottom: 14 },
  circle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  circleActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  filterCount: {
    position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9,
    backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.canvas,
  },
  filterCountText: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#fff' },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 34, lineHeight: 39, letterSpacing: -1.1, color: colors.ink, marginTop: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 6 },
  searchRow: { marginTop: 18 },
  mealsScroll: { marginHorizontal: -20, marginTop: 14 },
  meals: { gap: 8, paddingHorizontal: 20 },
  meal: {
    height: 38, paddingHorizontal: 15, borderRadius: radius.pill, justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  mealActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  mealText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  mealTextActive: { color: '#fff' },
  activeFiltersRow: { marginHorizontal: -20, marginTop: 12 },
  activeFiltersContent: { paddingHorizontal: 20, gap: 8, flexDirection: 'row' },
  activeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingLeft: 12, paddingRight: 9,
    borderRadius: radius.pill, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: '#f6d6cc',
  },
  activeChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.ink },
  clearAllChip: { height: 32, paddingHorizontal: 10, justifyContent: 'center' },
  clearAllChipText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.brand },
  resultLine: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 12 },
  emptyContainer: { alignItems: 'center', paddingTop: 30, paddingBottom: 20, gap: 4 },
  emptyArt: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  emptyText: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  emptySubtext: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginBottom: 18, textAlign: 'center' },
  footer: { paddingTop: 26, gap: 12 },
  footerLine: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  aiCardWrap: { width: '100%', gap: 10 },
  aiCard: { backgroundColor: colors.ink, borderRadius: radius.xl, padding: 20, width: '100%', gap: 6 },
  aiCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  aiCardIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  aiCardKicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: '#f3b8ad' },
  aiCardTitle: { fontFamily: fonts.headingBold, fontSize: 20, color: '#ffffff' },
  aiCardDesc: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.72)' },
  quickCard: { backgroundColor: colors.canvas, borderRadius: 28, padding: 23, width: '100%', gap: 12 },
  quickClose: { alignSelf: 'flex-end' },
  quickIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { fontFamily: fonts.headingBold, fontSize: 24, letterSpacing: -0.6, color: colors.ink },
  quickDesc: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  quickInput: {
    minHeight: 98, borderWidth: 1, borderRadius: radius.lg, borderColor: colors.line, backgroundColor: colors.surface,
    padding: 14, fontFamily: fonts.body, fontSize: 15, textAlignVertical: 'top', color: colors.ink,
  },
  quickAction: { minHeight: 52, backgroundColor: colors.brand, borderRadius: radius.pill, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  quickActionText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  quickPantry: { fontFamily: fonts.bodySemi, color: colors.brand, fontSize: 13, textAlign: 'center', paddingTop: 4 },
  quickToast: { position: 'absolute', bottom: 104, left: 20, right: 20, zIndex: 20, borderRadius: radius.lg, backgroundColor: colors.ink, padding: 14, ...shadow.floating },
  quickToastText: { fontFamily: fonts.bodySemi, color: '#fff', fontSize: 12, lineHeight: 17 },
  aiModalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 28 },
  aiModalCard: { backgroundColor: colors.canvas, borderRadius: radius.xl, padding: 32, alignItems: 'center', gap: 12, width: '100%' },
  aiModalTitle: { fontFamily: fonts.headingBold, fontSize: 19, color: colors.ink },
  aiModalMessage: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
