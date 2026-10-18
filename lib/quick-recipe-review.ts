/**
 * Quick AI recipes automatically publish only after Core-reviewed quality checks.
 * Pure/offline parsing and deterministic publication payload preparation;
 * no extra AI calls, no inferred portions, no unverified nutrition facts.
 */
import { validateRecipeAmount, validateRecipeUnit } from './recipe-measurements';

export type QuickIngredient = { name: string; amount: string; unit: string };
export type QuickRecipeDraft = {
  title: string;
  excerpt: string;
  servings: string;
  calories: string;
  prep_time: string;
  cook_time: string;
  chef_tip: string;
  image: string | number;
  cuisine: string[];
  meal_type: string[];
  difficulty: string[];
  diet: string[];
  ingredients: QuickIngredient[];
  steps: string[];
  seo: { title: string; description: string; focus_keywords: string };
  quality_check?: { status: string; issues: string[]; warnings: string[] };
};

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function integerField(value: unknown, min: number, max: number): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value).trim())) return '';
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? String(number) : '';
}
function terms(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string')
    .map(v => v.trim()).filter(Boolean).slice(0, 8) : [];
}

export function quickRecipeFromAI(candidate: unknown): QuickRecipeDraft {
  if (!record(candidate)) throw new Error('AI tarif önizlemesi okunamadı.');
  const ingredients = candidate.ingredients;
  const steps = candidate.steps;
  if (!Array.isArray(ingredients) || !Array.isArray(steps)
    || ingredients.length > 40 || steps.length > 40) {
    throw new Error('AI tarifinin malzemeleri veya adımları kontrol edilemedi.');
  }
  const seo = record(candidate.seo) ? candidate.seo : {};
  const quality = record(candidate.quality_check) ? candidate.quality_check : null;
  const rawKeywords = seo.focus_keywords;
  const image = candidate.image;
  return {
    title: text(candidate.title),
    excerpt: text(candidate.excerpt),
    servings: integerField(candidate.servings, 1, 36),
    // Core currently marks AI nutrition unverified. Keep empty estimates empty.
    calories: integerField(candidate.calories, 1, 3000),
    prep_time: integerField(candidate.prep_time, 0, 720),
    cook_time: integerField(candidate.cook_time, 0, 720),
    chef_tip: text(candidate.chef_tip),
    image: typeof image === 'number' && Number.isSafeInteger(image) && image > 0
      ? image : typeof image === 'string' && /^https:\/\//i.test(image.trim()) ? image.trim() : '',
    cuisine: terms(candidate.cuisine),
    meal_type: terms(candidate.meal_type),
    difficulty: terms(candidate.difficulty),
    diet: terms(candidate.diet),
    ingredients: ingredients.map(row => {
      if (typeof row === 'string') return { name: row.trim(), amount: '', unit: '' };
      if (!record(row)) return { name: '', amount: '', unit: '' };
      return { name: text(row.name), amount: typeof row.amount === 'number'
        ? String(row.amount) : text(row.amount), unit: text(row.unit) };
    }),
    steps: steps.map(row => typeof row === 'string' ? row.trim()
      : record(row) ? text(row.content) : ''),
    seo: {
      title: text(seo.title),
      description: text(seo.description),
      focus_keywords: Array.isArray(rawKeywords)
        ? rawKeywords.filter((v): v is string => typeof v === 'string').slice(0, 5).join(', ')
        : text(rawKeywords),
    },
    ...(quality ? { quality_check: {
      status: text(quality.status),
      issues: terms(quality.issues),
      warnings: terms(quality.warnings),
    } } : {}),
  };
}

export function validateQuickRecipe(draft: QuickRecipeDraft): string | null {
  // One authoritative AI editorial audit runs on Core before any image request.
  // Do not publish if the review flag is missing, unsuccessful or has issues.
  if (!draft.quality_check || draft.quality_check.status !== 'reviewed'
    || draft.quality_check.issues.length > 0) {
    return 'AI tarifi editoryal kalite kontrolünü geçemedi. Yayımlama durduruldu.';
  }
  if (!draft.title.trim() || draft.title.trim().length > 180) {
    return 'Tarifin adını kontrol et (en fazla 180 karakter).';
  }
  if (!/^[1-9]\d*$/.test(draft.servings.trim()) || Number(draft.servings) > 36) {
    return 'Tarifin kaç kişilik olduğunu kontrol et (1–36).';
  }
  for (const key of ['prep_time', 'cook_time'] as const) {
    if (draft[key].trim() && (!/^\d+$/.test(draft[key].trim()) || Number(draft[key]) > 720)) {
      return 'Hazırlama ve pişirme süresini dakika olarak kontrol et.';
    }
  }
  if (draft.calories.trim() && (!/^[1-9]\d*$/.test(draft.calories.trim()) || Number(draft.calories) > 3000)) {
    return 'Kişi başına yaklaşık kalori değerini kontrol et (1–3000).';
  }
  if (!draft.ingredients.length || draft.ingredients.length > 40
    || draft.ingredients.some(row => !row.name.trim())) {
    return 'Malzeme isimlerini tamamla (1–40 malzeme).';
  }
  for (const [index, row] of draft.ingredients.entries()) {
    // Recognize the culinary composite "1 bütün + 2 sarı" literally.
    // Do not recast as 3 whole eggs or permit arbitrary free-text amounts.
    const composedEggAmount = /^\d{1,2}\s*(?:bütün|tam)\s*\+\s*\d{1,2}\s*(?:sarı|sarısı)$/iu.test(row.amount.trim());
    if (!composedEggAmount) {
      const amountIssue = validateRecipeAmount(row.amount);
      if (amountIssue) return `${index + 1}. malzeme: ${amountIssue}`;
    }
    const unitIssue = validateRecipeUnit(row.unit);
    if (unitIssue) return `${index + 1}. malzeme: ${unitIssue}`;
  }
  if (!draft.steps.length || draft.steps.length > 40 || draft.steps.some(step => !step.trim())) {
    return 'Hazırlanış adımlarını tamamla (1–40 adım).';
  }
  return null;
}

export function approvedQuickRecipe(draft: QuickRecipeDraft): Record<string, unknown> {
  const problem = validateQuickRecipe(draft);
  if (problem) throw new Error(problem);
  return {
    title: draft.title.trim(),
    excerpt: draft.excerpt.trim(),
    servings: Number(draft.servings),
    ...(draft.calories.trim() ? { calories: Number(draft.calories) } : {}),
    ...(draft.prep_time.trim() ? { prep_time: Number(draft.prep_time) } : {}),
    ...(draft.cook_time.trim() ? { cook_time: Number(draft.cook_time) } : {}),
    chef_tip: draft.chef_tip.trim(),
    ...(draft.image ? { image: draft.image } : {}),
    cuisine: draft.cuisine.filter(Boolean),
    meal_type: draft.meal_type.filter(Boolean),
    difficulty: draft.difficulty.filter(Boolean),
    diet: draft.diet.filter(Boolean),
    ingredients: draft.ingredients.map(row => ({
      name: row.name.trim(), amount: row.amount.trim(), unit: row.unit.trim(),
    })),
    steps: draft.steps.map(step => step.trim()),
    seo: {
      title: draft.seo.title.trim() || draft.title.trim(),
      description: draft.seo.description.trim() || draft.excerpt.trim(),
      focus_keywords: draft.seo.focus_keywords.trim(),
    },
    ...(draft.quality_check ? { quality_check: draft.quality_check } : {}),
  };
}
