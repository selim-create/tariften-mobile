/**
 * Shopping list built only from recipes' own ingredient rows (same rules as the
 * web menu list). Amounts are summed only when they are unambiguous numbers in
 * the same unit; anything else ("1 tutam", "2-3", "yarım") is listed as written.
 */

export type ShoppingIngredient = {
  ingredient_id?: number | string;
  name?: unknown;
  amount?: unknown;
  unit?: unknown;
};

export type ShoppingRecipe = { title: string; ingredients?: ShoppingIngredient[] | null };

export type ShoppingItem = {
  key: string;
  name: string;
  unit: string;
  total: number | null;     // summed numeric amount, when every part was numeric
  parts: string[];          // amounts that could not be summed, as written
  recipes: string[];        // recipe titles that use it
};

function fold(value: string): string {
  return value.toLocaleLowerCase("tr-TR").normalize("NFC")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i")
    .replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .replace(/\s+/g, " ").trim();
}

/** "1", "1,5", "0.25", "1/2", "1 1/2" → number; anything else → null. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(",", ".");
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const value = Number(text);
    return value > 0 ? value : null;
  }
  const mixed = text.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1] || 0), num = Number(mixed[2]), den = Number(mixed[3]);
    if (den > 0 && num >= 0) {
      const value = whole + num / den;
      return value > 0 ? value : null;
    }
  }
  return null;
}

export function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace(".", ",");
}

export function buildShoppingList(recipes: ShoppingRecipe[]): ShoppingItem[] {
  const items = new Map<string, ShoppingItem>();
  for (const recipe of recipes) {
    for (const row of recipe.ingredients || []) {
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) continue;
      const unit = typeof row.unit === "string" ? row.unit.trim() : "";
      const identity = row.ingredient_id ? `id:${row.ingredient_id}` : `name:${fold(name)}`;
      const key = `${identity}|${fold(unit)}`;
      const amountText = typeof row.amount === "number" ? String(row.amount)
        : typeof row.amount === "string" ? row.amount.trim() : "";
      const numeric = parseAmount(amountText);

      let item = items.get(key);
      if (!item) {
        item = { key, name, unit, total: 0, parts: [], recipes: [] };
        items.set(key, item);
      }
      if (numeric !== null) {
        if (item.total !== null) item.total += numeric;
        else item.parts.push(amountText);
      } else if (amountText && !/^(?:nan|undefined|null|0)$/i.test(amountText)) {
        item.parts.push(amountText);
      }
      if (!item.recipes.includes(recipe.title)) item.recipes.push(recipe.title);
    }
  }
  return [...items.values()].map(item => ({
    ...item,
    total: item.total && item.total > 0 ? item.total : null,
  }));
}

/** "300 gram", "1 adet + 1 tutam", "Tuz" (no amount). */
export function itemAmountText(item: ShoppingItem): string {
  const parts = [
    ...(item.total ? [`${formatAmount(item.total)}${item.unit ? ` ${item.unit}` : ""}`] : []),
    ...item.parts.map(part => `${part}${item.unit ? ` ${item.unit}` : ""}`),
  ];
  return parts.join(" + ");
}

export function shoppingListText(title: string, items: ShoppingItem[]): string {
  const lines = items.map(item => {
    const amount = itemAmountText(item);
    return `- ${amount ? `${amount} ` : ""}${item.name}`;
  });
  return `${title} · Alışveriş listesi\n\n${lines.join("\n")}\n\ntariften.com`;
}
