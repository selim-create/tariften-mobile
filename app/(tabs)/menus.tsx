import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getMenusPage } from '../../lib/api';
import { Menu } from '../../lib/types';
import MenuCard from '../../components/MenuCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { useTabBarSpace } from '../../components/navigation/FloatingTabBar';
import { colors, fonts, radius } from '../../constants/theme';

/**
 * Menüler: the archive of whole tables (soup to dessert), newest first,
 * 12 per page from the API, loaded as the reader scrolls.
 */
export default function MenusScreen() {
  const tabSpace = useTabBarSpace();
  const router = useRouter();
  const [menus, setMenus] = useState<Menu[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async (target: number) => {
    if (busy.current) return;
    busy.current = true;
    if (target > 1) setLoadingMore(true);
    try {
      const result = await getMenusPage(target);
      setMenus(prev => {
        if (target === 1) return result.data;
        const seen = new Set(prev.map(m => m.id));
        return [...prev, ...result.data.filter(m => !seen.has(m.id))];
      });
      setCount(result.count);
      setPages(result.pages);
      setPage(target);
    } catch (error) {
      console.warn('Menus load error:', error);
    } finally {
      busy.current = false;
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(1); }, [load]);

  const header = (
    <View style={styles.head}>
      <TouchableOpacity style={styles.circle} onPress={() => router.navigate('/defterim')}
        accessibilityRole="button" accessibilityLabel="Defterim'e dön">
        <Ionicons name="chevron-back" size={21} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.art} pointerEvents="none">
        {['zeytinyağı', 'domates', 'limon'].map((name, i) => (
          <View key={name} style={[styles.artDot, { marginLeft: i ? -8 : 0 }]}><LokmaIngredientIcon name={name} size={22} /></View>
        ))}
      </View>
      <Text style={styles.kicker}>Menüler{count > 0 ? ` · ${count} sofra` : ''}</Text>
      <AccentText style={styles.title}>{'Tek tabak değil, *bütün sofra.*'}</AccentText>
      <Text style={styles.subtitle}>
        Çorbadan tatlıya birbirine eşlik eden tariflerle kurulmuş menüler. Akşam yemeği, bayram kahvaltısı ya da kalabalık bir davet; sen sadece misafir listesini yap.
      </Text>
      <Pressable onPress={() => router.push('/menu/create')} style={({ pressed }) => [styles.create, pressed && { opacity: 0.9 }]}
        accessibilityRole="button">
        <Ionicons name="add" size={19} color="#fff" />
        <Text style={styles.createText}>Kendi menünü kur</Text>
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.pad}>{header}</View>
        <LoadingSpinner />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={menus}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <MenuCard menu={item} />}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.pad, { paddingBottom: tabSpace }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(1); }} tintColor={colors.brand} />
        }
        onEndReached={() => { if (!loadingMore && page < pages) void load(page + 1); }}
        onEndReachedThreshold={0.6}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Henüz menü yok.</Text>
            <Text style={styles.emptyText}>İlk sofrayı sen kur; tariflerini seç, menün hazır olsun.</Text>
          </View>
        }
        ListFooterComponent={loadingMore ? <LoadingSpinner /> : (menus.length > 0 && page >= pages ? (
          <Text style={styles.end}>Hepsi bu kadar · {menus.length} menü</Text>
        ) : null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  pad: { paddingHorizontal: 20 },
  head: { paddingTop: 6, paddingBottom: 28 },
  circle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, marginBottom: 18,
  },
  art: { position: 'absolute', right: 0, top: 6, flexDirection: 'row' },
  artDot: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.canvas,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 36, lineHeight: 40, letterSpacing: -1.2, color: colors.ink, marginTop: 10 },
  subtitle: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textMuted, marginTop: 12 },
  create: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 50, paddingHorizontal: 20,
    borderRadius: radius.pill, backgroundColor: colors.brand, marginTop: 22,
  },
  createText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  empty: { padding: 24, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  end: { fontFamily: fonts.body, fontSize: 13, color: colors.textFaint, textAlign: 'center', paddingVertical: 8 },
});
