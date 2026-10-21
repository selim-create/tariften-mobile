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
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius } from '../../constants/theme';

interface Collection {
  name: string;
  slug: string;
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
      // /terms returns plain names; older payloads used { name, slug }.
      if (Array.isArray(terms?.collection)) {
        const mapped = (terms.collection as unknown[])
          .map(c => typeof c === 'string' ? { name: c, slug: c }
            : c && typeof c === 'object' && 'name' in c ? { name: String((c as { name: unknown }).name), slug: String((c as { slug?: unknown }).slug || (c as { name: unknown }).name) }
            : null)
          .filter((c): c is Collection => !!c && !!c.name.trim());
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
      const data = await getRecipes({ collection: [slug] });  // Core filters collections by name
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

  const active = collections.find(col => col.slug === selectedCollection) || null;
  const header = (
    <View style={styles.head}>
      <Text style={styles.kicker}>Koleksiyonlar{collections.length ? ` · ${collections.length}` : ''}</Text>
      <AccentText style={styles.title}>{active ? `${active.name} *seçkisi*` : 'Seçilmiş *tarifler*'}</AccentText>
      <Text style={styles.subtitle}>Editörlerin bir araya getirdiği tarif seçkileri.</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.collectionsRow}
        contentContainerStyle={styles.collectionsContent}
      >
        {collections.length === 0 ? (
          <Text style={styles.noCollections}>Koleksiyon bulunamadı.</Text>
        ) : (
          collections.map((col) => {
            const selected = selectedCollection === col.slug;
            return (
              <TouchableOpacity
                key={col.slug}
                style={[styles.collectionChip, selected && styles.collectionChipActive]}
                onPress={() => handleSelectCollection(col.slug)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.collectionName, selected && styles.collectionNameActive]}>
                  {col.name}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      {selectedCollection ? (
        <FlatList
          data={loadingRecipes ? [] : recipes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <RecipeCard recipe={item} variant="row" />}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
          }
          ListEmptyComponent={loadingRecipes ? <LoadingSpinner /> : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>Bu koleksiyonda tarif bulunamadı.</Text>
            </View>
          )}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}>
          {header}
          <View style={styles.selectPrompt}>
            <View style={styles.promptArt}>
              {['domates', 'fesleğen', 'limon'].map(name => <LokmaIngredientIcon key={name} name={name} size={28} />)}
            </View>
            <Text style={styles.selectPromptText}>Tarifleri görmek için bir koleksiyon seçin.</Text>
            <TouchableOpacity style={styles.allButton} onPress={() => router.push('/recipes')} accessibilityRole="button">
              <Text style={styles.allButtonText}>Tüm tariflere göz at</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  list: { paddingHorizontal: 20, paddingBottom: 48, gap: 10 },
  head: { paddingTop: 8, paddingBottom: 12 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 32, lineHeight: 37, letterSpacing: -0.9, color: colors.ink, marginTop: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 6 },
  collectionsRow: { marginHorizontal: -20, marginTop: 18 },
  collectionsContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  collectionChip: {
    height: 38, paddingHorizontal: 15, borderRadius: radius.pill, justifyContent: 'center',
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  collectionChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  collectionName: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  collectionNameActive: { color: '#ffffff' },
  noCollections: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  emptyContainer: { alignItems: 'center', padding: 24, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  selectPrompt: {
    alignItems: 'center', gap: 12, padding: 24, marginTop: 10, borderRadius: radius.xl,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  promptArt: { flexDirection: 'row', gap: 10 },
  selectPromptText: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink, textAlign: 'center' },
  allButton: { height: 46, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.brand, justifyContent: 'center' },
  allButtonText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
});
