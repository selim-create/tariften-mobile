/**
 * Per-account "seen" flag for the social onboarding, kept like the app's
 * other device flags (expo-secure-store). Rules: lib/onboarding-core.ts.
 */
import * as SecureStore from 'expo-secure-store';
import { seenKey, shouldShowSocialOnboarding } from './onboarding-core';

export async function hasSeenSocialOnboarding(userId: number): Promise<boolean> {
  const key = seenKey(userId);
  if (!key) return true;
  try { return !!(await SecureStore.getItemAsync(key)); } catch { return true; }
}

export async function markSocialOnboardingSeen(userId: number | null | undefined): Promise<void> {
  const key = userId ? seenKey(userId) : null;
  if (!key) return;
  try { await SecureStore.setItemAsync(key, String(Date.now())); } catch { /* best effort */ }
}

/** After the kitchen profile step of a brand-new account (welcome=1). */
export async function shouldOfferWelcomeOnboarding(userId: number | null | undefined): Promise<boolean> {
  if (!userId) return false;
  return shouldShowSocialOnboarding({ entry: 'welcome', userId, seen: await hasSeenSocialOnboarding(userId) });
}
