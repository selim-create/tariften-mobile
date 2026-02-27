import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Recipe } from '../lib/types';

interface RecipeCardProps {
  recipe: Recipe;
  horizontal?: boolean;
  badge?: string;
}

export default function RecipeCard({ recipe, horizontal = false, badge }: RecipeCardProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={[styles.card, horizontal && styles.horizontalCard]}
      onPress={() => router.push(`/recipe/${recipe.slug}`)}
      activeOpacity={0.8}
    >
      <Image
        source={{ uri: recipe.image }}
        style={[styles.image, horizontal && styles.horizontalImage]}
        contentFit="cover"
        transition={200}
      />
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {recipe.title}
        </Text>
        {recipe.excerpt ? (
          <Text style={styles.excerpt} numberOfLines={2}>
            {recipe.excerpt}
          </Text>
        ) : null}
        <View style={styles.meta}>
          {recipe.prep_time ? (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={11} color="#666666" />
              <Text style={styles.metaText}>{recipe.prep_time} dk</Text>
            </View>
          ) : null}
          {recipe.difficulty?.length > 0 ? (
            <View style={styles.metaItem}>
              <Ionicons name="stats-chart-outline" size={11} color="#666666" />
              <Text style={styles.metaText}>{recipe.difficulty[0]}</Text>
            </View>
          ) : null}
          {recipe.calories ? (
            <View style={styles.metaItem}>
              <Ionicons name="flame-outline" size={11} color="#666666" />
              <Text style={styles.metaText}>{recipe.calories} kcal</Text>
            </View>
          ) : null}
        </View>
        {recipe.average_rating && recipe.average_rating > 0 ? (
          <View style={styles.ratingRow}>
            <Ionicons name="star" size={12} color="#e74c3c" />
            <Text style={styles.rating}>{recipe.average_rating.toFixed(1)}</Text>
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
  horizontalCard: {
    width: 200,
    marginRight: 12,
    marginBottom: 0,
  },
  image: {
    width: '100%',
    height: 180,
  },
  horizontalImage: {
    height: 140,
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
