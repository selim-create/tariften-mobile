import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getBlogCategories, getBlogPosts } from '../../lib/api';
import { BlogPost } from '../../lib/types';
import { postCategory, postDate, postExcerpt, postImage, postTitle, readingMinutes } from '../../lib/blog';
import LoadingSpinner from '../../components/LoadingSpinner';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius } from '../../constants/theme';

type Category = { id: number; name: string; slug: string; count: number };
const PER_PAGE = 10;

function meta(post: BlogPost) {
  const minutes = readingMinutes(post.content?.rendered);
  return [postDate(post.date), minutes ? `${minutes} dk okuma` : null].filter(Boolean).join(' · ');
}

/** Lead story: the newest post, large. */
function FeaturedPost({ post, onPress }: { post: BlogPost; onPress: () => void }) {
  const image = postImage(post);
  const category = postCategory(post);
  const excerpt = postExcerpt(post);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.featured, pressed && { opacity: 0.92 }]}
      accessibilityRole="link" accessibilityLabel={postTitle(post)}>
      <View style={styles.featuredMedia}>
        {image
          ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          : <View style={styles.noImage}><LokmaIngredientIcon name="kahve" size={46} /></View>}
      </View>
      {category ? <Text style={styles.kickerSmall}>{category.name}</Text> : null}
      <Text style={styles.featuredTitle} numberOfLines={3}>{postTitle(post)}</Text>
      {excerpt ? <Text style={styles.featuredExcerpt} numberOfLines={3}>{excerpt}</Text> : null}
      <Text style={styles.meta}>{meta(post)}</Text>
    </Pressable>
  );
}

function PostRow({ post, onPress }: { post: BlogPost; onPress: () => void }) {
  const image = postImage(post);
  const category = postCategory(post);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.88 }]}
      accessibilityRole="link" accessibilityLabel={postTitle(post)}>
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        {category ? <Text style={styles.kickerSmall}>{category.name}</Text> : null}
        <Text style={styles.rowTitle} numberOfLines={3}>{postTitle(post)}</Text>
        <Text style={styles.meta}>{meta(post)}</Text>
      </View>
      <View style={styles.rowThumb}>
        {image
          ? <Image source={{ uri: image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          : <View style={styles.noImage}><LokmaIngredientIcon name="kahve" size={28} /></View>}
      </View>
    </Pressable>
  );
}

/**
 * Blog: "Tabaktan önce okumalık." Category chips from WordPress, the newest
 * post as the lead story, then a quiet list; pages load while scrolling.
 */
export default function BlogListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kategori?: string }>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [active, setActive] = useState<Category | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const request = useRef(0);

  useEffect(() => {
    getBlogCategories().then(list => {
      setCategories(list);
      if (params.kategori) setActive(list.find(c => c.slug === params.kategori) || null);
    });
  }, [params.kategori]);

  const loadPosts = useCallback(async (pageNum: number, category: Category | null) => {
    const id = ++request.current;
    if (pageNum === 1) setLoading(true); else setLoadingMore(true);
    try {
      const result = await getBlogPosts({ page: pageNum, perPage: PER_PAGE, categories: category ? [category.id] : undefined });
      if (id !== request.current) return;
      setPosts(prev => (pageNum === 1 ? result.data : [...prev, ...result.data.filter(p => !prev.some(x => x.id === p.id))]));
      if (pageNum === 1) setTotal(typeof result.total === 'number' ? result.total : null);
      setHasMore(pageNum < result.totalPages);
      setPage(pageNum);
    } finally {
      if (id === request.current) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => { void loadPosts(1, active); }, [active, loadPosts]);

  const open = (post: BlogPost) => router.push(`/blog/${post.slug}`);
  const allCount = categories.reduce((sum, c) => sum + c.count, 0);
  const shownTotal = active ? active.count : total;

  const header = (
    <View style={styles.head}>
      <TouchableOpacity style={styles.circle} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button" accessibilityLabel="Geri dön">
        <Ionicons name="chevron-back" size={21} color={colors.ink} />
      </TouchableOpacity>
      <Text style={styles.kicker}>Mutfaktan blog{shownTotal ? ` · ${shownTotal} yazı` : ''}</Text>
      <AccentText style={styles.title}>{'Tabaktan önce *okumalık.*'}</AccentText>
      <Text style={styles.subtitle}>Teknikler, malzemeler ve mutfağın arkasındaki küçük bilimler. Kısa okumalar, uzun lezzetler.</Text>
      {categories.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
          {[{ id: 0, name: 'Tümü', slug: '', count: allCount }, ...categories].map(category => {
            const selected = category.id === 0 ? !active : active?.id === category.id;
            return (
              <Pressable key={category.id} onPress={() => setActive(category.id === 0 ? null : category)}
                style={[styles.chip, selected && styles.chipActive]}
                accessibilityRole="tab" accessibilityState={{ selected }}>
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{category.name}</Text>
                {category.count > 0 ? <Text style={[styles.chipCount, selected && styles.chipCountActive]}>{category.count}</Text> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={loading ? [] : posts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item, index }) => index === 0
          ? <FeaturedPost post={item} onPress={() => open(item)} />
          : <PostRow post={item} onPress={() => open(item)} />}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void loadPosts(1, active); }} tintColor={colors.brand} />}
        onEndReached={() => { if (hasMore && !loadingMore && !loading) void loadPosts(page + 1, active); }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={loading ? <LoadingSpinner /> : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Bu bölümde henüz yazı yok.</Text>
            {active ? (
              <TouchableOpacity onPress={() => setActive(null)}><Text style={styles.emptyLink}>Tüm yazılara dön</Text></TouchableOpacity>
            ) : null}
          </View>
        )}
        ListFooterComponent={loadingMore ? <LoadingSpinner /> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  list: { paddingHorizontal: 20, paddingBottom: 48, flexGrow: 1 },
  head: { paddingTop: 6, paddingBottom: 26 },
  circle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, marginBottom: 18,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 36, lineHeight: 40, letterSpacing: -1.2, color: colors.ink, marginTop: 10 },
  subtitle: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textMuted, marginTop: 12 },
  chipsScroll: { marginHorizontal: -20, marginTop: 20 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 15, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  chipTextActive: { color: '#fff' },
  chipCount: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  chipCountActive: { color: 'rgba(255,255,255,0.6)' },
  featured: { gap: 8, paddingBottom: 26, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  featuredMedia: { aspectRatio: 16 / 10, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.cream, marginBottom: 8 },
  featuredTitle: { fontFamily: fonts.headingBold, fontSize: 25, lineHeight: 31, letterSpacing: -0.6, color: colors.ink },
  featuredExcerpt: { fontFamily: fonts.body, fontSize: 15, lineHeight: 23, color: colors.textMuted },
  noImage: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  kickerSmall: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.brand },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  rowTitle: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 22, color: colors.ink },
  rowThumb: { width: 96, height: 96, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.cream },
  empty: { padding: 24, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', gap: 8 },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink },
  emptyLink: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
});
