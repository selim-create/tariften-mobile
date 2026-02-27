import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import RenderHtml from 'react-native-render-html';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { getBlogPost } from '../../lib/api';
import { BlogPost } from '../../lib/types';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function BlogDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const navigation = useNavigation();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();

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
        <RenderHtml contentWidth={width - CONTENT_PADDING * 2} source={{ html: post.content.rendered }} />
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const CONTENT_PADDING = 20;

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
    padding: CONTENT_PADDING,
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
