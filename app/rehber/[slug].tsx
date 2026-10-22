import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchGuide, GuideNotFoundError } from '../../lib/guides-api';
import {
  guideBlocks, guideDateTr, guideShareUrl, guideToc, internalRouteFor, primaryTopic, readingLabel,
  type GuideDetail, type TocEntry,
} from '../../lib/guides';
import GuideArticle from '../../components/guide/GuideArticle';
import GuideTocSheet, { TocList } from '../../components/guide/GuideTocSheet';
import { LevelMeter } from '../../components/guide/GuideCard';
import { openExternal } from '../../components/guide/openExternal';
import ImagePlaceholder from '../../components/ImagePlaceholder';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';

const SIDE = 20;
const BAR = 56;
const TOC_PREVIEW = 6;
const ARTICLE_TOP = 28;

type Status = 'loading' | 'ready' | 'not_found' | 'error';

/**
 * One Mutfak Rehberi article: meta, food-safety badge, hero, İçindekiler
 * (inline and as a sheet from the top bar), the body, sources and recipes to
 * cook with it. The top bar stays put and gains a background once you scroll.
 */
export default function GuideDetailScreen() {
  const params = useLocalSearchParams<{ slug: string }>();
  // Typed or shared links may carry capitals; Core slugs are lowercase.
  const slug = ((Array.isArray(params.slug) ? params.slug[0] : params.slug) || '').trim().replace(/[A-Z]/g, (c: string) => c.toLowerCase());
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [guide, setGuide] = useState<GuideDetail | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const [tocExpanded, setTocExpanded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const columnY = useRef(0);
  const bodyY = useRef(0);
  const headingY = useRef<Record<string, number>>({});

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading');
    try {
      const data = await fetchGuide(slug, signal);
      if (signal?.aborted) return;
      headingY.current = {};
      setGuide(data);
      setStatus('ready');
    } catch (cause) {
      if (signal?.aborted) return;
      if (cause instanceof GuideNotFoundError) { setStatus('not_found'); return; }
      setError(cause instanceof Error ? cause.message : 'Rehber yazısı yüklenemedi.');
      setStatus('error');
    }
  }, [slug]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const blocks = useMemo(() => guideBlocks(guide?.contentHtml), [guide]);
  const toc = useMemo(() => guideToc(blocks), [blocks]);
  const contentWidth = Math.min(width, 720) - SIDE * 2;
  const topSpace = insets.top + BAR;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/rehber'));

  const share = async () => {
    if (!guide) return;
    const url = guideShareUrl(guide);
    try {
      await Share.share({ title: guide.title, message: `${guide.title}\n${url}`, url });
    } catch (cause) {
      console.warn('Share error:', cause);
    }
  };

  const onLink = useCallback((href: string) => {
    const route = internalRouteFor(href);
    if (route) { router.push(route as never); return; }
    if (href.startsWith('#')) return;
    void openExternal(href);
  }, [router]);

  const onOpenUrl = useCallback((url: string) => { void openExternal(url); }, []);
  const onHeadingLayout = useCallback((id: string, y: number) => { headingY.current[id] = y; }, []);

  const jumpTo = (entry: TocEntry) => {
    setTocOpen(false);
    const y = headingY.current[entry.id];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, columnY.current + bodyY.current + ARTICLE_TOP + y - topSpace - 4), animated: true });
  };

  const barBackground = scrollY.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' });
  const barTitle = scrollY.interpolate({ inputRange: [110, 170], outputRange: [0, 1], extrapolate: 'clamp' });

  const topBar = (
    <View style={[styles.bar, { paddingTop: insets.top, height: topSpace }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.barBg, { opacity: barBackground }]} pointerEvents="none" />
      <TouchableOpacity style={styles.circle} onPress={goBack} accessibilityRole="button" accessibilityLabel="Geri dön">
        <Ionicons name="chevron-back" size={21} color={colors.ink} />
      </TouchableOpacity>
      <Animated.Text style={[styles.barTitle, { opacity: status === 'ready' ? barTitle : 0 }]} numberOfLines={1}
        importantForAccessibility="no" accessibilityElementsHidden>
        {guide?.title || ''}
      </Animated.Text>
      <View style={styles.barRight}>
        {status === 'ready' && toc.length >= 2 ? (
          <TouchableOpacity style={styles.circle} onPress={() => setTocOpen(true)} accessibilityRole="button" accessibilityLabel="İçindekiler">
            <Ionicons name="list" size={20} color={colors.ink} />
          </TouchableOpacity>
        ) : null}
        {status === 'ready' ? (
          <TouchableOpacity style={styles.circle} onPress={() => void share()} accessibilityRole="button" accessibilityLabel="Rehber yazısını paylaş">
            <Ionicons name="share-outline" size={19} color={colors.ink} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  if (status !== 'ready' || !guide) {
    return (
      <View style={styles.screen}>
        <View style={[styles.state, { paddingTop: topSpace }]}>
          {status === 'loading' ? <ActivityIndicator color={colors.brand} size="large" /> : status === 'not_found' ? (
            <>
              <View style={styles.stateArt}><Ionicons name="book-outline" size={26} color={colors.brand} /></View>
              <Text style={styles.stateTitle}>Bu rehber yazısını bulamadık</Text>
              <Text style={styles.stateText}>Yayından kaldırılmış ya da adresi değişmiş olabilir. Mutfak Rehberi'nde benzerlerine göz at.</Text>
              <TouchableOpacity style={styles.primary} onPress={() => router.replace('/rehber')} accessibilityRole="button">
                <Text style={styles.primaryText}>Mutfak Rehberi'ne git</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.stateArt}><Ionicons name="cloud-offline-outline" size={26} color={colors.brand} /></View>
              <Text style={styles.stateTitle}>Rehber yazısı yüklenemedi</Text>
              <Text style={styles.stateText}>{error}</Text>
              <TouchableOpacity style={styles.secondary} onPress={() => void load()} accessibilityRole="button">
                <Text style={styles.secondaryText}>Tekrar dene</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {topBar}
      </View>
    );
  }

  const topic = primaryTopic(guide.topics);
  const minutes = readingLabel(guide.readingMinutes);
  const published = guideDateTr(guide.publishedAt);
  const updated = guide.updatedAt && guideDateTr(guide.updatedAt) !== published ? guideDateTr(guide.updatedAt) : '';
  const byline = [guide.authorName, updated ? `Güncellendi: ${updated}` : published].filter(Boolean).join('  ·  ');
  const reviewed = guide.foodSafety ? guideDateTr(guide.foodSafety.reviewedAt) : '';
  const tocShown = tocExpanded || toc.length <= TOC_PREVIEW ? toc : toc.slice(0, TOC_PREVIEW - 1);

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        ref={scrollRef as never}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        contentContainerStyle={{ paddingTop: topSpace, paddingBottom: insets.bottom + 48 }}>
        <View style={styles.column} onLayout={e => { columnY.current = e.nativeEvent.layout.y; }}>
          <View style={styles.header}>
            {topic ? (
              <TouchableOpacity onPress={() => router.push({ pathname: '/rehber', params: { konu: topic.slug } })} hitSlop={8}
                accessibilityRole="link" accessibilityLabel={`${topic.name} konusundaki rehberler`}>
                <Text style={styles.kicker}>{topic.name}</Text>
              </TouchableOpacity>
            ) : <Text style={styles.kicker}>Mutfak Rehberi</Text>}
            <Text style={styles.title} accessibilityRole="header">{guide.title}</Text>
            {guide.excerpt ? <Text style={styles.standfirst}>{guide.excerpt}</Text> : null}
            {(guide.level || minutes) ? (
              <View style={styles.metaRow}>
                <LevelMeter level={guide.level} />
                {guide.level && minutes ? <Text style={styles.metaDot}>·</Text> : null}
                {minutes ? (
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.metaText}>{minutes}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            {byline ? <Text style={styles.byline}>{byline}</Text> : null}
            {guide.foodSafety ? (
              <View style={styles.safety} accessible accessibilityLabel={`Gıda güvenliği uzmanı tarafından incelendi${reviewed ? `, ${reviewed}` : ''}`}>
                <View style={styles.safetyIcon}><Ionicons name="shield-checkmark" size={16} color={colors.success} /></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.safetyTitle}>Gıda güvenliği uzmanı tarafından incelendi</Text>
                  {reviewed ? <Text style={styles.safetyDate}>{reviewed}</Text> : null}
                </View>
              </View>
            ) : null}
            {guide.foodSafetyWarning ? (
              <View style={styles.warn} accessible accessibilityRole="text" accessibilityLabel={`Uzman incelemesi bekleniyor. ${guide.foodSafetyWarning}`}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.warning} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.warnTitle}>Uzman incelemesi bekleniyor</Text>
                  <Text style={styles.warnText}>{guide.foodSafetyWarning}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {guide.image ? (
            <View style={styles.figure}>
              <Image source={{ uri: guide.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} accessibilityLabel={guide.title} />
            </View>
          ) : null}

          {toc.length >= 2 ? (
            <View style={styles.tocCard}>
              <View style={styles.tocHead}>
                <Text style={styles.tocKicker}>İçindekiler</Text>
                <Text style={styles.tocCount}>{toc.length} bölüm</Text>
              </View>
              <TocList entries={tocShown} onPick={jumpTo} />
              {tocShown.length < toc.length ? (
                <TouchableOpacity onPress={() => setTocExpanded(true)} style={styles.tocMore} accessibilityRole="button">
                  <Text style={styles.tocMoreText}>Tüm bölümleri göster ({toc.length})</Text>
                  <Ionicons name="chevron-down" size={15} color={colors.ink} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.article} onLayout={e => { bodyY.current = e.nativeEvent.layout.y; }}>
            {blocks.length ? (
              <GuideArticle blocks={blocks} width={contentWidth} onHeadingLayout={onHeadingLayout} onLink={onLink} onOpenUrl={onOpenUrl} />
            ) : (
              <Text style={styles.emptyBody}>Bu yazının metni henüz eklenmemiş.</Text>
            )}
          </View>

          {guide.sources.length > 0 ? (
            <View style={styles.sources}>
              <Text style={styles.sectionKicker}>Kaynaklar</Text>
              {guide.sources.map((item, index) => (
                <Pressable key={item.url} onPress={() => void openExternal(item.url)}
                  style={({ pressed }) => [styles.sourceRow, index > 0 && styles.sourceLine, pressed && { opacity: 0.7 }]}
                  accessibilityRole="link" accessibilityLabel={`${item.title}, ${item.host}`} accessibilityHint="Kaynağı tarayıcıda açar">
                  <Text style={styles.sourceNum}>{index + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.sourceTitle}>{item.title}</Text>
                    <Text style={styles.sourceHost} numberOfLines={1}>{item.host}</Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.endRow}>
            <Pressable onPress={() => void share()} style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.88 }]} accessibilityRole="button">
              <Ionicons name="share-outline" size={17} color="#fff" />
              <Text style={styles.shareText}>Paylaş</Text>
            </Pressable>
            <TouchableOpacity onPress={() => router.push('/rehber')} style={styles.allLink} accessibilityRole="link">
              <Text style={styles.allText}>Tüm rehber</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.ink} />
            </TouchableOpacity>
          </View>
        </View>

        {guide.relatedRecipes.length > 0 ? (
          <View style={styles.related}>
            <View style={styles.relatedHead}>
              <Text style={styles.sectionKicker}>Bu rehberle pişir</Text>
              <AccentText style={styles.relatedTitle}>{'İlgili *tarifler*'}</AccentText>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
              {guide.relatedRecipes.map(recipe => (
                <Pressable key={recipe.id} onPress={() => router.push(`/recipe/${encodeURIComponent(recipe.slug)}`)}
                  style={({ pressed }) => [styles.recipe, pressed && { opacity: 0.9 }]}
                  accessibilityRole="link" accessibilityLabel={`${recipe.title}${recipe.totalTime ? `, ${recipe.totalTime} dakika` : ''}`}>
                  <View style={styles.recipeImage}>
                    {recipe.image
                      ? <Image source={{ uri: recipe.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                      : <ImagePlaceholder title={recipe.title} style={StyleSheet.absoluteFill} compact />}
                  </View>
                  <Text style={styles.recipeTitle} numberOfLines={2}>{recipe.title}</Text>
                  {recipe.totalTime ? <Text style={styles.recipeMeta}>{recipe.totalTime} dk</Text> : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
      </Animated.ScrollView>

      {topBar}
      <GuideTocSheet visible={tocOpen} entries={toc} onClose={() => setTocOpen(false)} onPick={jumpTo} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  bar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  barBg: { backgroundColor: colors.canvas, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  barTitle: { flex: 1, fontFamily: fonts.heading, fontSize: 15, color: colors.ink },
  barRight: { flexDirection: 'row', gap: 8, minWidth: 42, justifyContent: 'flex-end' },
  circle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, ...shadow.card,
  },
  column: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { paddingHorizontal: SIDE, paddingTop: 14, paddingBottom: 22 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 31, lineHeight: 37, letterSpacing: -0.9, color: colors.ink, marginTop: 12 },
  standfirst: { fontFamily: fonts.body, fontSize: 18, lineHeight: 27, color: colors.textMuted, marginTop: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
  metaDot: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint },
  byline: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, marginTop: 6 },
  safety: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: radius.md, backgroundColor: colors.successSoft,
  },
  safetyIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  safetyTitle: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, color: colors.ink },
  safetyDate: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  warn: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, padding: 14, borderRadius: radius.md, backgroundColor: colors.warningSoft },
  warnTitle: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, color: colors.ink },
  warnText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.ink, marginTop: 3 },
  figure: { marginHorizontal: SIDE, aspectRatio: 16 / 10, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.cream },
  tocCard: {
    marginHorizontal: SIDE, marginTop: 24, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  tocHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 },
  tocKicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: colors.brand },
  tocCount: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  tocMore: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, borderTopWidth: 1, borderTopColor: colors.line },
  tocMoreText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  article: { paddingHorizontal: SIDE, paddingTop: ARTICLE_TOP },
  emptyBody: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted },
  sectionKicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  sources: { marginHorizontal: SIDE, marginTop: 10, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 52 },
  sourceLine: { borderTopWidth: 1, borderTopColor: colors.line },
  sourceNum: { width: 18, fontFamily: fonts.bodySemi, fontSize: 12, color: colors.textFaint },
  sourceTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.ink },
  sourceHost: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  endRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: SIDE, marginTop: 20,
    paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.line,
  },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 46, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.ink },
  shareText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#fff' },
  allLink: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 46 },
  allText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  related: { marginTop: 36, paddingTop: 26, paddingBottom: 18, backgroundColor: '#f8f1ea', borderTopWidth: 1, borderTopColor: colors.line },
  relatedHead: { paddingHorizontal: SIDE, gap: 6, marginBottom: 16, width: '100%', maxWidth: 720, alignSelf: 'center' },
  relatedTitle: { fontFamily: fonts.headingBold, fontSize: 25, lineHeight: 30, letterSpacing: -0.6, color: colors.ink },
  rail: { gap: 12, paddingHorizontal: SIDE },
  recipe: { width: 168, gap: 4 },
  recipeImage: { height: 124, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.cream, marginBottom: 6 },
  recipeTitle: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 20, color: colors.ink },
  recipeMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  stateArt: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  stateTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink, textAlign: 'center' },
  stateText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  primary: { marginTop: 8, minHeight: 48, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  secondary: { marginTop: 8, minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
});
