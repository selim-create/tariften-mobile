import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { getBlogPosts } from '../../lib/api';
import { BlogPost } from '../../lib/types';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function BlogListScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const loadPosts = useCallback(async (pageNum: number = 1, append = false) => {
    try {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      const data = await getBlogPosts({ page: pageNum, perPage: 10 });
      if (append) {
        setPosts((prev) => [...prev, ...data]);
      } else {
        setPosts(data);
      }
      setHasMore(data.length === 10);
      setPage(pageNum);
    } catch (error) {
      console.error('Blog load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPosts(1, false);
  }, [loadPosts]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPosts(1, false);
  }, [loadPosts]);

  const onEndReached = useCallback(() => {
    if (!hasMore || loadingMore) return;
    loadPosts(page + 1, true);
  }, [hasMore, loadingMore, page, loadPosts]);

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => {
        const imageUrl = item._embedded?.['wp:featuredmedia']?.[0]?.source_url;
        const title = item.title.rendered.replace(/<[^>]*>/g, '');
        const excerpt = item.excerpt.rendered.replace(/<[^>]*>/g, '').trim().slice(0, 120);

        return (
          <TouchableOpacity
            style={styles.postCard}
            onPress={() => router.push(`/blog/${item.slug}`)}
            activeOpacity={0.8}
          >
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.postImage} contentFit="cover" transition={200} />
            ) : (
              <View style={styles.postImagePlaceholder}>
                <Text style={styles.postImagePlaceholderText}>📝</Text>
              </View>
            )}
            <View style={styles.postContent}>
              <Text style={styles.postTitle} numberOfLines={2}>
                {title}
              </Text>
              {excerpt ? (
                <Text style={styles.postExcerpt} numberOfLines={2}>
                  {excerpt}...
                </Text>
              ) : null}
              <Text style={styles.postDate}>
                {new Date(item.date).toLocaleDateString('tr-TR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>
          </TouchableOpacity>
        );
      }}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e74c3c" />
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Henüz blog yazısı yok.</Text>
        </View>
      }
      ListFooterComponent={loadingMore ? <LoadingSpinner /> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    backgroundColor: '#ffffff',
    flexGrow: 1,
  },
  postCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  postImage: {
    width: '100%',
    height: 200,
  },
  postImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postImagePlaceholderText: {
    fontSize: 40,
  },
  postContent: {
    padding: 14,
  },
  postTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    lineHeight: 22,
    marginBottom: 6,
  },
  postExcerpt: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 19,
    marginBottom: 8,
  },
  postDate: {
    fontSize: 12,
    color: '#999999',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#666666',
  },
});
