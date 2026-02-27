import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getBlogPosts, getMenus, getRecipes } from '../../lib/api';
import { BlogPost, Menu, Recipe } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import LoadingSpinner from '../../components/LoadingSpinner';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const CUISINES = [
  {
    label: '🇹🇷 Türk',
    param: 'Türk Mutfağı',
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?q=80&w=400&auto=format&fit=crop',
  },
  {
    label: '🇮🇹 İtalyan',
    param: 'İtalyan Mutfağı',
    image: 'https://images.unsplash.com/photo-1595295333158-4742f28fbd85?q=80&w=400&auto=format&fit=crop',
  },
  {
    label: '🥢 Asya',
    param: 'Asya Mutfağı',
    image: 'https://images.unsplash.com/photo-1552590635-27c2c2128abf?q=80&w=400&auto=format&fit=crop',
  },
  {
    label: '🌮 Meksika',
    param: 'Meksika Mutfağı',
    image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?q=80&w=400&auto=format&fit=crop',
  },
];

const MOODS: { label: string; icon: IoniconName; color: string; param: Record<string, string> }[] = [
  { label: 'Fit & Sağlıklı', icon: 'leaf-outline', color: '#27ae60', param: { diet: 'Düşük Karbonhidrat' } },
  { label: 'Üşengeç Şef', icon: 'bed-outline', color: '#8e44ad', param: { difficulty: 'Kolay' } },
  { label: 'Ziyafet', icon: 'heart-outline', color: '#e74c3c', param: { difficulty: 'Şef' } },
  { label: 'Tatlı Krizi', icon: 'ice-cream-outline', color: '#e67e22', param: { mealType: 'Tatlı' } },
  { label: 'Acı Sever', icon: 'flame-outline', color: '#c0392b', param: { cuisine: 'Meksika Mutfağı' } },
  { label: 'Pazar Kahvaltısı', icon: 'cafe-outline', color: '#16a085', param: { mealType: 'Kahvaltı' } },
];

