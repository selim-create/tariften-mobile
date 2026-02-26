import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { getBlogPost } from '../../lib/api';
import { BlogPost } from '../../lib/types';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function BlogDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const navigation = useNavigation();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPost = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await getBlogPost(slug);
      setPost(data);
      if (data) {
        const title = data.title.rendered.replace(/<[^>]*>/g, '');
        navigation.setOptions({ title });
      }
    } catch (error) {
      console.error('Blog post load error:', error);
    } finally {
      setLoading(false);
    }
  }, [slug, navigation]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  if (loading) return <LoadingSpinner fullScreen />;

  if (!post) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Yazı bulunamadı.</Text>
      </View>
    );
  }

  const title = post.title.rendered.replace(/<[^>]*>/g, '');
  const content = post.content.rendered
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, '\n\n$1\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();

  const imageUrl = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" transition={300} />
      ) : null}

      <View style={styles.content}>
        <Text style={styles.date}>
          {new Date(post.date).toLocaleDateString('tr-TR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{content}</Text>
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
  image: {
    width: '100%',
    height: 260,
  },
  content: {
    padding: 20,
  },
  date: {
    fontSize: 13,
    color: '#999999',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    lineHeight: 32,
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    color: '#1a1a1a',
    lineHeight: 26,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666666',
  },
  bottomPadding: {
    height: 40,
  },
});
