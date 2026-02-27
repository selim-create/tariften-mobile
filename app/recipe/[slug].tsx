import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  checkInteraction,
  getRecipe,
  getRecipeRating,
  getRecipes,
  getUserRating,
  submitRating,
  toggleInteraction,
} from '../../lib/api';
import { Recipe } from '../../lib/types';
import LoadingSpinner from '../../components/LoadingSpinner';
import RatingStars from '../../components/RatingStars';
import CommentSection from '../../components/CommentSection';
import CookingAssistant from '../../components/CookingAssistant';
import RecipeCard from '../../components/RecipeCard';
import ImagePlaceholder, { isPlaceholderImage } from '../../components/ImagePlaceholder';
import AuthorCard from '../../components/AuthorCard';

export default function RecipeDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { user, token } = useAuth();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isCooked, setIsCooked] = useState(false);
  const [ratingData, setRatingData] = useState({ average: 0, count: 0 });
  const [userRating, setUserRating] = useState<number | null>(null);
  const [cookingAssistantVisible, setCookingAssistantVisible] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [currentServings, setCurrentServings] = useState<number>(1);
  const [defaultServings, setDefaultServings] = useState<number>(1);
  const [similarRecipes, setSimilarRecipes] = useState<Recipe[]>([]);

  const loadRecipe = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await getRecipe(slug);
      setRecipe(data);
      if (data) {
        navigation.setOptions({ title: data.title });

        const parsedServings = parseInt(String(data.servings), 10) || 1;
        setDefaultServings(parsedServings);
        setCurrentServings(parsedServings);

        const ratingResult = await getRecipeRating(data.id);
        setRatingData({ average: ratingResult.average || 0, count: ratingResult.count || 0 });

        if (token) {
          const interaction = await checkInteraction(token, data.id);
          setIsFavorite(interaction?.favorite || interaction?.is_favorite || false);
          setIsCooked(interaction?.cooked || interaction?.is_cooked || false);

          const userRatingResult = await getUserRating(token, data.id);
          setUserRating(userRatingResult?.rating || null);
        }

        if (data.cuisine?.length > 0) {
          const similar = await getRecipes({ cuisine: data.cuisine, page: 1 });
          setSimilarRecipes((similar.data || []).filter((r: Recipe) => r.id !== data.id).slice(0, 4));
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
    const newStatus = !isFavorite;
    setIsFavorite(newStatus);
    try {
      await toggleInteraction(token, recipe.id, 'favorite');
    } catch (error: unknown) {
      setIsFavorite(!newStatus);
      Alert.alert('Hata', error instanceof Error ? error.message : 'İşlem başarısız');
    }
  };

  const handleCooked = async () => {
    if (!token || !recipe) return;
    const newStatus = !isCooked;
    setIsCooked(newStatus);
    try {
      await toggleInteraction(token, recipe.id, 'cooked');
    } catch (error: unknown) {
      setIsCooked(!newStatus);
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

  const handleShare = async () => {
    if (!recipe) return;
    try {
      await Share.share({
        title: recipe.title,
        message: `${recipe.title} tarifini Tariften.com'da incele!\nhttps://tariften.com/recipe/${recipe.slug}`,
        url: `https://tariften.com/recipe/${recipe.slug}`,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const toggleIngredient = (idx: number) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleStep = (idx: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const displayAmount = (amount: string | number): string => {
    const num = parseFloat(String(amount));
    if (isNaN(num) || defaultServings === 0) return String(amount);
    const scaled = (num * currentServings) / defaultServings;
    return Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(1);
  };

  if (loading) return <LoadingSpinner fullScreen />;

  if (!recipe) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Tarif bulunamadı.</Text>
      </View>
    );
  }

  const calories = recipe.nutrition?.calories || Number(recipe.calories) || 0;
  const protein = recipe.nutrition?.protein ?? Math.round((calories * 0.25) / 4);
  const carbs = recipe.nutrition?.carbs ?? Math.round((calories * 0.45) / 4);
  const fat = recipe.nutrition?.fat ?? Math.round((calories * 0.30) / 9);
  const nutritionTotal = protein + carbs + fat;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {isPlaceholderImage(recipe.image) ? (
        <ImagePlaceholder title={recipe.title} style={styles.image} />
      ) : (
        <Image source={{ uri: recipe.image }} style={styles.image} contentFit="cover" transition={300} />
      )}

      <View style={styles.content}>
        {/* Title & Actions */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>{recipe.title}</Text>
          <View style={styles.actions}>
            {user && (
              <>
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
              </>
            )}
            <TouchableOpacity onPress={handleShare} style={styles.actionButton}>
              <Ionicons name="share-outline" size={24} color="#666666" />
            </TouchableOpacity>
          </View>
        </View>

        {recipe.excerpt ? <Text style={styles.excerpt}>{recipe.excerpt}</Text> : null}

        {/* Tags (above rating) */}
        {(recipe.meal_type?.length > 0 || recipe.cuisine?.length > 0 || recipe.diet?.length > 0) && (
          <View style={styles.tagsRow}>
            {recipe.meal_type?.map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.tag, styles.tagMealType]}
                onPress={() => router.push({ pathname: '/recipes', params: { mealType: m } })}
              >
                <Text style={[styles.tagText, styles.tagMealTypeText]}>{m}</Text>
              </TouchableOpacity>
            ))}
            {recipe.cuisine?.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.tag, styles.tagCuisine]}
                onPress={() => router.push({ pathname: '/recipes', params: { cuisine: c } })}
              >
                <Text style={[styles.tagText, styles.tagCuisineText]}>{c}</Text>
              </TouchableOpacity>
            ))}
            {recipe.diet?.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.tag, styles.tagDiet]}
                onPress={() => router.push({ pathname: '/recipes', params: { diet: d } })}
              >
                <Text style={[styles.tagText, styles.tagDietText]}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

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
              <Ionicons name="time-outline" size={20} color="#db4c3f" />
              <Text style={styles.metaLabel}>Hazırlık</Text>
              <Text style={styles.metaValue}>{recipe.prep_time} dk</Text>
            </View>
          ) : null}
          {recipe.cook_time ? (
            <View style={styles.metaItem}>
              <Ionicons name="flame-outline" size={20} color="#f97316" />
              <Text style={styles.metaLabel}>Pişirme</Text>
              <Text style={styles.metaValue}>{recipe.cook_time} dk</Text>
            </View>
          ) : null}
          {recipe.calories ? (
            <View style={styles.metaItem}>
              <Ionicons name="leaf-outline" size={20} color="#22c55e" />
              <Text style={styles.metaLabel}>Kalori</Text>
              <Text style={styles.metaValue}>{recipe.calories} kcal</Text>
            </View>
          ) : null}
          {recipe.difficulty?.[0] ? (
            <View style={styles.metaItem}>
              <Ionicons name="bar-chart-outline" size={20} color="#3b82f6" />
              <Text style={styles.metaLabel}>Zorluk</Text>
              <Text style={styles.metaValue}>{recipe.difficulty[0]}</Text>
            </View>
          ) : null}
        </View>

        {/* Ingredients */}
        {recipe.ingredients?.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Malzemeler</Text>
              <View style={styles.servingsControl}>
                <TouchableOpacity
                  style={styles.servingsBtn}
                  onPress={() => setCurrentServings((s) => Math.max(1, s - 1))}
                >
                  <Ionicons name="remove" size={16} color="#e74c3c" />
                </TouchableOpacity>
                <Text style={styles.servingsText}>{currentServings} Porsiyon</Text>
                <TouchableOpacity
                  style={styles.servingsBtn}
                  onPress={() => setCurrentServings((s) => s + 1)}
                >
                  <Ionicons name="add" size={16} color="#e74c3c" />
                </TouchableOpacity>
              </View>
            </View>
            {recipe.ingredients.map((ing, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.ingredientRow}
                onPress={() => toggleIngredient(idx)}
                activeOpacity={0.7}
              >
                {checkedIngredients.has(idx) ? (
                  <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
                ) : (
                  <Text style={styles.ingredientBullet}>•</Text>
                )}
                <Text
                  style={[
                    styles.ingredientText,
                    checkedIngredients.has(idx) && styles.ingredientTextChecked,
                  ]}
                >
                  {displayAmount(ing.amount)} {ing.unit} {ing.name}
                  {ing.note ? ` (${ing.note})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Steps */}
        {recipe.steps?.length > 0 && (
          <View style={styles.section}>
            <View style={styles.stepsSectionHeader}>
              <Text style={styles.sectionTitle}>Yapılışı</Text>
              <TouchableOpacity
                style={styles.startCookingButton}
                onPress={() => setCookingAssistantVisible(true)}
              >
                <Ionicons name="play-circle" size={16} color="#ffffff" />
                <Text style={styles.startCookingText}>Pişirmeye Başla</Text>
              </TouchableOpacity>
            </View>
            {recipe.steps.map((step, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.stepRow}
                onPress={() => toggleStep(idx)}
                activeOpacity={0.7}
              >
                {completedSteps.has(idx) ? (
                  <View style={styles.stepNumberDone}>
                    <Ionicons name="checkmark" size={14} color="#ffffff" />
                  </View>
                ) : (
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{idx + 1}</Text>
                  </View>
                )}
                <Text
                  style={[
                    styles.stepText,
                    completedSteps.has(idx) && styles.stepTextDone,
                  ]}
                >
                  {step}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Chef Tip */}
        {recipe.chef_tip && (
          <View style={styles.chefTip}>
            <Ionicons name="bulb-outline" size={22} color="#d97706" />
            <View style={styles.chefTipContent}>
              <Text style={styles.chefTipTitle}>Şefin İpucu:</Text>
              <Text style={styles.chefTipText}>{recipe.chef_tip}</Text>
            </View>
          </View>
        )}

        {/* Nutrition */}
        {(recipe.nutrition || calories > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1 Porsiyon İçin Besin Değerleri</Text>
            {recipe.serving_weight ? (
              <Text style={styles.servingWeightText}>yaklaşık {recipe.serving_weight} gr</Text>
            ) : null}
            <View style={styles.nutritionCalorieRow}>
              <Text style={styles.nutritionCalorieLabel}>Kalori</Text>
              <Text style={styles.nutritionCalorieValue}>{calories} kcal</Text>
            </View>
            <View style={styles.nutritionBars}>
              {[
                { label: 'Protein', value: protein, unit: 'g', color: '#3b82f6', max: nutritionTotal || 1 },
                { label: 'Karbonhidrat', value: carbs, unit: 'g', color: '#f97316', max: nutritionTotal || 1 },
                { label: 'Yağ', value: fat, unit: 'g', color: '#ef4444', max: nutritionTotal || 1 },
              ].map((n) => (
                <View key={n.label} style={styles.nutritionBarItem}>
                  <View style={styles.nutritionBarHeader}>
                    <Text style={styles.nutritionBarLabel}>{n.label}</Text>
                    <Text style={styles.nutritionBarValue}>{n.value}{n.unit}</Text>
                  </View>
                  <View style={styles.nutritionBarBg}>
                    <View
                      style={[
                        styles.nutritionBarFill,
                        {
                          backgroundColor: n.color,
                          width: `${Math.min(100, (n.value / n.max) * 100)}%`,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.nutritionDisclaimer}>Değerler yaklaşık olarak hesaplanmıştır.</Text>
          </View>
        )}

        {/* Similar Recipes */}
        {similarRecipes.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Bunu Sevenler Şunlara da Düştü 😍</Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/recipes', params: { cuisine: recipe.cuisine?.[0] } })}
              >
                <Text style={styles.seeAllText}>Tümünü Gör</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.similarList}>
              {similarRecipes.map((r) => (
                <RecipeCard key={r.id} recipe={r} horizontal />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Author */}
        {recipe.author?.name && (
          <View style={styles.section}>
            <AuthorCard author={recipe.author} />
          </View>
        )}

        {/* Comments */}
        <View style={styles.section}>
          <CommentSection recipeId={recipe.id} />
        </View>

        <View style={styles.bottomPadding} />
      </View>
      <CookingAssistant
        visible={cookingAssistantVisible}
        onClose={() => setCookingAssistantVisible(false)}
        recipeTitle={recipe.title}
        steps={recipe.steps}
        chefTip={recipe.chef_tip}
      />
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
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  tagMealType: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  tagCuisine: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  tagDiet: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  tagDifficulty: {
    backgroundColor: '#fff0f0',
    borderColor: '#fecaca',
  },
  tagText: {
    fontSize: 12,
    color: '#666666',
  },
  tagMealTypeText: {
    color: '#1d4ed8',
  },
  tagCuisineText: {
    color: '#c2410c',
  },
  tagDietText: {
    color: '#15803d',
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
  metaLabel: {
    fontSize: 11,
    color: '#999999',
    marginBottom: 2,
    marginTop: 4,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1a1a1a',
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
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  seeAllText: {
    fontSize: 13,
    color: '#e74c3c',
    fontWeight: '600',
  },
  servingsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  servingsBtn: {
    padding: 4,
  },
  servingsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
    minWidth: 70,
    textAlign: 'center',
  },
  stepsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  startCookingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e74c3c',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  startCookingText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
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
    width: 20,
    textAlign: 'center',
  },
  ingredientText: {
    fontSize: 15,
    color: '#1a1a1a',
    flex: 1,
    lineHeight: 22,
  },
  ingredientTextChecked: {
    textDecorationLine: 'line-through',
    opacity: 0.5,
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
  stepNumberDone: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    lineHeight: 23,
  },
  stepTextDone: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
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
  servingWeightText: {
    fontSize: 13,
    color: '#999999',
    marginBottom: 12,
    marginTop: -8,
  },
  nutritionCalorieRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  nutritionCalorieLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  nutritionCalorieValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e74c3c',
  },
  nutritionBars: {
    gap: 12,
  },
  nutritionBarItem: {
    gap: 4,
  },
  nutritionBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nutritionBarLabel: {
    fontSize: 13,
    color: '#666666',
  },
  nutritionBarValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  nutritionBarBg: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  nutritionBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  nutritionDisclaimer: {
    fontSize: 11,
    color: '#999999',
    marginTop: 12,
    fontStyle: 'italic',
  },
  similarList: {
    paddingRight: 16,
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
