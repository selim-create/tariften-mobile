import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
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
import { LOKMA_RATINGS } from '../../lib/lokma-emoji';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import CommentSection from '../../components/CommentSection';
import CookingAssistant from '../../components/CookingAssistant';
import RecipeCard from '../../components/RecipeCard';
import ImagePlaceholder, { isPlaceholderImage } from '../../components/ImagePlaceholder';
import AuthorCard from '../../components/AuthorCard';

export default function RecipeDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuth();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isCooked, setIsCooked] = useState(false);
  const [ratingData, setRatingData] = useState({ average: 0, count: 0 });
  const [userRating, setUserRating] = useState<number | null>(null);
  const [cookingAssistantVisible, setCookingAssistantVisible] = useState(false);
  const [assistantAuthVisible, setAssistantAuthVisible] = useState(false);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  // Preserve unknown source servings instead of inventing a single portion.
  const [currentServings, setCurrentServings] = useState<number | null>(null);
  const [defaultServings, setDefaultServings] = useState<number | null>(null);
  const [similarRecipes, setSimilarRecipes] = useState<Recipe[]>([]);

  const requestCookingAssistant = () => {
    if (authLoading) return;
    if (!token || !user) { setAssistantAuthVisible(true); return; }
    setCookingAssistantVisible(true);
  };

  useEffect(() => {
    if (!authLoading && (!token || !user)) setCookingAssistantVisible(false);
  }, [authLoading, token, user]);

  const loadRecipe = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await getRecipe(slug);
      setRecipe(data);
      if (data) {
        navigation.setOptions({ title: data.title });

        const servingCount = Number(data.servings);
        const parsedServings = Number.isInteger(servingCount) && servingCount > 0 && servingCount <= 36 ? servingCount : null;
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
    if (currentServings === null || defaultServings === null || !/^[0-9]+(?:[.,][0-9]+)?$/.test(String(amount).trim())) return String(amount);
    const scaled = (Number(String(amount).replace(',', '.')) * currentServings) / defaultServings;
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
  const ingredientsReady = recipe.ingredients?.filter((_, index) => checkedIngredients.has(index)).length || 0;
  const stepsReady = recipe.steps?.filter((_, index) => completedSteps.has(index)).length || 0;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {isPlaceholderImage(recipe.image) ? (
        <ImagePlaceholder title={recipe.title} variant="detail" style={styles.image} />
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

        {user && (
          <View style={styles.lokmaRatingRow}>
            {LOKMA_RATINGS.map(({ rating, emoji, label }) => (
              <TouchableOpacity key={rating} accessibilityRole="button"
                accessibilityLabel={`${rating} yıldız, ${label}`}
                onPress={() => handleRate(rating)}
                style={[styles.lokmaRatingOption, userRating === rating && styles.lokmaRatingOptionSelected]}>
                <Text style={styles.lokmaRatingEmoji}>{emoji}</Text>
                <Text style={styles.lokmaRatingLabel} numberOfLines={1}>{label}</Text>
              </TouchableOpacity>
            ))}
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
              <View style={styles.sectionHeadingBlock}>
                <Text style={styles.sectionEyebrow}>HAZIRLIK LİSTEN</Text>
                <Text style={styles.sectionTitle}>Malzemeler</Text>
                <Text style={styles.sectionCaption}>{ingredientsReady} / {recipe.ingredients.length} malzeme hazır</Text>
              </View>
              <View style={styles.servingsControl}>
                <TouchableOpacity
                  style={styles.servingsBtn}
                  disabled={currentServings === null || currentServings <= 1}
                  accessibilityLabel="Porsiyonu azalt"
                  onPress={() => setCurrentServings((s) => s === null ? null : Math.max(1, s - 1))}
                >
                  <Ionicons name="remove" size={16} color="#e74c3c" />
                </TouchableOpacity>
                <Text style={styles.servingsText}>{currentServings === null ? 'Kişi sayısı belirtilmemiş' : `${currentServings} Porsiyon`}</Text>
                <TouchableOpacity
                  style={styles.servingsBtn}
                  disabled={currentServings === null || currentServings >= 36}
                  accessibilityLabel="Porsiyonu artır"
                  onPress={() => setCurrentServings((s) => s === null ? null : Math.min(36, s + 1))}
                >
                  <Ionicons name="add" size={16} color="#e74c3c" />
                </TouchableOpacity>
              </View>
            </View>
            {recipe.ingredients.map((ing, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.ingredientRow, checkedIngredients.has(idx) && styles.ingredientRowChecked]}
                onPress={() => toggleIngredient(idx)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: checkedIngredients.has(idx) }}
                accessibilityLabel={`${ing.name}, ${displayAmount(ing.amount)} ${ing.unit || ''}`}
                activeOpacity={0.75}
              >
                <View style={[styles.ingredientCheck, checkedIngredients.has(idx) && styles.ingredientCheckActive]}>
                  {checkedIngredients.has(idx) ? <Ionicons name="checkmark" size={13} color="#ffffff" /> : null}
                </View>
                <LokmaIngredientIcon name={ing.name} size={27} />
                <View style={styles.ingredientCopy}>
                  <Text style={[styles.ingredientText, checkedIngredients.has(idx) && styles.ingredientTextChecked]}>
                    {[displayAmount(ing.amount), ing.unit, ing.name].filter(v => String(v || '').trim()).join(' ')}
                  </Text>
                  {ing.note ? <Text style={styles.ingredientNote}>{ing.note}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Steps */}
        {recipe.steps?.length > 0 && (
          <View style={styles.section}>
            <View style={styles.stepsSectionHeader}>
              <View style={styles.sectionHeadingBlock}>
                <Text style={styles.sectionEyebrow}>ADIM ADIM</Text>
                <Text style={styles.sectionTitle}>Yapılışı</Text>
                <Text style={styles.sectionCaption}>{stepsReady} / {recipe.steps.length} adım tamamlandı</Text>
              </View>
              <TouchableOpacity
                style={styles.startCookingButton}
                onPress={requestCookingAssistant}
              >
                <Ionicons name="play-circle" size={16} color="#ffffff" />
                <Text style={styles.startCookingText}>Pişirmeye Başla</Text>
              </TouchableOpacity>
            </View>
            {recipe.steps.map((step, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.stepRow, completedSteps.has(idx) && styles.stepRowDone]}
                onPress={() => toggleStep(idx)}
                activeOpacity={0.75}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: completedSteps.has(idx) }}
                accessibilityLabel={`Adım ${idx + 1}: ${step}`}
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
            <Text style={styles.sectionTitle}>{defaultServings === null ? 'Besin Değerleri (tahmini)' : '1 Porsiyon İçin Besin Değerleri'}</Text>
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

      <Modal visible={assistantAuthVisible} transparent animationType="fade"
        onRequestClose={() => setAssistantAuthVisible(false)}>
        <View style={assistantGateStyles.scrim}>
          <View style={assistantGateStyles.card}>
            <View style={assistantGateStyles.icon}><Ionicons name="restaurant-outline" size={27} color="#db4c3f" /></View>
            <Text style={assistantGateStyles.title}>Tariften Pişirme Rehberi</Text>
            <Text style={assistantGateStyles.description}>Adım adım sesli pişirme rehberini ve mutfak sayaçlarını kullanmak için hesabına giriş yap veya Standart Üye ol.</Text>
            <TouchableOpacity style={assistantGateStyles.primary} onPress={() => { setAssistantAuthVisible(false); router.push('/login'); }}>
              <Text style={assistantGateStyles.primaryLabel}>Giriş Yap</Text>
            </TouchableOpacity>
            <TouchableOpacity style={assistantGateStyles.secondary} onPress={() => { setAssistantAuthVisible(false); router.push('/register'); }}>
              <Text style={assistantGateStyles.secondaryLabel}>Standart Üye Ol</Text>
            </TouchableOpacity>
            <TouchableOpacity style={assistantGateStyles.dismiss} onPress={() => setAssistantAuthVisible(false)}>
              <Text style={assistantGateStyles.dismissLabel}>Şimdi değil</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {!!user && !!token && (
        <CookingAssistant
          visible={cookingAssistantVisible}
          onClose={() => setCookingAssistantVisible(false)}
          recipeTitle={recipe.title}
          recipeId={recipe.id}
          steps={recipe.steps}
          chefTip={recipe.chef_tip}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fffbf7',
  },
  image: {
    width: '100%',
    height: 280,
  },
  content: {
    paddingHorizontal: 17,
    paddingTop: 22,
    paddingBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#18243a',
    flex: 1,
    marginRight: 12,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  excerpt: {
    fontSize: 14,
    color: '#81756e',
    lineHeight: 23,
    marginBottom: 19,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#e5afa0',
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
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 9,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#efe4dd',
  },
  metaLabel: {
    fontSize: 11,
    color: '#8b807b',
    marginBottom: 4,
    marginTop: 5,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#202b3d',
  },
  section: {
    marginBottom: 18,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#efe3da',
    padding: 15,
  },
  sectionHeadingBlock: { flex: 1, minWidth: 0, gap: 3, paddingRight: 5 },
  sectionEyebrow: { color: '#d35c4b', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  sectionCaption: { color: '#96877b', fontSize: 11, fontWeight: '600' },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1d2940',
    marginBottom: 4,
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
    gap: 4,
    backgroundColor: '#fff8f2',
    borderRadius: 13,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#f1e0d3',
    maxWidth: '55%',
  },
  servingsBtn: {
    minWidth: 30,
    minHeight: 32,
    borderRadius: 9,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  servingsText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5c4c43',
    textAlign: 'center',
    flexShrink: 1,
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
  lokmaRatingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  lokmaRatingOption: { paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, backgroundColor: '#fff5ec', borderWidth: 1, borderColor: '#f2e6da', alignItems: 'center', gap: 3, flexGrow: 1 },
  lokmaRatingOptionSelected: { borderColor: '#db4c3f', backgroundColor: '#ffe9e0' },
  lokmaRatingEmoji: { fontSize: 23 },
  lokmaRatingLabel: { fontSize: 9, fontWeight: '700', color: '#66574c' },
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

const assistantGateStyles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, backgroundColor: 'rgba(5,10,17,0.86)' },
  card: { borderRadius: 28, padding: 28, alignItems: 'center', backgroundColor: '#182231', borderWidth: 1, borderColor: 'rgba(219,76,63,0.28)' },
  icon: { width: 66, height: 66, borderRadius: 22, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(219,76,63,0.13)', marginBottom: 19 },
  title: { fontSize: 22, fontWeight: '900', textAlign: 'center', color: '#fffaf4', marginBottom: 12 },
  description: { fontSize: 14, lineHeight: 23, textAlign: 'center', color: '#c9d0dc', marginBottom: 24 },
  primary: { width: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#db4c3f', marginBottom: 10 },
  primaryLabel: { fontWeight: '800', fontSize: 16, color: '#ffffff' },
  secondary: { width: '100%', minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' },
  secondaryLabel: { fontWeight: '800', fontSize: 15, color: '#ffffff' },
  dismiss: { paddingVertical: 16, paddingHorizontal: 16 },
  dismissLabel: { color: '#9ca8b8', fontSize: 13 },
});
