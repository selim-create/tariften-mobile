/**
 * Fotoğraftan tarif (mode=dish) & Defterden tarif (mode=notebook) — Core 1.0.58.
 *
 * Pure view-model helpers: no React Native imports, so
 * scripts/check-photo-video-recipe.test.cjs loads this file with plain Node.
 * A preview is never a recipe; only the member's explicit save creates one,
 * and it is created PRIVATE unless the member picks "Herkese açık".
 */
import { quickRecipeFromAI, type QuickRecipeDraft } from './quick-recipe-review';
import { validateRecipeAmount, validateRecipeUnit } from './recipe-measurements';
import { normaliseConflicts, type AllergenConflict } from './allergen-ui';

export type PhotoMode = 'dish' | 'notebook';
export type RecipeVisibility = 'private' | 'public';

export const PHOTO_NOTE_MAX = 300;
export const NOTEBOOK_MAX_PAGES = 4;
/** Long edge sent to Core; Core re-encodes to ≤1600 px anyway, this only saves data. */
export const PHOTO_MAX_EDGE = 2000;
export const PHOTO_JPEG_QUALITY = 0.8;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
/** gpt-4o can take 10–60 s; Core asks for a client timeout of at least 130 s. */
export const PHOTO_PREVIEW_TIMEOUT_MS = 130000;

/** Default is always private. Anything but an explicit 'public' stays private. */
export function normalizeVisibility(value: unknown): RecipeVisibility {
  return value === 'public' ? 'public' : 'private';
}

export type PhotoUncertainItem = { field: 'ingredients' | 'steps'; index: number; note: string };

export type PhotoPreview = {
  mode: PhotoMode;
  aiEstimated: boolean;
  label: string;
  detected: { dish: string; confidence: number; level: string; alternatives: string[] } | null;
  draft: QuickRecipeDraft;
  assumptions: string[];
  uncertain: PhotoUncertainItem[];
  illegible: string[];
  warnings: string[];
  needsConfirmation: string[];
  sourceNotes: string;
  allergens: { contains: string[]; possible: string[] };
  allergenConflicts: AllergenConflict[];
  allergenCautions: AllergenConflict[];
  allergenWarning: string;
  previewToken: string;
  expiresAt: string;
  pageCount: number;
  coverAvailable: boolean;
  defaultVisibility: RecipeVisibility;
  /** Original readings flagged as uncertain, keyed by their content (see uncertainNote*). */
  uncertainIngredients: Record<string, string>;
  uncertainSteps: Record<string, string>;
};

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const list = (v: unknown, max = 12): string[] => (Array.isArray(v)
  ? v.map(item => text(item)).filter(Boolean).slice(0, max) : []);

/** Stable key for an ingredient row: highlighting stays until the member changes the row. */
export function ingredientKey(row: { name: string; amount: string; unit: string }): string {
  return [row.name, row.amount, row.unit].map(part => String(part ?? '').trim().toLocaleLowerCase('tr-TR')).join('|');
}
export function stepKey(step: string): string {
  return String(step ?? '').trim().toLocaleLowerCase('tr-TR');
}

