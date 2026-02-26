import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Recipe } from '../lib/types';

interface RecipeCardProps {
  recipe: Recipe;
  horizontal?: boolean;
}

export default function RecipeCard({ recipe, horizontal = false }: RecipeCardProps) {
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
            <Text style={styles.metaText}>⏱ {recipe.prep_time} dk</Text>
          ) : null}
          {recipe.difficulty?.length > 0 ? (
            <Text style={styles.metaText}>📊 {recipe.difficulty[0]}</Text>
          ) : null}
          {recipe.calories ? (
            <Text style={styles.metaText}>🔥 {recipe.calories} kcal</Text>
          ) : null}
        </View>
        {recipe.average_rating && recipe.average_rating > 0 ? (
          <Text style={styles.rating}>⭐ {recipe.average_rating.toFixed(1)}</Text>
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
  metaText: {
    fontSize: 12,
    color: '#666666',
  },
  rating: {
    fontSize: 13,
    color: '#e74c3c',
    marginTop: 4,
  },
});
