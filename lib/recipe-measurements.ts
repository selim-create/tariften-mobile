/** A single curated list used by recipe create, edit and AI review. No free-form units. */
export const RECIPE_UNITS = [
  'adet', 'g', 'kg', 'ml', 'l', 'su bardağı', 'çay bardağı',
  'yemek kaşığı', 'tatlı kaşığı', 'çay kaşığı', 'fincan',
  'paket', 'dilim', 'diş', 'baş', 'dal', 'demet', 'tutam',
  'avuç', 'kase', 'çimdik',
] as const;

export function validateRecipeAmount(input: string): string | null {
  const raw = input.trim().toLocaleLowerCase('tr-TR');
  if (!raw) return null; // Unknown quantity stays unknown.
  if (raw === 'yarım' || raw === 'çeyrek') return null;
  const decimal = '(?:\\d+(?:[.,]\\d{1,2})?)';
  const fraction = '(?:\\d{1,3}\\/\\d{1,3})';
  const scalar = `(?:${decimal}|${fraction})`;
  const regex = new RegExp(`^(${scalar})(?:\\s*[-–]\\s*(${scalar}))?$`);
  const match = raw.match(regex);
  if (!match) return 'Miktara yalnızca sayı yaz (ör. 2, 1,5, 1/2 veya 2-3).';
  const numeric = (value: string) => {
    if (!value.includes('/')) return Number(value.replace(',', '.'));
    const [numerator, denominator] = value.split('/').map(Number);
    return denominator ? numerator / denominator : NaN;
  };
  const first = numeric(match[1]);
  const second = match[2] ? numeric(match[2]) : null;
  if (!Number.isFinite(first) || first <= 0 || first > 10000
    || (second !== null && (!Number.isFinite(second) || second <= 0 || second > 10000 || second < first))) {
    return 'Miktar 0’dan büyük, 10.000’den küçük ve mantıklı bir sayı olmalı.';
  }
  return null;
}

export function validateRecipeUnit(value: string): string | null {
  if (!value.trim()) return null; // No unit is valid when one is unknown.
  if (!RECIPE_UNITS.some(unit => unit.toLocaleLowerCase('tr-TR') === value.trim().toLocaleLowerCase('tr-TR'))) {
    return 'Lütfen listeden bir ölçü birimi seç.';
  }
  return null;
}
