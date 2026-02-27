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

const PLACEHOLDERS = [
  'Dolapta sadece yumurta ve yoğurt var...',
  'Akşama misafir var, havalı bir şey lazım...',
  '15 dakikada hazırlayabileceğim fit bir tarif...',
  'Canım tatlı çekiyor ama diyetteyim...',
  'İtalyan mutfağından makarna harici ne var?',
];

const PILLS = [
  '🥑 Elimde avokado var',
  '⏱️ 15 dakikada akşam yemeği',
  '💪 Spor sonrası protein',
  '🌱 Vegan ve glutensiz',
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

  // Typewriter states
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [typingSpeed, setTypingSpeed] = useState(100);

  useEffect(() => {
    const currentFullText = PLACEHOLDERS[placeholderIndex];
    const handleTyping = () => {
      if (!isDeleting) {
        setDisplayText(currentFullText.substring(0, displayText.length + 1));
        setTypingSpeed(50);
        if (displayText === currentFullText) {
          setIsDeleting(true);
          setTypingSpeed(2000);
        }
      } else {
        setDisplayText(currentFullText.substring(0, displayText.length - 1));
        setTypingSpeed(30);
        if (displayText === '') {
          setIsDeleting(false);
          setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
        }
      }
    };
    const timer = setTimeout(handleTyping, typingSpeed);
    return () => clearTimeout(timer);
  }, [displayText, isDeleting, placeholderIndex, typingSpeed]);

  const loadData = useCallback(async () => {
    try {
      const [popularData, editorsData, blogData, menusData] = await Promise.all([
        getRecipes({ collection: ['Popüler'] }),
        getRecipes({ collection: ['Editörün Seçimi'] }),
        getBlogPosts({ perPage: 3 }),
        getMenus({ collection: 'vitrin' }),
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
        <View style={styles.heroBadge}>
          <Ionicons name="sparkles" size={13} color="#db4c3f" />
          <Text style={styles.heroBadgeText}>Yapay Zeka Mutfak Asistanı</Text>
        </View>
        <Text style={styles.heroTitle}>
          Bugün ne{' '}
          <Text style={styles.heroTitleAccent}>pişiriyoruz?</Text>
        </Text>
        <Text style={styles.heroSubtitle}>Malzemeleri yaz, gerisini yapay zekaya bırak.</Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color="#999999" />
          <TextInput
            style={styles.searchInput}
            placeholder={searchQuery.length === 0 ? displayText + '|' : undefined}
            placeholderTextColor="#999999"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsContainer}
        >
          {PILLS.map((pill) => (
            <TouchableOpacity
              key={pill}
              style={styles.pill}
              onPress={() => router.push({ pathname: '/recipes', params: { query: pill } } as any)}
              activeOpacity={0.8}
            >
              <Text style={styles.pillText}>{pill}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
          <View style={styles.menuShowcaseBadge}>
            <Ionicons name="trophy" size={13} color="#db4c3f" />
            <Text style={styles.menuShowcaseBadgeText}>Şefin Tavsiyesi</Text>
          </View>
          <Text style={styles.menuShowcaseTitle}>
            "Bugün ne pişirsem?" derdine{' '}
            <Text style={styles.menuShowcaseTitleAccent}>ilaç gibi</Text>
            {' '}menüler.
          </Text>
          <Text style={styles.menuShowcaseDesc}>
            Sizin yerinize düşündük, planladık, eşleştirdik. Siz sadece mutfağa girin ve şovunuzu yapın. (Teşekküre gerek yok, bi' tabak gönderirsiniz.)
          </Text>
          {menus.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuCard}
              onPress={() => router.push(`/menu/${item.slug}`)}
              activeOpacity={0.85}
            >
              <View style={styles.menuImageWrapper}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.menuImage} contentFit="cover" />
                ) : (
                  <View style={[styles.menuImage, styles.menuImagePlaceholder]} />
                )}
                <View style={styles.menuGuestBadge}>
                  <Ionicons name="people-outline" size={12} color="#ffffff" />
                  <Text style={styles.menuGuestText}>{item.guest_count} Kişilik</Text>
                </View>
                <View style={styles.menuAIBadge}>
                  <Text style={styles.menuAIBadgeText}>✨ AI Choice</Text>
                </View>
              </View>
              <View style={styles.menuCardContent}>
                {item.concept ? (
                  <View style={styles.menuConceptBadge}>
                    <Text style={styles.menuConceptText}>{item.concept}</Text>
                  </View>
                ) : null}
                <Text style={styles.menuTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.description ? (
                  <Text style={styles.menuDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
                <View style={styles.menuCardFooter}>
                  {item.event_type ? (
                    <View style={styles.menuBadge}>
                      <Text style={styles.menuBadgeText}>{item.event_type}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.menuInspect}>İncele →</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.menuArchiveLink}
            onPress={() => router.push('/menus')}
          >
            <Text style={styles.menuArchiveLinkText}>
              Vitrindekiler yetmedi mi? Tüm arşivi karıştır →
            </Text>
          </TouchableOpacity>
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
            { label: 'Dolabım', icon: 'basket-outline' as IoniconName, route: '/pantry' },
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
    backgroundColor: '#fcfcfc',
    padding: 28,
    paddingTop: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0e8e8',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fde8e7',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#db4c3f',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  heroTitleAccent: {
    color: '#db4c3f',
  },
  heroSubtitle: {
    fontSize: 15,
    color: '#666666',
    marginTop: 6,
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
    borderWidth: 1,
    borderColor: '#e5e5e5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
  },
  pillsContainer: {
    paddingTop: 12,
    paddingRight: 4,
    gap: 8,
  },
  pill: {
    backgroundColor: 'rgba(219,76,63,0.08)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(219,76,63,0.2)',
    marginRight: 8,
  },
  pillText: {
    fontSize: 13,
    color: '#db4c3f',
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 36,
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
  menuShowcaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fde8e7',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  menuShowcaseBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#db4c3f',
  },
  menuShowcaseTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1a1a1a',
    lineHeight: 28,
    marginBottom: 8,
  },
  menuShowcaseTitleAccent: {
    color: '#db4c3f',
    fontStyle: 'italic',
  },
  menuShowcaseDesc: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 19,
    marginBottom: 16,
  },
  menuCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  menuImageWrapper: {
    position: 'relative',
  },
  menuImage: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  menuImagePlaceholder: {
    backgroundColor: '#e5e5e5',
  },
  menuGuestBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  menuGuestText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  menuAIBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(26,26,26,0.8)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  menuAIBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  menuCardContent: {
    padding: 12,
  },
  menuConceptBadge: {
    backgroundColor: '#fde8e7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  menuConceptText: {
    fontSize: 11,
    color: '#db4c3f',
    fontWeight: '600',
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
    lineHeight: 20,
  },
  menuDescription: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 18,
    marginBottom: 8,
  },
  menuCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  menuInspect: {
    fontSize: 13,
    color: '#db4c3f',
    fontWeight: '600',
  },
  menuArchiveLink: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  menuArchiveLinkText: {
    fontSize: 14,
    color: '#db4c3f',
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
