/**
 * Turkish display for ingredient amounts: "0.5" → "½", "1.5" → "1½",
 * "0.3" → "0,3", "1/2" → "½". Anything that is not a plain number or simple
 * fraction ("2-3", "bir tutam") is shown exactly as written.
 */
const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };
const SLASH: Record<string, string> = { '1/2': '½', '1/4': '¼', '3/4': '¾', '1/3': '⅓', '2/3': '⅔' };

export function formatAmountTr(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  const text = String(raw).trim();
  if (SLASH[text]) return SLASH[text];
  const mixed = text.match(/^(\d+)\s+(\d\/\d)$/);
  if (mixed && SLASH[mixed[2]]) return `${mixed[1]}${SLASH[mixed[2]]}`;
  if (!/^\d+(?:[.,]\d+)?$/.test(text)) return text;
  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value)) return text;
  const whole = Math.floor(value);
  const frac = Math.round((value - whole) * 100) / 100;
  const symbol = FRACTIONS[String(frac)];
  if (symbol) return whole > 0 ? `${whole}${symbol}` : symbol;
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', ',');
}
