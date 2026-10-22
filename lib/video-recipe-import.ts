import type { ImportEditor } from "./recipe-import";

type Json = Record<string, unknown>;
const object = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const statuses = ["queued", "dispatching", "processing", "needs_review", "failed", "uncertain"] as const;
export type VideoJobStatus = typeof statuses[number];
export type VideoJob = {
  success: true;
  id: number;
  status: VideoJobStatus;
  source_url: string;
  message: string;
  requires_approval: true;
  preview?: unknown;
  error_code?: string;
  retryable?: boolean;
  refunded?: boolean;
  /** Core P19: "upload" for the member's own video; its source_url is an opaque id, never a link. */
  source_kind?: string;
};

/** Opaque Core reference of an uploaded video ("upload:<32 hex>"). */
export function isUploadSourceRef(value: unknown): boolean {
  return typeof value === "string" && /^upload:[a-f0-9]{32}$/.test(value);
}

/** The member's own uploaded video (never shown as a link, never retried). */
export function isOwnVideoJob(job: Pick<VideoJob, "source_kind" | "source_url"> | null | undefined): boolean {
  return !!job && job.source_kind === "upload" && isUploadSourceRef(job.source_url);
}

export function isYouTubeVideoLink(value: string): boolean {
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(u.hostname.toLowerCase())) return false;
    return u.hostname === "youtu.be"
      ? /^\/[A-Za-z0-9_-]{11}$/.test(u.pathname)
      : /^\/(shorts\/[A-Za-z0-9_-]{11}\/?|watch\/?)$/.test(u.pathname)
        && (u.pathname.startsWith("/shorts/") || /^[A-Za-z0-9_-]{11}$/.test(u.searchParams.get("v") || ""));
  } catch { return false; }
}

export function isInstagramReelLink(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' && !u.username && !u.password && !u.port
      && ['instagram.com', 'www.instagram.com'].includes(u.hostname.toLowerCase())
      && /^\/(?:reel|reels)\/[A-Za-z0-9_-]{5,64}\/?$/.test(u.pathname);
  } catch { return false; }
}

/** Canonical public TikTok video URL (short vm./vt. links are expanded on the device first). */
export function isTikTokVideoLink(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' && !u.username && !u.password && !u.port
      && ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(u.hostname.toLowerCase())
      && /^\/@[A-Za-z0-9._]{2,32}\/video\/[0-9]{15,24}\/?$/.test(u.pathname);
  } catch { return false; }
}

/** vm./vt.tiktok.com links: Core cannot canonicalize them without following a redirect. */
export function isTikTokShortLink(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' && ['vm.tiktok.com', 'vt.tiktok.com'].includes(u.hostname.toLowerCase());
  } catch { return false; }
}

/** A /p/ URL can be photo, video or carousel; Core proves playable media before any paid call. */
export function isInstagramPostLink(value: string): boolean {
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' && !u.username && !u.password && !u.port
      && ['instagram.com', 'www.instagram.com'].includes(u.hostname.toLowerCase())
      && /^\/p\/[A-Za-z0-9_-]{5,64}\/?$/.test(u.pathname);
  } catch { return false; }
}

/** Social platforms where the user confirms media-processing rights (same rule as Core and web). */
export function needsRightsConfirmation(value: string): boolean {
  return isInstagramReelLink(value) || isInstagramPostLink(value) || isTikTokVideoLink(value);
}

export function isVideoRecipeLink(value: string): boolean {
  return isYouTubeVideoLink(value) || isInstagramReelLink(value) || isInstagramPostLink(value) || isTikTokVideoLink(value);
}

export function parseVideoJob(value: unknown): VideoJob {
  if (!object(value) || value.success !== true || !Number.isSafeInteger(value.id) || Number(value.id) < 1
      || !statuses.includes(value.status as VideoJobStatus) || !str(value.source_url)
      || !(isVideoRecipeLink(value.source_url) || (value.source_kind === "upload" && isUploadSourceRef(value.source_url)))
      || !str(value.message) || value.requires_approval !== true) {
    throw new Error("Video analiz işi sunucudan beklenen biçimde dönmedi.");
  }
  return value as VideoJob;
}

const amountText = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? String(v) : "";
const shortString = (v: unknown, limit = 700) =>
  str(v) && v.length <= limit ? v.trim() : "";

export function videoEditorFromJob(job: VideoJob): { editor: ImportEditor; warnings: string[] } {
  if (job.status !== "needs_review" || !object(job.preview)) throw new Error("Video tarifi henüz hazır değil.");
  const data = job.preview;
  if (data.status !== "needs_review" || data.requires_approval !== true || !object(data.recipe)) {
    throw new Error("Video tarifi inceleme formatında değil.");
  }
  const r = data.recipe;
  if (!str(r.title) || !r.title.trim() || r.title.length > 150 || !str(r.excerpt) ||
      !Array.isArray(r.ingredients) || r.ingredients.length < 1 || r.ingredients.length > 40 ||
      !Array.isArray(r.steps) || r.steps.length < 1 || r.steps.length > 40 ||
      !r.ingredients.every((i: unknown) => object(i) && str(i.name) && !!i.name.trim() && i.name.length <= 120) ||
      !r.steps.every((s: unknown) => object(s) && str(s.instruction) && !!s.instruction.trim() && s.instruction.length <= 700)) {
    throw new Error("Video tarifinin bazı alanları eksik. Yönetici incelemesi gerekiyor.");
  }
  const ingredients = (r.ingredients as Json[]).map(i => ({
    name: shortString(i.name, 120),
    amount: amountText(i.amount),
    unit: shortString(i.unit, 45),
    original_span: "",
    source_verified: false,
    name_corrected: false,
  }));
  const steps = (r.steps as Json[]).map(s => ({
    content: shortString(s.instruction),
    original_span: "",
    source_verified: false,
    editorial_rewrite: true,
  }));
  const warnings = [
    "Malzemeler ve adımlar yapay zekânın videodan çıkardığı önerilerdir; videodan bağımsız doğrulanmış sayılmaz.",
    "Ölçüler tahminidir. Yayınlamadan önce porsiyonu, miktarları ve hazırlama sırasını kontrol et.",
  ];
  if (Array.isArray(r.needs_confirmation)) {
    for (const n of r.needs_confirmation.slice(0, 10)) {
      if (str(n) && n.trim() && n.length <= 200) warnings.push(n.trim());
    }
  }
  if (object(r.quality_review) && Array.isArray(r.quality_review.issues)) {
    for (const item of r.quality_review.issues.slice(0, 8)) {
      if (object(item) && str(item.message) && item.message.length <= 220) warnings.push(item.message);
    }
  }
  const servings = Number.isInteger(r.servings) && Number(r.servings) >= 1 && Number(r.servings) <= 36
    ? String(r.servings) : "";
  // No calorie estimate without validated ingredient weights; user may add it.
  const editor: ImportEditor = {
    title: r.title.trim(), excerpt: shortString(r.excerpt, 700),
    servings, calories: "", cuisine: shortString(r.cuisine, 80), mealType: shortString(r.meal_type, 80),
    ingredients, steps, seoTitle: r.title.trim(),
    seoDescription: shortString(r.excerpt, 700), seoKeywords: "",
  };
  return { editor, warnings: Array.from(new Set(warnings)).slice(0, 16) };
}
