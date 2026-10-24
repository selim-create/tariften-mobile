/**
 * Native App Store / Google Play rating prompt (expo-store-review).
 *
 * One entry point for the app: `maybeAskForReview(reason)`, called right
 * after a happy moment (a recipe saved from any source, or "Pişirdim").
 * It never shows our own "do you like us?" question (Apple 5.6.1 / Google
 * Play anti-gating); it only asks the OS, which may still decide not to show
 * anything. The rules live in review-prompt-core.ts.
 *
 * A build without the native module (before `npm run ios:sim:rebuild`)
 * simply never asks; nothing crashes.
 */
import { AppState, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { requireOptionalNativeModule } from 'expo';
import type * as ExpoStoreReview from 'expo-store-review';
import {
  REVIEW_RULES, parseReviewState, reviewDecision, serializeReviewState, withDemoEnded, withFirstLaunch,
  withRequest, withSuccess, writeReviewUrl, type ReviewReason, type ReviewState,
} from './review-prompt-core';

export type { ReviewReason } from './review-prompt-core';

type StoreReviewModule = typeof ExpoStoreReview;

const KEY_STATE = 'tariften_review_state_v1';

let cachedModule: StoreReviewModule | null | undefined;
/** expo-store-review, or null on web / a native build that does not contain it yet. */
function storeReviewModule(): StoreReviewModule | null {
  if (cachedModule !== undefined) return cachedModule;
  cachedModule = null;
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    try {
      // The package calls requireNativeModule at import time: check first so an
      // older binary keeps running until it is rebuilt.
      if (requireOptionalNativeModule('ExpoStoreReview')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        cachedModule = require('expo-store-review') as StoreReviewModule;
      }
    } catch {
      cachedModule = null;
    }
  }
  return cachedModule;
}

async function loadState(): Promise<ReviewState> {
  try { return parseReviewState(await SecureStore.getItemAsync(KEY_STATE)); } catch { return parseReviewState(null); }
}
async function saveState(state: ReviewState): Promise<void> {
  try { await SecureStore.setItemAsync(KEY_STATE, serializeReviewState(state)); } catch { /* best effort */ }
}

// Serialise read-modify-write so two quick successes never lose a count.
let queue: Promise<unknown> = Promise.resolve();
function update(change: (state: ReviewState) => ReviewState): Promise<ReviewState> {
  const run = queue.then(async () => {
    const next = change(await loadState());
    await saveState(next);
    return next;
  });
  queue = run.catch(() => undefined);
  return run;
}

// ---- holds: sheets and the onboarding keep the prompt away ----------------------------------

const holds = new Set<symbol>();
let onboardingHolds = 0;

/**
 * Keeps the review prompt away while something of ours is on screen (a sheet,
 * the onboarding). Returns the release function; safe to call twice.
 */
export function holdReviewPrompt(kind: 'sheet' | 'onboarding' = 'sheet'): () => void {
  const id = Symbol(kind);
  holds.add(id);
  if (kind === 'onboarding') onboardingHolds += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds.delete(id);
    if (kind === 'onboarding') onboardingHolds = Math.max(0, onboardingHolds - 1);
  };
}

// ---- lifecycle notes -------------------------------------------------------------------------

/** App start: remembers the first launch on this device (only once). */
export function recordFirstLaunch(): void {
  void update(state => withFirstLaunch(state, Date.now())).catch(() => undefined);
}

/** The onboarding demo ended (finished or skipped). `first` = the post-sign-up run. */
export function noteDemoEnded(first: boolean): void {
  void update(state => withDemoEnded(state, Date.now(), first)).catch(() => undefined);
}

// ---- the one entry point ---------------------------------------------------------------------

let inFlight = false;

/**
 * Call right after a success the member sees (never from the onboarding demo).
 * Counts the moment, and when every rule allows, waits ~1.5 s for the
 * success UI to settle and asks the OS for its native rating sheet.
 */
export function maybeAskForReview(reason: ReviewReason): void {
  void (async () => {
    try {
      const counted = await update(state => withSuccess(state, reason));
      const module = storeReviewModule();
      if (!module || inFlight) return;
      const decide = (state: ReviewState, available: boolean) => reviewDecision({
        state, reason, now: Date.now(), available,
        onboardingActive: onboardingHolds > 0,
        busy: holds.size > 0 || AppState.currentState !== 'active',
      });
      if (!decide(counted, true).ask) return;
      inFlight = true;
      try {
        if (!(await module.isAvailableAsync())) return;
        await new Promise(resolve => setTimeout(resolve, REVIEW_RULES.delayMs));
        // Re-check after the delay: a sheet may have opened or the app left the foreground.
        if (!decide(await loadState(), true).ask) return;
        // Record first: a crash inside the OS sheet must never lead to asking again soon.
        await update(state => withRequest(state, Date.now()));
        await module.requestReview();
      } finally {
        inFlight = false;
      }
    } catch { /* a rating prompt is never worth an error */ }
  })();
}

// ---- Profile row: "Tariften'i değerlendir" ---------------------------------------------------

/**
 * The store's write-review page, from `ios.appStoreUrl` / `android.playStoreUrl`
 * in app.json via StoreReview.storeUrl(). null hides the Profile row.
 */
export function storeReviewPageUrl(): string | null {
  const module = storeReviewModule();
  if (!module) return null;
  try { return writeReviewUrl(Platform.OS, module.storeUrl()); } catch { return null; }
}
