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
        <Text style={styles.eyebrow}>SENİN MUTFAĞIN</Text>
        <Text style={styles.title}>{isRecipe ? 'Tariflerim' : 'Sofralarım'}</Text>
        <Text style={styles.description}>{isRecipe
          ? 'Paylaştığın tarifler burada, her zaman elinin altında.'
          : 'Hazırladığın menüleri ve sofralarını yeniden keşfet.'}</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="İçeriklerimi yenile"
        onPress={() => void fetchPage(1)} style={styles.refresh} disabled={loading || moreLoading}>
        <Ionicons name="refresh-outline" size={20} color="#d45949" />
      </TouchableOpacity>
    </View>

    <View style={styles.searchBar}>
      <Ionicons name="search-outline" size={20} color="#98857c" />
      <TextInput
        style={styles.searchInput} value={search} onChangeText={setSearch}
        placeholder="Yüklenenlerde ara..." placeholderTextColor="#9a928b"
        autoCorrect={false} returnKeyType="search"
        accessibilityLabel="Yüklediğin içeriklerde ara" />
      {!!search && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Aramayı temizle"
        onPress={() => setSearch('')}><Ionicons name="close-circle" size={20} color="#9b8e84" /></TouchableOpacity>}
    </View>
    <View style={styles.countBar}>
      <Text style={styles.count}>{loading ? 'Yükleniyor…' : `${total} ${isRecipe ? 'tarifin' : 'sofran'}`}</Text>
      <Text style={styles.hint}>Yeniden düzenlemek için tarifini açabilirsin.</Text>
    </View>

    {loading && entries.length === 0 ? (
      <View style={styles.loading}><ActivityIndicator color="#df5043" size="small" />
        <Text style={styles.muted}>İçeriklerin getiriliyor…</Text>
      </View>
    ) : null}

    {!loading && !error && !entries.length ? <View style={styles.empty}>
      <View style={styles.emptyIcon}><Ionicons name={isRecipe ? 'restaurant-outline' : 'book-outline'} size={28} color="#d65a4b" /></View>
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
      <Ionicons name="alert-circle-outline" size={19} color="#ac5848" />
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
              : <View style={styles.fallback}><Ionicons name="restaurant-outline" size={28} color="#cb7e5d" /></View>}
          <View style={styles.entryText}>
            <Text numberOfLines={2} style={styles.entryTitle}>{item.title}</Text>
            <Text numberOfLines={2} style={styles.entrySubtitle}>
              {recipe?.excerpt || menu?.description || (isRecipe ? 'Ev yapımı tarifin' : 'Özenle hazırlanmış sofran')}
            </Text>
            <View style={styles.meta}>
              <Ionicons name={isRecipe ? 'document-text-outline' : 'people-outline'} size={13} color="#af8169" />
              <Text style={styles.metaText}>{isRecipe
                ? [recipe?.servings ? recipe.servings + ' kişilik' : '', recipe?.prep_time ? recipe.prep_time + ' dk' : ''].filter(Boolean).join(' · ') || 'Tarifini incele'
                : menu?.guest_count ? menu.guest_count + ' kişilik' : 'Menünü incele'}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" color="#bda79a" size={17} />
        </TouchableOpacity>
        <View style={styles.entryFooter}>
          <TouchableOpacity accessibilityRole="button" onPress={goDetail} style={styles.footerLink}>
            <Ionicons name="eye-outline" color="#a27b66" size={16} />
            <Text style={styles.footerLinkText}>Görüntüle</Text>
          </TouchableOpacity>
          {isRecipe ? <TouchableOpacity accessibilityRole="button"
            accessibilityLabel={`${item.title} düzenle`} style={styles.editAction}
            onPress={() => router.push(`/recipe/edit/${item.id}`)}>
            <Ionicons name="create-outline" size={16} color="#cf5646" />
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
        {moreLoading ? <ActivityIndicator color="#c65947" /> : <Ionicons name="chevron-down" size={16} color="#a95d4e" />}
        <Text style={styles.moreText}>{moreLoading ? 'Yükleniyor…' : 'Daha fazla yükle'}</Text>
      </TouchableOpacity>
    ) : null}
    {page < pages && !!search && <Text style={styles.hint}>Arama yalnızca yüklediğin sayfalarda çalışır; daha fazlasını yükleyebilirsin.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  section: { marginHorizontal: 15, marginTop: 17, marginBottom: 9, gap: 12 },
  header: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.1, color: '#d45b4c' },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4, color: '#1e2e3d' },
  description: { fontSize: 12, lineHeight: 18, color: '#94867e' },
  refresh: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#fff', borderColor: '#eee2da',
    borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingHorizontal: 13, minHeight: 47,
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#eae0d8', borderRadius: 14 },
  searchInput: { flex: 1, fontSize: 13, color: '#2d3847', paddingVertical: 10 },
  countBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  count: { fontSize: 12, color: '#cb6d59', fontWeight: '900' },
  hint: { fontSize: 10, color: '#ac9b90', flexShrink: 1, textAlign: 'right' },
  entry: { backgroundColor: '#fff', borderRadius: 19, borderWidth: 1, borderColor: '#eee1d9', overflow: 'hidden' },
  entryBody: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 10 },
  thumbnail: { width: 82, height: 84, borderRadius: 14, overflow: 'hidden' },
  fallback: { width: 82, height: 84, borderRadius: 14, backgroundColor: '#fff3ed', alignItems: 'center', justifyContent: 'center' },
  entryText: { flex: 1, minWidth: 0, gap: 4 },
  entryTitle: { fontSize: 13, lineHeight: 19, color: '#28344a', fontWeight: '900' },
  entrySubtitle: { color: '#847c75', fontSize: 11, lineHeight: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  metaText: { fontSize: 10, color: '#ad816b', fontWeight: '700' },
  entryFooter: { minHeight: 39, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#f4eee7', paddingHorizontal: 13 },
  footerLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7 },
  footerLinkText: { fontSize: 11, color: '#927a6a', fontWeight: '800' },
  editAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9,
    paddingVertical: 6, borderRadius: 9, backgroundColor: '#fff0eb' },
  editText: { fontSize: 11, color: '#c95947', fontWeight: '900' },
  loading: { minHeight: 90, justifyContent: 'center', alignItems: 'center', gap: 8 },
  muted: { fontSize: 12, color: '#978e86' },
  empty: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#f0e3da',
    padding: 23, alignItems: 'center', gap: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 19, backgroundColor: '#fff2eb', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: '#1d2e3c' },
  emptyCopy: { fontSize: 12, lineHeight: 18, textAlign: 'center', color: '#97877e' },
  emptyAction: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 17, paddingVertical: 11,
    borderRadius: 13, backgroundColor: '#df5043', marginTop: 4 },
  emptyActionText: { fontSize: 12, color: '#fff', fontWeight: '900' },
  errorCard: { flexDirection: 'row', gap: 10, backgroundColor: '#fff3eb', borderWidth: 1,
    borderColor: '#edc9b6', borderRadius: 14, padding: 14 },
  errorText: { flex: 1, gap: 7 },
  error: { fontSize: 12, color: '#9d493c', lineHeight: 18 },
  retry: { fontSize: 12, fontWeight: '900', color: '#a95243' },
  more: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8d8c8', borderRadius: 13,
    minHeight: 47, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  moreText: { color: '#a65b4d', fontSize: 12, fontWeight: '900' },
  noMatch: { color: '#95877e', fontSize: 12, textAlign: 'center', paddingVertical: 14 },
});