export function parsePhotoPreview(payload: unknown, mode: PhotoMode): PhotoPreview {
  if (!isRecord(payload) || payload.success !== true || payload.mode !== mode || !isRecord(payload.recipe)) {
    throw new Error('Tarif önizlemesi beklenen biçimde gelmedi. Tekrar dene.');
  }
  const previewToken = text(payload.preview_token, 128);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(previewToken)) {
    throw new Error('Tarif önizlemesi doğrulanamadı. Tekrar dene.');
  }
  // Same recipe shape as /ai/generate; we never trust a client-side image here.
  const draft = { ...quickRecipeFromAI(payload.recipe), image: '' };
  const rawIngredients = Array.isArray(payload.recipe.ingredients) ? payload.recipe.ingredients : [];
  const rawSteps = Array.isArray(payload.recipe.steps) ? payload.recipe.steps : [];

  const uncertain: PhotoUncertainItem[] = (Array.isArray(payload.uncertain) ? payload.uncertain : [])
    .flatMap((item): PhotoUncertainItem[] => {
      if (!isRecord(item) || (item.field !== 'ingredients' && item.field !== 'steps')) return [];
      const index = Number(item.index);
      if (!Number.isInteger(index) || index < 0 || index >= 40) return [];
      return [{ field: item.field, index, note: text(item.note, 200) }];
    }).slice(0, 40);

  const uncertainIngredients: Record<string, string> = {};
  const uncertainSteps: Record<string, string> = {};
  rawIngredients.forEach((row, index) => {
    if (isRecord(row) && row.uncertain === true && draft.ingredients[index]) {
      const hint = text(row.note, 200) || (text(row.original_text, 200) ? `Sayfada: ${text(row.original_text, 200)}` : '');
      uncertainIngredients[ingredientKey(draft.ingredients[index])] = hint || 'Belirsiz okundu';
    }
  });
  for (const item of uncertain) {
    if (item.field === 'ingredients' && draft.ingredients[item.index]) {
      const key = ingredientKey(draft.ingredients[item.index]);
      uncertainIngredients[key] = item.note || uncertainIngredients[key] || 'Belirsiz okundu';
    } else if (item.field === 'steps' && typeof draft.steps[item.index] === 'string' && rawSteps[item.index] !== undefined) {
      uncertainSteps[stepKey(draft.steps[item.index])] = item.note || 'Belirsiz okundu';
    }
  }

  const detected = isRecord(payload.detected) && text(payload.detected.dish, 120) ? {
    dish: text(payload.detected.dish, 120),
    confidence: Math.min(1, Math.max(0, Number(payload.detected.confidence) || 0)),
    level: text(payload.detected.confidence_level, 20),
    alternatives: list(payload.detected.alternatives, 4),
  } : null;
  const allergens = isRecord(payload.allergens) ? payload.allergens : {};

  return {
    mode,
    // Core decides the label (dish → true). Never upgrade a notebook to "AI tahmini".
    aiEstimated: payload.ai_estimated === true,
    label: text(payload.label, 60),
    detected,
    draft,
    assumptions: list(payload.assumptions),
    uncertain,
    illegible: list(payload.illegible),
    warnings: list(payload.warnings, 20),
    needsConfirmation: list(payload.needs_confirmation, 20),
    sourceNotes: text(payload.source_notes, 500),
    allergens: { contains: list(allergens.contains, 14), possible: list(allergens.possible, 14) },
    allergenConflicts: normaliseConflicts(payload.allergen_conflicts),
    allergenCautions: normaliseConflicts(payload.allergen_cautions),
    allergenWarning: text(payload.allergen_warning, 400),
    previewToken,
    expiresAt: text(payload.expires_at, 40),
    pageCount: Number.isInteger(payload.page_count) ? Number(payload.page_count) : 1,
    coverAvailable: mode === 'dish' && payload.cover_available === true,
    defaultVisibility: normalizeVisibility(payload.default_visibility),
    uncertainIngredients,
    uncertainSteps,
  };
}

/** Allergen hits on the member's own (consented) profile must be acknowledged before saving. */
export function needsAllergenAcknowledgement(preview: Pick<PhotoPreview, 'allergenConflicts' | 'allergenCautions' | 'allergenWarning' | 'needsConfirmation'>): boolean {
  return preview.allergenConflicts.length > 0 || preview.allergenCautions.length > 0
    || !!preview.allergenWarning || preview.needsConfirmation.includes('allergens');
}

export function isLowConfidence(preview: Pick<PhotoPreview, 'detected' | 'warnings' | 'needsConfirmation'>): boolean {
  return preview.warnings.includes('low_confidence') || preview.needsConfirmation.includes('dish')
    || (!!preview.detected && preview.detected.confidence < 0.45);
}

export function confidenceText(confidence: number): string {
  const percent = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  const level = confidence >= 0.75 ? 'Yüksek güven' : confidence >= 0.45 ? 'Orta güven' : 'Düşük güven';
  return `%${percent} · ${level}`;
}

/** Note to show next to a still-unchanged uncertain row, or null once the member fixed it. */
export function uncertainIngredientNote(preview: Pick<PhotoPreview, 'uncertainIngredients'>, row: { name: string; amount: string; unit: string }): string | null {
  return preview.uncertainIngredients[ingredientKey(row)] ?? null;
}
export function uncertainStepNote(preview: Pick<PhotoPreview, 'uncertainSteps'>, step: string): string | null {
  return preview.uncertainSteps[stepKey(step)] ?? null;
}
export function unresolvedUncertainCount(preview: Pick<PhotoPreview, 'uncertainIngredients' | 'uncertainSteps'>, draft: QuickRecipeDraft): number {
  return draft.ingredients.filter(row => uncertainIngredientNote(preview, row) !== null).length
    + draft.steps.filter(step => uncertainStepNote(preview, step) !== null).length;
}

/**
 * Same rules as Core's recipes/create (1–40 items, title ≤180, numeric
 * ranges). Servings is optional: a notebook page often has no portion count
 * and we never invent one. No quality_check gate (that is /ai/generate only).
 */
