import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getMenu } from '../../lib/api';
import { Menu } from '../../lib/types';
import { parseIngredients } from '../../lib/recipeUtils';
import { addRecipeToShopping, isInShopping, useKitchen } from '../../lib/kitchen-store';
import { useAuth } from '../../context/AuthContext';
import RecipeCard from '../../components/RecipeCard';
import { useBlockFilter } from '../../hooks/useBlockFilter';
import AuthorCard from '../../components/AuthorCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import ImagePlaceholder, { isPlaceholderImage } from '../../components/ImagePlaceholder';
import { colors, fonts, radius, shadow } from '../../constants/theme';

// Course names as a printed menu would set them, with one honest line each (same as the web).
const COURSES: Record<string, { title: string; line: string }> = {
  soup: { title: 'Çorba', line: 'Sofra sıcakla açılır.' },
  starter: { title: 'Başlangıç', line: 'İştahı açmak için.' },
  meze: { title: 'Mezeler', line: 'Ortaya, paylaşmalık.' },
  hot_appetizer: { title: 'Ara sıcak', line: 'Mezeyle ana yemek arasında.' },
  salad: { title: 'Salata', line: 'Ferah bir eşlikçi.' },
  side: { title: 'Eşlikçiler', line: 'Ana yemeğin yanına.' },
  main: { title: 'Ana yemek', line: 'Sofranın yıldızı.' },
  dessert: { title: 'Tatlı', line: 'Mutlu son.' },
  drink: { title: 'İçecek', line: 'Kadehe, bardağa.' },
  breakfast_main: { title: 'Kahvaltılıklar', line: 'Masanın ortasına.' },
  breakfast_side: { title: 'Kahvaltının yanına', line: 'Küçük tabaklar.' },
  savory: { title: 'Tuzlular', line: 'Çayın yanına.' },
  sweet: { title: 'Tatlılar', line: 'Şekerli mola.' },
  cold_canape: { title: 'Soğuk kanapeler', line: 'Tek lokmalık.' },
  hot_bites: { title: 'Sıcak ikramlar', line: 'Fırından yeni çıkmış.' },
  dip_sauce: { title: 'Dip ve soslar', line: 'Banmalık.' },
};

