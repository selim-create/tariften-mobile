/**
 * "Bu Hafta" plan and "Alışveriş" list, stored on this device.
 *
 * Kept deliberately simple and honest: everything the cook adds is saved as a
 * small JSON file per account on the phone (localStorage on web preview).
 * Shopping rows are always rebuilt from the recipes' own ingredient rows, so
 * nothing is invented or estimated.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { Ingredient } from './types';
import { buildShoppingList, type ShoppingItem } from './shopping-list';

export type PlannedRecipe = {
  id: string;            // unique entry id
  recipeId: number;
  slug: string;
  title: string;
  image?: string;
  day: string;           // YYYY-MM-DD (local)
  addedAt: number;
};

export type ShoppingSource = {
  recipeId: number;
  slug: string;
  title: string;
  servings?: number | null;
  ingredients: { name: string; amount: string; unit: string }[];
  addedAt: number;
};

export type ManualItem = { key: string; name: string; addedAt: number };

export type KitchenState = {
  version: 1;
  plan: PlannedRecipe[];
  shopping: ShoppingSource[];
  manual: ManualItem[];
  checked: string[];
};

const EMPTY: KitchenState = { version: 1, plan: [], shopping: [], manual: [], checked: [] };

let owner = 'guest';
let state: KitchenState = EMPTY;
let loadedFor: string | null = null;
const listeners = new Set<(s: KitchenState) => void>();

const fileName = (who: string) => `tariften-kitchen-${who.replace(/[^a-z0-9_-]/gi, '')}.json`;

async function readRaw(who: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(fileName(who)) ?? null;
    const uri = `${FileSystem.documentDirectory}${fileName(who)}`;
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? await FileSystem.readAsStringAsync(uri) : null;
  } catch {
    return null;
  }
}

async function writeRaw(who: string, value: string) {
  try {
    if (Platform.OS === 'web') { globalThis.localStorage?.setItem(fileName(who), value); return; }
    await FileSystem.writeAsStringAsync(`${FileSystem.documentDirectory}${fileName(who)}`, value);
  } catch {
    /* Saving is best effort; the list stays usable in memory. */
  }
}

function sanitize(raw: unknown): KitchenState {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const value = raw as Partial<KitchenState>;
  return {
    version: 1,
    plan: Array.isArray(value.plan) ? value.plan.filter(p => p && typeof p.slug === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.day)) : [],
    shopping: Array.isArray(value.shopping) ? value.shopping.filter(s => s && typeof s.title === 'string' && Array.isArray(s.ingredients)) : [],
    manual: Array.isArray(value.manual) ? value.manual.filter(m => m && typeof m.name === 'string') : [],
    checked: Array.isArray(value.checked) ? value.checked.filter(k => typeof k === 'string') : [],
  };
}

function emit() {
  for (const listener of listeners) listener(state);
}

function commit(next: KitchenState) {
  state = next;
  emit();
  void writeRaw(owner, JSON.stringify(next));
}

/** Switch to the signed-in account's file (or the guest file). */
export async function loadKitchen(userId?: number | null) {
  const who = userId ? `u${userId}` : 'guest';
  if (loadedFor === who) return state;
  owner = who;
  loadedFor = who;
  const raw = await readRaw(who);
  try { state = raw ? sanitize(JSON.parse(raw)) : EMPTY; } catch { state = EMPTY; }
  emit();
  return state;
}

export function useKitchen(userId?: number | null): KitchenState {
  const [snapshot, setSnapshot] = useState<KitchenState>(state);
  useEffect(() => {
    listeners.add(setSnapshot);
    void loadKitchen(userId);
    return () => { listeners.delete(setSnapshot); };
  }, [userId]);
  return snapshot;
}

/* ------------------------------------------------------------------ plan */

export function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday-first week containing `date`. */
export function weekDays(date = new Date()): Date[] {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export function addToPlan(recipe: { id: number; slug: string; title: string; image?: string }, day: string) {
  const entry: PlannedRecipe = {
    id: `${recipe.id}-${day}-${Date.now()}`, recipeId: recipe.id, slug: recipe.slug, title: recipe.title,
    image: recipe.image, day, addedAt: Date.now(),
  };
  commit({ ...state, plan: [...state.plan, entry] });
}

export function removeFromPlan(entryId: string) {
  commit({ ...state, plan: state.plan.filter(entry => entry.id !== entryId) });
}

/* -------------------------------------------------------------- shopping */

export function addRecipeToShopping(recipe: {
  id: number; slug: string; title: string; servings?: number | null; ingredients: Ingredient[] | undefined;
}) {
  const rows = (recipe.ingredients || [])
    .map(row => ({
      name: String(row.name ?? '').trim(),
      amount: String(row.amount ?? '').trim(),
      unit: String(row.unit ?? '').trim(),
    }))
    .filter(row => row.name);
  const source: ShoppingSource = {
    recipeId: recipe.id, slug: recipe.slug, title: recipe.title, servings: recipe.servings ?? null,
    ingredients: rows, addedAt: Date.now(),
  };
  commit({ ...state, shopping: [...state.shopping.filter(s => s.recipeId !== recipe.id), source] });
}

export function removeRecipeFromShopping(recipeId: number) {
  commit({ ...state, shopping: state.shopping.filter(s => s.recipeId !== recipeId) });
}

export function addManualItem(name: string) {
  const clean = name.trim().slice(0, 80);
  if (!clean) return;
  commit({ ...state, manual: [...state.manual, { key: `manual:${Date.now()}`, name: clean, addedAt: Date.now() }] });
}

export function removeManualItem(key: string) {
  commit({ ...state, manual: state.manual.filter(m => m.key !== key), checked: state.checked.filter(k => k !== key) });
}

export function toggleChecked(key: string) {
  const checked = state.checked.includes(key) ? state.checked.filter(k => k !== key) : [...state.checked, key];
  commit({ ...state, checked });
}

export function clearChecked() {
  const done = new Set(state.checked);
  commit({ ...state, manual: state.manual.filter(m => !done.has(m.key)), checked: [] });
}

export function isInShopping(recipeId: number, s: KitchenState = state) {
  return s.shopping.some(source => source.recipeId === recipeId);
}

/** Merged rows for the list screen (recipe rows summed safely + manual rows). */
export function shoppingRows(s: KitchenState): ShoppingItem[] {
  return buildShoppingList(s.shopping.map(source => ({ title: source.title, ingredients: source.ingredients })));
}
