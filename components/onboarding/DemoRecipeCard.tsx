import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import LokmaIngredientIcon from '../LokmaIngredientIcon';
import { lokmaArtUri } from '../../lib/lokma-svg-art';
import { DEMO_RECIPE } from '../../lib/onboarding-core';
import { colors, fonts, radius, shadow } from '../../constants/theme';

/** Warm "video still" behind the demo: a self-drawn plate of pasta (Lokma drawings, bundled). */
export const DISH_GRADIENT = ['#2b1d17', '#5b2f22', '#9a5132'] as const;

export function DishArt({ size }: { size: number }) {
  const item = (figure: string, s: number, left: number, top: number, rotate = '0deg') => (
    <Image key={figure + left} source={{ uri: lokmaArtUri(figure) }} contentFit="contain" cachePolicy="memory" accessible={false}
      style={{ position: 'absolute', width: size * s, height: size * s, left: size * left, top: size * top, transform: [{ rotate }] }} />
  );
  return (
    <View style={{ width: size, height: size }} accessible={false} importantForAccessibility="no-hide-descendants">
      <View style={[styles.plate, { width: size, height: size, borderRadius: size / 2 }]} />
      <View style={[styles.plateInner, { width: size * 0.74, height: size * 0.74, borderRadius: size * 0.37, left: size * 0.13, top: size * 0.13 }]} />
      {item('pasta', 0.5, 0.25, 0.24)}
      {item('tomato', 0.24, 0.12, 0.16, '-12deg')}
      {item('herb', 0.24, 0.62, 0.14, '18deg')}
      {item('garlic', 0.2, 0.18, 0.62, '-8deg')}
      {item('cheese', 0.2, 0.62, 0.6, '10deg')}
    </View>
  );
}

/** The success card: a local, static sample recipe. Nothing is fetched or saved. */
export default function DemoRecipeCard({ compact }: { compact?: boolean }) {
  const r = DEMO_RECIPE;
  const shown = r.ingredients.slice(0, compact ? 3 : 4);
  const more = r.ingredients.length - shown.length;
  const artHeight = compact ? 112 : 148;
  return (
    <View style={styles.card}
      accessible accessibilityRole="summary"
      accessibilityLabel={`Örnek tarif: ${r.title}. ${r.minutes} dakika, ${r.servings} kişilik, ${r.ingredients.length} malzeme.`}>
      <LinearGradient colors={DISH_GRADIENT} style={[styles.art, { height: artHeight }]}>
        <DishArt size={artHeight * 0.86} />
        <View style={styles.badge}>
          <Ionicons name="sparkles" size={12} color={colors.brand} />
          <Text style={styles.badgeText} allowFontScaling={false}>Videodan</Text>
        </View>
      </LinearGradient>
      <View style={styles.body}>
        <Text style={styles.title} maxFontSizeMultiplier={1.3}>{r.title}</Text>
        <View style={styles.meta}>
          {([['time-outline', `${r.minutes} dk`], ['people-outline', `${r.servings} kişilik`], ['list-outline', `${r.ingredients.length} malzeme`]] as const).map(([icon, label]) => (
            <View key={label} style={styles.metaItem}>
              <Ionicons name={icon} size={14} color={colors.textMuted} />
              <Text style={styles.metaText} maxFontSizeMultiplier={1.3}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.chips}>
          {shown.map(ing => (
            <View key={ing.name} style={styles.chip}>
              <LokmaIngredientIcon name={ing.name} size={15} />
              <Text style={styles.chipText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{ing.label}</Text>
            </View>
          ))}
          {more > 0 ? <View style={[styles.chip, styles.chipMore]}><Text style={styles.chipText} maxFontSizeMultiplier={1.3}>+{more}</Text></View> : null}
        </View>
        {!compact ? (
          <View style={styles.step}>
            <View style={styles.stepNo}><Text style={styles.stepNoText}>1</Text></View>
            <Text style={styles.stepText} numberOfLines={2} maxFontSizeMultiplier={1.3}>{r.firstStep}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { position: 'absolute', backgroundColor: colors.cream },
  plateInner: { position: 'absolute', backgroundColor: '#fbf6f0', borderWidth: 1, borderColor: colors.creamDeep },
  card: {
    width: '100%', borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    overflow: 'hidden', ...shadow.floating,
  },
  art: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface,
  },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.ink },
  body: { padding: 16, gap: 10 },
  title: { fontFamily: fonts.headingBold, fontSize: 19, lineHeight: 24, letterSpacing: -0.3, color: colors.ink },
  meta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingLeft: 4, paddingRight: 10, borderRadius: radius.pill,
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line, maxWidth: '100%',
  },
  chipMore: { paddingLeft: 10 },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 12.5, color: colors.text, flexShrink: 1 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingTop: 2 },
  stepNo: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  stepNoText: { fontFamily: fonts.bodyBold, fontSize: 12, color: colors.brand },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 13.5, lineHeight: 19, color: colors.text },
});
