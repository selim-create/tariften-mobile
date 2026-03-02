import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../lib/types';
import ImagePlaceholder, { isPlaceholderImage } from './ImagePlaceholder';
import { useResponsive } from '../hooks/useResponsive';
import { rf } from '../utils/responsiveFont';

interface RecipeCardProps {
  recipe: Recipe;
  horizontal?: boolean;
  badge?: string;
}

export default function RecipeCard({ recipe, horizontal = false, badge }: RecipeCardProps) {
  const router = useRouter();
  const { isTablet, cardWidth, fontScale } = useResponsive();

  const horizontalCardWidth = isTablet ? 260 : 200;
  const imageHeight = isTablet ? 220 : 180;
  const horizontalImageHeight = isTablet ? 160 : 140;
  const contentPadding = isTablet ? 16 : 12;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        !horizontal && { width: cardWidth },
        horizontal && { width: horizontalCardWidth },
        horizontal && styles.horizontalCardBase,
      ]}
      onPress={() => router.push(`/recipe/${recipe.slug}`)}
      activeOpacity={0.8}
    >
      {isPlaceholderImage(recipe.image) ? (
        <ImagePlaceholder
          title={recipe.title}
          style={[styles.image, { height: horizontal ? horizontalImageHeight : imageHeight }]}
        />
      ) : (
        <Image
          source={{ uri: recipe.image }}
          style={[styles.image, { height: horizontal ? horizontalImageHeight : imageHeight }]}
          contentFit="cover"
          transition={200}
        />
      )}
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={[styles.content, { padding: contentPadding }]}>
        <Text style={[styles.title, { fontSize: rf(15, fontScale) }]} numberOfLines={2}>
          {recipe.title}
        </Text>
        {recipe.excerpt ? (
          <Text style={[styles.excerpt, { fontSize: rf(13, fontScale) }]} numberOfLines={2}>
            {recipe.excerpt}
          </Text>
        ) : null}
        <View style={styles.meta}>
          {recipe.prep_time ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={11} color="#666666" />
              <Text style={[styles.metaText, { fontSize: rf(12, fontScale) }]}>{recipe.prep_time} dk</Text>
            </View>
          ) : null}
          {recipe.difficulty?.length > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="stats-chart-outline" size={11} color="#666666" />
              <Text style={[styles.metaText, { fontSize: rf(12, fontScale) }]}>{recipe.difficulty[0]}</Text>
            </View>
          ) : null}
          {recipe.calories ? (
            <View style={styles.metaItem}>
              <Ionicons name="flame-outline" size={11} color="#666666" />
              <Text style={[styles.metaText, { fontSize: rf(12, fontScale) }]}>{recipe.calories} kcal</Text>
            </View>
          ) : null}
        </View>
        {recipe.average_rating && recipe.average_rating > 0 ? (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color="#e74c3c" />
            <Text style={[styles.rating, { fontSize: rf(13, fontScale) }]}>{recipe.average_rating.toFixed(1)}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  horizontalCardBase: {
    marginRight: 12,
    marginBottom: 0,
  },
  image: {
    width: '100%',
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#e74c3c',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  content: {
    padding: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  excerpt: {
    fontSize: 13,
    color: '#666666',
    marginBottom: 8,
  },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    color: '#666666',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
  },
  rating: {
    fontSize: 13,
    color: '#e74c3c',
  },
});
