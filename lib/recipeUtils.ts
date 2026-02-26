import { Ingredient } from './types';

/**
 * Safely parse a field that might be a JSON string or already an array
 */
export function parseJsonField<T>(field: T | string | null | undefined): T | null {
  if (!field) return null;

  if (typeof field !== 'string') {
    return field as T;
  }

  try {
    const parsed = JSON.parse(field);
    return parsed as T;
  } catch (e) {
    console.warn('Failed to parse JSON field:', e);
    return null;
  }
}

/**
 * Parse recipe ingredients - handles both string and array formats
 */
export function parseIngredients(ingredients: Ingredient[] | string | null | undefined): Ingredient[] {
  const parsed = parseJsonField<Ingredient[]>(ingredients);
  return Array.isArray(parsed) ? parsed : [];
}

type StepInput = string[] | Array<{ content: string }> | string | null | undefined;

function isStepObject(step: unknown): step is { content: string } {
  return (
    typeof step === 'object' &&
    step !== null &&
    'content' in step &&
    typeof (step as { content: unknown }).content === 'string'
  );
}

/**
 * Parse recipe steps - handles both string and array formats
 */
export function parseSteps(steps: StepInput): string[] {
  const parsed = parseJsonField<string[] | Array<{ content: string }>>(steps);

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((step) => {
      if (typeof step === 'string') return step;
      if (isStepObject(step)) return step.content;
      return '';
    })
    .filter(Boolean);
}
