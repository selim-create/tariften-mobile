import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { generateAIRecipe, getRecipes, getTerms } from '../../lib/api';
import { Recipe, RecipeFilters } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import SearchBar from '../../components/SearchBar';
import FilterSheet from '../../components/FilterSheet';
import LoadingSpinner from '../../components/LoadingSpinner';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

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
  }>();
  const router = useRouter();
  const { token } = useAuth();

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
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingMessage, setAiLoadingMessage] = useState(AI_LOADING_MESSAGES[0]);
  const aiMsgIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const handleGenerateAI = useCallback(async () => {
    if (!token) {
      router.push('/login');
      return;
    }
    const searchQuery = filters.query || query;
    if (!searchQuery.trim()) {
      Alert.alert('Hata', 'Tarif oluşturmak için önce bir arama yapın.');
      return;
    }
    setAiModalVisible(true);
    setAiLoading(true);
    let msgIdx = 0;
    aiMsgIntervalRef.current = setInterval(() => {
      msgIdx = (msgIdx + 1) % AI_LOADING_MESSAGES.length;
      setAiLoadingMessage(AI_LOADING_MESSAGES[msgIdx]);
    }, 2000);
    try {
      const result = await generateAIRecipe(token, searchQuery);
      if (aiMsgIntervalRef.current) {
        clearInterval(aiMsgIntervalRef.current);
        aiMsgIntervalRef.current = null;
      }
      setAiModalVisible(false);
      if (result?.slug) {
        router.push(`/recipe/${result.slug}`);
      } else {
        Alert.alert('Tarif Hazır!', 'AI tarifiniz oluşturuldu.');
      }
    } catch (error: unknown) {
      if (aiMsgIntervalRef.current) {
        clearInterval(aiMsgIntervalRef.current);
        aiMsgIntervalRef.current = null;
      }
      setAiModalVisible(false);
      Alert.alert('Hata', error instanceof Error ? error.message : 'AI tarif oluşturulamadı.');
    } finally {
      setAiLoading(false);
    }
  }, [token, filters.query, query, router]);

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

      {activeChips.length > 0 && (
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
      )}

      {loading ? (
        <LoadingSpinner fullScreen />
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <RecipeCard recipe={item} />}
          contentContainerStyle={styles.list}
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
                <TouchableOpacity style={styles.aiCard} onPress={handleGenerateAI}>
                  <View style={styles.aiCardHeader}>
                    <Ionicons name="sparkles" size={20} color="#ffffff" />
                    <Text style={styles.aiCardTitle}>AI ile Tarif Oluştur</Text>
                  </View>
                  <Text style={styles.aiCardDesc}>
                    "{filters.query || query}" için yapay zeka ile özel bir tarif hazırlayalım.
                  </Text>
                </TouchableOpacity>
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
  list: {
    padding: 16,
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
});
