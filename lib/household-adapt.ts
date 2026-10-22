/**
 * "Evime göre uyarla (N kişi)" — Core 1.0.62 (docs/AI_PERSONALIZATION_ALLERGENS.md,
 * "Hane halkına göre uyarlama isteğe bağlı").
 *
 * Standard AI recipes are written for four. A member whose kitchen profile has
 * a household size may ask POST /ai/generate to write for their household by
 * sending adapt_household: true. The option is off by default and the flag is
 * omitted (never false) unless the member switched it on.
 *
 * Pure and dependency-free so scripts/check-recipe-notes.test.cjs can load it.
 */

export const HOUSEHOLD_ADAPT_MIN = 1;
export const HOUSEHOLD_ADAPT_MAX = 12;

/** The household size the toggle may offer, or null (toggle hidden). */
export function householdAdaptSize(size: unknown): number | null {
  if (typeof size !== 'number' || !Number.isInteger(size)) return null;
  return size >= HOUSEHOLD_ADAPT_MIN && size <= HOUSEHOLD_ADAPT_MAX ? size : null;
}

export function householdAdaptLabel(size: number): string {
  return `Evime göre uyarla (${size} kişi)`;
}

/** True only when the toggle is visible and on; anything else omits the flag. */
export function shouldAdaptHousehold(size: number | null, on: boolean): boolean {
  return size !== null && on === true;
}
