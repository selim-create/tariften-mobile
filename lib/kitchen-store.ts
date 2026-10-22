/**
 * "Bu Hafta" plan and "Alışveriş" list.
 *
 * Every change is saved first as a small JSON file per account on the phone
 * (localStorage on web preview), so the lists work offline. For signed-in
 * members the same document is kept on the account (Core /me/kitchen) and
 * synced in the background: three-way merge against the last synced copy, a
 * revision check on write, retry on conflict. Shopping rows are always rebuilt
 * from the recipes' own ingredient rows, so nothing is invented or estimated.
 */
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { EMPTY_DOC, mergeKitchen, sameKitchen } from './kitchen-merge';
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
  scheduleSync(1500);
}

const isEmpty = (s: KitchenState) => !s.plan.length && !s.shopping.length && !s.manual.length;

/** Switch to the signed-in account's file (or the guest file). */
export async function loadKitchen(userId?: number | null) {
  const who = userId ? `u${userId}` : 'guest';
  if (loadedFor === who) return state;
  owner = who;
  loadedFor = who;
  const raw = await readRaw(who);
  try { state = raw ? sanitize(JSON.parse(raw)) : EMPTY; } catch { state = EMPTY; }
  syncMeta = await readSyncMeta(who);
  if (who !== 'guest' && isEmpty(state) && syncMeta.rev === 0) {
    // Things added before signing in move to the account once, then leave the guest file.
    const guestRaw = await readRaw('guest');
    let guest = EMPTY;
    try { guest = guestRaw ? sanitize(JSON.parse(guestRaw)) : EMPTY; } catch { guest = EMPTY; }
    if (!isEmpty(guest)) {
      state = guest;
      await writeRaw(who, JSON.stringify(state));
      await writeRaw('guest', JSON.stringify(EMPTY));
    }
  }
  emit();
  scheduleSync(0);
  return state;
}

/* ------------------------------------------------------------------ sync */

const KITCHEN_API = 'https://api.tariften.com/wp-json/tariften/v1/me/kitchen';
type ServerDoc = { state: KitchenState; rev: number };
type SyncMeta = { rev: number; base: KitchenState | null };

let authToken: string | null = null;
let syncMeta: SyncMeta = { rev: 0, base: null };
let syncing = false;
let syncAgain = false;
let syncTimer: ReturnType<typeof setTimeout> | null = null;

const syncFile = (who: string) => `sync-${who}`;

async function readSyncMeta(who: string): Promise<SyncMeta> {
  if (who === 'guest') return { rev: 0, base: null };
  const raw = await readRaw(syncFile(who));
  try {
    const value = raw ? JSON.parse(raw) : null;
    return value && Number.isInteger(value.rev) && value.rev >= 0
      ? { rev: value.rev, base: value.base ? sanitize(value.base) : null }
      : { rev: 0, base: null };
  } catch {
    return { rev: 0, base: null };
  }
}

/** Called by AuthContext whenever the signed-in token changes (null on sign-out). */
export function setKitchenAuth(token: string | null) {
  authToken = token;
  if (token) scheduleSync(0);
}

function scheduleSync(delay: number) {
  if (!authToken || owner === 'guest') return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; void syncKitchen(); }, delay);
}

async function request(method: 'GET' | 'PUT', token: string, body?: unknown) {
  const res = await fetch(KITCHEN_API, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

function serverDoc(value: unknown): ServerDoc | null {
  const v = value as { state?: unknown; rev?: unknown } | null;
  return v && Number.isInteger(v.rev) ? { state: sanitize(v.state), rev: v.rev as number } : null;
}

/**
 * One sync round: fetch, merge, write with the revision we saw; on 409 merge
 * again with the newer copy (up to three times). Network errors leave the
 * local copy as it is; the next change, sign-in or app focus tries again.
 */
export async function syncKitchen(): Promise<void> {
  const token = authToken;
  const who = owner;
  if (!token || who === 'guest') return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  try {
    const snapshot = state;
    const got = await request('GET', token);
    let remote = got.status === 200 ? serverDoc(got.data) : null;
    for (let attempt = 0; remote && attempt < 3; attempt++) {
      if (owner !== who) return;
      const merged = sanitize(mergeKitchen(syncMeta.base ?? EMPTY_DOC, snapshot, remote.state));
      if (sameKitchen(merged, remote.state)) { adopt(remote, snapshot, who); return; }
      const put = await request('PUT', token, { state: merged, base_rev: remote.rev });
      if (put.status === 200) { const saved = serverDoc(put.data); if (saved) adopt(saved, snapshot, who); return; }
      remote = put.status === 409 ? serverDoc(put.data?.data?.current) : null;
    }
  } catch {
    /* offline or server error: local copy stays, next trigger retries */
  } finally {
    syncing = false;
    if (syncAgain) { syncAgain = false; scheduleSync(1500); }
  }
}

function adopt(server: ServerDoc, snapshot: KitchenState, who: string) {
  if (owner !== who) return;
  // Keep anything changed on this phone while the request was in flight.
  const next = sameKitchen(state, snapshot) ? server.state : sanitize(mergeKitchen(snapshot, state, server.state));
  syncMeta = { rev: server.rev, base: server.state };
  void writeRaw(syncFile(who), JSON.stringify(syncMeta));
  if (!sameKitchen(next, state)) {
    state = next;
    emit();
    void writeRaw(who, JSON.stringify(next));
  }
  if (!sameKitchen(next, server.state)) syncAgain = true;
}

AppState.addEventListener('change', status => { if (status === 'active') scheduleSync(0); });

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
