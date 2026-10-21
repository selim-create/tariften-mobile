import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getOwnedMenusPage, getOwnedRecipesPage } from '../../lib/api';
import type { Menu, Recipe } from '../../lib/types';
import ImagePlaceholder, { isPlaceholderImage } from '../ImagePlaceholder';
import { colors, fonts, radius, shadow } from '../../constants/theme';

type Kind = 'recipes' | 'menus';
type Entry = Recipe | Menu;

export default function MyKitchenLibrary({ kind, token, userId }: {
  kind: Kind; token: string; userId: number;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const isRecipe = kind === 'recipes';

  const fetchPage = useCallback(async (nextPage: number) => {
    const currentRequest = ++requestId.current;
    if (nextPage === 1) { setLoading(true); setError(''); }
    else setMoreLoading(true);
    try {
      const result = kind === 'recipes'
        ? await getOwnedRecipesPage(token, nextPage, userId)
        : await getOwnedMenusPage(token, nextPage, userId);
      if (requestId.current !== currentRequest) return;
      setEntries(previous => {
        if (nextPage === 1) return result.items;
        const existing = new Set(previous.map(item => item.id));
        return [...previous, ...result.items.filter(item => !existing.has(item.id))];
      });
      setPage(result.page);
      setPages(result.pages);
      setTotal(result.total);
    } catch (cause) {
      if (requestId.current !== currentRequest) return;
      setError(cause instanceof Error ? cause.message : 'İçeriklerin alınamadı.');
      // On reload failures, never claim the user's collection is empty.
    } finally {
      if (requestId.current === currentRequest) {
        setLoading(false);
        setMoreLoading(false);
      }
    }
  }, [kind, token, userId]);

  useFocusEffect(useCallback(() => {
    setSearch('');
    void fetchPage(1);
    return () => { requestId.current++; };
  }, [fetchPage]));

  const normalized = search.trim().toLocaleLowerCase('tr-TR');
  const filtered = normalized ? entries.filter(item =>
    [item.title, isRecipe ? (item as Recipe).excerpt : (item as Menu).description]
      .some(value => (value || '').toLocaleLowerCase('tr-TR').includes(normalized))
  ) : entries;

  return <View style={styles.section}>
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>Senin mutfağın</Text>
        <Text style={styles.title}>{isRecipe ? 'Tariflerim' : 'Sofralarım'}</Text>
        <Text style={styles.description}>{isRecipe
          ? 'Paylaştığın tarifler burada, her zaman elinin altında.'
          : 'Hazırladığın menüleri ve sofralarını yeniden keşfet.'}</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="İçeriklerimi yenile"
        onPress={() => void fetchPage(1)} style={styles.refresh} disabled={loading || moreLoading}>
        <Ionicons name="refresh-outline" size={20} color={colors.ink} />
      </TouchableOpacity>
    </View>

    <View style={styles.searchBar}>
      <Ionicons name="search-outline" size={20} color={colors.textMuted} />
      <TextInput
        style={styles.searchInput} value={search} onChangeText={setSearch}
        placeholder="Yüklenenlerde ara..." placeholderTextColor={colors.textFaint}
        autoCorrect={false} returnKeyType="search"
        accessibilityLabel="Yüklediğin içeriklerde ara" />
      {!!search && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Aramayı temizle"
        onPress={() => setSearch('')}><Ionicons name="close-circle" size={20} color={colors.textFaint} /></TouchableOpacity>}
    </View>
    <View style={styles.countBar}>
      <Text style={styles.count}>{loading ? 'Yükleniyor…' : `${total} ${isRecipe ? 'tarifin' : 'sofran'}`}</Text>
      <Text style={styles.hint}>Yeniden düzenlemek için tarifini açabilirsin.</Text>
    </View>

    {loading && entries.length === 0 ? (
      <View style={styles.loading}><ActivityIndicator color={colors.brand} size="small" />
        <Text style={styles.muted}>İçeriklerin getiriliyor…</Text>
      </View>
    ) : null}

    {!loading && !error && !entries.length ? <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={isRecipe ? 'restaurant-outline' : 'book-outline'} size={28} color={colors.brand} /></View>
      <Text style={styles.emptyTitle}>{isRecipe ? 'İlk tarifin için yer hazır!' : 'Henüz bir sofran yok.'}</Text>
      <Text style={styles.emptyCopy}>{isRecipe
        ? 'Mutfağındaki güzel fikirleri paylaşmaya başlayabilirsin.'
        : 'İlk menünü oluştur, sonra buradan kolayca ulaş.'}</Text>
      <TouchableOpacity style={styles.emptyAction} onPress={() => router.push(isRecipe ? '/recipe/create' : '/menu/create')}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.emptyActionText}>{isRecipe ? 'Tarif yaz' : 'Menü oluştur'}</Text>
      </TouchableOpacity>
    </View> : null}

    {!!error && <View style={styles.errorCard} accessibilityRole="alert">
      <Ionicons name="alert-circle-outline" size={19} color={colors.brand} />
      <View style={styles.errorText}><Text style={styles.error}>{error}</Text>
        <TouchableOpacity onPress={() => void fetchPage(page === 0 ? 1 : page)}>
          <Text style={styles.retry}>Tekrar dene</Text>
        </TouchableOpacity></View>
    </View>}

    {filtered.map(item => {
      const menu = !isRecipe ? item as Menu : null;
      const recipe = isRecipe ? item as Recipe : null;
      const goDetail = () => router.push(isRecipe ? `/recipe/${item.slug}` : `/menu/${item.slug}`);
      return <View key={item.id} style={styles.entry}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${item.title} görüntüle`}
          activeOpacity={0.82} style={styles.entryBody} onPress={goDetail}>
          {item.image && !isPlaceholderImage(item.image)
            ? <Image source={{ uri: item.image }} contentFit="cover" style={styles.thumbnail} />
            : recipe ? <ImagePlaceholder title={item.title} style={styles.thumbnail} />
              : <View style={styles.fallback}><Ionicons name="restaurant-outline" size={28} color={colors.brand} /></View>}
          <View style={styles.entryText}>
            <Text numberOfLines={2} style={styles.entryTitle}>{item.title}</Text>
            <Text numberOfLines={2} style={styles.entrySubtitle}>
              {recipe?.excerpt || menu?.description || (isRecipe ? 'Ev yapımı tarifin' : 'Özenle hazırlanmış sofran')}
            </Text>
            <View style={styles.meta}>
              <Ionicons name={isRecipe ? 'document-text-outline' : 'people-outline'} size={13} color={colors.textFaint} />
              <Text style={styles.metaText}>{isRecipe
                ? [recipe?.servings ? recipe.servings + ' kişilik' : '', recipe?.prep_time ? recipe.prep_time + ' dk' : ''].filter(Boolean).join(' · ') || 'Tarifini incele'
                : menu?.guest_count ? menu.guest_count + ' kişilik' : 'Menünü incele'}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" color={colors.textFaint} size={17} />
        </TouchableOpacity>
        <View style={styles.entryFooter}>
          <TouchableOpacity accessibilityRole="button" onPress={goDetail} style={styles.footerLink}>
            <Ionicons name="eye-outline" color={colors.ink} size={16} />
            <Text style={styles.footerLinkText}>Görüntüle</Text>
          </TouchableOpacity>
          {isRecipe ? <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={`${item.title} düzenle`} style={styles.editAction}
            onPress={() => router.push(`/recipe/edit/${item.id}`)}>
            <Ionicons name="create-outline" size={16} color={colors.brand} />
            <Text style={styles.editText}>Düzenle</Text>
          </TouchableOpacity> : null}
        </View>
      </View>;
    })}

    {!!entries.length && filtered.length === 0 && !loading
      ? <Text style={styles.noMatch}>Yüklenen içeriklerde bu aramayla eşleşen bir sonuç yok.</Text> : null}

    {page < pages && !loading ? (
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Daha fazla içerik yükle"
        disabled={moreLoading} onPress={() => void fetchPage(page + 1)} style={styles.more}>
        {moreLoading ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="chevron-down" size={16} color={colors.ink} />}
        <Text style={styles.moreText}>{moreLoading ? 'Yükleniyor…' : 'Daha fazla yükle'}</Text>
      </TouchableOpacity>
    ) : null}
    {page < pages && !!search && <Text style={styles.hint}>Arama yalnızca yüklediğin sayfalarda çalışır; daha fazlasını yükleyebilirsin.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 20, marginTop: 14, marginBottom: 9, gap: 12 },
  header: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 22, letterSpacing: -0.5, color: colors.ink },
  description: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted },
  refresh: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderColor: colors.lineStrong,
    borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 16, height: 48,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink, paddingVertical: 0 },
  countBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  count: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, flexShrink: 1, textAlign: 'right' },
  entry: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  entryBody: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, paddingRight: 14 },
  thumbnail: { width: 76, height: 76, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.cream },
  fallback: { width: 76, height: 76, borderRadius: 14, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  entryText: { flex: 1, minWidth: 0, gap: 3 },
  entryTitle: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 21, color: colors.ink },
  entrySubtitle: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  entryFooter: { minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 14, backgroundColor: colors.canvas },
  footerLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  footerLinkText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  editAction: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12,
    height: 32, borderRadius: radius.pill, backgroundColor: colors.brandSoft },
  editText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.brand },
  loading: { minHeight: 90, justifyContent: 'center', alignItems: 'center', gap: 8 },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  empty: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line,
    padding: 24, alignItems: 'center', gap: 8, ...shadow.card },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.ink, textAlign: 'center' },
  emptyCopy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, textAlign: 'center', color: colors.textMuted },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 20, height: 48,
    borderRadius: radius.pill, backgroundColor: colors.brand, marginTop: 8 },
  emptyActionText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  errorCard: { flexDirection: 'row', gap: 10, backgroundColor: colors.brandSoft, borderWidth: 1,
    borderColor: '#f3d2c8', borderRadius: radius.lg, padding: 14 },
  errorText: { flex: 1, gap: 7 },
  error: { fontFamily: fonts.body, fontSize: 13, color: colors.ink, lineHeight: 19 },
  retry: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.brand },
  more: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.pill,
    height: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  moreText: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 14 },
  noMatch: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 14 },
});