export function validatePhotoDraft(draft: QuickRecipeDraft): string | null {
  if (!draft.title.trim()) return 'Tarifine bir ad ver.';
  if (draft.title.trim().length > 180) return 'Tarifin adı en fazla 180 karakter olabilir.';
  if (draft.servings.trim() && (!/^[1-9]\d*$/.test(draft.servings.trim()) || Number(draft.servings) > 36)) {
    return 'Kaç kişilik olduğunu 1–36 arasında yaz ya da boş bırak.';
  }
  for (const key of ['prep_time', 'cook_time'] as const) {
    if (draft[key].trim() && (!/^\d+$/.test(draft[key].trim()) || Number(draft[key]) > 720)) {
      return 'Hazırlama ve pişirme süresini dakika olarak kontrol et.';
    }
  }
  if (draft.calories.trim() && (!/^\d+$/.test(draft.calories.trim()) || Number(draft.calories) > 3000)) {
    return 'Kişi başına yaklaşık kalori değerini kontrol et (0–3000).';
  }
  if (!draft.ingredients.length || draft.ingredients.length > 40 || draft.ingredients.some(row => !row.name.trim())) {
    return 'Malzeme isimlerini tamamla (1–40 malzeme).';
  }
  for (const [index, row] of draft.ingredients.entries()) {
    const amountIssue = validateRecipeAmount(row.amount);
    if (amountIssue) return `${index + 1}. malzeme: ${amountIssue}`;
    const unitIssue = validateRecipeUnit(row.unit);
    if (unitIssue) return `${index + 1}. malzeme: ${unitIssue}`;
  }
  if (!draft.steps.length || draft.steps.length > 40 || draft.steps.some(step => !step.trim())) {
    return 'Hazırlanış adımlarını tamamla (1–40 adım).';
  }
  return null;
}

export type PhotoSaveOptions = {
  mode: PhotoMode;
  visibility?: RecipeVisibility;
  useCover?: boolean;
  coverAvailable?: boolean;
};

/**
 * Body of POST /ai/photo-recipe/save. The recipe never carries image,
 * ai_estimated, visibility, source_kind or quality_check: Core sets those from
 * the preview session. Visibility is top level and private by default.
 */
export function buildPhotoSavePayload(previewToken: string, draft: QuickRecipeDraft, options: PhotoSaveOptions) {
  const problem = validatePhotoDraft(draft);
  if (problem) throw new Error(problem);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(previewToken)) throw new Error('Önizleme doğrulanamadı.');
  const numeric = (value: string) => value.trim();
  return {
    preview_token: previewToken,
    recipe: {
      title: draft.title.trim(),
      excerpt: draft.excerpt.trim(),
      prep_time: numeric(draft.prep_time),
      cook_time: numeric(draft.cook_time),
      servings: numeric(draft.servings),
      calories: numeric(draft.calories),
      cuisine: draft.cuisine.filter(Boolean),
      meal_type: draft.meal_type.filter(Boolean),
      difficulty: draft.difficulty.filter(Boolean),
      diet: draft.diet.filter(Boolean),
      ingredients: draft.ingredients.map(row => ({ name: row.name.trim(), amount: row.amount.trim(), unit: row.unit.trim() })),
      steps: draft.steps.map(step => step.trim()),
      chef_tip: draft.chef_tip.trim(),
      seo: {
        title: draft.seo.title.trim() || draft.title.trim(),
        description: draft.seo.description.trim() || draft.excerpt.trim(),
        focus_keywords: draft.seo.focus_keywords.trim(),
      },
    },
    visibility: normalizeVisibility(options.visibility),
    use_photo_as_cover: options.mode === 'dish' && options.coverAvailable === true && options.useCover === true,
  };
}

export type PhotoErrorInfo = { message: string; unavailable: boolean; quota: boolean };

