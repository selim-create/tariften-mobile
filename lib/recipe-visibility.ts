/**
 * "AI Tahmini Tarif" badge and private-recipe rules for list and detail screens.
 * Pure: no imports, so scripts/check-photo-video-recipe.test.cjs loads it with Node.
 */
export const AI_ESTIMATED_LABEL = 'AI Tahmini Tarif';
export const PRIVATE_OWNER_NOTICE = 'Sadece sen görüyorsun';

type RecipeFlags = {
  ai_estimated?: unknown;
  visibility?: unknown;
  source_kind?: unknown;
  author?: { id?: unknown } | null;
};

/** Core sets ai_estimated (dish photo) and it stays after publishing. Only a real `true` counts. */
export function showAiEstimatedBadge(recipe: RecipeFlags | null | undefined): boolean {
  return recipe?.ai_estimated === true;
}

export function isPrivateRecipe(recipe: RecipeFlags | null | undefined): boolean {
  return recipe?.visibility === 'private';
}

export function isRecipeOwner(recipe: RecipeFlags | null | undefined, userId: number | null | undefined): boolean {
  const authorId = Number(recipe?.author?.id);
  return !!userId && Number.isSafeInteger(authorId) && authorId > 0 && authorId === Number(userId);
}

/** POST /recipes/visibility only accepts recipes made by the photo or notebook flows. */
export function canToggleVisibility(recipe: RecipeFlags | null | undefined, userId: number | null | undefined): boolean {
  return isRecipeOwner(recipe, userId)
    && (recipe?.source_kind === 'photo' || recipe?.source_kind === 'notebook')
    && (recipe?.visibility === 'private' || recipe?.visibility === 'public');
}

export function nextVisibility(current: unknown): 'private' | 'public' {
  return current === 'public' ? 'private' : 'public';
}
