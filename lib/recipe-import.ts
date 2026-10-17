/**
 * Shared Native (Expo) view model for Tariften Core's source-grounded text import.
 *
 * The returned preview is not a saved recipe. Only an explicit user-initiated
 * publish action can call the existing recipes/create endpoint.
 */
export type ImportIngredient = {
  name: string;
  amount: string;
  unit: string;
  original_span: string;
  source_verified: boolean;
  source_name?: string;
  name_corrected?: boolean;
};

export type ImportStep = {
  content: string;
  original_span: string;
  source_verified: boolean;
  editorial_rewrite?: boolean;
};

export type ImportSeo = {
  title: string;
  description: string;
  focus_keywords: string[];
};

export type GroundedImportPreview = {
  success: true;
  mode: "manual_text_import";
  generation_status: "needs_review";
  requires_approval: true;
  source_text: string;
  recipe: {
    title: string;
    excerpt: string;
    ingredients: ImportIngredient[];
    steps: ImportStep[];
    seo: ImportSeo;
  };
  warnings: string[];
  needs_confirmation: string[];
  provenance: {
    origin_type: "manual_text";
    ingredient_evidence: string;
    step_evidence: string;
    editorial_fields: string[];
  };
};

export type EditableIngredient = ImportIngredient & { userEdited?: boolean };
export type EditableStep = ImportStep & { userEdited?: boolean };

export type ImportEditor = {
  title: string;
  excerpt: string;
  /** User-provided number of people. Never generated from ingredient mass. */
  servings: string;
  ingredients: EditableIngredient[];
  steps: EditableStep[];
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string;
};

/** UTF-8 byte count without relying on browser-only TextEncoder in Hermes. */
function utf8ByteLength(value: string): number {
  try {
    return encodeURIComponent(value).replace(/%[0-9a-fA-F]{2}/g, "x").length;
  } catch {
    return Number.POSITIVE_INFINITY; // Reject malformed UTF-16.
  }
}

export function validateRecipeSource(text: string): string | null {
  const size = utf8ByteLength(text);
  if (size > 20000) return "Metin çok uzun. En fazla 20 KB metin aktarabilirsin.";
  if (text.trim().length < 25) return "Malzeme ve hazırlanışı içeren biraz daha ayrıntılı bir metin gir.";
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isString(value: unknown): value is string {
  return typeof value === "string";
}
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}
function isIngredient(value: unknown): value is ImportIngredient {
  return isRecord(value) && isString(value.name) && isString(value.amount)
    && isString(value.unit) && isString(value.original_span) && value.source_verified === true
    && (value.source_name === undefined || isString(value.source_name))
    && (value.name_corrected === undefined || typeof value.name_corrected === "boolean");
}
function isStep(value: unknown): value is ImportStep {
  return isRecord(value) && isString(value.content) && isString(value.original_span)
    && value.source_verified === true
    && (value.editorial_rewrite === undefined || typeof value.editorial_rewrite === "boolean");
}

export function parseImportPreview(value: unknown): GroundedImportPreview {
  if (!isRecord(value) || value.success !== true || value.mode !== "manual_text_import"
    || value.generation_status !== "needs_review" || value.requires_approval !== true
    || !isString(value.source_text) || !isRecord(value.recipe) || !isRecord(value.provenance)
    || !isStringArray(value.warnings) || !isStringArray(value.needs_confirmation)) {
    throw new Error("Tarif aktarımı yanıtı beklenen biçimde değil.");
  }
  const r = value.recipe;
  if (!isString(r.title) || !isString(r.excerpt)
    || !Array.isArray(r.ingredients) || !r.ingredients.every(isIngredient)
    || !Array.isArray(r.steps) || !r.steps.every(isStep)
    || r.ingredients.length > 40 || r.steps.length > 40 || !isRecord(r.seo)
    || !isString(r.seo.title) || !isString(r.seo.description)
    || !isStringArray(r.seo.focus_keywords)
    || value.provenance.origin_type !== "manual_text") {
    throw new Error("Tarif alanları eksik veya beklenmeyen türde.");
  }
  for (const ingredient of r.ingredients as ImportIngredient[]) {
    const sourceName = ingredient.source_name || ingredient.name;
    if (!value.source_text.includes(ingredient.original_span)
        || !ingredient.original_span.toLocaleLowerCase("tr-TR").includes(sourceName.toLocaleLowerCase("tr-TR"))
        || (ingredient.name_corrected && !ingredient.source_name)) {
      throw new Error("Malzeme kanıtı orijinal kaynakla eşleşmiyor.");
    }
  }
  for (const step of r.steps as ImportStep[]) {
    if (!value.source_text.includes(step.original_span) || !step.content.trim()) {
      throw new Error("Tarif adımı kaynakla doğrulanamadı.");
    }
  }
  return value as GroundedImportPreview;
}

export function editorFromPreview(p: GroundedImportPreview): ImportEditor {
  return {
    title: p.recipe.title,
    excerpt: p.recipe.excerpt,
    servings: "", // Source does not verify servings; require explicit human choice.
    ingredients: p.recipe.ingredients.map(i => ({ ...i })),
    steps: p.recipe.steps.map(s => ({ ...s })),
    seoTitle: p.recipe.seo.title,
    seoDescription: p.recipe.seo.description,
    seoKeywords: p.recipe.seo.focus_keywords.join(", "),
  };
}