export default function HomeScreen() {
  const router = useRouter();
  const [popularRecipes, setPopularRecipes] = useState<Recipe[]>([]);
  const [editorsRecipes, setEditorsRecipes] = useState<Recipe[]>([]);
  const [latestBlog, setLatestBlog] = useState<BlogPost[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [popularData, editorsData, blogData, menusData] = await Promise.all([
        getRecipes({ collection: ['Popüler'] }),
        getRecipes({ collection: ['Editörün Seçimi'] }),
        getBlogPosts({ perPage: 3 }),
        getMenus(),
      ]);
      setPopularRecipes(popularData.data.slice(0, 6));
      setEditorsRecipes(editorsData.data.slice(0, 4));
      setLatestBlog(blogData);
      setMenus(menusData.slice(0, 3));
    } catch (error) {
      console.error('Home load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      router.push({ pathname: '/recipes', params: { query: searchQuery.trim() } } as any);
    } else {
      router.push('/recipes');
    }
  };

  const navigateWithFilter = (params: Record<string, string>) => {
    router.push({ pathname: '/recipes', params } as any);
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e74c3c" />}
      showsVerticalScrollIndicator={false}
    >
      {/* Section 1: Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Bugün ne pişiriyoruz?</Text>
        <Text style={styles.heroSubtitle}>Binlerce tarif, tek platform</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#999999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Tarif veya malzeme ara..."
            placeholderTextColor="#999999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </View>
      </View>

      {/* Section 2: Vizesiz Dünya Turu */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="earth" size={18} color="#1a1a1a" />
          <Text style={styles.sectionTitle}>Vizesiz Dünya Turu</Text>
        </View>
        <FlatList
          data={CUISINES}
          keyExtractor={(item) => item.param}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.cuisineCard}
              onPress={() => navigateWithFilter({ cuisine: item.param })}
              activeOpacity={0.85}
            >
              <Image source={{ uri: item.image }} style={styles.cuisineImage} contentFit="cover" />
              <View style={styles.cuisineOverlay}>
                <Text style={styles.cuisineLabel}>{item.label}</Text>
              </View>
            </TouchableOpacity>
          )}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        />
      </View>

      {/* Section 3: Şu An Herkes Bunu Pişiriyor */}
      {popularRecipes.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flame" size={18} color="#e74c3c" />
            <Text style={styles.sectionTitle}>Şu An Herkes Bunu Pişiriyor</Text>
            <TouchableOpacity onPress={() => router.push('/recipes')}>
              <Text style={styles.seeAll}>Tümü →</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={popularRecipes}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <RecipeCard recipe={item} horizontal badge="Popüler" />}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
          />
        </View>
      )}

      {/* Section 4: Şefin Tavsiyesi */}
      {editorsRecipes.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="ribbon" size={18} color="#f39c12" />
            <Text style={styles.sectionTitle}>Şefin Tavsiyesi</Text>
            <TouchableOpacity onPress={() => router.push('/recipes')}>
              <Text style={styles.seeAll}>Tümü →</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.editorsGrid}>
            {editorsRecipes.map((recipe) => (
              <TouchableOpacity
                key={recipe.id}
                style={styles.editorCard}
                onPress={() => router.push(`/recipe/${recipe.slug}`)}
                activeOpacity={0.85}
              >
                <Image source={{ uri: recipe.image }} style={styles.editorImage} contentFit="cover" />
                <View style={styles.editorOverlay}>
                  <Text style={styles.editorTitle} numberOfLines={2}>
                    {recipe.title}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Section 5: Mutfaktan Blog */}
      {latestBlog.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text" size={18} color="#1a1a1a" />
            <Text style={styles.sectionTitle}>Mutfaktan Blog</Text>
            <TouchableOpacity onPress={() => router.push('/blog')}>
              <Text style={styles.seeAll}>Tümü →</Text>
            </TouchableOpacity>
          </View>
          {latestBlog.map((post) => {
            const imageUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
            return (
              <TouchableOpacity
                key={post.id}
                style={styles.blogCard}
                onPress={() => router.push(`/blog/${post.slug}`)}
              >
                {imageUrl && (
                  <Image source={{ uri: imageUrl }} style={styles.blogImage} contentFit="cover" transition={200} />
                )}
                <View style={styles.blogContent}>
                  <Text style={styles.blogTitle} numberOfLines={2}>
                    {post.title.rendered.replace(/<[^>]*>/g, '')}
                  </Text>
                  <Text style={styles.blogDate}>
                    {new Date(post.date).toLocaleDateString('tr-TR')}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Section 6: Menü Showcase */}
      {menus.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="restaurant" size={18} color="#1a1a1a" />
            <Text style={styles.sectionTitle}>Menü Showcase</Text>
            <TouchableOpacity onPress={() => router.push('/menus')}>
              <Text style={styles.seeAll}>Tümü →</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionSubtitle}>"Bugün ne pişirsem?" derdine ilaç gibi menüler</Text>
          <FlatList
            data={menus}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.menuCard}
                onPress={() => router.push(`/menu/${item.slug}`)}
                activeOpacity={0.85}
              >
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.menuImage} contentFit="cover" />
                ) : (
                  <View style={[styles.menuImage, styles.menuImagePlaceholder]} />
                )}
                <View style={styles.menuCardContent}>
                  <Text style={styles.menuTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  {item.event_type ? (
                    <View style={styles.menuBadge}>
                      <Text style={styles.menuBadgeText}>{item.event_type}</Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            )}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
          />
        </View>
      )}

      {/* Section 7: Hangi Moddasın? */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="color-palette" size={18} color="#1a1a1a" />
          <Text style={styles.sectionTitle}>Hangi Moddasın?</Text>
        </View>
        <View style={styles.moodsGrid}>
          {MOODS.map((mood) => (
            <TouchableOpacity
              key={mood.label}
              style={[styles.moodButton, { backgroundColor: mood.color }]}
              onPress={() => navigateWithFilter(mood.param)}
              activeOpacity={0.8}
            >
              <Ionicons name={mood.icon} size={22} color="#ffffff" />
              <Text style={styles.moodLabel}>{mood.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Section 8: Akıllı Banner */}
      <View style={styles.bannerSection}>
        <View style={styles.banner}>
          <Ionicons name="sparkles" size={32} color="#ffffff" />
          <Text style={styles.bannerTitle}>AI ile Tarif Keşfet</Text>
          <Text style={styles.bannerSubtitle}>
            Elindeki malzemelere göre yapay zeka destekli tarif önerileri al.
          </Text>
          <TouchableOpacity style={styles.bannerButton} onPress={() => router.push('/pantry')}>
            <Text style={styles.bannerButtonText}>Hemen Dene</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hızlı Erişim</Text>
        <View style={styles.actionsGrid}>
          {[
            { label: 'Kilerim', icon: 'basket-outline' as IoniconName, route: '/pantry' },
            { label: 'Menüler', icon: 'book-outline' as IoniconName, route: '/menus' },
            { label: 'Blog', icon: 'document-text-outline' as IoniconName, route: '/blog' },
            { label: 'Profil', icon: 'person-outline' as IoniconName, route: '/profile' },
          ].map((action) => (
            <TouchableOpacity
              key={action.route}
              style={styles.actionCard}
              onPress={() => router.push(action.route as any)}
            >
              <Ionicons name={action.icon} size={24} color="#e74c3c" />
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  hero: {
    backgroundColor: '#e74c3c',
    padding: 28,
    paddingTop: 32,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    marginBottom: 20,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    flex: 1,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#666666',
    marginTop: -8,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  seeAll: {
    fontSize: 13,
    color: '#e74c3c',
    fontWeight: '600',
  },
  horizontalList: {
    paddingRight: 16,
  },
  cuisineCard: {
    width: 140,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
  },
  cuisineImage: {
    width: '100%',
    height: '100%',
  },
  cuisineOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  cuisineLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  editorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  editorCard: {
    width: '47.5%',
    height: 130,
    borderRadius: 12,
    overflow: 'hidden',
  },
  editorImage: {
    width: '100%',
    height: '100%',
  },
  editorOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 8,
  },
  editorTitle: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
  },
  blogCard: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  blogImage: {
    width: 90,
    height: 90,
  },
  blogContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  blogTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    lineHeight: 20,
  },
  blogDate: {
    fontSize: 12,
    color: '#999999',
  },
  menuCard: {
    width: 180,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  menuImage: {
    width: '100%',
    height: 110,
  },
  menuImagePlaceholder: {
    backgroundColor: '#e5e5e5',
  },
  menuCardContent: {
    padding: 10,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 6,
    lineHeight: 18,
  },
  menuBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  menuBadgeText: {
    fontSize: 10,
    color: '#666666',
    fontWeight: '600',
  },
  moodsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  moodButton: {
    width: '47.5%',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  moodLabel: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  bannerSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  banner: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  bannerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  bannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 20,
  },
  bannerButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginTop: 8,
  },
  bannerButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  actionCard: {
    width: '47%',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    alignItems: 'center',
    gap: 8,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  bottomPadding: {
    height: 32,
  },
});