/** Friendly Turkish copy for Core's photo-recipe errors (preview and save). */
export function photoErrorInfo(
  status: number, code: string, serverMessage: string, mode: PhotoMode = 'dish', phase: 'preview' | 'save' = 'preview',
): PhotoErrorInfo {
  const plain = (message: string): PhotoErrorInfo => ({ message, unavailable: false, quota: false });
  if (status === 503 && code === 'photo_recipe_unavailable') {
    return { message: mode === 'dish'
      ? 'Fotoğraftan tarif çok yakında burada. Şimdilik tarifini yazarak ya da bağlantıyla aktarabilirsin.'
      : 'Defterden tarif çok yakında burada. Şimdilik tarifini yazarak ekleyebilirsin.', unavailable: true, quota: false };
  }
  if (status === 429) {
    return { message: phase === 'save'
      ? 'Bugünkü tarif kaydetme hakkın doldu. Yarın yeniden deneyebilirsin.'
      : 'Bugünkü yapay zekâ tarif hakkını kullandın. Yarın yeniden deneyebilirsin.', unavailable: false, quota: true };
  }
  if (status === 401 || code === 'photo_recipe_auth_required') return plain('Oturumunun süresi dolmuş. Tekrar giriş yapıp dene.');
  switch (code) {
    case 'photo_recipe_not_food':
      return plain('Bu fotoğrafta bir yemek göremedik. Tabağın net göründüğü başka bir fotoğraf dene.');
    case 'photo_recipe_not_recipe_page':
      return plain('Bu sayfada bir tarif bulamadık. Tarifin yazılı olduğu sayfanın fotoğrafını çek.');
    case 'photo_recipe_unreadable':
      return plain('Sayfayı okuyamadık. Aydınlık bir yerde, sayfayı düz tutup yeniden çekmeyi dene.');
    case 'photo_recipe_decode_failed':
    case 'photo_recipe_image_too_small':
      return plain('Fotoğraf açılamadı ya da çok küçük. Başka bir fotoğraf dene.');
    case 'photo_recipe_heic_unsupported':
      return plain('Bu fotoğraf biçimi desteklenmiyor. Fotoğrafı yeniden seçip tekrar dene.');
    case 'photo_recipe_image_unsupported':
      return plain('Yalnızca JPEG, PNG veya WebP fotoğraflar kullanılabilir.');
    case 'photo_recipe_image_count':
      return plain(mode === 'dish' ? 'Tek bir yemek fotoğrafı seçmelisin.' : 'En az 1, en fazla 4 sayfa ekleyebilirsin.');
    case 'photo_recipe_invalid_note':
      return plain(`Not en fazla ${PHOTO_NOTE_MAX} karakter olabilir.`);
    case 'photo_recipe_preview_expired':
      return plain('Bu önizleme artık kullanılamıyor: süresi dolmuş ya da tarif zaten kaydedilmiş. Tariflerim bölümünü kontrol et ya da yeniden dene.');
    case 'photo_recipe_save_in_progress':
      return plain('Tarifin kaydediliyor. Birkaç saniye sonra Tariflerim bölümüne bak.');
    case 'photo_recipe_timeout':
      return plain('Tarifin hazırlanması uzun sürdü. Birazdan yeniden deneyebilirsin; deneme hakkından kullanım düşmüş olabilir.');
    case 'photo_recipe_invalid_output':
      return plain('Bu fotoğraftan kullanılabilir bir tarif çıkaramadık. Başka bir fotoğrafla dene.');
    default:
      break;
  }
  if (status === 413) return plain('Fotoğraf çok büyük. Daha küçük bir fotoğraf seç ya da sayfa sayısını azalt.');
  if (status === 415) return plain('Yalnızca JPEG, PNG veya WebP fotoğraflar kullanılabilir.');
  if (status === 422) return plain(serverMessage || 'Bu fotoğraftan tarif çıkaramadık. Başka bir fotoğraf dene.');
  if (status >= 500) return plain('Şu anda tarifini hazırlayamadık. Biraz sonra tekrar dene.');
  return plain(serverMessage && serverMessage.length <= 240 ? serverMessage : 'Bir şeyler ters gitti. Tekrar dene.');
}

/** expo-image-manipulator resize action for the long edge, or null when already small enough. */
export function downscaleAction(width: number, height: number, maxEdge = PHOTO_MAX_EDGE): { resize: { width: number } | { height: number } } | null {
  if (!(width > 0) || !(height > 0) || Math.max(width, height) <= maxEdge) return null;
  return width >= height ? { resize: { width: maxEdge } } : { resize: { height: maxEdge } };
}

/** Notebook pages: add (up to 4), remove and reorder without mutating the list. */
export function addPages<T>(pages: T[], added: T[], max = NOTEBOOK_MAX_PAGES): T[] {
  return [...pages, ...added].slice(0, max);
}
export function removePage<T>(pages: T[], index: number): T[] {
  return pages.filter((_, i) => i !== index);
}
export function movePage<T>(pages: T[], from: number, to: number): T[] {
  if (from < 0 || from >= pages.length || to < 0 || to >= pages.length || from === to) return pages;
  const next = [...pages];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