export function publishValidation(editor: ImportEditor): string | null {
  if (!editor.title.trim()) return "Tarif başlığını tamamlamalısın.";
  if (!/^[1-9]\d*$/.test(editor.servings.trim()) || Number(editor.servings) > 36) {
    return "Tarifin kaç kişilik olduğunu seçmelisin (1–36 kişi).";
  }
  if (!editor.ingredients.length || editor.ingredients.some(i => !i.name.trim())) {
    return "En az bir malzeme eklemeli ve tüm malzeme isimlerini tamamlamalısın.";
  }
  if (!editor.steps.length || editor.steps.some(s => !s.content.trim())) {
    return "En az bir hazırlanış adımı eklemeli ve tüm adımları tamamlamalısın.";
  }
  if (editor.ingredients.length > 40 || editor.steps.length > 40) {
    return "En fazla 40 malzeme ve 40 adım eklenebilir.";
  }
  return null;
}

/**
 * Only keys accepted by current recipes/create are supplied; image is
 * deliberately never included. No image generation or payment is triggered.
 * The existing WP create endpoint PUBLISHES immediately, not a draft.
 */
export function buildApprovedRecipe(editor: ImportEditor) {
  const error = publishValidation(editor);
  if (error) throw new Error(error);
  return {
    title: editor.title.trim(),
    excerpt: editor.excerpt.trim(),
    servings: Number(editor.servings),
    ingredients: editor.ingredients.map(i => ({
      name: i.name.trim(),
      amount: i.amount.trim(),
      unit: i.unit.trim(),
    })),
    steps: editor.steps.map(s => s.content.trim()),
    seo: {
      title: editor.seoTitle.trim() || editor.title.trim(),
      description: editor.seoDescription.trim() || editor.excerpt.trim(),
      focus_keywords: editor.seoKeywords.split(",").map(k => k.trim()).filter(Boolean).slice(0, 5).join(", "),
    },
  };
}

/**
 * Keep the review panel human and short. Duplicated backend evidence codes
 * remain intact in the preview; only their editorial presentation is grouped.
 * Safety-specific warnings never disappear into a generic review tip.
 */
const REVIEW_MESSAGES = {
  spelling: "Yazım hataları düzeltilmiş olabilir. Malzeme adlarını kendi tarifinle karşılaştır.",
  editorial: "Adımlar daha akıcı bir Türkçe ile tekrar yazıldı. Anlamın değişmediğini kontrol et.",
  ingredient: "Bir malzemeyi doğrulamalısın.",
  step: "Bir yapılış adımını doğrulamalısın.",
} as const;

const SPECIAL_WARNINGS: Record<string, string> = {
  high_salt_quantity_review: "Tuz miktarı fazla olabilir. Tarifindeki ölçüyü bir kez daha kontrol et.",
  salt_quantity: "Tuz miktarını kontrol et.",
  title_missing: "Tarifine bir isim ekleyebilirsin.",
  title: "Tarifinin adını kontrol et.",
  spot_needs_editorial_review: "Tarifini anlatan kısa metne bir göz at.",
  excerpt: "Tarifinin kısa açıklamasını kontrol et.",
  ingredients: "Malzeme listeni tamamla.",
  steps: "Yapılış adımlarını tamamla.",
};

export function importWarningLabel(code: string): string {
  if (SPECIAL_WARNINGS[code]) return SPECIAL_WARNINGS[code];
  if (code === "ingredient_name_corrected" || code === "ingredient_name_unverified") return REVIEW_MESSAGES.spelling;
  if (code === "step_editorial_rewrite" || code === "step_rewrite_needs_review") return REVIEW_MESSAGES.editorial;
  if (code.startsWith("ingredient_") || code === "ingredients_missing_or_unverified") return REVIEW_MESSAGES.ingredient;
  if (code.startsWith("step_") || code === "steps_missing_or_unverified") return REVIEW_MESSAGES.step;
  return "Tarifine son bir kez göz at.";
}

export function importReviewNotes(warnings: readonly string[], confirmations: readonly string[]): string[] {
  const codes = new Set([...warnings, ...confirmations]);
  const result: string[] = [];
  if ([...codes].some(code => code === "ingredient_name_corrected" || code === "ingredient_name_unverified")) result.push(REVIEW_MESSAGES.spelling);
  if ([...codes].some(code => code === "step_editorial_rewrite" || code === "step_rewrite_needs_review")) result.push(REVIEW_MESSAGES.editorial);
  if ([...codes].some(code => (code.startsWith("ingredient_") || code === "ingredients_missing_or_unverified") && !["ingredient_name_corrected", "ingredient_name_unverified"].includes(code))) result.push(REVIEW_MESSAGES.ingredient);
  if ([...codes].some(code => (code.startsWith("step_") || code === "steps_missing_or_unverified") && !["step_editorial_rewrite", "step_rewrite_needs_review"].includes(code))) result.push(REVIEW_MESSAGES.step);
  for (const code of codes) {
    if (SPECIAL_WARNINGS[code] && !result.includes(SPECIAL_WARNINGS[code])) result.push(SPECIAL_WARNINGS[code]);
  }
  return result;
}
