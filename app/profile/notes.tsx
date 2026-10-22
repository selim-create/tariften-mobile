import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import ImagePlaceholder, { isPlaceholderImage } from '../../components/ImagePlaceholder';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { colors, fonts, radius } from '../../constants/theme';
import {
  MY_NOTES_PER_PAGE, RecipeNoteError, deleteMyRecipeNote, getMyNotesPage, noteDateTr, type MyNoteItem,
} from '../../lib/recipe-notes-api';

/** Notlarım: the member's private recipe notes, most recently updated first (GET /me/notes). */
export default function MyNotesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const memberToken = user && token ? token : null;
  const [items, setItems] = useState<MyNoteItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<RecipeNoteError | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (nextPage: number, mode: 'initial' | 'refresh' | 'more') => {
    if (!memberToken) { setLoading(false); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more') setLoadingMore(true);
    try {
      const result = await getMyNotesPage(memberToken, nextPage, MY_NOTES_PER_PAGE, controller.signal);
      if (controller.signal.aborted) return;
      setItems(old => (nextPage === 1 ? result.notes
        : [...old, ...result.notes.filter(n => !old.some(o => o.recipe_id === n.recipe_id))]));
      setPage(result.page);
      setPages(result.pages);
      setTotal(result.total);
      setError(null);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof RecipeNoteError ? cause : new RecipeNoteError('Notların yüklenemedi.', 'unavailable'));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [memberToken]);

  // Notes edited on a recipe page show up when the member comes back here.
  useFocusEffect(useCallback(() => { void load(1, 'initial'); }, [load]));
  useEffect(() => () => abortRef.current?.abort(), []);
  // Another account on the same device never sees this list.
  useEffect(() => { setItems([]); setPage(1); setPages(1); setTotal(0); }, [user?.id]);

  const remove = (item: MyNoteItem) => {
    if (!memberToken || deletingId) return;
    Alert.alert('Notu sil', 'Bu not kalıcı olarak silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          setDeletingId(item.recipe_id);
          try {
            await deleteMyRecipeNote(memberToken, item.recipe_id);
            setItems(old => old.filter(n => n.recipe_id !== item.recipe_id));
            setTotal(t => Math.max(0, t - 1));
          } catch (cause) {
            Alert.alert('Not silinemedi', cause instanceof Error ? cause.message : 'Birazdan tekrar dene.');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  if (!memberToken) {
    return (
      <View style={[styles.root, styles.center]}>
        <View style={styles.emptyArt}><Ionicons name="create-outline" size={26} color={colors.brand} /></View>
        <Text style={styles.emptyTitle}>Notların burada</Text>
        <Text style={styles.emptyText}>Tariflere yalnızca senin görebileceğin notlar eklemek için giriş yap.</Text>
        <TouchableOpacity style={styles.primary} onPress={() => router.push('/login')} accessibilityRole="button">
          <Text style={styles.primaryText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={item => String(item.recipe_id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }, !items.length && { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(1, 'refresh'); }} tintColor={colors.brand} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (!loading && !loadingMore && !error && page < pages) void load(page + 1, 'more'); }}
        ListHeaderComponent={items.length ? (
          <View style={styles.header}>
            <Text style={styles.headerCount}>{`${total.toLocaleString('tr-TR')} not`}</Text>
            <View style={styles.privateRow}>
              <Ionicons name="lock-closed-outline" size={11} color={colors.textMuted} />
              <Text style={styles.privateText}>Yalnızca sen görürsün</Text>
            </View>
          </View>
        ) : null}
        ListEmptyComponent={loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Notların yüklenemedi</Text>
            <Text style={styles.emptyText}>{error.message}</Text>
            {error.code === 'auth' ? (
              <TouchableOpacity style={styles.secondary} onPress={() => router.push('/login')} accessibilityRole="button">
                <Text style={styles.secondaryText}>Giriş yap</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.secondary} onPress={() => { setLoading(true); void load(1, 'initial'); }} accessibilityRole="button">
                <Text style={styles.secondaryText}>Tekrar dene</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.center}>
            <View style={styles.emptyArt}>
              {['domates', 'fesleğen'].map(name => <LokmaIngredientIcon key={name} name={name} size={26} />)}
            </View>
            <Text style={styles.emptyTitle}>Henüz notun yok</Text>
            <Text style={styles.emptyText}>
              Bir tarif sayfasındaki “Notum” kutusuna yazdıkların burada toplanır. Yalnızca sen görürsün.
            </Text>
            <TouchableOpacity style={styles.secondary} onPress={() => router.push('/recipes')} accessibilityRole="button">
              <Text style={styles.secondaryText}>Tarifleri keşfet</Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.brand} />
          : error && items.length ? (
            <TouchableOpacity onPress={() => { void load(page + 1, 'more'); }} accessibilityRole="button">
              <Text style={styles.footerError}>{error.message} · Tekrar dene</Text>
            </TouchableOpacity>
          ) : null}
        renderItem={({ item }) => <NoteRow item={item} deleting={deletingId === item.recipe_id}
          onOpen={() => { if (item.available && item.slug) router.push({ pathname: '/recipe/[slug]', params: { slug: item.slug } }); }}
          onDelete={() => remove(item)} />}
      />
    </View>
  );
}

function NoteRow({ item, deleting, onOpen, onDelete }: {
  item: MyNoteItem; deleting: boolean; onOpen: () => void; onDelete: () => void;
}) {
  const when = noteDateTr(item.updated_at);
  if (!item.available || !item.slug) {
    return (
      <View style={[styles.row, styles.rowGone]}>
        <View style={[styles.thumb, styles.thumbGone]}>
          <Ionicons name="eye-off-outline" size={20} color={colors.textFaint} />
        </View>
        <View style={styles.texts}>
          <Text style={styles.goneTitle}>Bu tarif artık erişilebilir değil</Text>
          {item.note_excerpt ? <Text style={styles.excerptGone} numberOfLines={2}>{item.note_excerpt}</Text> : null}
          {when ? <Text style={styles.time}>{when}</Text> : null}
        </View>
        <TouchableOpacity onPress={onDelete} disabled={deleting} style={styles.deleteButton} hitSlop={6}
          accessibilityRole="button" accessibilityLabel="Erişilemeyen tarifteki notu sil">
          {deleting ? <ActivityIndicator size="small" color={colors.brand} /> : <Text style={styles.deleteText}>Sil</Text>}
        </TouchableOpacity>
      </View>
    );
  }
  const title = item.title || 'Tarif';
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="button" accessibilityLabel={`${title}. Notun: ${item.note_excerpt}. ${when}`}
      accessibilityHint="Tarifi açar">
      {item.image && !isPlaceholderImage(item.image) ? (
        <Image source={{ uri: item.image }} style={styles.thumb} contentFit="cover" transition={200} />
      ) : (
        <ImagePlaceholder title={title} style={styles.thumb} />
      )}
      <View style={styles.texts}>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {item.note_excerpt ? <Text style={styles.excerpt} numberOfLines={2}>{item.note_excerpt}</Text> : null}
        {when ? <Text style={styles.time}>{when}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 },
  headerCount: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textMuted },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  privateText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  rowGone: { backgroundColor: colors.canvas, borderStyle: 'dashed', borderColor: colors.lineStrong },
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.cream, overflow: 'hidden' },
  thumbGone: { alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  excerpt: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  goneTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.textMuted },
  excerptGone: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textFaint },
  time: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 1 },
  chevron: { alignSelf: 'center' },
  deleteButton: {
    minWidth: 52, height: 34, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: '#f0c8bd',
    backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center',
  },
  deleteText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.brand },
  emptyArt: {
    flexDirection: 'row', gap: 4, width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cream,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  primary: { marginTop: 8, minHeight: 48, paddingHorizontal: 28, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  secondary: { marginTop: 8, minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  footerError: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 12 },
});
