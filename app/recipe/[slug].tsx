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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import {
  checkInteraction,
  getRecipe,
  getRecipeRating,
  getRecipes,
  getUserRating,
  setRecipeVisibility,
  submitRating,
  toggleInteraction,
} from '../../lib/api';
import {
  PRIVATE_OWNER_NOTICE, canToggleVisibility, isPrivateRecipe, isRecipeOwner, nextVisibility, showAiEstimatedBadge,
} from '../../lib/recipe-visibility';
import AiEstimatedBadge from '../../components/recipe/AiEstimatedBadge';
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
import SocialSourceCard, { PLATFORM_ICON, watchSocialVideo } from '../../components/recipe/SocialSourceCard';
import { creatorLabel, PLATFORM_COPY } from '../../lib/social-format';
import WeekPickerSheet from '../../components/recipe/WeekPickerSheet';
import RecipeNoteCard from '../../components/recipe/RecipeNoteCard';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { formatAmountTr } from '../../lib/amount-format';
import { addRecipeToShopping, addToPlan, isInShopping, removeRecipeFromShopping, useKitchen } from '../../lib/kitchen-store';
import { useKitchenProfile } from '../../lib/kitchen-profile';
import { ALLERGEN_BAND_LINK, allergenBand } from '../../lib/allergen-ui';

const RATING_ICONS = ['sad-outline', 'remove-circle-outline', 'happy-outline', 'heart-outline', 'sparkles-outline'] as const;
// Short visual captions keep five choices aligned on narrow screens.
// LOKMA_RATINGS labels remain the full accessible descriptions and API values.
const RATING_DISPLAY_LABELS = ['Sevmedim', 'Pek değil', 'Fena değil', 'Lezzetli', 'Bayıldım'] as const;

