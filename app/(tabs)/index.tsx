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
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { getBlogPosts, getRecipes } from '../../lib/api';
import { BlogPost, Recipe } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function HomeScreen() {
  const router = useRouter();
  const [featuredRecipes, setFeaturedRecipes] = useState<Recipe[]>([]);
  const [latestBlog, setLatestBlog] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [recipesData, blogData] = await Promise.all([
        getRecipes({ sort: 'popular', page: 1 }),
        getBlogPosts({ perPage: 3 }),
      ]);
      setFeaturedRecipes(recipesData.data.slice(0, 6));
      setLatestBlog(blogData);
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

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e74c3c" />}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>tariften</Text>
        <Text style={styles.heroSubtitle}>Yemek tarifleri ve menüler</Text>
        <TouchableOpacity style={styles.heroCta} onPress={() => router.push('/recipes')}>
          <Text style={styles.heroCtaText}>Tarifleri Keşfet</Text>
        </TouchableOpacity>
      </View>

      {/* Featured Recipes */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Popüler Tarifler</Text>
          <TouchableOpacity onPress={() => router.push('/recipes')}>
            <Text style={styles.seeAll}>Tümü →</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={featuredRecipes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => <RecipeCard recipe={item} horizontal />}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        />
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hızlı Erişim</Text>
        <View style={styles.actionsGrid}>
          {[
            { label: '🧺 Kilerim', route: '/pantry' },
            { label: '📋 Menüler', route: '/menus' },
            { label: '📚 Koleksiyonlar', route: '/collections' },
            { label: '📝 Blog', route: '/blog' },
          ].map((action) => (
            <TouchableOpacity
              key={action.route}
              style={styles.actionCard}
              onPress={() => router.push(action.route as any)}
            >
              <Text style={styles.actionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Latest Blog */}
      {latestBlog.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Son Yazılar</Text>
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
    padding: 32,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: -1,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
    marginBottom: 20,
  },
  heroCta: {
    backgroundColor: '#ffffff',
    borderRadius: 25,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  heroCtaText: {
    color: '#e74c3c',
    fontWeight: '700',
    fontSize: 15,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  seeAll: {
    fontSize: 14,
    color: '#e74c3c',
    fontWeight: '600',
  },
  horizontalList: {
    paddingRight: 16,
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
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
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
  bottomPadding: {
    height: 32,
  },
});
