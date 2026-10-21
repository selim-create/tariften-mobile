import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import RenderHtml, { defaultSystemFonts } from 'react-native-render-html';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getBlogPost, getBlogPosts } from '../../lib/api';
import { BlogPost } from '../../lib/types';
import {
  postAuthor, postCategory, postDate, postImage, postStandfirst, postTitle, readingMinutes,
} from '../../lib/blog';
import LoadingSpinner from '../../components/LoadingSpinner';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';

const SIDE = 20;
const SYSTEM_FONTS = [...defaultSystemFonts, fonts.body, fonts.bodyMedium, fonts.bodySemi, fonts.bodyBold, fonts.heading, fonts.headingBold, fonts.headingItalic];

/** Next reads: same category first, topped up with the newest posts. */
async function relatedPosts(post: BlogPost): Promise<BlogPost[]> {
  const category = post.categories?.[0];
  let related: BlogPost[] = [];
  if (category) related = (await getBlogPosts({ categories: [category], exclude: [post.id], perPage: 3 })).data;
  if (related.length < 3) {
    const { data: latest } = await getBlogPosts({ perPage: 6 });
    related = [...related, ...latest.filter(p => p.id !== post.id && !related.some(r => r.id === p.id))];
  }
  return related.slice(0, 3);
}

export default function BlogDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [related, setRelated] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPost = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await getBlogPost(slug);
      setPost(data);
      if (data) relatedPosts(data).then(setRelated).catch(() => setRelated([]));
    } catch (error) {
      console.warn('Blog post load error:', error);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void loadPost(); }, [loadPost]);

  const contentWidth = Math.min(width, 720) - SIDE * 2;
  const html = useMemo(() => ({ html: post?.content?.rendered || '' }), [post]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/blog'));

  if (loading) return <LoadingSpinner fullScreen />;

  if (!post) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>Yazı bulunamadı.</Text>
        <TouchableOpacity onPress={goBack} style={styles.errorBack}><Text style={styles.errorBackText}>Bloga dön</Text></TouchableOpacity>
      </View>
    );
  }

  const title = postTitle(post);
  const standfirst = postStandfirst(post);
  const image = postImage(post);
  const category = postCategory(post);
  const author = postAuthor(post);
  const minutes = readingMinutes(post.content?.rendered);
  const published = postDate(post.date);
  const updated = post.modified && post.modified.slice(0, 10) !== post.date.slice(0, 10) ? postDate(post.modified) : '';
  const metaLine = [author, published, minutes ? `${minutes} dk okuma` : null].filter(Boolean).join('  ·  ');

  const share = async () => {
    try {
      await Share.share({
        title,
        message: `${title}\nhttps://tariften.com/blog/${post.slug}`,
        url: `https://tariften.com/blog/${post.slug}`,
      });
    } catch (error) {
      console.warn('Share error:', error);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 + insets.bottom }}>
        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.circle} onPress={goBack} accessibilityRole="button" accessibilityLabel="Bloga geri dön">
            <Ionicons name="chevron-back" size={21} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.circle} onPress={() => void share()} accessibilityRole="button" accessibilityLabel="Yazıyı paylaş">
            <Ionicons name="share-outline" size={19} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <View style={styles.header}>
          {category ? (
            <TouchableOpacity onPress={() => router.push({ pathname: '/blog', params: { kategori: category.slug } })} hitSlop={8}>
              <Text style={styles.kicker}>{category.name}</Text>
            </TouchableOpacity>
          ) : <Text style={styles.kicker}>Mutfaktan blog</Text>}
          <Text style={styles.title}>{title}</Text>
          {standfirst ? <Text style={styles.standfirst}>{standfirst}</Text> : null}
          {metaLine ? <Text style={styles.meta}>{metaLine}</Text> : null}
          {updated ? <Text style={styles.updated}>Güncellendi: {updated}</Text> : null}
        </View>

        {image ? (
          <View style={styles.figure}>
            <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250}
              accessibilityLabel={post._embedded?.['wp:featuredmedia']?.[0]?.alt_text || title} />
          </View>
        ) : null}

        <View style={styles.article}>
          <RenderHtml
            contentWidth={contentWidth}
            source={html}
            systemFonts={SYSTEM_FONTS}
            baseStyle={baseStyle}
            tagsStyles={htmlTagsStyles}
            classesStyles={htmlClassesStyles}
            renderersProps={{
              img: { enableExperimentalPercentWidth: true },
              a: {
                onPress: (_: unknown, href: string) => {
                  if (href) void Linking.openURL(href);
                },
              },
            }}
          />

          <View style={styles.endRow}>
            <Pressable onPress={() => void share()} style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.88 }]} accessibilityRole="button">
              <Ionicons name="share-outline" size={17} color="#fff" />
              <Text style={styles.shareText}>Paylaş</Text>
            </Pressable>
            <TouchableOpacity onPress={() => router.push('/blog')} style={styles.allLink} accessibilityRole="link">
              <Ionicons name="arrow-back" size={16} color={colors.ink} />
              <Text style={styles.allText}>Tüm yazılar</Text>
            </TouchableOpacity>
          </View>
        </View>

        {related.length > 0 && (
          <View style={styles.related}>
            <Text style={styles.relatedKicker}>Mutfaktan blog</Text>
            <AccentText style={styles.relatedTitle}>{'Sıradaki *okumalık*'}</AccentText>
            <View style={{ marginTop: 14 }}>
              {related.map(item => {
                const thumb = postImage(item);
                const cat = postCategory(item);
                return (
                  <Pressable key={item.id} onPress={() => router.push(`/blog/${item.slug}`)}
                    style={({ pressed }) => [styles.relatedRow, pressed && { opacity: 0.88 }]} accessibilityRole="link">
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      {cat ? <Text style={styles.relatedCat}>{cat.name}</Text> : null}
                      <Text style={styles.relatedRowTitle} numberOfLines={3}>{postTitle(item)}</Text>
                      <Text style={styles.relatedMeta}>{postDate(item.date)}</Text>
                    </View>
                    {thumb ? (
                      <View style={styles.relatedThumb}><Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" /></View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const baseStyle = { fontFamily: fonts.body, fontSize: 17, lineHeight: 29, color: '#334155' };

const htmlTagsStyles = {
  p: { marginTop: 0, marginBottom: 20 },
  h1: { fontFamily: fonts.headingBold, color: colors.ink, fontSize: 28, lineHeight: 34, marginTop: 30, marginBottom: 12 },
  h2: { fontFamily: fonts.headingBold, color: colors.ink, fontSize: 25, lineHeight: 31, letterSpacing: -0.4, marginTop: 30, marginBottom: 12 },
  h3: { fontFamily: fonts.headingBold, color: colors.ink, fontSize: 20, lineHeight: 26, marginTop: 24, marginBottom: 8 },
  h4: { fontFamily: fonts.heading, color: colors.ink, fontSize: 18, marginTop: 20, marginBottom: 8 },
  h5: { fontFamily: fonts.heading, color: colors.ink, fontSize: 16, marginTop: 16, marginBottom: 6 },
  h6: { fontFamily: fonts.heading, color: colors.ink, fontSize: 15, marginTop: 16, marginBottom: 6 },
  strong: { fontFamily: fonts.bodyBold, color: colors.ink },
  b: { fontFamily: fonts.bodyBold, color: colors.ink },
  em: { fontStyle: 'italic' as const },
  i: { fontStyle: 'italic' as const },
  a: { fontFamily: fonts.bodySemi, color: colors.brand, textDecorationLine: 'none' as const },
  ul: { marginTop: 0, marginBottom: 20, paddingLeft: 6 },
  ol: { marginTop: 0, marginBottom: 20, paddingLeft: 6 },
  li: { marginBottom: 6 },
  blockquote: {
    marginVertical: 18, marginHorizontal: 0, paddingVertical: 4, paddingLeft: 18,
    borderLeftWidth: 3, borderLeftColor: colors.brand,
    fontFamily: fonts.headingItalic, fontSize: 19, lineHeight: 28, color: colors.ink,
  },
  img: { borderRadius: 16 },
  figure: { marginVertical: 12, marginHorizontal: 0 },
  figcaption: { fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: 'center' as const, marginTop: 6 },
  pre: { backgroundColor: '#f1f5f9', padding: 16, borderRadius: 10, marginVertical: 12 },
  code: { backgroundColor: '#f1f5f9', fontFamily: 'monospace', fontSize: 14, color: '#334155' },
  hr: { borderBottomWidth: 1, borderBottomColor: colors.line, marginVertical: 24 },
  table: { borderWidth: 1, borderColor: colors.line, marginVertical: 12 },
  th: { backgroundColor: colors.cream, padding: 8, borderWidth: 1, borderColor: colors.line, fontFamily: fonts.bodySemi, color: colors.ink },
  td: { padding: 8, borderWidth: 1, borderColor: colors.line },
};

const htmlClassesStyles = {
  'wp-block-image': { marginVertical: 12 },
  'wp-block-quote': { marginVertical: 18, paddingLeft: 18, borderLeftWidth: 3, borderLeftColor: colors.brand },
  'wp-block-gallery': { marginVertical: 12 },
  'wp-block-code': { backgroundColor: '#f1f5f9', padding: 16, borderRadius: 10 },
  'wp-block-preformatted': { backgroundColor: '#f1f5f9', padding: 16, borderRadius: 10 },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  bar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  circle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, ...shadow.card,
  },
  header: { paddingHorizontal: SIDE, paddingTop: 22, paddingBottom: 22 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 31, lineHeight: 37, letterSpacing: -0.9, color: colors.ink, marginTop: 12 },
  standfirst: { fontFamily: fonts.body, fontSize: 18, lineHeight: 27, color: colors.textMuted, marginTop: 14 },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginTop: 16 },
  updated: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 4 },
  figure: { marginHorizontal: SIDE, aspectRatio: 16 / 10, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.cream },
  article: { paddingHorizontal: SIDE, paddingTop: 28, width: '100%', maxWidth: 720, alignSelf: 'center' },
  endRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12,
    paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line,
  },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 46, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.ink },
  shareText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#fff' },
  allLink: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 46 },
  allText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  related: { marginTop: 40, paddingTop: 28, paddingHorizontal: SIDE, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#f8f1ea', paddingBottom: 12 },
  relatedKicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  relatedTitle: { fontFamily: fonts.headingBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.6, color: colors.ink, marginTop: 6 },
  relatedRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#eadfd5' },
  relatedCat: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.brand },
  relatedRowTitle: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 22, color: colors.ink },
  relatedMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  relatedThumb: { width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.cream },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas, gap: 14 },
  errorTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  errorBack: { height: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.ink, justifyContent: 'center' },
  errorBackText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#fff' },
});
