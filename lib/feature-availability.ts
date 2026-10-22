/**
 * Core has no public feature-flag endpoint for the photo/own-video flows.
 * When Core answers "feature off" (503 photo_recipe_unavailable /
 * video_upload_unavailable), we remember it for this app session so the "+"
 * menu shows "Yakında" instead of sending the member into a dead end.
 * Memory only: a new app launch asks Core again.
 */
import { useSyncExternalStore } from 'react';

export type MediaFeature = 'photo' | 'notebook' | 'own_video';

const unavailable = new Set<MediaFeature>();
const listeners = new Set<() => void>();
let snapshot = '';

function emit() {
  snapshot = [...unavailable].sort().join(',');
  listeners.forEach(listener => listener());
}

export function markFeatureUnavailable(feature: MediaFeature) {
  if (unavailable.has(feature)) return;
  unavailable.add(feature);
  // One Core flag drives both photo flows.
  if (feature === 'photo') unavailable.add('notebook');
  if (feature === 'notebook') unavailable.add('photo');
  emit();
}

export function markFeatureAvailable(feature: MediaFeature) {
  const before = unavailable.size;
  unavailable.delete(feature);
  if (feature === 'photo') unavailable.delete('notebook');
  if (feature === 'notebook') unavailable.delete('photo');
  if (unavailable.size !== before) emit();
}

export function isFeatureUnavailable(feature: MediaFeature) {
  return unavailable.has(feature);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Comma-separated snapshot; components test it with isFeatureUnavailable. */
export function useFeatureAvailability(): string {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
