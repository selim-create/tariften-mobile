import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { fetchGuides, fetchGuideTaxonomy } from '../../lib/guides-api';
import {
  mergeGuides, topicPath, visibleLevels, visibleTopics, type GuideSummary, type GuideTaxonomy,
} from '../../lib/guides';
import GuideCard from '../../components/guide/GuideCard';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius } from '../../constants/theme';

const PER_PAGE = 12;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) || null;

function Chip({ label, count, selected, onPress, tone = 'ink' }: {
  label: string; count?: number; selected: boolean; onPress: () => void; tone?: 'ink' | 'soft';
}) {
  const soft = tone === 'soft';
  return (
    <Pressable onPress={onPress}
      style={[soft ? styles.softChip : styles.chip, selected && (soft ? styles.softChipActive : styles.chipActive)]}
      accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={count ? `${label}, ${count} yazı` : label}>
      <Text style={[soft ? styles.softChipText : styles.chipText, selected && (soft ? styles.softChipTextActive : styles.chipTextActive)]}>{label}</Text>
      {!soft && count ? <Text style={[styles.chipCount, selected && styles.chipCountActive]}>{count}</Text> : null}
    </Pressable>
  );
}

/**
 * Mutfak Rehberi: Core's topic tree as chips (sub-topics appear under the
 * selected parent), a quiet level filter, and long-form guides newest first.
 * Pages load while scrolling; "Daha fazla" is there too.
 */
