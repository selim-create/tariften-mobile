/**
 * When Tariften may ask for an App Store / Google Play rating. Pure logic, no
 * React Native imports, so scripts/check-onboarding-review.test.cjs can test it.
 *
 * Store rules (Apple 5.6.1, Google Play): only the platform's own review
 * prompt, no "do you like us?" pre-question and no gating. The OS itself also
 * rate-limits the prompt; these are our own, stricter limits on top:
 *  - a happy moment only: the 2nd (and later) saved recipe, or "Pişirdim";
 *  - at least 3 days after the first launch and after the first onboarding;
 *  - never during the onboarding demo, and not within 30 minutes after it;
 *  - at least 90 days between two requests, at most 3 in any 365 days;
 *  - never while one of our sheets or the onboarding is on screen.
 */

export type ReviewReason = 'recipe_saved' | 'recipe_cooked';

const DAY_MS = 24 * 60 * 60 * 1000;

export const REVIEW_RULES = {
  /** Days after first launch / first onboarding before the first request. */
  minDaysSinceStart: 3,
  /** Days between two requests. */
  minDaysBetweenRequests: 90,
  /** Requests in any rolling 365 days. */
  maxRequestsPerYear: 3,
  /** Saved recipes needed before a save may ask (the 2nd and later). */
  minSavedRecipes: 2,
  /** Quiet time after the onboarding demo (also after a replay). */
  demoQuietMs: 30 * 60 * 1000,
  /** Let the success UI settle before the system sheet appears. */
  delayMs: 1500,
} as const;

export type ReviewState = {
  firstLaunchAt: number | null;
  /** First time the post-sign-up onboarding was finished or skipped. */
  onboardingFinishedAt: number | null;
  /** Last time the demo ended (first run or replay from Profile). */
  demoEndedAt: number | null;
  /** Successful recipe saves on this device (any source). */
  savedRecipes: number;
  /** Times we asked the OS to show the review prompt (pruned to 365 days). */
  requests: number[];
};

export const EMPTY_REVIEW_STATE: ReviewState = {
  firstLaunchAt: null, onboardingFinishedAt: null, demoEndedAt: null, savedRecipes: 0, requests: [],
};

function stamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/** Reads the stored JSON defensively; anything broken starts from empty. */
export function parseReviewState(raw: string | null | undefined): ReviewState {
  if (!raw) return { ...EMPTY_REVIEW_STATE, requests: [] };
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || typeof v !== 'object') return { ...EMPTY_REVIEW_STATE, requests: [] };
    const saved = typeof v.savedRecipes === 'number' && Number.isFinite(v.savedRecipes) && v.savedRecipes > 0
      ? Math.min(Math.floor(v.savedRecipes), 100000) : 0;
    const requests = Array.isArray(v.requests)
      ? v.requests.map(stamp).filter((t): t is number => t !== null).sort((a, b) => a - b).slice(-20)
      : [];
    return {
      firstLaunchAt: stamp(v.firstLaunchAt),
      onboardingFinishedAt: stamp(v.onboardingFinishedAt),
      demoEndedAt: stamp(v.demoEndedAt),
      savedRecipes: saved,
      requests,
    };
  } catch {
    return { ...EMPTY_REVIEW_STATE, requests: [] };
  }
}

export function serializeReviewState(state: ReviewState): string {
  return JSON.stringify(state);
}

/** First launch is recorded once and never moved. */
export function withFirstLaunch(state: ReviewState, now: number): ReviewState {
  return state.firstLaunchAt ? state : { ...state, firstLaunchAt: now };
}

/** The demo ended. `first` = the post-sign-up run (anchors the 3-day wait once). */
export function withDemoEnded(state: ReviewState, now: number, first: boolean): ReviewState {
  return {
    ...state,
    demoEndedAt: now,
    onboardingFinishedAt: first && !state.onboardingFinishedAt ? now : state.onboardingFinishedAt,
  };
}

/** A happy moment happened; a recipe save is counted. */
export function withSuccess(state: ReviewState, reason: ReviewReason): ReviewState {
  return reason === 'recipe_saved' ? { ...state, savedRecipes: state.savedRecipes + 1 } : state;
}

/** We asked the OS; keep only the last 365 days. */
export function withRequest(state: ReviewState, now: number): ReviewState {
  const yearAgo = now - 365 * DAY_MS;
  return { ...state, requests: [...state.requests.filter(t => t > yearAgo && t <= now), now] };
}

export type ReviewSkip =
  | 'unavailable' | 'busy' | 'onboarding' | 'too_early' | 'demo_quiet'
  | 'needs_more_saves' | 'too_soon' | 'yearly_cap';

export type ReviewDecision = { ask: true } | { ask: false; why: ReviewSkip };

export type ReviewInput = {
  state: ReviewState;
  reason: ReviewReason;
  now: number;
  /** StoreReview.isAvailableAsync() (and the native module exists). */
  available: boolean;
  /** The onboarding demo is on screen. */
  onboardingActive: boolean;
  /** One of our sheets / the onboarding holds the prompt, or the app is not active. */
  busy: boolean;
};

export function reviewDecision(input: ReviewInput): ReviewDecision {
  const { state, reason, now } = input;
  if (!input.available) return { ask: false, why: 'unavailable' };
  if (input.onboardingActive) return { ask: false, why: 'onboarding' };
  if (input.busy) return { ask: false, why: 'busy' };
  const minStart = REVIEW_RULES.minDaysSinceStart * DAY_MS;
  if (!state.firstLaunchAt || now - state.firstLaunchAt < minStart) return { ask: false, why: 'too_early' };
  if (state.onboardingFinishedAt && now - state.onboardingFinishedAt < minStart) return { ask: false, why: 'too_early' };
  if (state.demoEndedAt && now - state.demoEndedAt < REVIEW_RULES.demoQuietMs) return { ask: false, why: 'demo_quiet' };
  if (reason === 'recipe_saved' && state.savedRecipes < REVIEW_RULES.minSavedRecipes) return { ask: false, why: 'needs_more_saves' };
  const last = state.requests.length ? state.requests[state.requests.length - 1] : null;
  if (last && now - last < REVIEW_RULES.minDaysBetweenRequests * DAY_MS) return { ask: false, why: 'too_soon' };
  const yearAgo = now - 365 * DAY_MS;
  if (state.requests.filter(t => t > yearAgo).length >= REVIEW_RULES.maxRequestsPerYear) return { ask: false, why: 'yearly_cap' };
  return { ask: true };
}

/**
 * The store's "write a review" page for the Profile row. iOS opens the
 * review composer with `action=write-review`; Google Play has no such link,
 * so the listing itself opens. Only the real store hosts are accepted;
 * a missing URL means the row stays hidden on that platform.
 */
export function writeReviewUrl(os: string, storeUrl: string | null | undefined): string | null {
  if (typeof storeUrl !== 'string' || !storeUrl.trim()) return null;
  let url: URL;
  try { url = new URL(storeUrl.trim()); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (os === 'ios') {
    if (url.hostname !== 'apps.apple.com' && url.hostname !== 'itunes.apple.com') return null;
    if (!/\/id\d{6,12}\/?$/.test(url.pathname)) return null;
    url.searchParams.set('action', 'write-review');
    return url.toString();
  }
  if (os === 'android') {
    if (url.hostname !== 'play.google.com') return null;
    if (!/^[A-Za-z][\w]*(\.[A-Za-z][\w]*)+$/.test(url.searchParams.get('id') || '')) return null;
    return url.toString();
  }
  return null;
}
