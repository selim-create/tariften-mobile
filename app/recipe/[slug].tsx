import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  checkInteraction,
  getRecipe,
  getRecipeRating,
  getUserRating,
  submitRating,
  toggleInteraction,
} from '../../lib/api';
import { Recipe } from '../../lib/types';
import LoadingSpinner from '../../components/LoadingSpinner';
import RatingStars from '../../components/RatingStars';
import CommentSection from '../../components/CommentSection';

export default function RecipeDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const navigation = useNavigation();
  const { user, token } = useAuth();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isCooked, setIsCooked] = useState(false);
  const [ratingData, setRatingData] = useState({ average: 0, count: 0 });
  const [userRating, setUserRating] = useState<number | null>(null);

  const loadRecipe = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await getRecipe(slug);
      setRecipe(data);
      if (data) {
        navigation.setOptions({ title: data.title });

        const ratingResult = await getRecipeRating(data.id);
        setRatingData({ average: ratingResult.average || 0, count: ratingResult.count || 0 });

        if (token) {
          const interaction = await checkInteraction(token, data.id);
          setIsFavorite(interaction?.is_favorite || false);
          setIsCooked(interaction?.is_cooked || false);

          const userRatingResult = await getUserRating(token, data.id);
          setUserRating(userRatingResult?.rating || null);
        }
      }
    } catch (error) {
      console.error('Recipe load error:', error);
    } finally {
      setLoading(false);
    }
  }, [slug, token, navigation]);

  useEffect(() => {
    loadRecipe();
  }, [loadRecipe]);

  const handleFavorite = async () => {
    if (!token || !recipe) return;
    try {
      await toggleInteraction(token, recipe.id, 'favorite');
      setIsFavorite(!isFavorite);
    } catch (error: unknown) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'İşlem başarısız');
    }
  };

  const handleCooked = async () => {
    if (!token || !recipe) return;
    try {
      await toggleInteraction(token, recipe.id, 'cooked');
      setIsCooked(!isCooked);
    } catch (error: unknown) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'İşlem başarısız');
    }
  };

  const handleRate = async (rating: number) => {
    if (!token || !recipe) return;
    try {
      const result = await submitRating(token, recipe.id, rating);
      setUserRating(rating);
      setRatingData({ average: result.new_average || 0, count: result.new_count || 0 });
    } catch (error: unknown) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'Değerlendirme gönderilemedi');
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;

  if (!recipe) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Tarif bulunamadı.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Image source={{ uri: recipe.image }} style={styles.image} contentFit="cover" transition={300} />

      <View style={styles.content}>
        {/* Title & Actions */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>{recipe.title}</Text>
          {user && (
            <View style={styles.actions}>
              <TouchableOpacity onPress={handleFavorite} style={styles.actionButton}>
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={24}
                  color={isFavorite ? '#e74c3c' : '#666666'}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCooked} style={styles.actionButton}>
                <Ionicons
                  name={isCooked ? 'checkmark-circle' : 'checkmark-circle-outline'}
                  size={24}
                  color={isCooked ? '#27ae60' : '#666666'}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {recipe.excerpt ? <Text style={styles.excerpt}>{recipe.excerpt}</Text> : null}

        {/* Rating */}
        <View style={styles.ratingSection}>
          <RatingStars rating={ratingData.average} size={18} />
          <Text style={styles.ratingText}>
            {ratingData.average.toFixed(1)} ({ratingData.count} değerlendirme)
          </Text>
        </View>

        {/* User Rating */}
        {user && (
          <View style={styles.userRating}>
            <Text style={styles.userRatingLabel}>Değerlendirin:</Text>
            <RatingStars
              rating={userRating || 0}
              size={28}
              interactive
              onRate={handleRate}
            />
          </View>
        )}

        {/* Meta Info */}
        <View style={styles.metaGrid}>
          {recipe.prep_time ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>⏱</Text>
              <Text style={styles.metaLabel}>Hazırlık</Text>
              <Text style={styles.metaValue}>{recipe.prep_time} dk</Text>
            </View>
          ) : null}
          {recipe.cook_time ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>🍳</Text>
              <Text style={styles.metaLabel}>Pişirme</Text>
              <Text style={styles.metaValue}>{recipe.cook_time} dk</Text>
            </View>
          ) : null}
          {recipe.servings ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>👥</Text>
              <Text style={styles.metaLabel}>Porsiyon</Text>
              <Text style={styles.metaValue}>{recipe.servings}</Text>
            </View>
          ) : null}
          {recipe.calories ? (
            <View style={styles.metaItem}>
              <Text style={styles.metaIcon}>🔥</Text>
              <Text style={styles.metaLabel}>Kalori</Text>
              <Text style={styles.metaValue}>{recipe.calories} kcal</Text>
            </View>
          ) : null}
        </View>

        {/* Tags */}
        {(recipe.cuisine?.length > 0 || recipe.diet?.length > 0 || recipe.difficulty?.length > 0) && (
          <View style={styles.tagsRow}>
            {recipe.difficulty?.map((d) => (
              <View key={d} style={[styles.tag, styles.tagDifficulty]}>
                <Text style={styles.tagText}>{d}</Text>
              </View>
            ))}
            {recipe.cuisine?.map((c) => (
              <View key={c} style={styles.tag}>
                <Text style={styles.tagText}>{c}</Text>
              </View>
            ))}
            {recipe.diet?.map((d) => (
              <View key={d} style={[styles.tag, styles.tagDiet]}>
                <Text style={styles.tagText}>{d}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Ingredients */}
        {recipe.ingredients?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Malzemeler</Text>
            {recipe.ingredients.map((ing, idx) => (
              <View key={idx} style={styles.ingredientRow}>
                <Text style={styles.ingredientBullet}>•</Text>
                <Text style={styles.ingredientText}>
                  {ing.amount} {ing.unit} {ing.name}
                  {ing.note ? ` (${ing.note})` : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Steps */}
        {recipe.steps?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Yapılışı</Text>
            {recipe.steps.map((step, idx) => (
              <View key={idx} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{idx + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Chef Tip */}
        {recipe.chef_tip && (
          <View style={styles.chefTip}>
            <Text style={styles.chefTipIcon}>👨‍🍳</Text>
            <View style={styles.chefTipContent}>
              <Text style={styles.chefTipTitle}>Şef İpucu</Text>
              <Text style={styles.chefTipText}>{recipe.chef_tip}</Text>
            </View>
          </View>
        )}

        {/* Nutrition */}
        {recipe.nutrition && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Besin Değerleri</Text>
            <View style={styles.nutritionGrid}>
              {[
                { label: 'Kalori', value: recipe.nutrition.calories, unit: 'kcal' },
                { label: 'Protein', value: recipe.nutrition.protein, unit: 'g' },
                { label: 'Karbonhidrat', value: recipe.nutrition.carbs, unit: 'g' },
                { label: 'Yağ', value: recipe.nutrition.fat, unit: 'g' },
              ].map((n) => (
                <View key={n.label} style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{n.value}</Text>
                  <Text style={styles.nutritionUnit}>{n.unit}</Text>
                  <Text style={styles.nutritionLabel}>{n.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Comments */}
        <View style={styles.section}>
          <CommentSection recipeId={recipe.id} />
        </View>

        <View style={styles.bottomPadding} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  image: {
    width: '100%',
    height: 280,
  },
  content: {
    padding: 16,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    flex: 1,
    marginRight: 12,
    lineHeight: 30,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  excerpt: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
    marginBottom: 16,
  },
  ratingSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  ratingText: {
    fontSize: 13,
    color: '#666666',
  },
  userRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
  },
  userRatingLabel: {
    fontSize: 14,
    color: '#666666',
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  metaItem: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  metaIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 11,
    color: '#999999',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 20,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  tagDifficulty: {
    backgroundColor: '#fff0f0',
  },
  tagDiet: {
    backgroundColor: '#f0fff0',
  },
  tagText: {
    fontSize: 12,
    color: '#666666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  ingredientBullet: {
    fontSize: 16,
    color: '#e74c3c',
    marginTop: 1,
  },
  ingredientText: {
    fontSize: 15,
    color: '#1a1a1a',
    flex: 1,
    lineHeight: 22,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepNumberText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 23,
  },
  chefTip: {
    flexDirection: 'row',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 12,
    alignItems: 'flex-start',
  },
  chefTipIcon: {
    fontSize: 24,
  },
  chefTipContent: {
    flex: 1,
  },
  chefTipTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 4,
  },
  chefTipText: {
    fontSize: 14,
    color: '#78350f',
    lineHeight: 21,
  },
  nutritionGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  nutritionItem: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  nutritionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#e74c3c',
  },
  nutritionUnit: {
    fontSize: 11,
    color: '#999999',
  },
  nutritionLabel: {
    fontSize: 11,
    color: '#666666',
    marginTop: 2,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666666',
  },
  bottomPadding: {
    height: 40,
  },
});