export default function RecipeDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/recipes');
  };
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
  const [tab, setTab] = useState<'ingredients' | 'steps'>('ingredients');
  const [weekPickerVisible, setWeekPickerVisible] = useState(false);
  const [toast, setToast] = useState('');
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const kitchen = useKitchen(user?.id);
  // Members only; one cached read per session, refreshed when the kitchen profile is saved.
  const kitchenProfile = useKitchenProfile(user ? token : null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const requestCookingAssistant = () => {
    if (authLoading) return;
    if (!token || !user) { setAssistantAuthVisible(true); return; }
    setCookingAssistantVisible(true);
  };

  useEffect(() => {
    if (!authLoading && (!token || !user)) setCookingAssistantVisible(false);
  }, [authLoading, token, user]);

  const loadRecipe = useCallback(async () => {
    // Wait for the stored session: a private recipe is only returned to its owner's token.
    if (!slug || authLoading) return;
    try {
      const data = await getRecipe(slug, token);
      setRecipe(data);
      if (data) {
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
  }, [slug, token, authLoading]);

  useEffect(() => {
    loadRecipe();
  }, [loadRecipe]);

  const changeVisibility = () => {
    if (!token || !recipe || visibilityBusy) return;
    const target = nextVisibility(recipe.visibility);
    const run = async () => {
      setVisibilityBusy(true);
      try {
        const result = await setRecipeVisibility(token, recipe.id, target);
        setRecipe(prev => (prev ? { ...prev, visibility: result.visibility } : prev));
        setToast(result.visibility === 'public' ? 'Tarifin artık herkese açık' : 'Tarifin artık sadece sana görünüyor');
      } catch (error: unknown) {
        Alert.alert('Görünürlük değiştirilemedi', error instanceof Error ? error.message : 'Tekrar dene.');
      } finally {
        setVisibilityBusy(false);
      }
    };
    if (target === 'private') { void run(); return; }
    Alert.alert('Tarifin herkese açık olsun mu?', showAiEstimatedBadge(recipe)
      ? 'Herkes görebilir; "AI Tahmini Tarif" etiketi tarifte kalır. İstediğin zaman yeniden gizleyebilirsin.'
      : 'Herkes görebilir. İstediğin zaman yeniden gizleyebilirsin.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Herkese aç', onPress: () => { void run(); } },
    ]);
  };

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
    if (currentServings === null || defaultServings === null || !/^[0-9]+(?:[.,][0-9]+)?$/.test(String(amount).trim())) return formatAmountTr(amount);
    const scaled = (Number(String(amount).replace(',', '.')) * currentServings) / defaultServings;
    return formatAmountTr(Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(2));
  };

  if (loading) return <LoadingSpinner fullScreen />;

  if (!recipe) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Tarif bulunamadı.</Text>
        <TouchableOpacity onPress={handleBack} style={styles.errorBack}><Text style={styles.errorBackText}>Geri dön</Text></TouchableOpacity>
      </View>
    );
  }

  // Never fabricate macronutrients from calories: only checked values are shown.
  const verifiedMacros = recipe.nutrition_status === 'verified'
    && recipe.nutrition != null
    && [recipe.nutrition.protein, recipe.nutrition.carbs, recipe.nutrition.fat]
      .every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
  const calories = Number(recipe.nutrition?.calories || recipe.calories) || 0;
  const ingredientsReady = recipe.ingredients?.filter((_, index) => checkedIngredients.has(index)).length || 0;
  const stepsReady = recipe.steps?.filter((_, index) => completedSteps.has(index)).length || 0;
  const minutes = (Number(recipe.prep_time) || 0) + (Number(recipe.cook_time) || 0);
  const facts = [
    minutes > 0 ? `${minutes} dk` : null,
    defaultServings ? `${defaultServings} kişilik` : null,
    recipe.difficulty?.[0] || null,
    calories > 0 ? `${calories} kcal` : null,
  ].filter(Boolean) as string[];
  const tags = [...(recipe.cuisine || []).map(v => ({ v, key: 'cuisine' })), ...(recipe.meal_type || []).map(v => ({ v, key: 'mealType' })), ...(recipe.diet || []).map(v => ({ v, key: 'diet' }))];
  const inList = isInShopping(recipe.id, kitchen);
  const allergenNotice = user && kitchenProfile
    ? allergenBand(recipe.allergens, kitchenProfile.profile, kitchenProfile.options.allergens)
    : null;

  const toggleShopping = () => {
    if (inList) { removeRecipeFromShopping(recipe.id); setToast('Alışveriş listesinden çıkarıldı'); return; }
    addRecipeToShopping({ id: recipe.id, slug: recipe.slug, title: recipe.title, servings: defaultServings, ingredients: recipe.ingredients });
    setToast('Malzemeler alışveriş listene eklendi');
  };
  const pickDay = (day: string) => {
    addToPlan({ id: recipe.id, slug: recipe.slug, title: recipe.title, image: isPlaceholderImage(recipe.image) ? undefined : recipe.image }, day);
    setWeekPickerVisible(false);
    setToast('Haftana eklendi');
  };

  const quickActions: { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; active?: boolean; onPress: () => void }[] = [
    { key: 'cook', label: 'Pişir', icon: 'play', onPress: requestCookingAssistant },
    { key: 'week', label: 'Haftaya ekle', icon: 'calendar-clear-outline', onPress: () => setWeekPickerVisible(true) },
    { key: 'shop', label: inList ? 'Listede' : 'Alışverişe ekle', icon: inList ? 'basket' : 'basket-outline', active: inList, onPress: toggleShopping },
    ...(user ? [{ key: 'cooked', label: 'Pişirdim', icon: (isCooked ? 'checkmark-circle' : 'checkmark-circle-outline') as React.ComponentProps<typeof Ionicons>['name'], active: isCooked, onPress: handleCooked }] : []),
  ];

  return (
    <>
      <StatusBar style="light" />
      <ScrollView style={styles.container}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        <View style={styles.hero}>
          {isPlaceholderImage(recipe.image) ? (
            <ImagePlaceholder title={recipe.title} variant="detail" style={styles.image} />
          ) : (
            <Image source={{ uri: recipe.image }} style={styles.image} contentFit="cover" transition={300} />
          )}
          <LinearGradient colors={['rgba(18,23,33,0.50)', 'rgba(18,23,33,0.08)', 'transparent']}
            locations={[0, 0.55, 1]}
            style={styles.heroGradient} pointerEvents="none" />
          <TouchableOpacity style={[styles.heroBack, { top: Math.max(insets.top + 8, 20) }]}
            onPress={handleBack} accessibilityRole="button" accessibilityLabel="Tariflere geri dön"
            activeOpacity={0.8}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <View style={[styles.heroRight, { top: Math.max(insets.top + 8, 20) }]}>
            {user ? (
              <TouchableOpacity onPress={handleFavorite} style={styles.heroCircle} accessibilityRole="button"
                accessibilityLabel={isFavorite ? 'Kaydedilenlerden çıkar' : 'Tarifi kaydet'} accessibilityState={{ selected: isFavorite }}>
                <Ionicons name={isFavorite ? 'heart' : 'heart-outline'} size={21} color={isFavorite ? colors.brand : colors.ink} />
              </TouchableOpacity>
            ) : null}
            {/* A private recipe's link opens for nobody else, so it is not offered for sharing. */}
            {!isPrivateRecipe(recipe) ? (
              <TouchableOpacity onPress={handleShare} style={styles.heroCircle} accessibilityRole="button" accessibilityLabel="Tarifi paylaş">
                <Ionicons name="share-outline" size={20} color={colors.ink} />
              </TouchableOpacity>
            ) : null}
          </View>
          {/* Only over a real photograph; the pending-photo cover carries its own caption there. */}
          {recipe.social_source && PLATFORM_COPY[recipe.social_source.platform] && !isPlaceholderImage(recipe.image) ? (
            <TouchableOpacity style={styles.heroSource} activeOpacity={0.85}
              onPress={() => { if (recipe.social_source) void watchSocialVideo(recipe.social_source); }}
              accessibilityRole="button"
              accessibilityLabel={`Orijinal videoyu ${PLATFORM_COPY[recipe.social_source.platform].at} izle`}>
              <View style={styles.heroSourcePlay}><Ionicons name="play" size={11} color={colors.ink} style={{ marginLeft: 1 }} /></View>
              <Ionicons name={PLATFORM_ICON[recipe.social_source.platform]} size={14} color="#fff" />
              <Text style={styles.heroSourceText} numberOfLines={1}>
                {creatorLabel(recipe.social_source).primary || `${PLATFORM_COPY[recipe.social_source.platform].from} aktarıldı`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

      <View style={styles.content}>
        {facts.length > 0 ? <Text style={styles.kicker}>{facts.join('  ·  ')}</Text> : null}
        {showAiEstimatedBadge(recipe) ? <View style={styles.aiBadgeRow}><AiEstimatedBadge /></View> : null}
        <Text style={styles.title}>{recipe.title}</Text>
        {recipe.excerpt ? <Text style={styles.excerpt}>{recipe.excerpt}</Text> : null}

        {tags.length > 0 && (
          <View style={styles.tagsRow}>
            {tags.map(({ v, key }) => (
              <TouchableOpacity key={`${key}-${v}`} style={styles.tag}
                onPress={() => router.push({ pathname: '/recipes', params: { [key]: v } })}>
                <Text style={styles.tagText}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {ratingData.count > 0 && (
          <View style={styles.ratingSection}>
            <RatingStars rating={ratingData.average} size={15} />
            <Text style={styles.ratingText}>
              {ratingData.average.toFixed(1)} · {ratingData.count} değerlendirme
            </Text>
          </View>
        )}

        {recipe.social_source ? (
          <View style={styles.block}><SocialSourceCard source={recipe.social_source} /></View>
        ) : null}

        {user && isRecipeOwner(recipe, user.id) && (isPrivateRecipe(recipe) || canToggleVisibility(recipe, user.id)) ? (
          <View style={styles.visibilityCard}>
            <View style={styles.visibilityIcon}>
              <Ionicons name={isPrivateRecipe(recipe) ? 'lock-closed' : 'globe-outline'} size={17} color={colors.ink} />
            </View>
            <View style={styles.visibilityCopy}>
              <Text style={styles.visibilityTitle}>{isPrivateRecipe(recipe) ? PRIVATE_OWNER_NOTICE : 'Herkese açık'}</Text>
              <Text style={styles.visibilityText}>{isPrivateRecipe(recipe)
                ? 'Bu tarif özel; aramalarda ve listelerde görünmez.'
                : 'Herkes görebilir. İstediğin zaman yeniden gizleyebilirsin.'}</Text>
            </View>
            {canToggleVisibility(recipe, user.id) ? (
              <TouchableOpacity onPress={changeVisibility} disabled={visibilityBusy} style={styles.visibilityButton}
                accessibilityRole="button" accessibilityLabel={isPrivateRecipe(recipe) ? 'Tarifi herkese aç' : 'Tarifi gizle'}>
                <Text style={styles.visibilityButtonText}>{visibilityBusy ? '…' : isPrivateRecipe(recipe) ? 'Herkese aç' : 'Gizle'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {user && Number(recipe.author?.id) === Number(user.id) ? (
          <TouchableOpacity style={styles.authorEditButton} accessibilityRole="button"
            accessibilityLabel="Kendi tarifimi düzenle"
            onPress={() => router.push(`/recipe/edit/${recipe.id}`)}>
            <Ionicons name="create-outline" size={17} color={colors.brand} />
            <Text style={styles.authorEditText}>Bu tarif sana ait · Düzenle</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.brand} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.quickRow}>
          {quickActions.map(action => (
            <TouchableOpacity key={action.key} onPress={action.onPress} style={styles.quick} accessibilityRole="button"
              accessibilityLabel={action.label} accessibilityState={action.active ? { selected: true } : undefined}>
              <View style={[styles.quickIcon, action.key === 'cook' && styles.quickIconPrimary, action.active && styles.quickIconActive]}>
                <Ionicons name={action.icon} size={21} color={action.key === 'cook' || action.active ? '#ffffff' : colors.ink} />
              </View>
              <Text style={styles.quickLabel} numberOfLines={2}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {allergenNotice ? (
          <View style={styles.allergenBand}>
            <View accessible accessibilityLabel={allergenNotice.accessibilityLabel} style={styles.allergenBody}>
              <Ionicons name={allergenNotice.tone === 'contains' ? 'alert-circle-outline' : 'information-circle-outline'}
                size={20} color={colors.warning} style={styles.allergenIcon} />
              <View style={styles.allergenCopy}>
                {allergenNotice.lines.map(line => <Text key={line} style={styles.allergenText}>{line}</Text>)}
                <Text style={styles.allergenNote}>{allergenNotice.note}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => router.push('/profile/kitchen')} style={styles.allergenLink}
              accessibilityRole="link" accessibilityLabel={ALLERGEN_BAND_LINK} hitSlop={{ top: 4, bottom: 4 }}>
              <Text style={styles.allergenLinkText}>{ALLERGEN_BAND_LINK}</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.warning} />
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.segment} accessibilityRole="tablist">
          {(['ingredients', 'steps'] as const).map(key => (
            <TouchableOpacity key={key} onPress={() => setTab(key)} style={[styles.segmentItem, tab === key && styles.segmentActive]}
              accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
              <Text style={[styles.segmentText, tab === key && styles.segmentTextActive]}>
                {key === 'ingredients' ? `Malzemeler${recipe.ingredients?.length ? ` · ${recipe.ingredients.length}` : ''}` : `Tarif${recipe.steps?.length ? ` · ${recipe.steps.length} adım` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Ingredients */}
        {tab === 'ingredients' && recipe.ingredients?.length > 0 && (
          <View style={styles.section}>
            <View style={styles.servingsRow}>
              <View>
                <Text style={styles.servingsLabel}>Kişi sayısı</Text>
                <Text style={styles.sectionCaption}>{ingredientsReady} / {recipe.ingredients.length} malzeme hazır</Text>
              </View>
              <View style={styles.servingsControl}>
                <TouchableOpacity
                  style={styles.servingsBtn}
                  disabled={currentServings === null || currentServings <= 1}
                  accessibilityLabel="Porsiyonu azalt"
                  onPress={() => setCurrentServings((s) => s === null ? null : Math.max(1, s - 1))}
                >
                  <Ionicons name="remove" size={17} color={colors.ink} />
                </TouchableOpacity>
                <Text style={styles.servingsText}>{currentServings === null ? 'Kişi sayısı belirtilmemiş' : `${currentServings} kişilik`}</Text>
                <TouchableOpacity
                  style={styles.servingsBtn}
                  disabled={currentServings === null || currentServings >= 36}
                  accessibilityLabel="Porsiyonu artır"
                  onPress={() => setCurrentServings((s) => s === null ? null : Math.min(36, s + 1))}
                >
                  <Ionicons name="add" size={17} color={colors.ink} />
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
                    {[displayAmount(ing.amount), ing.unit].filter(v => String(v || '').trim()).length
                      ? <Text style={styles.ingredientAmount}>{[displayAmount(ing.amount), ing.unit].filter(v => String(v || '').trim()).join(' ')} </Text>
                      : null}
                    {ing.name}
                  </Text>
                  {ing.note ? <Text style={styles.ingredientNote}>{ing.note}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={toggleShopping} style={styles.inlineShop} accessibilityRole="button">
              <Ionicons name={inList ? 'checkmark' : 'basket-outline'} size={18} color={colors.brand} />
              <Text style={styles.inlineShopText}>{inList ? 'Alışveriş listende' : 'Tüm malzemeleri alışveriş listesine ekle'}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Steps */}
        {tab === 'steps' && recipe.steps?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionCaption}>{stepsReady} / {recipe.steps.length} adım tamamlandı · dokunarak işaretle</Text>
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
                    <Ionicons name="checkmark" size={15} color="#ffffff" />
                  </View>
                ) : (
                  <Text style={styles.stepNumberText}>{idx + 1}</Text>
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
            {recipe.chef_tip ? (
              <View style={styles.chefTip}>
                <Text style={styles.chefTipTitle}>Şefin notu</Text>
                <Text style={styles.chefTipText}>{recipe.chef_tip}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Notum: private note, fetched separately (never part of the public recipe payload). */}
        <RecipeNoteCard recipeId={recipe.id} onToast={setToast} />

        {/* Nutrition: checked values only */}
        {verifiedMacros && (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>Besin değerleri</Text>
              <Text style={styles.cardMeta}>{defaultServings === null ? 'Tarifin tamamı' : '1 porsiyon'} · doğrulanmış</Text>
            </View>
            <View style={styles.macroRow}>
              {calories > 0 && <Macro label="Kalori" value={`${calories}`} unit="kcal" />}
              <Macro label="Protein" value={String(recipe.nutrition.protein)} unit="g" />
              <Macro label="Karbonhidrat" value={String(recipe.nutrition.carbs)} unit="g" />
              <Macro label="Yağ" value={String(recipe.nutrition.fat)} unit="g" />
            </View>
          </View>
        )}

        {/* Lokma rating: one control, five honest feelings */}
        {user && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Nasıl buldun?</Text>
            <View style={styles.lokmaRatingRow}>
              {LOKMA_RATINGS.map(({ rating, label }) => (
                <TouchableOpacity key={rating} accessibilityRole="button"
                  accessibilityLabel={`${rating} yıldız, ${label}`}
                  accessibilityState={{ selected: userRating === rating }}
                  onPress={() => handleRate(rating)}
                  style={[styles.lokmaRatingOption, userRating === rating && styles.lokmaRatingOptionSelected]}>
                  <View style={[styles.lokmaRatingSymbol, userRating === rating && styles.lokmaRatingSymbolSelected]}>
                    <Ionicons name={RATING_ICONS[rating - 1]} size={21}
                      color={userRating === rating ? '#ffffff' : colors.brand} />
                  </View>
                  <Text style={styles.lokmaRatingLabel} numberOfLines={1}
                    adjustsFontSizeToFit minimumFontScale={0.85} ellipsizeMode="tail">
                    {RATING_DISPLAY_LABELS[rating - 1]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Similar Recipes */}
        {similarRecipes.length > 0 && (
          <View style={styles.sectionWide}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Bunu sevenler <Text style={styles.sectionAccent}>şunlara da</Text> bayıldı</Text>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/recipes', params: { cuisine: recipe.cuisine?.[0] } })}
              >
                <Text style={styles.seeAllText}>Tümü</Text>
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
          <View style={styles.block}>
            <AuthorCard author={recipe.author} />
          </View>
        )}

        {/* Comments */}
        <View style={styles.block}>
          <CommentSection recipeId={recipe.id} />
        </View>
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

      <View style={[styles.cookBar, { paddingBottom: Math.max(insets.bottom, 14) }]} pointerEvents="box-none">
        <TouchableOpacity onPress={requestCookingAssistant} style={styles.cookButton} accessibilityRole="button" activeOpacity={0.9}>
          <Ionicons name="play" size={18} color="#ffffff" />
          <Text style={styles.cookButtonText}>Pişirmeye başla</Text>
        </TouchableOpacity>
      </View>

      {toast ? (
        <View style={[styles.toast, { bottom: Math.max(insets.bottom, 14) + 74 }]} pointerEvents="none" accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}

      <WeekPickerSheet visible={weekPickerVisible} title={recipe.title} onClose={() => setWeekPickerVisible(false)} onPick={pickDay} />
    </>
  );
}

function Macro({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroValue}>{value}<Text style={styles.macroUnit}> {unit}</Text></Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  hero: { position: 'relative', height: 400, backgroundColor: colors.cream },
  image: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 150 },
  heroBack: {
    position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', ...shadow.card,
  },
  heroRight: { position: 'absolute', right: 16, flexDirection: 'row', gap: 10 },
  heroSource: {
    position: 'absolute', left: 16, bottom: 46, maxWidth: '78%', flexDirection: 'row', alignItems: 'center', gap: 7,
    height: 36, paddingLeft: 5, paddingRight: 13, borderRadius: radius.pill, backgroundColor: 'rgba(31,26,23,0.78)',
  },
  heroSourcePlay: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  heroSourceText: { flexShrink: 1, fontFamily: fonts.bodySemi, fontSize: 13, color: '#fff' },
  heroCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center', justifyContent: 'center', ...shadow.card,
  },
  content: {
    marginTop: -30, borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: colors.canvas,
    paddingTop: 26,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textMuted, marginHorizontal: 20 },
  title: { fontFamily: fonts.headingBold, fontSize: 30, lineHeight: 36, letterSpacing: -0.8, color: colors.ink, marginHorizontal: 20, marginTop: 8 },
  excerpt: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textMuted, marginHorizontal: 20, marginTop: 10 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 20, marginTop: 16 },
  tag: { height: 34, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.cream, justifyContent: 'center' },
  tagText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  ratingSection: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 14 },
  ratingText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  block: { marginHorizontal: 20, marginTop: 20 },
  authorEditButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 16,
    paddingHorizontal: 14, height: 44, borderRadius: radius.pill, backgroundColor: colors.brandSoft,
  },
  authorEditText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
  aiBadgeRow: { marginHorizontal: 20, marginTop: 10 },
  visibilityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 16, padding: 14,
    borderRadius: radius.lg, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.lineStrong,
  },
  visibilityIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  visibilityCopy: { flex: 1, gap: 2 },
  visibilityTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  visibilityText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  visibilityButton: { height: 36, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: colors.ink, justifyContent: 'center' },
  visibilityButtonText: { fontFamily: fonts.bodySemi, fontSize: 13, color: '#fff' },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: 12, marginTop: 24 },
  quick: { flex: 1, alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  quickIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  quickIconPrimary: { backgroundColor: colors.brand, borderColor: colors.brand },
  quickIconActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  quickLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 15, color: colors.text, textAlign: 'center' },
  allergenBand: {
    marginHorizontal: 20, marginTop: 22, paddingTop: 14, paddingBottom: 4, paddingHorizontal: 14,
    borderRadius: radius.lg, backgroundColor: colors.warningSoft,
  },
  allergenBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  allergenIcon: { marginTop: 1 },
  allergenCopy: { flex: 1, minWidth: 0, gap: 4 },
  allergenText: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: colors.ink },
  allergenNote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 2 },
  allergenLink: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', minHeight: 40, marginLeft: 30 },
  allergenLinkText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.warning },
  segment: { flexDirection: 'row', gap: 4, padding: 4, marginHorizontal: 20, marginTop: 26, borderRadius: radius.pill, backgroundColor: colors.cream },
  segmentItem: { flex: 1, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.textMuted },
  segmentTextActive: { color: '#ffffff' },
  section: { marginHorizontal: 20, marginTop: 18 },
  sectionWide: { marginTop: 30 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginHorizontal: 20, marginBottom: 14 },
  sectionTitle: { flex: 1, fontFamily: fonts.headingBold, fontSize: 21, lineHeight: 26, color: colors.ink },
  sectionAccent: { fontFamily: fonts.headingBoldItalic, color: colors.brand },
  sectionCaption: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  seeAllText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
  servingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  servingsLabel: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink },
  servingsControl: {
    flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface, paddingHorizontal: 4,
  },
  servingsBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  servingsText: { minWidth: 76, textAlign: 'center', fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  ingredientRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong,
  },
  ingredientRowChecked: { opacity: 0.55 },
  ingredientCheck: { width: 24, height: 24, borderRadius: 8, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  ingredientCheckActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  ingredientCopy: { flex: 1, minWidth: 0 },
  ingredientText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.ink },
  ingredientAmount: { fontFamily: fonts.bodySemi },
  ingredientTextChecked: { textDecorationLine: 'line-through', color: colors.textFaint },
  ingredientNote: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 2 },
  inlineShop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, marginTop: 16,
    borderRadius: radius.pill, borderWidth: 1, borderColor: '#f0c8bd', backgroundColor: colors.brandSoft,
  },
  inlineShopText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  stepRowDone: { opacity: 0.5 },
  stepNumberText: { width: 30, fontFamily: fonts.headingBold, fontSize: 24, lineHeight: 28, color: colors.brand, textAlign: 'center' },
  stepNumberDone: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 17, lineHeight: 26, color: colors.ink },
  stepTextDone: { textDecorationLine: 'line-through', color: colors.textFaint },
  chefTip: { marginTop: 18, padding: 16, borderRadius: radius.lg, backgroundColor: colors.cream },
  chefTipTitle: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.brand },
  chefTipText: { fontFamily: fonts.headingItalic, fontSize: 16, lineHeight: 24, color: colors.ink, marginTop: 6 },
  card: { marginHorizontal: 20, marginTop: 24, padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  cardTitle: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.ink },
  cardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  macroRow: { flexDirection: 'row', marginTop: 14 },
  macro: { flex: 1 },
  macroValue: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.ink },
  macroUnit: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  macroLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  lokmaRatingRow: { flexDirection: 'row', flexWrap: 'nowrap', justifyContent: 'space-between', gap: 5, marginTop: 14 },
  lokmaRatingOption: {
    flex: 1, minWidth: 0, height: 80, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line,
  },
  lokmaRatingOptionSelected: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  lokmaRatingSymbol: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  lokmaRatingSymbolSelected: { backgroundColor: colors.brand },
  lokmaRatingLabel: { height: 16, fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.text, textAlign: 'center' },
  similarList: { paddingHorizontal: 20, gap: 12 },
  cookBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10 },
  cookButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 58,
    borderRadius: radius.pill, backgroundColor: colors.brand, ...shadow.floating,
  },
  cookButtonText: { fontFamily: fonts.bodySemi, fontSize: 17, color: '#ffffff' },
  toast: {
    position: 'absolute', alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, height: 42, borderRadius: radius.pill, backgroundColor: colors.ink,
  },
  toastText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#ffffff' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, backgroundColor: colors.canvas },
  errorText: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink },
  errorBack: { height: 44, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: colors.ink, justifyContent: 'center' },
  errorBackText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
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