export default function GuideListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ konu?: string; seviye?: string }>();
  const [taxonomy, setTaxonomy] = useState<GuideTaxonomy | null>(null);
  const [topic, setTopic] = useState<string | null>(one(params.konu));
  const [level, setLevel] = useState<string | null>(one(params.seviye));
  const [items, setItems] = useState<GuideSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // A new ?konu= / ?seviye= (from a guide's topic link) replaces the filter.
  useEffect(() => { setTopic(one(params.konu)); }, [params.konu]);
  useEffect(() => { setLevel(one(params.seviye)); }, [params.seviye]);

  const loadTaxonomy = useCallback(() => {
    fetchGuideTaxonomy().then(setTaxonomy).catch(() => undefined); // filters are optional; the list still works
  }, []);
  useEffect(() => { loadTaxonomy(); }, [loadTaxonomy]);

  const load = useCallback(async (pageNum: number, mode: 'initial' | 'refresh' | 'more') => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (mode === 'initial') setLoading(true);
    if (mode === 'more') { setLoadingMore(true); setMoreError(''); }
    try {
      const result = await fetchGuides({ topic, level, page: pageNum, perPage: PER_PAGE }, controller.signal);
      if (controller.signal.aborted) return;
      setItems(prev => (pageNum === 1 ? result.items : mergeGuides(prev, result.items)));
      setTotal(result.total);
      setPage(result.page);
      setPages(result.pages);
      setError('');
    } catch (cause) {
      if (controller.signal.aborted) return;
      const message = cause instanceof Error ? cause.message : 'Rehber yazıları yüklenemedi.';
      if (mode === 'more') setMoreError(message);
      else { setError(message); setItems([]); }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [topic, level]);

  useEffect(() => { void load(1, 'initial'); }, [load]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const hasMore = page < pages;
  const loadMore = () => { if (hasMore && !loading && !loadingMore && !moreError) void load(page + 1, 'more'); };
  const filtered = !!(topic || level);

  const topics = useMemo(() => visibleTopics(taxonomy?.topics || [], topic), [taxonomy, topic]);
  const levels = useMemo(() => visibleLevels(taxonomy?.levels || [], level), [taxonomy, level]);
  const path = topicPath(topics, topic);
  const parent = path[0] || null;
  const allCount = topics.reduce((sum, t) => sum + t.totalCount, 0);

  const header = (
    <View style={styles.head}>
      <TouchableOpacity style={styles.circle} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        accessibilityRole="button" accessibilityLabel="Geri dön">
        <Ionicons name="chevron-back" size={21} color={colors.ink} />
      </TouchableOpacity>
      <Text style={styles.kicker}>Mutfak Rehberi{total ? ` · ${total} yazı` : ''}</Text>
      <AccentText style={styles.title}>{'Mutfağın *el kitabı.*'}</AccentText>
      <Text style={styles.subtitle}>Teknikler, pişirme süreleri, saklama ve ölçüler. Mutfakta işine yarayacak her şey, adım adım.</Text>

      {topics.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll} contentContainerStyle={styles.chips}>
          <Chip label="Tümü" count={allCount} selected={!topic} onPress={() => setTopic(null)} />
          {topics.map(t => (
            <Chip key={t.slug} label={t.name} count={t.totalCount} selected={parent?.slug === t.slug}
              onPress={() => setTopic(t.slug)} />
          ))}
        </ScrollView>
      )}
      {parent && parent.children.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subScroll} contentContainerStyle={styles.chips}>
          <Chip tone="soft" label="Tümü" selected={topic === parent.slug} onPress={() => setTopic(parent.slug)} />
          {parent.children.map(c => (
            <Chip key={c.slug} tone="soft" label={c.name} selected={topic === c.slug} onPress={() => setTopic(c.slug)} />
          ))}
        </ScrollView>
      )}
      {levels.length > 0 && (
        <View style={styles.levelRow}>
          <Text style={styles.levelLabel}>Seviye</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.levelChips}>
            <Chip tone="soft" label="Hepsi" selected={!level} onPress={() => setLevel(null)} />
            {levels.map(l => (
              <Chip key={l.slug} tone="soft" label={l.name} selected={level === l.slug} onPress={() => setLevel(level === l.slug ? null : l.slug)} />
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );

  const empty = loading ? (
    <View style={styles.state}><ActivityIndicator color={colors.brand} /></View>
  ) : error ? (
    <View style={styles.state}>
      <View style={styles.stateArt}><Ionicons name="cloud-offline-outline" size={24} color={colors.brand} /></View>
      <Text style={styles.stateTitle}>Rehber yüklenemedi</Text>
      <Text style={styles.stateText}>{error}</Text>
      <TouchableOpacity style={styles.secondary} onPress={() => { loadTaxonomy(); void load(1, 'initial'); }} accessibilityRole="button">
        <Text style={styles.secondaryText}>Tekrar dene</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.state}>
      <View style={styles.stateArt}>
        {['un', 'yumurta'].map(name => <LokmaIngredientIcon key={name} name={name} size={24} />)}
      </View>
      <Text style={styles.stateTitle}>{filtered ? 'Bu seçimde henüz rehber yok' : 'Rehber yazıları hazırlanıyor'}</Text>
      <Text style={styles.stateText}>
        {filtered ? 'Başka bir konu ya da seviye seçebilirsin.' : 'İlk yazılar yayımlandığında burada olacak.'}
      </Text>
      {filtered ? (
        <TouchableOpacity style={styles.secondary} onPress={() => { setTopic(null); setLevel(null); }} accessibilityRole="button">
          <Text style={styles.secondaryText}>Filtreleri temizle</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const footer = loadingMore ? (
    <ActivityIndicator style={styles.footer} color={colors.brand} />
  ) : moreError ? (
    <View style={styles.footer}>
      <Text style={styles.footerError}>{moreError}</Text>
      <TouchableOpacity style={styles.secondary} onPress={() => { setMoreError(''); void load(page + 1, 'more'); }} accessibilityRole="button">
        <Text style={styles.secondaryText}>Tekrar dene</Text>
      </TouchableOpacity>
    </View>
  ) : hasMore && items.length > 0 ? (
    <View style={styles.footer}>
      <TouchableOpacity style={styles.secondary} onPress={loadMore} accessibilityRole="button">
        <Text style={styles.secondaryText}>Daha fazla</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <FlatList
        data={loading || error ? [] : items}
        keyExtractor={item => String(item.id)}
        renderItem={({ item }) => (
          <GuideCard guide={item} onPress={() => router.push(`/rehber/${encodeURIComponent(item.slug)}`)} />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadTaxonomy(); void load(1, 'refresh'); }} tintColor={colors.brand} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  list: { flexGrow: 1, paddingHorizontal: 20, width: '100%', maxWidth: 760, alignSelf: 'center' },
  head: { paddingTop: 6, paddingBottom: 6 },
  circle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, marginBottom: 18,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 36, lineHeight: 40, letterSpacing: -1.2, color: colors.ink, marginTop: 10 },
  subtitle: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textMuted, marginTop: 12 },
  chipsScroll: { marginHorizontal: -20, marginTop: 22 },
  subScroll: { marginHorizontal: -20, marginTop: 10 },
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
  softChip: { height: 32, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  softChipActive: { backgroundColor: colors.brandSoft },
  softChipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
  softChipTextActive: { fontFamily: fonts.bodySemi, color: colors.brandDark },
  levelRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14, marginRight: -20 },
  levelLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textFaint, marginRight: 10 },
  levelChips: { gap: 6, paddingRight: 20 },
  state: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 16, gap: 10 },
  stateArt: {
    flexDirection: 'row', gap: 4, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cream,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  stateTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink, textAlign: 'center' },
  stateText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  secondary: {
    marginTop: 8, minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, alignSelf: 'center',
  },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  footer: { paddingTop: 20, alignItems: 'center', gap: 4 },
  footerError: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
