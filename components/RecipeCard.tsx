import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../lib/types';
import ImagePlaceholder, { isPlaceholderImage } from './ImagePlaceholder';
import SocialBadge from './recipe/SocialBadge';
import { useResponsive } from '../hooks/useResponsive';
import { colors, fonts, radius } from '../constants/theme';

interface RecipeCardProps {
  recipe: Recipe;
  /** Rail card (fixed width) for horizontal lists. */
  horizontal?: boolean;
  badge?: string;
  fullWidth?: boolean;
  /** tile: grid cell (2 columns on phones); row: compact list row. */
  variant?: 'card' | 'tile' | 'row';
}

export function recipeMinutes(recipe: Pick<Recipe, 'prep_time' | 'cook_time'>) {
  const total = (Number(recipe.prep_time) || 0) + (Number(recipe.cook_time) || 0);
  return total > 0 ? total : 0;
}

function metaLine(recipe: Recipe) {
  const minutes = recipeMinutes(recipe);
  return [minutes > 0 ? `${minutes} dk` : null, recipe.difficulty?.[0] || null].filter(Boolean).join(' · ');
}

/**
 * Editorial recipe card: the photograph carries the card, the title sits
 * under it in Poppins, one quiet line of facts. Recipes imported from a video
 * carry the platform mark on the photo.
 */
export default function RecipeCard({ recipe, horizontal = false, badge, fullWidth = false, variant = 'card' }: RecipeCardProps) {
  const router = useRouter();
  const { isTablet, cardWidth } = useResponsive();
  const photo = !isPlaceholderImage(recipe.image);
  const kicker = recipe.cuisine?.[0] || recipe.meal_type?.[0] || null;
  const meta = metaLine(recipe);
  const rating = typeof recipe.average_rating === 'number' && recipe.average_rating > 0 ? recipe.average_rating : 0;
  const platform = recipe.social_source?.platform;
  const open = () => router.push(`/recipe/${recipe.slug}`);

  if (variant === 'row') {
    return (
      <Pressable onPress={open} style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        accessibilityRole="link" accessibilityLabel={recipe.title}>
        <View style={styles.rowThumb}>
          {photo
            ? <Image source={{ uri: recipe.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            : <ImagePlaceholder title={recipe.title} style={StyleSheet.absoluteFill} compact />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          {kicker ? <Text style={styles.kicker} numberOfLines={1}>{kicker}</Text> : null}
          <Text style={styles.rowTitle} numberOfLines={2}>{recipe.title}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </Pressable>
    );
  }

  const tile = variant === 'tile';
  const width = horizontal ? (isTablet ? 260 : 210) : tile ? undefined : fullWidth ? '100%' : cardWidth;
  const mediaStyle = tile ? styles.mediaTile : horizontal ? styles.mediaRail : styles.mediaCard;

  return (
    <Pressable onPress={open}
      style={({ pressed }) => [styles.card, tile && { flex: 1 }, width !== undefined && { width }, horizontal && styles.rail, pressed && styles.pressed]}
      accessibilityRole="link" accessibilityLabel={recipe.title}>
      <View style={[styles.media, mediaStyle]}>
        {photo
          ? <Image source={{ uri: recipe.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          : <ImagePlaceholder title={recipe.title} style={StyleSheet.absoluteFill} compact={tile || horizontal} />}
        <View style={styles.badges} pointerEvents="none">
          {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
          {platform ? <SocialBadge platform={platform} label={tile || horizontal ? '' : undefined} /> : null}
        </View>
        {rating > 0 ? (
          <View style={styles.rating} pointerEvents="none">
            <Ionicons name="star" size={11} color={colors.brand} />
            <Text style={styles.ratingText}>{rating.toFixed(1).replace('.', ',')}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        {kicker ? <Text style={styles.kicker} numberOfLines={1}>{kicker}</Text> : null}
        <Text style={[styles.title, tile && styles.titleTile]} numberOfLines={2}>{recipe.title}</Text>
        {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 6 },
  rail: { marginRight: 12, marginBottom: 0 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  media: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: colors.cream },
  mediaCard: { aspectRatio: 16 / 11 },
  mediaRail: { height: 150 },
  mediaTile: { aspectRatio: 0.84 },
  badges: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 6 },
  badge: { height: 26, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: colors.brand, justifyContent: 'center' },
  badgeText: { fontFamily: fonts.bodySemi, fontSize: 11, color: '#fff' },
  rating: {
    position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 4,
    height: 24, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.94)',
  },
  ratingText: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.ink },
  body: { paddingTop: 10, paddingHorizontal: 2, gap: 3 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: colors.ink },
  titleTile: { fontSize: 15, lineHeight: 20 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, paddingRight: 14,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  rowThumb: { width: 76, height: 76, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.cream },
  rowTitle: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 21, color: colors.ink },
});
