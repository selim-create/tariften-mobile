import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import LokmaIngredientIcon from '../LokmaIngredientIcon';
import { guideArt, levelRank, primaryTopic, readingLabel, type GuideSummary, type GuideTerm } from '../../lib/guides';
import { colors, fonts, radius } from '../../constants/theme';

/** Photo, or the topic's Lokma drawing on cream (no invented imagery). */
export function GuideCover({ guide, style, artSize = 46 }: {
  guide: Pick<GuideSummary, 'image' | 'topics' | 'title'>; style?: StyleProp<ViewStyle>; artSize?: number;
}) {
  return (
    <View style={[styles.cover, style]}>
      {guide.image
        ? <Image source={{ uri: guide.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} accessibilityIgnoresInvertColors />
        : <View style={styles.art}><LokmaIngredientIcon name={guideArt(guide.topics)} size={artSize} /></View>}
    </View>
  );
}

/** Three quiet bars: Başlangıç · Orta · İleri. */
export function LevelMeter({ level }: { level: GuideTerm | null }) {
  const rank = levelRank(level);
  if (!level) return null;
  return (
    <View style={styles.level} accessible accessibilityLabel={`Seviye: ${level.name}`}>
      {rank ? (
        <View style={styles.bars}>
          {[1, 2, 3].map(step => (
            <View key={step} style={[styles.bar, { height: 3 + step * 3 }, step <= rank ? styles.barOn : styles.barOff]} />
          ))}
        </View>
      ) : null}
      <Text style={styles.levelText}>{level.name}</Text>
    </View>
  );
}

/**
 * Guide card. "list": full-width with excerpt (Mutfak Rehberi screen).
 * "rail": compact for the Keşfet carousel.
 */
export default function GuideCard({ guide, onPress, variant = 'list' }: {
  guide: GuideSummary; onPress: () => void; variant?: 'list' | 'rail';
}) {
  const topic = primaryTopic(guide.topics);
  const minutes = readingLabel(guide.readingMinutes);
  const rail = variant === 'rail';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [rail ? styles.rail : styles.card, pressed && { opacity: 0.9 }]}
      accessibilityRole="link"
      accessibilityLabel={[guide.title, topic?.name, guide.level?.name, minutes].filter(Boolean).join(', ')}>
      <GuideCover guide={guide} style={rail ? styles.railCover : styles.listCover} artSize={rail ? 40 : 52} />
      <View style={rail ? styles.railBody : styles.body}>
        {topic ? <Text style={styles.kicker} numberOfLines={1}>{topic.name}</Text> : null}
        <Text style={rail ? styles.railTitle : styles.title} numberOfLines={rail ? 2 : 3}>{guide.title}</Text>
        {!rail && guide.excerpt ? <Text style={styles.excerpt} numberOfLines={2}>{guide.excerpt}</Text> : null}
        {(guide.level || minutes) ? (
          <View style={styles.meta}>
            <LevelMeter level={guide.level} />
            {guide.level && minutes ? <Text style={styles.dot}>·</Text> : null}
            {minutes ? <Text style={styles.metaText}>{minutes}</Text> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: 'hidden', backgroundColor: colors.cream },
  art: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  card: { paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  listCover: { aspectRatio: 16 / 9, borderRadius: radius.xl },
  body: { paddingTop: 14, gap: 6 },
  rail: { width: 236 },
  railCover: { height: 148, borderRadius: radius.lg },
  railBody: { paddingTop: 10, gap: 4 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.4, color: colors.ink },
  railTitle: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 21, color: colors.ink },
  excerpt: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  metaText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  dot: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  level: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 },
  bar: { width: 3, borderRadius: 1.5 },
  barOn: { backgroundColor: colors.brand },
  barOff: { backgroundColor: colors.lineStrong },
  levelText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.text },
});