export default function MenuDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const kitchen = useKitchen(user?.id);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const { visibleRecipes } = useBlockFilter();

  const loadMenu = useCallback(async () => {
    if (!slug) return;
    try {
      setMenu(await getMenu(slug));
    } catch (error) {
      console.warn('Menu load error:', error);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { void loadMenu(); }, [loadMenu]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/menus');
  };

  if (loading) return <LoadingSpinner fullScreen />;

  if (!menu) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>Menü bulunamadı.</Text>
        <TouchableOpacity onPress={goBack} style={styles.errorBack}><Text style={styles.errorBackText}>Menülere dön</Text></TouchableOpacity>
      </View>
    );
  }

  // Blocked members' recipes are left out of the courses (and of "add all to shopping").
  const sections = (menu.sections || [])
    .map(section => ({ ...section, recipes: visibleRecipes(section.recipes) }))
    .filter(section => section.recipes.length > 0);
  const recipes = sections.flatMap(section => section.recipes);
  const recipeCount = recipes.length;
  const guests = Number(menu.guest_count) || 0;
  const hasPhoto = !isPlaceholderImage(menu.image);
  const concept = menu.concept && menu.concept.trim().toLocaleLowerCase('tr-TR') !== menu.title.trim().toLocaleLowerCase('tr-TR')
    ? menu.concept.trim() : null;
  const facts = [
    recipeCount > 0 ? { icon: 'restaurant-outline' as const, label: 'Tarif', value: `${recipeCount} tarif` } : null,
    guests > 0 ? { icon: 'people-outline' as const, label: 'Sofra', value: `${guests} kişilik` } : null,
    menu.event_type ? { icon: 'calendar-clear-outline' as const, label: 'Öğün', value: menu.event_type } : null,
  ].filter(Boolean) as { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }[];
  const allInList = recipeCount > 0 && recipes.every(recipe => isInShopping(recipe.id, kitchen));

  const addAllToShopping = () => {
    if (allInList) { router.push('/alisveris'); return; }
    let added = 0;
    for (const recipe of recipes) {
      if (isInShopping(recipe.id, kitchen)) continue;
      const servings = Number(recipe.servings);
      addRecipeToShopping({
        id: recipe.id, slug: recipe.slug, title: recipe.title,
        servings: Number.isFinite(servings) && servings > 0 ? servings : null,
        ingredients: parseIngredients(recipe.ingredients),
      });
      added += 1;
    }
    setToast(added > 0 ? `${added} tarifin malzemeleri alışveriş listene eklendi` : 'Hepsi zaten listende');
  };

  const share = async () => {
    try {
      await Share.share({
        title: menu.title,
        message: `${menu.title} menüsünü Tariften.com'da incele!\nhttps://tariften.com/menu/${menu.slug}`,
        url: `https://tariften.com/menu/${menu.slug}`,
      });
    } catch (error) {
      console.warn('Share error:', error);
    }
  };

  const heroHeight = width >= 600 ? 420 : 360;

  return (
    <>
      <StatusBar style={hasPhoto ? 'light' : 'dark'} />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>
        <View style={[styles.hero, { height: heroHeight }]}>
          {hasPhoto ? (
            <Image source={{ uri: menu.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
          ) : (
            <ImagePlaceholder title={menu.title} variant="detail" style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient colors={['rgba(18,23,33,0.45)', 'transparent']} style={styles.heroGradient} pointerEvents="none" />
          <View style={[styles.heroBar, { top: Math.max(insets.top + 8, 20) }]}>
            <TouchableOpacity style={styles.heroCircle} onPress={goBack} accessibilityRole="button" accessibilityLabel="Menülere geri dön">
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroCircle} onPress={() => void share()} accessibilityRole="button" accessibilityLabel="Menüyü paylaş">
              <Ionicons name="share-outline" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.content}>
          <Text style={styles.kicker}>Tariften menüsü{menu.event_type ? ` · ${menu.event_type}` : ''}</Text>
          <Text style={styles.title}>{menu.title}</Text>
          {concept ? <Text style={styles.concept}>“{concept}”</Text> : null}
          {menu.description ? <Text style={styles.description}>{menu.description}</Text> : null}

          {facts.length > 0 && (
            <View style={styles.facts}>
              {facts.map((fact, i) => (
                <View key={fact.label} style={[styles.fact, i > 0 && styles.factLine]}>
                  <View style={styles.factLabelRow}>
                    <Ionicons name={fact.icon} size={13} color={colors.textFaint} />
                    <Text style={styles.factLabel}>{fact.label}</Text>
                  </View>
                  <Text style={styles.factValue} numberOfLines={1}>{fact.value}</Text>
                </View>
              ))}
            </View>
          )}

          {recipeCount > 0 && (
            <View style={styles.actions}>
              <Pressable onPress={addAllToShopping} style={({ pressed }) => [styles.primary, allInList && styles.primaryDone, pressed && { opacity: 0.9 }]}
                accessibilityRole="button" accessibilityLabel={allInList ? 'Alışveriş listesine git' : 'Menünün malzemelerini alışveriş listesine ekle'}>
                <Ionicons name={allInList ? 'basket' : 'basket-outline'} size={18} color="#fff" />
                <Text style={styles.primaryText}>{allInList ? 'Listede · Listeye git' : 'Alışverişe ekle'}</Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/recipe/${recipes[0].slug}`)} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}
                accessibilityRole="button" accessibilityLabel="İlk tariften başla">
                <Ionicons name="play" size={15} color={colors.ink} />
                <Text style={styles.secondaryText}>İlk tarif</Text>
              </Pressable>
            </View>
          )}

          {sections.length > 0 ? sections.map((section, idx) => {
            const course = COURSES[section.type] || { title: section.title || 'Diğer', line: 'Menüye özel.' };
            return (
              <View key={`${section.type}-${idx}`} style={styles.course}>
                <View style={styles.courseHead}>
                  <Text style={styles.courseNumber}>{String(idx + 1).padStart(2, '0')}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.courseTitle}>{section.title || course.title}</Text>
                    <Text style={styles.courseLine}>{course.line} <Text style={styles.courseCount}>· {section.recipes.length} tarif</Text></Text>
                  </View>
                </View>
                <View style={{ gap: 10 }}>
                  {section.recipes.map(recipe => <RecipeCard key={recipe.id} recipe={recipe} variant="row" />)}
                </View>
              </View>
            );
          }) : (
            <View style={styles.emptyCourses}><Text style={styles.emptyText}>Bu menüye henüz tarif eklenmemiş.</Text></View>
          )}

          {recipeCount > 0 && (
            <View style={styles.ready}>
              <Text style={styles.readyTitle}>Önlük hazır mı?</Text>
              <Text style={styles.readyText}>
                Malzemeleri alışveriş listene al, sonra hangi tarifle başlayacağını seç; pişirme rehberi adım adım eşlik etsin.
              </Text>
              <View style={styles.readyActions}>
                <Pressable onPress={addAllToShopping} style={({ pressed }) => [styles.readyPrimary, pressed && { opacity: 0.9 }]} accessibilityRole="button">
                  <Text style={styles.readyPrimaryText}>{allInList ? 'Listeye git' : 'Alışveriş listesi'}</Text>
                </Pressable>
                <Pressable onPress={() => void share()} style={({ pressed }) => [styles.readySecondary, pressed && { opacity: 0.85 }]} accessibilityRole="button">
                  <Text style={styles.readySecondaryText}>Paylaş</Text>
                </Pressable>
              </View>
            </View>
          )}

          {menu.author?.name ? (
            <View style={{ marginTop: 22 }}>
              <AuthorCard author={menu.author} label="Menüyü hazırlayan" />
            </View>
          ) : null}
        </View>
      </ScrollView>
      {toast ? (
        <View style={[styles.toast, { bottom: Math.max(insets.bottom, 14) + 10 }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={18} color="#fff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  hero: { backgroundColor: colors.cream },
  heroGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  heroBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
  heroCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center', ...shadow.card,
  },
  content: {
    marginTop: -30, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: colors.canvas,
    paddingTop: 26, paddingHorizontal: 20,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 31, lineHeight: 37, letterSpacing: -0.9, color: colors.ink, marginTop: 8 },
  concept: { fontFamily: fonts.headingItalic, fontSize: 17, lineHeight: 24, color: colors.brand, marginTop: 10 },
  description: { fontFamily: fonts.body, fontSize: 16, lineHeight: 25, color: colors.textMuted, marginTop: 12 },
  facts: {
    flexDirection: 'row', marginTop: 22, borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  fact: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', paddingVertical: 13, paddingHorizontal: 12, gap: 3 },
  factLine: { borderLeftWidth: 1, borderLeftColor: colors.line },
  factLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  factLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  factValue: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primary: {
    flex: 1.6, height: 50, borderRadius: radius.pill, backgroundColor: colors.brand,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  primaryDone: { backgroundColor: colors.success },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  secondary: {
    flex: 1, height: 50, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  course: { marginTop: 34 },
  courseHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.line },
  courseNumber: { fontFamily: fonts.headingBold, fontSize: 15, color: colors.brand, marginTop: 6 },
  courseTitle: { fontFamily: fonts.headingBold, fontSize: 24, lineHeight: 29, letterSpacing: -0.5, color: colors.ink },
  courseLine: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  courseCount: { color: colors.textFaint },
  emptyCourses: { marginTop: 24, padding: 24, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  ready: { marginTop: 36, padding: 22, borderRadius: radius.xl, backgroundColor: colors.ink, gap: 8 },
  readyTitle: { fontFamily: fonts.headingBold, fontSize: 24, color: '#fff' },
  readyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.68)' },
  readyActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  readyPrimary: { flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  readyPrimaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  readySecondary: { flex: 1, height: 48, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  readySecondaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#fff' },
  toast: {
    position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 14, borderRadius: radius.lg, backgroundColor: colors.ink, ...shadow.floating,
  },
  toastText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: '#fff' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas, gap: 14 },
  errorTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  errorBack: { height: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: colors.ink, justifyContent: 'center' },
  errorBackText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#fff' },
});
