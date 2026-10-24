import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LokmaIngredientIcon from '../LokmaIngredientIcon';
import DemoMedia from './DemoMedia';
import { useEntrance } from './motion';
import { COPY, DEMO_RECIPE } from '../../lib/onboarding-core';
import { colors, fonts, radius, shadow } from '../../constants/theme';

/**
 * The finished sample recipe, drawn the way the app shows a recipe: the
 * photo hero with the brand "Videodan" badge and the source pill (as on the
 * recipe page), then the facts, the title, ingredient chips and the first
 * step. A local, static sample: nothing is fetched or saved.
 *
 * The calm "done" moment: the card rises into place with a soft shadow, then
 * the "Defterine eklemeye hazır" ribbon settles in. Reduce Motion: all still.
 */
export default function DemoRecipeCard({ compact, reduceMotion }: { compact?: boolean; reduceMotion: boolean }) {
  const r = DEMO_RECIPE;
  const shown = r.ingredients.slice(0, compact ? 3 : 4);
  const more = r.ingredients.length - shown.length;
  const heroHeight = compact ? 136 : 188;
  const rise = useEntrance(!reduceMotion, 60, 620);
  const ribbon = useEntrance(!reduceMotion, 560, 420);

  return (
    <Animated.View style={[styles.shadow, {
      opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
    }]}>
      <View style={styles.card} accessible accessibilityRole="summary"
        accessibilityLabel={`Örnek tarif: ${r.title}. ${r.minutes} dakika, ${r.servings} kişilik, ${r.ingredients.length} malzeme. ${COPY.doneRibbon}.`}>
        <View style={[styles.hero, { height: heroHeight }]}>
          <DemoMedia reduceMotion={reduceMotion} scrim="card" />
          <View style={styles.badge}>
            <Ionicons name="sparkles" size={12} color="#fff" />
            <Text style={styles.badgeText} maxFontSizeMultiplier={1.2} numberOfLines={1}>{COPY.doneBadge}</Text>
          </View>
          <View style={styles.source}>
            <View style={styles.sourcePlay}><Ionicons name="play" size={10} color={colors.ink} style={styles.playNudge} /></View>
            <Text style={styles.sourceText} maxFontSizeMultiplier={1.2} numberOfLines={1}>{r.creator}</Text>
          </View>
        </View>

        <View style={[styles.body, compact && styles.bodyCompact]}>
          <View style={styles.meta}>
            {([['time-outline', `${r.minutes} dk`], ['people-outline', `${r.servings} kişilik`], ['list-outline', `${r.ingredients.length} malzeme`]] as const)
              .map(([icon, label], i) => (
                <View key={label} style={styles.metaItem}>
                  {i > 0 ? <Text style={styles.metaDot} maxFontSizeMultiplier={1.3}>·</Text> : null}
                  <Ionicons name={icon} size={14} color={colors.textMuted} />
                  <Text style={styles.metaText} maxFontSizeMultiplier={1.3}>{label}</Text>
                </View>
              ))}
          </View>
          <Text style={[styles.title, compact && styles.titleCompact]} maxFontSizeMultiplier={1.3}>{r.title}</Text>
          <View style={styles.chips}>
            {shown.map(ing => (
              <View key={ing.name} style={styles.chip}>
                <LokmaIngredientIcon name={ing.name} size={18} />
                <Text style={styles.chipText} numberOfLines={1} maxFontSizeMultiplier={1.3}>{ing.label}</Text>
              </View>
            ))}
            {more > 0 ? (
              <View style={[styles.chip, styles.chipMore]}><Text style={styles.chipText} maxFontSizeMultiplier={1.3}>+{more}</Text></View>
            ) : null}
          </View>
          {!compact ? (
            <View style={styles.step}>
              <Text style={styles.stepNo} maxFontSizeMultiplier={1.3}>1</Text>
              <Text style={styles.stepText} numberOfLines={3} maxFontSizeMultiplier={1.3}>{r.firstStep}</Text>
            </View>
          ) : null}
        </View>

        <Animated.View style={[styles.ribbon, {
          opacity: ribbon, transform: [{ translateY: ribbon.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
        }]}>
          <Ionicons name="bookmark" size={15} color={colors.brand} />
          <Text style={styles.ribbonText} maxFontSizeMultiplier={1.3}>{COPY.doneRibbon}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Shadow on the outer view: iOS drops shadows on a view that clips its children.
  shadow: { width: '100%', borderRadius: radius.xl, backgroundColor: colors.surface, ...shadow.floating },
  card: { borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  hero: { backgroundColor: colors.ink, overflow: 'hidden' },
  // Same as RecipeCard's badge on a photo.
  badge: {
    position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 26, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.brand,
  },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 12, color: '#fff' },
  // Same as the recipe page's "watch the original video" pill.
  source: {
    position: 'absolute', left: 12, bottom: 12, maxWidth: '80%', flexDirection: 'row', alignItems: 'center', gap: 7,
    height: 32, paddingLeft: 4, paddingRight: 12, borderRadius: radius.pill, backgroundColor: 'rgba(31,26,23,0.78)',
  },
  sourcePlay: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  playNudge: { marginLeft: 1 },
  sourceText: { flexShrink: 1, fontFamily: fonts.bodySemi, fontSize: 12.5, color: '#fff' },
  body: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 10 },
  bodyCompact: { paddingTop: 14, paddingBottom: 14, gap: 9 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaDot: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textFaint, marginHorizontal: 6 },
  metaText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
  title: { fontFamily: fonts.headingBold, fontSize: 21, lineHeight: 26, letterSpacing: -0.4, color: colors.ink },
  titleCompact: { fontSize: 19, lineHeight: 24 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  // The recipe page's tag pills (cream), with the Lokma drawing.
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingLeft: 6, paddingRight: 12, paddingVertical: 4,
    borderRadius: radius.pill, backgroundColor: colors.cream, maxWidth: '100%',
  },
  chipMore: { paddingLeft: 12 },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text, flexShrink: 1 },
  // The recipe page's step row: a large brand numeral, then the text.
  step: {
    flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingTop: 12, marginTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong,
  },
  stepNo: { width: 22, fontFamily: fonts.headingBold, fontSize: 22, lineHeight: 26, color: colors.brand, textAlign: 'center' },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: colors.ink, paddingTop: 2 },
  ribbon: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 12,
    backgroundColor: colors.brandSoft, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong,
  },
  ribbonText: { flexShrink: 1, fontFamily: fonts.bodySemi, fontSize: 13.5, color: colors.brandDark },
});
