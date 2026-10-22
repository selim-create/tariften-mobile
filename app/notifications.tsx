import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../components/notifications/NotificationsProvider';
import { fetchNotifications, markNotificationsRead } from '../lib/notifications-api';
import { relativeTimeTr, type InboxItem } from '../lib/notifications-core';
import LokmaIngredientIcon from '../components/LokmaIngredientIcon';
import { colors, fonts, radius } from '../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
const PER_PAGE = 20;

function iconFor(type: string): { name: IoniconName; tint: string; bg: string } {
  if (type === 'recipe_ready') return { name: 'checkmark-circle-outline', tint: colors.success, bg: colors.successSoft };
  if (type === 'recipe_review') return { name: 'create-outline', tint: colors.warning, bg: colors.warningSoft };
  if (type === 'recipe_failed') return { name: 'alert-circle-outline', tint: colors.brand, bg: colors.brandSoft };
  return { name: 'notifications-outline', tint: colors.ink, bg: colors.cream };
}

/** Bildirimler: calm inbox of "Tarifin hazır" style updates from Core. */
export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { setUnreadCount, unreadCount, markRead } = useNotifications();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (nextPage: number, mode: 'initial' | 'refresh' | 'more') => {
    if (!token) { setLoading(false); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (mode === 'refresh') setRefreshing(true);
    if (mode === 'more') setLoadingMore(true);
    try {
      const result = await fetchNotifications(token, nextPage, PER_PAGE, controller.signal);
      if (controller.signal.aborted) return;
      setItems(old => (nextPage === 1 ? result.items : [...old, ...result.items.filter(i => !old.some(o => o.id === i.id))]));
      setPage(result.page);
      setTotalPages(result.totalPages);
      setUnreadCount(result.unreadCount);
      setNow(Date.now());
      setError('');
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Bildirimler yüklenemedi.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [token, setUnreadCount]);

  useFocusEffect(useCallback(() => { void load(1, 'initial'); }, [load]));
  useEffect(() => () => abortRef.current?.abort(), []);

  const open = (item: InboxItem) => {
    if (!item.read) {
      setItems(old => old.map(i => (i.id === item.id ? { ...i, read: true } : i)));
      void markRead(item.id);
    }
    router.push(item.path);
  };

  const markAll = async () => {
    if (!token || markingAll) return;
    setMarkingAll(true);
    try {
      const count = await markNotificationsRead(token, { all: true });
      setItems(old => old.map(i => ({ ...i, read: true })));
      setUnreadCount(count ?? 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bildirimler okundu olarak işaretlenemedi.');
    } finally {
      setMarkingAll(false);
    }
  };

  if (!token) {
    return (
      <View style={[styles.root, styles.center]}>
        <View style={styles.emptyArt}><Ionicons name="notifications-outline" size={26} color={colors.brand} /></View>
        <Text style={styles.emptyTitle}>Bildirimlerin burada</Text>
        <Text style={styles.emptyText}>Aktardığın tarifler hazır olduğunda burada görmek için giriş yap.</Text>
        <TouchableOpacity style={styles.primary} onPress={() => router.push('/login')} accessibilityRole="button">
          <Text style={styles.primaryText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const shownUnread = unreadCount || items.filter(i => !i.read).length;
  const hasUnread = shownUnread > 0;
  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }, !items.length && { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void load(1, 'refresh'); }} tintColor={colors.brand} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => { if (!loading && !loadingMore && page < totalPages) void load(page + 1, 'more'); }}
        ListHeaderComponent={items.length ? (
          <View style={styles.header}>
            <Text style={styles.headerCount}>{hasUnread ? `${shownUnread} okunmamış` : 'Hepsi okundu'}</Text>
            {hasUnread ? (
              <TouchableOpacity onPress={() => { void markAll(); }} disabled={markingAll} hitSlop={8}
                accessibilityRole="button" accessibilityLabel="Tümünü okundu say">
                <Text style={[styles.markAll, markingAll && { opacity: 0.5 }]}>Tümünü okundu say</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        ListEmptyComponent={loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Bildirimler yüklenemedi</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity style={styles.secondary} onPress={() => { setLoading(true); void load(1, 'initial'); }} accessibilityRole="button">
              <Text style={styles.secondaryText}>Tekrar dene</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.center}>
            <View style={styles.emptyArt}>
              {['domates', 'fesleğen'].map(name => <LokmaIngredientIcon key={name} name={name} size={26} />)}
            </View>
            <Text style={styles.emptyTitle}>Henüz bildirim yok</Text>
            <Text style={styles.emptyText}>
              Bir videodan tarif aktardığında, tarifin hazır olunca ya da kontrolünü beklediğinde burada görürsün.
            </Text>
            <TouchableOpacity style={styles.secondary} onPress={() => router.push('/recipe/aktar')} accessibilityRole="button">
              <Text style={styles.secondaryText}>Videodan tarif aktar</Text>
            </TouchableOpacity>
          </View>
        )}
        ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginTop: 12 }} color={colors.brand} />
          : error && items.length ? <Text style={styles.footerError}>{error}</Text> : null}
        renderItem={({ item }) => {
          const icon = iconFor(item.type);
          const when = relativeTimeTr(item.createdAt, now);
          return (
            <Pressable onPress={() => open(item)}
              style={({ pressed }) => [styles.row, !item.read && styles.rowUnread, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel={`${item.read ? '' : 'Okunmadı. '}${item.title}. ${item.body} ${when}`}>
              <View style={[styles.icon, { backgroundColor: icon.bg }]}>
                <Ionicons name={icon.name} size={19} color={icon.tint} />
              </View>
              <View style={styles.texts}>
                <View style={styles.titleRow}>
                  <Text style={[styles.title, !item.read && styles.titleUnread]} numberOfLines={2}>{item.title}</Text>
                  {!item.read ? <View style={styles.dot} /> : null}
                </View>
                {item.body ? <Text style={styles.body} numberOfLines={3}>{item.body}</Text> : null}
                {when ? <Text style={styles.time}>{when}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 },
  headerCount: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textMuted },
  markAll: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.brand },
  row: {
    flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  rowUnread: { borderColor: colors.lineStrong, backgroundColor: '#fffdfb' },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 20, color: colors.text },
  titleUnread: { fontFamily: fonts.bodySemi, color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 },
  body: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  time: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
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
