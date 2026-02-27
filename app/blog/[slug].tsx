import React, { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
        <RenderHtml
          contentWidth={width - CONTENT_PADDING * 2}
          source={{ html: post.content.rendered }}
          tagsStyles={htmlTagsStyles}
          classesStyles={htmlClassesStyles}
          renderersProps={{
            img: { enableExperimentalPercentWidth: true },
            a: {
              onPress: (_: unknown, href: string) => {
                if (href) Linking.openURL(href);
              },
            },
          }}
        />
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const CONTENT_PADDING = 20;

const htmlTagsStyles = {
  p: { color: '#475569', lineHeight: 28, marginBottom: 24, fontSize: 16 },
  h1: { color: '#0f172a', fontWeight: 'bold' as const, fontSize: 28, marginTop: 32, marginBottom: 12 },
  h2: { color: '#0f172a', fontWeight: 'bold' as const, fontSize: 24, marginTop: 32, marginBottom: 12 },
  h3: { color: '#0f172a', fontWeight: 'bold' as const, fontSize: 20, marginTop: 24, marginBottom: 8 },
  h4: { color: '#0f172a', fontWeight: 'bold' as const, fontSize: 18, marginTop: 20, marginBottom: 8 },
  h5: { color: '#0f172a', fontWeight: 'bold' as const, fontSize: 16, marginTop: 16, marginBottom: 6 },
  h6: { color: '#0f172a', fontWeight: 'bold' as const, fontSize: 15, marginTop: 16, marginBottom: 6 },
  strong: { color: '#0f172a', fontWeight: 'bold' as const },
  b: { color: '#0f172a', fontWeight: 'bold' as const },
  em: { color: '#1e293b', fontStyle: 'italic' as const },
  i: { color: '#1e293b', fontStyle: 'italic' as const },
  a: { color: '#db4c3f', fontWeight: '600' as const, textDecorationLine: 'none' as const },
  ul: { color: '#475569', paddingLeft: 8, marginBottom: 16 },
  ol: { color: '#475569', paddingLeft: 8, marginBottom: 16 },
  li: { color: '#475569', fontSize: 16, lineHeight: 26, marginBottom: 4 },
  blockquote: {
    borderLeftWidth: 4,
    borderLeftColor: '#db4c3f',
    backgroundColor: '#fff5f5',
    paddingLeft: 16,
    paddingVertical: 8,
    marginVertical: 16,
    fontStyle: 'italic' as const,
    color: '#475569',
  },
  img: { borderRadius: 16, marginVertical: 8 },
  pre: { backgroundColor: '#f1f5f9', padding: 16, borderRadius: 8, marginVertical: 12 },
  code: { backgroundColor: '#f1f5f9', fontFamily: 'monospace', fontSize: 14, color: '#334155' },
  hr: { borderBottomWidth: 1, borderBottomColor: '#e2e8f0', marginVertical: 24 },
  table: { borderWidth: 1, borderColor: '#e2e8f0', marginVertical: 12 },
  th: { backgroundColor: '#f8fafc', padding: 8, borderWidth: 1, borderColor: '#e2e8f0', fontWeight: 'bold' as const, color: '#0f172a' },
  td: { padding: 8, borderWidth: 1, borderColor: '#e2e8f0', color: '#475569' },
  figure: { marginVertical: 8 },
  figcaption: { color: '#64748b', fontSize: 13, textAlign: 'center' as const, marginTop: 4 },
};

const htmlClassesStyles = {
  'wp-block-image': { marginVertical: 12 },
  'wp-block-quote': {
    borderLeftWidth: 4,
    borderLeftColor: '#db4c3f',
    backgroundColor: '#fff5f5',
    paddingLeft: 16,
    paddingVertical: 8,
    marginVertical: 16,
  },
  'wp-block-gallery': { marginVertical: 12 },
  'wp-block-code': { backgroundColor: '#f1f5f9', padding: 16, borderRadius: 8 },
  'wp-block-preformatted': { backgroundColor: '#f1f5f9', padding: 16, borderRadius: 8 },
};

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
