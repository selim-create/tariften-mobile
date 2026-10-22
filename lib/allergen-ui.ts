/**
 * Allergen UI (Core 1.0.51, P10): the calm band on a recipe and the allergen
 * answers of POST /ai/generate.
 *
 * Pure: no React Native, so scripts/check-allergen-ui.test.cjs loads it with
 * plain Node. Allergen names always come from Core (kitchen profile options);
 * the app keeps no catalogue of its own.
 *
 * Semantics (tariften-core docs/AI_PERSONALIZATION_ALLERGENS.md):
 * - recipe.allergens = { contains, possible } with EU-14 keys, detected from
 *   ingredient NAMES only. A key is never in both lists.
 * - The member's declared allergens are only used with allergen_consent_at;
 *   allergy and intolerance are treated the same.
 */
import type { KitchenOption, KitchenProfile } from './kitchen-profile';

export interface RecipeAllergens {
  contains: string[];
  possible: string[];
}

export type AllergenCertainty = 'contains' | 'possible';

export interface AllergenConflict {
  key: string;
  label: string;
  ingredients: string[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keyList = (v: unknown): string[] => (Array.isArray(v)
  ? Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')))
  : []);

/** Reads recipe.allergens defensively; null when Core did not send it (older recipe payloads). */
export function normaliseRecipeAllergens(raw: unknown): RecipeAllergens | null {
  if (!isRecord(raw)) return null;
  const contains = keyList(raw.contains);
  const possible = keyList(raw.possible).filter(key => !contains.includes(key));
  return { contains, possible };
}

/**
 * The recipe's allergens that the member declared, or null when there is
 * nothing to say: no profile, no consent, no declared allergens, no summary
 * on the recipe or no overlap. Keeps the recipe's (EU) order.
 */
export function matchProfileAllergens(recipeAllergens: unknown, profile: KitchenProfile | null | undefined): RecipeAllergens | null {
  if (!profile || !profile.allergen_consent_at || !profile.allergens.length) return null;
  const summary = normaliseRecipeAllergens(recipeAllergens);
  if (!summary) return null;
  const declared = new Set(profile.allergens.map(a => a.key));
  const contains = summary.contains.filter(key => declared.has(key));
  const possible = summary.possible.filter(key => declared.has(key) && !contains.includes(key));
  return contains.length || possible.length ? { contains, possible } : null;
}

/** "A", "A ve B", "A, B ve C". */
export function joinTr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ve ${items[items.length - 1]}`;
}

export const ALLERGEN_BAND_NOTE = 'Malzeme adlarından otomatik çıkarılır; etiket okumanın yerini tutmaz.';
export const ALLERGEN_BAND_LINK = 'Mutfak profilini aç';

/**
 * "Bu tarif profilindeki Yer fıstığı alerjenini içeriyor." Labels are Core's
 * option labels. If one is missing (an allergen newer than the catalogue),
 * the sentence stays truthful without naming it rather than dropping it.
 */
export function allergenSentence(keys: string[], labels: KitchenOption[], certainty: AllergenCertainty): string | null {
  if (!keys.length) return null;
  const verb = certainty === 'contains' ? 'içeriyor' : 'içerebilir';
  const names = keys.map(key => labels.find(o => o.value === key)?.label?.trim() || '');
  if (names.some(name => !name)) {
    return `Bu tarif profilindeki alerjenlerden ${keys.length > 1 ? 'bazılarını' : 'birini'} ${verb}.`;
  }
  return `Bu tarif profilindeki ${joinTr(names)} ${names.length > 1 ? 'alerjenlerini' : 'alerjenini'} ${verb}.`;
}

export interface AllergenBand {
  /** 'contains' when at least one declared allergen is certain. */
  tone: AllergenCertainty;
  lines: string[];
  note: string;
  accessibilityLabel: string;
}

/** Everything the recipe screen renders, or null to render nothing. */
export function allergenBand(
  recipeAllergens: unknown,
  profile: KitchenProfile | null | undefined,
  labels: KitchenOption[] | null | undefined,
): AllergenBand | null {
  const match = matchProfileAllergens(recipeAllergens, profile);
  if (!match) return null;
  const lines = [
    allergenSentence(match.contains, labels ?? [], 'contains'),
    allergenSentence(match.possible, labels ?? [], 'possible'),
  ].filter((line): line is string => !!line);
  if (!lines.length) return null;
  return {
    tone: match.contains.length ? 'contains' : 'possible',
    lines,
    note: ALLERGEN_BAND_NOTE,
    accessibilityLabel: `Alerjen uyarısı. ${lines.join(' ')} ${ALLERGEN_BAND_NOTE}`,
  };
}

// --- POST /ai/generate ---------------------------------------------------------------

export const AI_ALLERGEN_CONFLICT = 'ai_allergen_conflict';
const CONFLICT_FALLBACK = 'Bu tarif alerji listene uygun şekilde üretilemedi. Güvenliğin için tarifi göstermiyoruz; farklı bir istekle tekrar dene.';

/** Core refused the recipe (422): it is not in the body and must never be saved. */
export class AIAllergenConflictError extends Error {
  code: typeof AI_ALLERGEN_CONFLICT;
  conflicts: AllergenConflict[];
  constructor(message: string, conflicts: AllergenConflict[]) {
    super(message);
    this.name = 'AIAllergenConflictError';
    this.code = AI_ALLERGEN_CONFLICT;
    this.conflicts = conflicts;
  }
}

export function normaliseConflicts(raw: unknown): AllergenConflict[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(item => {
    if (!isRecord(item) || typeof item.key !== 'string') return [];
    const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : '';
    const ingredients = keyList(item.ingredients).map(s => s.trim());
    return [{ key: item.key, label, ingredients }];
  });
}

/** The typed error for a 422 ai_allergen_conflict response, otherwise null. */
export function allergenConflictFrom(status: number, body: unknown): AIAllergenConflictError | null {
  if (status !== 422 || !isRecord(body) || body.code !== AI_ALLERGEN_CONFLICT) return null;
  const message = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : CONFLICT_FALLBACK;
  return new AIAllergenConflictError(message, normaliseConflicts(body.allergen_conflicts));
}

export const ALLERGEN_CONFLICT_TITLE = 'Alerji listene uygun tarif çıkmadı';

/** Alert copy: Core's Turkish message, then one line per allergen with the ingredients that tripped it. */
export function allergenConflictCopy(error: AIAllergenConflictError): { title: string; message: string } {
  const lines = error.conflicts
    .filter(c => c.ingredients.length)
    .map(c => `• ${c.label ? `${c.label}: ` : ''}${c.ingredients.join(', ')}`);
  return {
    title: ALLERGEN_CONFLICT_TITLE,
    message: lines.length ? `${error.message}\n\nSorunlu malzemeler:\n${lines.join('\n')}` : error.message,
  };
}

export const ALLERGEN_WARNING_TITLE = 'Etiketleri kontrol et';

/**
 * Core's allergen_warning for 'possible' hits on the member's allergens
 * ("Bazı malzemeler alerji listendekileri içerebilir (…)"). It lives on the
 * recipe object; the top level is accepted too in case Core moves it.
 */
export function allergenWarningFrom(aiResponse: unknown): string | null {
  if (!isRecord(aiResponse)) return null;
  const fromRecipe = isRecord(aiResponse.recipe) ? aiResponse.recipe.allergen_warning : undefined;
  const value = typeof fromRecipe === 'string' && fromRecipe.trim() ? fromRecipe : aiResponse.allergen_warning;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
