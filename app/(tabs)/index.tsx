import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getBlogPosts, getMenus, getRecipes } from '../../lib/api';
import { fetchGuides } from '../../lib/guides-api';
import type { GuideSummary } from '../../lib/guides';
import GuideCard from '../../components/guide/GuideCard';
import { BlogPost, Menu, Recipe } from '../../lib/types';
import LoadingSpinner from '../../components/LoadingSpinner';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import ImagePlaceholder, { isPlaceholderImage } from '../../components/ImagePlaceholder';
import { AccentText } from '../../components/ui/ScreenTitle';
import { useTabBarSpace } from '../../components/navigation/FloatingTabBar';
import { colors, fonts, radius, shadow } from '../../constants/theme';

// Same voice and destinations as the web home page.
const PLACEHOLDERS = [
  'Dolapta sadece yumurta ve yoğurt var…',
  'Akşama misafir var, havalı bir şey lazım…',
  '15 dakikada hazırlanacak hafif bir şey…',
  'Canım tatlı çekiyor ama diyetteyim…',
  'İtalyan mutfağından makarna dışında ne var?',
];

const PILLS = [
  { icon: 'avokado', label: 'Elimde avokado var', query: 'avokado' },
  { icon: 'yumurta', label: '15 dakikada akşam yemeği', query: 'pratik' },
  { icon: 'tavuk göğsü', label: 'Spor sonrası protein', query: 'tavuk' },
  { icon: 'nohut', label: 'Vegan ve doyurucu', query: 'nohut' },
];

const ASIAN = 'Çin Mutfağı,Japon Mutfağı,Kore Mutfağı,Hint Mutfağı';
const CUISINES = [
  { name: 'Türk Mutfağı', param: 'Türk Mutfağı', icon: 'domates', note: 'Zeytinyağlılar, hamur işleri' },
  { name: 'İtalyan Mutfağı', param: 'İtalyan Mutfağı', icon: 'makarna', note: 'Makarna, risotto, fırın' },
  { name: 'Asya Mutfağı', param: ASIAN, icon: 'pirinç', note: 'Çin, Japon, Kore, Hint' },
  { name: 'Meksika Mutfağı', param: 'Meksika Mutfağı', icon: 'avokado', note: 'Tortilla, salsa, acı sos' },
];

const MOODS: { label: string; line: string; icon: string; params: Record<string, string> }[] = [
  { label: 'Fit & Sağlıklı', line: 'Hafif ama doyurucu', icon: 'brokoli', params: { diet: 'Düşük Karbonhidrat' } },
  { label: 'Üşengeç Şef', line: 'Az emek, az bulaşık', icon: 'yumurta', params: { difficulty: 'Kolay' } },
  { label: 'Ziyafet', line: 'Misafire göster', icon: 'dana eti', params: { difficulty: 'Şef' } },
  { label: 'Tatlı Krizi', line: 'Bir dilim yeter mi?', icon: 'çikolata', params: { mealType: 'Tatlı' } },
  { label: 'Acı Sever', line: 'Biberi eksik olmasın', icon: 'acı biber', params: { query: 'acı biber' } },
  { label: 'Pazar Kahvaltısı', line: 'Uzun, sıcak, kalabalık', icon: 'bal', params: { mealType: 'Kahvaltı' } },
];

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Gece atıştırması';
  if (h < 11) return 'Günaydın';
  if (h < 16) return 'Öğle arası';
  if (h < 19) return 'İyi akşamlar';
  return 'Akşam sofrası';
}

function minutesOf(recipe: Recipe) {
  const total = (Number(recipe.prep_time) || 0) + (Number(recipe.cook_time) || 0);
  return total > 0 ? total : 0;
}

