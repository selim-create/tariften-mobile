/** Shared recipe amounts and practical Turkish kitchen measurements.
 * Existing units remain intact on edit; empty quantity/unit is allowed. */
export const RECIPE_UNITS = [
  'adet', 'g', 'kg', 'ml', 'l', 'su bardağı', 'çay bardağı',
  'yemek kaşığı', 'tatlı kaşığı', 'çay kaşığı', 'fincan',
  'paket', 'dilim', 'diş', 'baş', 'dal', 'demet', 'tutam',
  'avuç', 'kase', 'çimdik', 'gram', 'kilo', 'litre', 'gr', 'bardak',
  'çorba kaşığı', 'kaşık', 'tane', 'yaprak', 'sap', 'salkım',
  'yumru', 'kutu', 'şişe',
  // Size is a descriptive qualifier, not a physical measuring unit, but
  // many existing recipes store "1 orta boy soğan" in the unit field.
  'küçük boy', 'orta boy', 'büyük boy', 'küçük', 'orta', 'büyük',
] as const;

const TEXT_AMOUNTS = [
  'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz',
  'dokuz', 'on', 'yarım', 'çeyrek', 'birkaç', 'az', 'çok az',
  'bir buçuk', 'iki buçuk', '1 buçuk', '1/2', '1/4',
] as const;

const normalize = (value: string) => value.trim().toLocaleLowerCase('tr-TR');
const numericPart = '(?:\\d+(?:[.,]\\d{1,2})?|\\d{1,3}\\/\\d{1,3})';
const validNumeric = new RegExp(`^(${numericPart})(?:\\s*[-–]\\s*(${numericPart}))?$`);

export function validateRecipeAmount(input: string): string | null {
  const raw = normalize(input);
  if (!raw || TEXT_AMOUNTS.includes(raw as typeof TEXT_AMOUNTS[number])) return null;
  const match = raw.match(validNumeric);
  if (!match) return 'Miktarı sayı, kesir veya yarım / bir gibi anlaşılır bir ifadeyle belirt.';
  const parseValue = (value: string) => {
    if (!value.includes('/')) return Number(value.replace(',', '.'));
    const [a, b] = value.split('/').map(Number);
    return b ? a / b : NaN;
  };
  const first = parseValue(match[1]);
  const second = match[2] ? parseValue(match[2]) : null;
  if (!Number.isFinite(first) || first <= 0 || first > 10000
    || second !== null && (!Number.isFinite(second) || second <= 0 || second > 10000 || second < first)) {
    return 'Miktar 0’dan büyük ve mantıklı bir değer olmalı.';
  }
  return null;
}

/** Do not block natural progressive typing, e.g. "y" -> "yarım". */
export function canTypeRecipeAmount(input: string): boolean {
  const raw = normalize(input);
  if (!raw) return true;
  if (TEXT_AMOUNTS.some(amount => amount.startsWith(raw))) return true;
  if (/^[\d.,/\s\-–]+$/.test(raw)) return true;
  return false;
}

export function validateRecipeUnit(value: string): string | null {
  const unit = normalize(value);
  if (!unit) return null;
  if (!RECIPE_UNITS.some(item => normalize(item) === unit)) {
    return 'Bu ölçü veya boyut için listeden bir seçenek seç.';
  }
  return null;
}
