import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createRecipe, generateAIRecipe, getRecipes, getTerms } from '../../lib/api';
import { RecipeCreateUnconfirmedError } from '../../lib/recipe-publish';
import QuickRecipeReview from '../../components/recipe/QuickRecipeReview';
import { quickRecipeFromAI, validateQuickRecipe, approvedQuickRecipe, type QuickRecipeDraft } from '../../lib/quick-recipe-review';
import { Recipe, RecipeFilters } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import SearchBar from '../../components/SearchBar';
import FilterSheet from '../../components/FilterSheet';
import LoadingSpinner from '../../components/LoadingSpinner';
import ResponsiveGrid from '../../components/ResponsiveGrid';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { fetchAccountQuotas, reached, resetDate, useQuotas } from '../../lib/quotas';

const AI_LOADING_MESSAGES = [
  'Şef malzemeleri kokluyor... 👃',
  'Eski tarif defterleri karıştırılıyor... 📖',
  'Yapay zeka mutfağa giriyor... 🤖',
  'Tarifler harmanlıyor... 🥘',
  'Son dokunuşlar yapılıyor... ✨',
];

export default function RecipesScreen() {
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
  const { token } = useAuth();
  const quotas = useQuotas(token);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
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
  const quickCreateInFlightRef = useRef(false);
  const quickPublishInFlightRef = useRef(false);
  const [reviewDraft, setReviewDraft] = useState<QuickRecipeDraft | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewExistingId, setReviewExistingId] = useState<number | null>(null);
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

  const handleGenerateAI = useCallback(async (overridePrompt?: string) => {
    // Lock synchronously, before the first network await or React re-render.
    if (quickCreateInFlightRef.current) return;
    if (reviewDraft) {
      setReviewVisible(true); // Do not bill again for an already-generated proposal.
      return;
    }
    if (!token) {
      router.push('/login');
      return;
    }
    const searchQuery = (overridePrompt?.trim() || filters.query || query).trim();
    if (!searchQuery) {
      Alert.alert('Bir tarif yaz', 'Tarif adı veya elindeki malzemeleri yazabilirsin.');
      return;
    }

    quickCreateInFlightRef.current = true;
    setAiLoading(true);
    try {
      // An unavailable quota service is NOT permission to incur paid AI cost.
      let fresh;
      try {
        fresh = await fetchAccountQuotas(token);
      } catch {
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

      const aiResponse = await generateAIRecipe(token, searchQuery);
      setUsageNotice("AI tarif oluşturma denemen kullanıldı. Kalan hakların Profil'de.");
      void quotas.refresh();

      if (aiResponse.success && aiResponse.recipe) {
        // AI generation is a paid but UNSAVED candidate.
        // Never call createRecipe until the user approves the editable preview.
        const candidate = quickRecipeFromAI(aiResponse.recipe);
        setReviewDraft(candidate);
        setReviewExistingId(Number.isSafeInteger(aiResponse.existing_recipe_id) && aiResponse.existing_recipe_id > 0
          ? aiResponse.existing_recipe_id : null);
        setReviewError('');
        setReviewUncertain(false);
        setReviewVisible(true);
      } else {
        Alert.alert('Hata', 'Tarif hazırlanamadı. Lütfen tekrar dene.');
      }
    } catch (error: unknown) {
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
  }, [token, filters.query, query, router, quotas.refresh, reviewDraft]);

  const handlePublishQuickRecipe = useCallback(async () => {
    if (quickPublishInFlightRef.current || reviewSaving || reviewUncertain || !reviewDraft) return;
    const problem = validateQuickRecipe(reviewDraft);
    if (problem) { setReviewError(problem); return; }
    if (!token) { setReviewError('Tarifini yayımlamak için giriş yapmalısın.'); return; }
    quickPublishInFlightRef.current = true;
    setReviewSaving(true);
    setReviewError('');
    let requestStarted = false;
    try {
      let rights;
      try {
        rights = await fetchAccountQuotas(token);
      } catch {
        setReviewError('Kullanım hakların doğrulanamadı. Tarifin burada korunuyor; yeniden deneyebilirsin.');
        return;
      }
      if (reached(rights, 'recipe_day')) {
        setReviewError('Bugünkü tarif yayımlama hakkın doldu. Yeni hak: ' + resetDate(rights, 'recipe_day'));
        return;
      }
      const payload = approvedQuickRecipe(reviewDraft);
      requestStarted = true;
      const saved = await createRecipe(token, payload);
      if (!saved?.success || !(saved.slug || saved.id)) {
        setReviewError(saved?.message || 'Tarif kaydedilemedi.');
        return;
      }
      void quotas.refresh();
      setQuickPromptText('');
      setReviewVisible(false);
      router.push(`/recipe/${saved.slug || saved.id}`);
    } catch (error: unknown) {
      if (error instanceof RecipeCreateUnconfirmedError || requestStarted) {
        setReviewUncertain(true);
        setReviewError('Tarif kaydedilmiş olabilir. Yeniden oluşturmadan önce Profil > Tariflerim bölümünü kontrol et.');
      } else setReviewError(error instanceof Error ? error.message : 'Tarif yayımlanamadı.');
    } finally {
      quickPublishInFlightRef.current = false;
      setReviewSaving(false);
    }
  }, [reviewDraft, reviewSaving, reviewUncertain, token, router, quotas.refresh]);

  const handleNewQuickRecipe = useCallback(() => {
    if (reviewSaving || quickCreateInFlightRef.current) return;
    setReviewDraft(null);
    setReviewExistingId(null);
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

  const SORT_LABELS: Record<string, string> = { date: 'En Yeni', popular: 'En Popüler', rating: 'En Yüksek Puan' };

  const activeChips: { id: string; label: string; type: string; value?: string; color: string }[] = [];
  if (filters.query) activeChips.push({ id: 'query', label: `"${filters.query}"`, type: 'query', color: '#6b7280' });
  filters.mealType?.forEach((v) => activeChips.push({ id: `mealType-${v}`, label: v, type: 'mealType', value: v, color: '#1d4ed8' }));
  filters.cuisine?.forEach((v) => activeChips.push({ id: `cuisine-${v}`, label: v, type: 'cuisine', value: v, color: '#c2410c' }));
  filters.diet?.forEach((v) => activeChips.push({ id: `diet-${v}`, label: v, type: 'diet', value: v, color: '#15803d' }));
  filters.difficulty?.forEach((v) => activeChips.push({ id: `difficulty-${v}`, label: v, type: 'difficulty', value: v, color: '#6b7280' }));
  if (filters.sort) activeChips.push({ id: 'sort', label: SORT_LABELS[filters.sort] || filters.sort, type: 'sort', color: '#7c3aed' });

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchBarWrapper}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            onSubmit={handleSearch}
            placeholder="Tarif veya malzeme ara..."
          />
        </View>
        <TouchableOpacity
          style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonActive]}
          onPress={() => setFilterVisible(true)}
        >
          <Ionicons name="options" size={20} color={activeFilterCount > 0 ? '#ffffff' : '#1a1a1a'} />
          {activeFilterCount > 0 && <Text style={styles.filterCount}>{activeFilterCount}</Text>}
        </TouchableOpacity>
      </View>


      {activeChips.length > 0 ? (
        <View style={styles.activeFiltersRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersContent}>
            {activeChips.map((chip) => (
              <TouchableOpacity
                key={chip.id}
                style={[styles.activeChip, { backgroundColor: chip.color + '15', borderColor: chip.color + '40' }]}
                onPress={() => removeFilter(chip.type, chip.value)}
              >
                <Text style={[styles.activeChipText, { color: chip.color }]}>{chip.label}</Text>
                <Ionicons name="close-circle" size={14} color={chip.color} />
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
      ) : (
        <View style={styles.allRecipesRow}>
          <Ionicons name="list-outline" size={14} color="#999999" />
          <Text style={styles.allRecipesText}>Tüm tarifler listeleniyor</Text>
        </View>
      )}

      {loading ? (
        <LoadingSpinner fullScreen />
      ) : (
        <ResponsiveGrid
          data={recipes}
          keyExtractor={(item) => (item as Recipe).id.toString()}
          renderItem={({ item }) => <RecipeCard recipe={item as Recipe} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e74c3c" />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Tarif bulunamadı.</Text>
              <Text style={styles.emptySubtext}>Farklı filtreler deneyin.</Text>
              {(filters.query || query) ? (
                <View>
                  <TouchableOpacity
                    style={styles.aiCard}
                    onPress={() => { void handleGenerateAI(); }}>
                  <View style={styles.aiCardHeader}>
                    <Ionicons name="sparkles" size={20} color="#ffffff" />
                    <Text style={styles.aiCardTitle}>AI ile Tarif Oluştur</Text>
                  </View>
                  <Text style={styles.aiCardDesc}>
                    "{filters.query || query}" için yapay zeka ile özel bir tarif hazırlayalım.
                  </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          }
          ListFooterComponent={
            loadingMore ? <LoadingSpinner /> : null
          }
        />
      )}

      <FilterSheet
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={filters}
        onFiltersChange={handleFiltersChange}
        terms={terms ?? undefined}
      />

      {/* One global + shortcut. An explicit user-submitted prompt starts AI. */}
      <Modal visible={quickPromptVisible} transparent animationType="slide" onRequestClose={() => setQuickPromptVisible(false)}>
        <View style={styles.aiModalOverlay}>
          <View style={styles.quickCard}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pencereyi kapat"
              style={styles.quickClose} onPress={() => setQuickPromptVisible(false)}>
              <Ionicons name="close" size={20} color="#98887c" />
            </TouchableOpacity>
            <Ionicons name="sparkles" size={28} color="#db4c3f" />
            <Text style={styles.quickTitle}>Hızlı tarif oluştur</Text>
            <Text style={styles.quickDesc}>Tarif adını veya elindeki malzemeleri yaz. AI Şef senin için hazırlasın.</Text>
            <TextInput value={quickPromptText} onChangeText={setQuickPromptText}
              accessibilityLabel="Tarif adı veya malzemeler" multiline
              placeholder="Örn. Fırında tavuk veya patates, biber, peynir..."
              placeholderTextColor="#ac9c91" style={styles.quickInput} />
            <TouchableOpacity accessibilityRole="button" style={styles.quickAction}
              disabled={!reviewDraft && !quickPromptText.trim()} onPress={() => {
                const prompt = quickPromptText.trim();
                setQuickPromptVisible(false);
                void handleGenerateAI(prompt);
              }}>
              <Ionicons name="sparkles-outline" size={18} color="#fff" />
              <Text style={styles.quickActionText}>{reviewDraft ? 'Tarif önizlemene dön' : 'Tarifimi oluştur'}</Text>
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
      {reviewDraft ? (
        <QuickRecipeReview
          visible={reviewVisible}
          draft={reviewDraft}
          onChange={fn => setReviewDraft(old => old ? fn(old) : old)}
          existingRecipeId={reviewExistingId}
          cuisineOptions={terms?.cuisine?.map(item => item.label) || []}
          mealOptions={terms?.meal_type?.map(item => item.label) || []}
          saving={reviewSaving}
          uncertain={reviewUncertain}
          error={reviewError}
          onClose={() => setReviewVisible(false)}
          onNew={handleNewQuickRecipe}
          onPublish={() => { void handlePublishQuickRecipe(); }}
        />
      ) : null}
            {/* AI Loading Modal */}
      <Modal visible={aiModalVisible} transparent animationType="fade">
        <View style={styles.aiModalOverlay}>
          <View style={styles.aiModalCard}>
            <ActivityIndicator color="#e74c3c" size="large" />
            <Text style={styles.aiModalTitle}>Tarif Hazırlanıyor...</Text>
            <Text style={styles.aiModalMessage}>{aiLoadingMessage}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  searchRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchBarWrapper: {
    flex: 1,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    flexDirection: 'row',
    gap: 4,
  },
  filterButtonActive: {
    backgroundColor: '#e74c3c',
    borderColor: '#e74c3c',
  },
  filterCount: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999999',
    marginBottom: 20,
  },
  aiCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 20,
    width: '100%',
    gap: 8,
  },
  aiCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  aiCardDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
  },
  quickCard: { backgroundColor: '#fffbf7', borderRadius: 28, padding: 23, width: '100%', gap: 13 },
  quickClose: { alignSelf: 'flex-end' },
  quickTitle: { fontSize: 23, fontWeight: '900', color: '#1f303a' },
  quickDesc: { fontSize: 13, lineHeight: 19, color: '#8f8177' },
  quickInput: { minHeight: 98, borderWidth: 1, borderRadius: 16, borderColor: '#ecd9cc', backgroundColor: '#fff', padding: 13, fontSize: 14, textAlignVertical: 'top', color: '#202f3f' },
  quickAction: { minHeight: 51, backgroundColor: '#db4c3f', borderRadius: 14, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8 },
  quickActionText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  quickPantry: { color: '#b35744', fontSize: 12, fontWeight: '800', textAlign: 'center', paddingTop: 4 },
  quickToast: { position: 'absolute', bottom: 90, left: 20, right: 20, zIndex: 20, borderRadius: 14, backgroundColor: '#274538', padding: 13 },
  quickToastText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  aiModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  aiModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  aiModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  aiModalMessage: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  activeFiltersRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activeFiltersContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
    flexDirection: 'row',
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  activeChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  clearAllChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
  },
  clearAllChipText: {
    fontSize: 12,
    color: '#666666',
    fontWeight: '600',
  },
  allRecipesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  allRecipesText: {
    fontSize: 12,
    color: '#999999',
  },
});
