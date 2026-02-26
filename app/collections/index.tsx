import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getRecipes, getTerms } from '../../lib/api';
import { Recipe } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import LoadingSpinner from '../../components/LoadingSpinner';

interface Collection {
  name: string;
  slug: string;
  emoji: string;
  description: string;
}

export default function CollectionsScreen() {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadCollections = useCallback(async () => {
    try {
      const terms = await getTerms();
      if (terms?.collection) {
        const mapped = terms.collection.map((c: { name: string; slug: string }) => ({
          name: c.name,
          slug: c.slug,
          emoji: '📚',
          description: c.name,
        }));
        setCollections(mapped);
      }
    } catch (error) {
      console.error('Collections load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const loadCollectionRecipes = useCallback(async (slug: string) => {
    setLoadingRecipes(true);
    try {
      const data = await getRecipes({ collection: [slug] });
      setRecipes(data.data || []);
    } catch (error) {
      console.error('Collection recipes error:', error);
    } finally {
      setLoadingRecipes(false);
    }
  }, []);

  const handleSelectCollection = (slug: string) => {
    setSelectedCollection(slug);
    loadCollectionRecipes(slug);
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadCollections();
  }, [loadCollections]);

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.collectionsRow}
        contentContainerStyle={styles.collectionsContent}
      >
        {collections.length === 0 ? (
          <Text style={styles.noCollections}>Koleksiyon bulunamadı.</Text>
        ) : (
          collections.map((col) => (
            <TouchableOpacity
              key={col.slug}
              style={[styles.collectionChip, selectedCollection === col.slug && styles.collectionChipActive]}
              onPress={() => handleSelectCollection(col.slug)}
            >
              <Text style={styles.collectionEmoji}>{col.emoji}</Text>
              <Text style={[styles.collectionName, selectedCollection === col.slug && styles.collectionNameActive]}>
                {col.name}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {selectedCollection ? (
        loadingRecipes ? (
          <LoadingSpinner />
        ) : (
          <FlatList
            data={recipes}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <RecipeCard recipe={item} />}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e74c3c" />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Bu koleksiyonda tarif bulunamadı.</Text>
              </View>
            }
          />
        )
      ) : (
        <View style={styles.selectPrompt}>
          <Text style={styles.selectPromptIcon}>📚</Text>
          <Text style={styles.selectPromptText}>Tarifleri görmek için bir koleksiyon seçin.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  collectionsRow: {
    maxHeight: 80,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  collectionsContent: {
    padding: 12,
    gap: 8,
    alignItems: 'center',
  },
  collectionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    gap: 6,
  },
  collectionChipActive: {
    backgroundColor: '#e74c3c',
    borderColor: '#e74c3c',
  },
  collectionEmoji: {
    fontSize: 16,
  },
  collectionName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
  },
  collectionNameActive: {
    color: '#ffffff',
  },
  noCollections: {
    fontSize: 14,
    color: '#999999',
  },
  list: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
  },
  selectPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  selectPromptIcon: {
    fontSize: 48,
  },
  selectPromptText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
  },
});
