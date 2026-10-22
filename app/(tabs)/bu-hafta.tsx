import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import ScreenTitle from '../../components/ui/ScreenTitle';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { useTabBarSpace } from '../../components/navigation/FloatingTabBar';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { addRecipeToShopping, localDay, removeFromPlan, useKitchen, weekDays } from '../../lib/kitchen-store';
import { getRecipe } from '../../lib/api';
import { lokmaDishName } from '../../lib/lokma-emoji';

const DAY_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAY_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

function isPlaceholder(url?: string) {
  return !url || url.includes('placehold') || url.includes('placeholder');
}

export default function WeekScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const kitchen = useKitchen(user?.id);
  const bottom = useTabBarSpace();
  const [offset, setOffset] = useState(0);
  const base = new Date();
  base.setDate(base.getDate() + offset * 7);
  const days = weekDays(base);
  const today = localDay();
  const [selected, setSelected] = useState(today);
  const [busy, setBusy] = useState(false);

  const keys = days.map(d => localDay(d));
  const activeDay = keys.includes(selected) ? selected : (keys.includes(today) ? today : keys[0]);
  const weekEntries = kitchen.plan.filter(entry => keys.includes(entry.day));
  const dayEntries = weekEntries.filter(entry => entry.day === activeDay);
  const activeIndex = keys.indexOf(activeDay);

  const range = useMemo(() => {
    const fmt = (d: Date, withMonth: boolean) => d.toLocaleDateString('tr-TR', withMonth ? { day: 'numeric', month: 'long' } : { day: 'numeric' });
    const sameMonth = days[0].getMonth() === days[6].getMonth();
    return `${fmt(days[0], !sameMonth)} – ${fmt(days[6], true)}`;
  }, [days]);

  const shopWeek = async () => {
    if (!weekEntries.length || busy) return;
    setBusy(true);
    try {
      const unique = [...new Map(weekEntries.map(e => [e.slug, e])).values()];
      let added = 0;
      for (const entry of unique) {
        const recipe = await getRecipe(entry.slug);
        if (recipe?.ingredients?.length) {
          addRecipeToShopping({ id: recipe.id, slug: recipe.slug, title: recipe.title, ingredients: recipe.ingredients });
          added += 1;
        }
      }
      Alert.alert('Alışveriş listesi', added ? `${added} tarifin malzemeleri listene eklendi.` : 'Bu tariflerde malzeme bilgisi bulunamadı.', [
        { text: 'Tamam' }, ...(added ? [{ text: 'Listeye git', onPress: () => router.push('/alisveris') }] : []),
      ]);
    } catch {
      Alert.alert('Bağlantı sorunu', 'Tarifler şu anda alınamadı. Biraz sonra yeniden dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
        <ScreenTitle kicker="Bu hafta" title="Haftanın *sofrası*"
          subtitle={weekEntries.length ? `${range} · ${weekEntries.length} tarif planlı` : range} />

        <View style={styles.weekNav}>
          <Pressable onPress={() => setOffset(o => o - 1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Önceki hafta">
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </Pressable>
          <View style={styles.strip}>
            {days.map((d, i) => {
              const key = keys[i];
              const active = key === activeDay;
              const count = weekEntries.filter(e => e.day === key).length;
              return (
                <Pressable key={key} onPress={() => setSelected(key)} style={[styles.day, active && styles.dayActive]}
                  accessibilityRole="button" accessibilityState={{ selected: active }}
                  accessibilityLabel={`${DAY_LONG[i]} ${d.getDate()}${count ? `, ${count} tarif` : ''}`}>
                  <Text style={[styles.dayShort, active && styles.dayTextActive]}>{DAY_SHORT[i]}</Text>
                  <Text style={[styles.dayNum, active && styles.dayTextActive, key === today && !active && { color: colors.brand }]}>{d.getDate()}</Text>
                  <View style={[styles.dot, { opacity: count ? 1 : 0 }, active && { backgroundColor: '#fff' }]} />
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => setOffset(o => o + 1)} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Sonraki hafta">
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </Pressable>
        </View>

        <View style={styles.dayHead}>
          <Text style={styles.dayTitle}>{DAY_LONG[activeIndex]}{activeDay === today ? ' · Bugün' : ''}</Text>
        </View>

        {dayEntries.length === 0 ? (
          <View style={styles.empty}>
            <LokmaIngredientIcon name="tabak" size={34} />
            <Text style={styles.emptyTitle}>Bu güne henüz tarif yok.</Text>
            <Text style={styles.emptyText}>Bir tarifin sayfasında “Haftaya ekle”ye dokun, günü seç; burada sıralansın.</Text>
            <TouchableOpacity onPress={() => router.push('/recipes')} style={styles.cta}>
              <Text style={styles.ctaText}>Tarif seç</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 12, paddingHorizontal: 20 }}>
            {dayEntries.map(entry => (
              <Pressable key={entry.id} onPress={() => router.push(`/recipe/${entry.slug}`)} style={styles.entry}>
                <View style={styles.thumb}>
                  {isPlaceholder(entry.image)
                    ? <LokmaIngredientIcon name={lokmaDishName(entry.title)} size={30} />
                    : <Image source={{ uri: entry.image }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                </View>
                <Text style={styles.entryTitle} numberOfLines={2}>{entry.title}</Text>
                <Pressable onPress={() => removeFromPlan(entry.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${entry.title} planından çıkar`}>
                  <Ionicons name="close-circle" size={22} color={colors.lineStrong} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}

        {weekEntries.length > 0 && (
          <TouchableOpacity onPress={shopWeek} disabled={busy} style={styles.shopAll} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Ionicons name="basket" size={18} color="#fff" />}
            <Text style={styles.shopAllText}>Haftanın malzemelerini listeye ekle</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.footnote}>{user ? 'Planın hesabına kaydedilir; tariften.com\'da da aynısını görürsün.' : 'Planın bu cihazda saklanır; giriş yapınca hesabına taşınır.'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 },
  navBtn: { width: 32, height: 64, alignItems: 'center', justifyContent: 'center' },
  strip: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  day: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  dayActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayShort: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted },
  dayNum: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink, marginTop: 2 },
  dayTextActive: { color: '#fff' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginTop: 5 },
  dayHead: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 12 },
  dayTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  entry: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, paddingRight: 14,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  thumb: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  entryTitle: { flex: 1, fontFamily: fonts.heading, fontSize: 15, lineHeight: 20, color: colors.ink },
  empty: { alignItems: 'center', marginHorizontal: 20, paddingVertical: 28, paddingHorizontal: 24, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink, marginTop: 12 },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  cta: { marginTop: 16, height: 44, paddingHorizontal: 22, borderRadius: radius.pill, backgroundColor: colors.ink, justifyContent: 'center' },
  ctaText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#fff' },
  shopAll: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, marginHorizontal: 20, marginTop: 24,
    borderRadius: radius.pill, backgroundColor: colors.brand,
  },
  shopAllText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  footnote: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, textAlign: 'center', marginTop: 18 },
});