/** Typed placeholder that writes and erases the suggestions in turn. */
function useTypewriter(lines: string[]) {
  const [index, setIndex] = useState(0);
  const [text, setText] = useState('');
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    const full = lines[index];
    const done = !deleting && text === full;
    const empty = deleting && text === '';
    const delay = done ? 1900 : deleting ? 28 : 46;
    const timer = setTimeout(() => {
      if (done) { setDeleting(true); return; }
      if (empty) { setDeleting(false); setIndex(i => (i + 1) % lines.length); return; }
      setText(deleting ? full.slice(0, text.length - 1) : full.slice(0, text.length + 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [text, deleting, index, lines]);
  return text;
}

function Heading({ kicker, title, onMore, more }: { kicker: string; title: string; onMore?: () => void; more?: string }) {
  return (
    <View style={styles.heading}>
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.kicker}>{kicker}</Text>
        <AccentText style={styles.sectionTitle}>{title}</AccentText>
      </View>
      {onMore ? (
        <TouchableOpacity onPress={onMore} hitSlop={8} style={styles.moreBtn}>
          <Text style={styles.more}>{more || 'Tümü'}</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.ink} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function FeatureCard({ recipe, height, onPress }: { recipe: Recipe; height: number; onPress: () => void }) {
  const photo = !isPlaceholderImage(recipe.image);
  const minutes = minutesOf(recipe);
  const kicker = recipe.cuisine?.[0] || recipe.meal_type?.[0];
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.feature, { height }, pressed && { transform: [{ scale: 0.985 }] }]}
      accessibilityRole="link" accessibilityLabel={recipe.title}>
      {photo ? (
        <>
          <Image source={{ uri: recipe.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.15)', 'rgba(0,0,0,0.72)']} style={StyleSheet.absoluteFill} />
        </>
      ) : (
        <ImagePlaceholder title={recipe.title} style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.featureCopy}>
        {kicker ? <Text style={[styles.featureKicker, !photo && { color: colors.brand }]}>{kicker}</Text> : null}
        <Text style={[styles.featureTitle, !photo && { color: colors.ink }]} numberOfLines={3}>{recipe.title}</Text>
        {minutes > 0 ? (
          <View style={styles.featureMeta}>
            <Ionicons name="time-outline" size={13} color={photo ? 'rgba(255,255,255,0.85)' : colors.textMuted} />
            <Text style={[styles.featureMetaText, !photo && { color: colors.textMuted }]}>{minutes} dk</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const bottom = useTabBarSpace();
  const [popular, setPopular] = useState<Recipe[]>([]);
  const [editors, setEditors] = useState<Recipe[]>([]);
  const [cuisines, setCuisines] = useState<{ cover: string | null; count: number }[]>([]);
  const [blog, setBlog] = useState<BlogPost[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [guides, setGuides] = useState<GuideSummary[]>([]);
  const [recipeTotal, setRecipeTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const typed = useTypewriter(PLACEHOLDERS);
  const hello = useMemo(() => greeting(), []);


  const load = useCallback(async () => {
    // Mutfak Rehberi is a bonus row: its failure never blocks the home feed.
    const guidesRequest = fetchGuides({ perPage: 5 }).then(page => page.items).catch(() => [] as GuideSummary[]);
    try {
      const [all, pop, ed, blogData, menuData, ...cuisineData] = await Promise.all([
        getRecipes({}),
        getRecipes({ collection: ['Popüler'] }),
        getRecipes({ collection: ['Editörün Seçimi'] }),
        getBlogPosts({ perPage: 3 }),
        getMenus({ collection: 'vitrin' }),
        ...CUISINES.map(c => getRecipes({ cuisine: [c.param] })),
      ]);
      const total = Number(all.count);
      setRecipeTotal(all.source !== 'error' && Number.isFinite(total) && total > 0 ? total : null);
      setPopular((pop.data || []).slice(0, 5));
      setEditors((ed.data || []).slice(0, 4));
      setBlog(blogData.data || []);
      setMenus(menuData.slice(0, 4));
      setGuides(await guidesRequest);
      setCuisines(cuisineData.map(r => ({
        cover: (r.data || []).find((x: Recipe) => !isPlaceholderImage(x.image))?.image || null,
        count: r.count || 0,
      })));
    } catch (error) {
      console.error('Home load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const go = (params: Record<string, string>) => router.push({ pathname: '/recipes', params } as never);
  const submit = () => (search.trim() ? go({ query: search.trim() }) : router.push('/recipes'));

  if (loading) return <LoadingSpinner fullScreen />;


  return (
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: bottom }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.brand} />}>

      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.kicker}>{hello}</Text>
        <Text style={styles.heroTitle}>Bugün ne{'\n'}<Text style={styles.heroAccent}>pişiriyoruz?</Text></Text>
        <Text style={styles.heroLine}>Elindekileri yaz, gerisini Tariften'e bırak.</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={19} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={submit}
            returnKeyType="search"
            placeholder={search ? undefined : `${typed}|`}
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Tarif ya da malzeme ara"
          />
          <TouchableOpacity onPress={submit} style={styles.searchGo} accessibilityRole="button" accessibilityLabel="Ara">
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
          {PILLS.map(pill => (
            <TouchableOpacity key={pill.label} onPress={() => go({ query: pill.query })} style={styles.pill} activeOpacity={0.85}>
              <LokmaIngredientIcon name={pill.icon} size={18} />
              <Text style={styles.pillText}>{pill.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Social import: the flagship flow */}
      <Pressable onPress={() => router.push('/recipe/aktar')} style={({ pressed }) => [styles.importCard, pressed && { opacity: 0.92 }]}
        accessibilityRole="button" accessibilityLabel="Sosyal medyadan tarif aktar">
        <View style={{ flex: 1 }}>
          <Text style={styles.importKicker}>Reels · TikTok · Shorts</Text>
          <Text style={styles.importTitle}>Kaydettiğin videoyu <Text style={styles.importAccent}>tarife</Text> çevir.</Text>
          <Text style={styles.importLine}>Linki yapıştır; malzemeler ve adımlar defterine gelsin.</Text>
        </View>
        <View style={styles.importIcons}>
          {(['logo-instagram', 'logo-tiktok', 'logo-youtube'] as const).map(icon => (
            <View key={icon} style={styles.importIcon}><Ionicons name={icon} size={18} color={colors.ink} /></View>
          ))}
        </View>
      </Pressable>

      {/* The whole archive, one tap away (the old Tarifler tab). */}
      <Pressable onPress={() => router.push('/recipes')} style={({ pressed }) => [styles.browse, pressed && { opacity: 0.9 }]}
        accessibilityRole="link" accessibilityLabel="Tüm tarifleri gör">
        <View style={styles.browseArt}>
          {['makarna', 'domates', 'çikolata'].map((icon, i) => (
            <View key={icon} style={[styles.browseDot, { marginLeft: i ? -10 : 0 }]}><LokmaIngredientIcon name={icon} size={22} /></View>
          ))}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.browseTitle}>Tüm tarifler</Text>
          <Text style={styles.browseLine} numberOfLines={1}>
            {recipeTotal ? `${recipeTotal.toLocaleString('tr-TR')} tarif · ` : ''}ara ve filtrele
          </Text>
        </View>
        <View style={styles.browseGo}><Ionicons name="arrow-forward" size={17} color="#fff" /></View>
      </Pressable>

      {popular.length > 0 && (
        <View style={styles.section}>
          <Heading kicker="Öne çıkanlar" title="Bu hafta bunları *pişiriyoruz*" onMore={() => router.push('/recipes')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={292} decelerationRate="fast" contentContainerStyle={styles.rail}>
            {popular.map(recipe => (
              <View key={recipe.id} style={{ width: 280 }}>
                <FeatureCard recipe={recipe} height={360} onPress={() => router.push(`/recipe/${recipe.slug}`)} />
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.section}>
        <Heading kicker="Mutfaklar" title="Vizesiz *dünya turu*" />
        <View style={styles.grid}>
          {CUISINES.map((c, i) => {
            const meta = cuisines[i];
            const cover = meta?.cover;
            return (
              <Pressable key={c.name} onPress={() => go({ cuisine: c.param })} style={({ pressed }) => [styles.cuisine, pressed && { opacity: 0.9 }]}>
                {cover ? (
                  <>
                    <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.7)']} style={StyleSheet.absoluteFill} />
                  </>
                ) : (
                  <View style={styles.cuisineArt}><LokmaIngredientIcon name={c.icon} size={44} /></View>
                )}
                <Text style={[styles.cuisineName, !cover && { color: colors.ink }]}>{c.name}</Text>
                <Text style={[styles.cuisineNote, !cover && { color: colors.textMuted }]} numberOfLines={1}>
                  {meta?.count ? `${meta.count} tarif · ` : ''}{c.note}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {editors.length > 0 && (
        <View style={styles.section}>
          <Heading kicker="Şefin tavsiyesi" title="Editörün *seçtikleri*" onMore={() => router.push('/collections')} more="Koleksiyonlar" />
          <View style={{ gap: 12, paddingHorizontal: 20 }}>
            {editors.map(recipe => (
              <Pressable key={recipe.id} onPress={() => router.push(`/recipe/${recipe.slug}`)} style={styles.row}>
                <View style={styles.rowThumb}>
                  {isPlaceholderImage(recipe.image)
                    ? <ImagePlaceholder title={recipe.title} style={StyleSheet.absoluteFill} compact />
                    : <Image source={{ uri: recipe.image }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  {recipe.cuisine?.[0] ? <Text style={styles.rowKicker}>{recipe.cuisine[0]}</Text> : null}
                  <Text style={styles.rowTitle} numberOfLines={2}>{recipe.title}</Text>
                  {minutesOf(recipe) > 0 ? <Text style={styles.rowMeta}>{minutesOf(recipe)} dk</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={[styles.section, styles.moodBand]}>
        <Heading kicker="Ruh haline göre" title="Hangi *moddasın?*" />
        <View style={styles.moodGrid}>
          {MOODS.map(mood => (
            <Pressable key={mood.label} onPress={() => go(mood.params)} style={({ pressed }) => [styles.mood, pressed && { transform: [{ scale: 0.97 }] }]}>
              <View style={styles.moodIcon}><LokmaIngredientIcon name={mood.icon} size={30} /></View>
              <Text style={styles.moodLabel}>{mood.label}</Text>
              <Text style={styles.moodLine}>{mood.line}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {menus.length > 0 && (
        <View style={styles.section}>
          <Heading kicker="Hazır sofralar" title="Düşündük, *eşleştirdik*" onMore={() => router.push('/menus')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {menus.map(menu => (
              <Pressable key={menu.id} onPress={() => router.push(`/menu/${menu.slug}`)} style={styles.menuCard}>
                <View style={styles.menuImage}>
                  {menu.image && !isPlaceholderImage(menu.image)
                    ? <Image source={{ uri: menu.image }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    : <ImagePlaceholder title={menu.title} style={StyleSheet.absoluteFill} />}
                </View>
                {menu.event_type ? <Text style={styles.rowKicker}>{menu.event_type}</Text> : null}
                <Text style={styles.menuTitle} numberOfLines={2}>{menu.title}</Text>
                {Number(menu.guest_count) > 0 ? <Text style={styles.rowMeta}>{menu.guest_count} kişilik</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {guides.length > 0 && (
        <View style={styles.section}>
          <Heading kicker="Mutfak Rehberi" title="Mutfağın *el kitabı*" onMore={() => router.push('/rehber')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={248} decelerationRate="fast" contentContainerStyle={styles.rail}>
            {guides.map(guide => (
              <GuideCard key={guide.id} guide={guide} variant="rail"
                onPress={() => router.push(`/rehber/${encodeURIComponent(guide.slug)}`)} />
            ))}
          </ScrollView>
        </View>
      )}

      {blog.length > 0 && (
        <View style={styles.section}>
          <Heading kicker="Mutfaktan blog" title="Okurken *acıktıran* yazılar" onMore={() => router.push('/blog')} />
          <View style={{ gap: 12, paddingHorizontal: 20 }}>
            {blog.map(post => {
              const img = post._embedded?.['wp:featuredmedia']?.[0]?.source_url;
              return (
                <Pressable key={post.id} onPress={() => router.push(`/blog/${post.slug}`)} style={styles.row}>
                  {img ? <View style={styles.rowThumb}><Image source={{ uri: img }} style={StyleSheet.absoluteFill} contentFit="cover" /></View> : null}
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{post.title.rendered.replace(/<[^>]*>/g, '')}</Text>
                    <Text style={styles.rowMeta}>{new Date(post.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  hero: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  heroTitle: { fontFamily: fonts.headingBold, fontSize: 40, lineHeight: 44, letterSpacing: -1.4, color: colors.ink, marginTop: 10 },
  heroAccent: { fontFamily: fonts.headingBoldItalic, color: colors.brand },
  heroLine: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.textMuted, marginTop: 10 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 58, marginTop: 20, paddingLeft: 18, paddingRight: 7,
    borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  searchGo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  pills: { gap: 8, paddingTop: 14, paddingBottom: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingLeft: 6, paddingRight: 14, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  importCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginTop: 22, padding: 18,
    borderRadius: radius.xl, backgroundColor: colors.ink,
  },
  importKicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: '#f3b8ad' },
  importTitle: { fontFamily: fonts.headingBold, fontSize: 20, lineHeight: 25, color: '#fff', marginTop: 6 },
  importAccent: { fontFamily: fonts.headingBoldItalic, color: '#ff8a7c' },
  importLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
  importIcons: { gap: 6 },
  importIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  browse: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginTop: 12, padding: 14, paddingRight: 12,
    borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  browseArt: { flexDirection: 'row' },
  browseDot: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.surface,
  },
  browseTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink },
  browseLine: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 1 },
  browseGo: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 34 },
  heading: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 20, marginBottom: 16 },
  sectionTitle: { fontFamily: fonts.headingBold, fontSize: 25, lineHeight: 30, letterSpacing: -0.6, color: colors.ink },
  moreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 4 },
  more: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  rail: { gap: 12, paddingHorizontal: 20 },
  feature: { borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.cream, justifyContent: 'flex-end' },
  featureCopy: { padding: 18 },
  featureKicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' },
  featureTitle: { fontFamily: fonts.headingBold, fontSize: 22, lineHeight: 27, color: '#fff', marginTop: 6 },
  featureMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  featureMetaText: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 },
  cuisine: { width: '47.5%', aspectRatio: 0.82, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.cream, justifyContent: 'flex-end', padding: 14 },
  cuisineArt: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  cuisineName: { fontFamily: fonts.headingBold, fontSize: 17, lineHeight: 21, color: '#fff' },
  cuisineNote: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, paddingRight: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  rowThumb: { width: 76, height: 76, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.cream },
  rowKicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.brand },
  rowTitle: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 21, color: colors.ink },
  rowMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  moodBand: { backgroundColor: '#f8f1ea', paddingVertical: 30, marginTop: 40 },
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20 },
  mood: { width: '31%', flexGrow: 1, alignItems: 'center', paddingTop: 16, paddingBottom: 14, paddingHorizontal: 6, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#eadfd5' },
  moodIcon: { marginBottom: 10 },
  moodLabel: { fontFamily: fonts.heading, fontSize: 13, color: colors.ink, textAlign: 'center' },
  moodLine: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  menuCard: { width: 220, gap: 4 },
  menuImage: { height: 150, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.cream, marginBottom: 8 },
  menuTitle: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 21, color: colors.ink },
});
