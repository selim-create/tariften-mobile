import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { getRecipes, getTerms } from '../../lib/api';
import { Recipe, RecipeFilters } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import SearchBar from '../../components/SearchBar';
import FilterSheet from '../../components/FilterSheet';
import LoadingSpinner from '../../components/LoadingSpinner';
import { Ionicons } from '@expo/vector-icons';

export default function RecipesScreen() {
  const params = useLocalSearchParams<{
    query?: string;
    cuisine?: string;
    diet?: string;
    difficulty?: string;
    mealType?: string;
    collection?: string;
  }>();

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
    getTerms().then(setTerms).catch(console.error);
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

  const activeFilterCount = [
    filters.cuisine?.length,
    filters.diet?.length,
    filters.mealType?.length,
    filters.difficulty?.length,
    filters.sort,
  ].filter(Boolean).length;

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
  },
});
