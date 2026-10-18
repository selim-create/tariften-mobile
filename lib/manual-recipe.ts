import type { Recipe } from './types';
import { validateRecipeAmount, validateRecipeUnit } from './recipe-measurements';
import { parseIngredients, parseSteps } from './recipeUtils';

export type ManualIngredient = { name: string; amount: string; unit: string };
export type RecipeManualDraft = {
  title: string; excerpt: string; chef_tip: string; servings: string;
  prep_time: string; cook_time: string; calories: string;
  image: number | string; ingredients: ManualIngredient[]; steps: string[];
  cuisine: string[]; meal_type: string[]; difficulty: string[]; diet: string[];
};

export const EMPTY_INGREDIENT = (): ManualIngredient => ({ name: '', amount: '', unit: '' });
export function emptyRecipeDraft(): RecipeManualDraft {
  return {
    title: '', excerpt: '', chef_tip: '', servings: '', prep_time: '', cook_time: '',
    calories: '', image: '', ingredients: [EMPTY_INGREDIENT()], steps: [''],
    cuisine: [], meal_type: [], difficulty: [], diet: [],
  };
}
export function draftFromRecipe(recipe: Recipe): RecipeManualDraft {
  const items = parseIngredients(recipe.ingredients as Recipe['ingredients']).map(item => ({
    name: String(item.name || ''), amount: item.amount == null ? '' : String(item.amount),
    unit: String(item.unit || ''),
  }));
  const steps = parseSteps(recipe.steps as Recipe['steps']).map(value => String(value));
  return {
    title: recipe.title || '', excerpt: recipe.excerpt || '', chef_tip: recipe.chef_tip || '',
    servings: recipe.servings == null || recipe.servings === 0 ? '' : String(recipe.servings),
    prep_time: recipe.prep_time == null ? '' : String(recipe.prep_time),
    cook_time: recipe.cook_time == null ? '' : String(recipe.cook_time),
    calories: recipe.calories == null ? '' : String(recipe.calories),
    image: recipe.image || '', ingredients: items.length ? items : [EMPTY_INGREDIENT()],
    steps: steps.length ? steps : [''],
    cuisine: Array.isArray(recipe.cuisine) ? [...recipe.cuisine] : [],
    meal_type: Array.isArray(recipe.meal_type) ? [...recipe.meal_type] : [],
    difficulty: Array.isArray(recipe.difficulty) ? [...recipe.difficulty] : [],
    diet: Array.isArray(recipe.diet) ? [...recipe.diet] : [],
  };
}
export type ManualField = 'title' | 'servings' | 'ingredients' | 'steps' | 'prep_time' | 'cook_time' | 'calories';
export function validateManualDraft(draft: RecipeManualDraft): { field: ManualField; message: string } | null {
  if (!draft.title.trim()) return { field: 'title', message: 'Tarifine bir isim vermelisin.' };
  if (draft.title.length > 180) return { field: 'title', message: 'Başlığı biraz kısaltmalısın (en fazla 180 karakter).' };
  if (!/^[1-9]\d*$/.test(draft.servings.trim()) || Number(draft.servings) > 36) {
    return { field: 'servings', message: 'Tarifin kaç kişilik olduğunu seçmelisin (1–36).' };
  }
  for (const key of ['prep_time', 'cook_time', 'calories'] as const) {
    const max = key === 'calories' ? 3000 : 720;
    if (draft[key].trim() && (!/^\d+$/.test(draft[key].trim()) || Number(draft[key]) > max)) {
      return { field: key, message: key === 'calories'
        ? 'Kişi başına kalori 0–3000 arasında olmalı.'
        : 'Süre 0–720 dakika arasında olmalı.' };
    }
  }
  if (!draft.ingredients.length || draft.ingredients.some(item => !item.name.trim())) {
    return { field: 'ingredients', message: 'Malzeme satırlarında isim boş bırakılamaz.' };
  }
  if (draft.ingredients.length > 40) return { field: 'ingredients', message: 'En fazla 40 malzeme ekleyebilirsin.' };
  for (const [index, row] of draft.ingredients.entries()) {
    const issue = validateRecipeAmount(row.amount) || validateRecipeUnit(row.unit);
    if (issue) return { field: 'ingredients', message: `${index + 1}. malzeme: ${issue}` };
  }
  if (!draft.steps.length || draft.steps.some(step => !step.trim())) {
    return { field: 'steps', message: 'Yapılış adımlarını doldurmalısın.' };
  }
  if (draft.steps.length > 40) return { field: 'steps', message: 'En fazla 40 adım ekleyebilirsin.' };
  return null;
}
export function approvedManualPayload(draft: RecipeManualDraft, image: number | string = draft.image): Record<string, unknown> {
  const error = validateManualDraft(draft);
  if (error) throw new Error(error.message);
  // A blank quantity is permitted; never extrapolate from servings.
  return {
    title: draft.title.trim(), excerpt: draft.excerpt.trim(), chef_tip: draft.chef_tip.trim(),
    servings: Number(draft.servings), prep_time: draft.prep_time.trim(),
    cook_time: draft.cook_time.trim(), calories: draft.calories.trim(), image,
    ingredients: draft.ingredients.map(row => ({
      name: row.name.trim(), amount: row.amount.trim(), unit: row.unit.trim(),
    })),
    steps: draft.steps.map(step => step.trim()),
    cuisine: [...draft.cuisine], meal_type: [...draft.meal_type],
    difficulty: [...draft.difficulty], diet: [...draft.diet],
  };
}
