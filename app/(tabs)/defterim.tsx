import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import ScreenTitle from '../../components/ui/ScreenTitle';
import MyKitchenLibrary from '../../components/account/MyKitchenLibrary';
import RecipeCard from '../../components/RecipeCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { useTabBarSpace } from '../../components/navigation/FloatingTabBar';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { getInteractions } from '../../lib/api';
import type { Recipe } from '../../lib/types';

type Shelf = 'recipes' | 'favorites' | 'menus' | 'cooked';
const SHELVES: { key: Shelf; label: string }[] = [
  { key: 'recipes', label: 'Tariflerim' },
  { key: 'favorites', label: 'Kaydettiklerim' },
  { key: 'menus', label: 'Sofralarım' },
  { key: 'cooked', label: 'Pişirdiklerim' },
];

/**
 * "Defterim": the cook's own kitchen — their recipes, saved recipes, tables
 * (menus), cooked list — plus doors to Dolap and Menüler. Profile lives on the
 * avatar at the top right.
 */
export default function NotebookScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const bottom = useTabBarSpace();
  const [shelf, setShelf] = useState<Shelf>('recipes');
  const [items, setItems] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!token || (shelf !== 'favorites' && shelf !== 'cooked')) return;
    let active = true;
    setLoading(true);
    getInteractions(token, shelf === 'favorites' ? 'favorite' : 'cooked')
      .then(data => { if (active) setItems(data); })
      .catch(() => { if (active) setItems([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, shelf]));

  const avatar = (
    <TouchableOpacity onPress={() => router.push(user ? '/profile' : '/login')} style={styles.avatar}
      accessibilityRole="button" accessibilityLabel={user ? 'Profilim ve ayarlar' : 'Giriş yap'}>
      {user?.avatar_url
        ? <Image source={{ uri: user.avatar_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        : <Ionicons name={user ? 'person' : 'person-outline'} size={18} color={user ? colors.brand : colors.ink} />}
    </TouchableOpacity>
  );

  if (!user || !token) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
          <ScreenTitle kicker="Defterim" title="Mutfağının *defteri*" right={avatar} />
          <View style={styles.guest}>
            <View style={styles.guestArt}>
              {['un', 'yumurta', 'tereyağı'].map(name => <LokmaIngredientIcon key={name} name={name} size={30} />)}
            </View>
            <Text style={styles.guestTitle}>Tariflerin, kaydettiklerin, sofraların tek yerde.</Text>
            <Text style={styles.guestText}>Giriş yap; Instagram, TikTok ya da YouTube'dan aktardığın tarifler de burada toplansın.</Text>
            <TouchableOpacity onPress={() => router.push('/login')} style={styles.primary}>
              <Text style={styles.primaryText}>Giriş yap</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/register')} style={styles.secondary}>
              <Text style={styles.secondaryText}>Standart Üye ol</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const firstName = (user.user_display_name || '').split(' ')[0];

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
        <ScreenTitle kicker="Defterim" title="Mutfak *defterin*" subtitle={firstName ? `Merhaba ${firstName}.` : undefined} right={avatar} />

        <View style={styles.doors}>
          <Door icon="file-tray-full" tint="#3f6f8f" tile="#eaf3f8" title="Dolap" line="Evde ne var, ne bitiyor"
            onPress={() => router.push('/pantry')} />
          <Door icon="restaurant" tint="#387b64" tile="#e9f5ee" title="Menüler" line="Hazır sofralar ve davetler"
            onPress={() => router.push('/menus')} />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelves}>
          {SHELVES.map(item => {
            const active = shelf === item.key;
            return (
              <Pressable key={item.key} onPress={() => setShelf(item.key)}
                style={[styles.shelf, active && styles.shelfActive]}
                accessibilityRole="tab" accessibilityState={{ selected: active }}>
                <Text style={[styles.shelfText, active && styles.shelfTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.content}>
          {shelf === 'recipes' || shelf === 'menus' ? (
            <MyKitchenLibrary kind={shelf === 'recipes' ? 'recipes' : 'menus'} token={token} userId={user.id} />
          ) : loading ? (
            <LoadingSpinner />
          ) : (
            <FlatList
              data={items}
              keyExtractor={item => String(item.id)}
              renderItem={({ item }) => <RecipeCard recipe={item} />}
              scrollEnabled={false}
              contentContainerStyle={{ gap: 4 }}
              ListEmptyComponent={
                <View style={styles.emptyShelf}>
                  <Text style={styles.emptyTitle}>{shelf === 'favorites' ? 'Henüz kaydettiğin bir tarif yok.' : 'Pişirdiğin tarifler burada birikir.'}</Text>
                  <Text style={styles.emptyText}>{shelf === 'favorites' ? 'Tarif sayfasındaki kalbe dokun; tarif buraya gelsin.' : 'Bir tarifi pişirdikten sonra “Pişirdim” olarak işaretle.'}</Text>
                </View>
              }
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Door({ icon, tint, tile, title, line, onPress }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; tint: string; tile: string; title: string; line: string; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.door, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={title}>
      <View style={[styles.doorIcon, { backgroundColor: tile }]}><Ionicons name={icon} size={20} color={tint} /></View>
      <Text style={styles.doorTitle}>{title}</Text>
      <Text style={styles.doorLine} numberOfLines={2}>{line}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  avatar: {
    width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  doors: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginBottom: 22 },
  door: { flex: 1, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow.card },
  doorIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  doorTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink },
  doorLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
  shelves: { gap: 8, paddingHorizontal: 20, paddingBottom: 6 },
  shelf: { height: 40, paddingHorizontal: 16, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  shelfActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  shelfText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  shelfTextActive: { color: '#fff' },
  content: { paddingTop: 10 },
  emptyShelf: { marginHorizontal: 20, marginTop: 10, padding: 24, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  guest: { marginHorizontal: 20, padding: 24, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  guestArt: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  guestTitle: { fontFamily: fonts.headingBold, fontSize: 20, lineHeight: 26, color: colors.ink, textAlign: 'center' },
  guestText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  primary: { alignSelf: 'stretch', height: 52, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 16, color: '#fff' },
  secondary: { alignSelf: 'stretch', height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
});
