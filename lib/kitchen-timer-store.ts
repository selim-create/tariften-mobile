/**
 * Kitchen timers for the Mutfak Rehberi tools (egg, pasta). Only the end time
 * is kept, so a timer survives backgrounding, leaving the screen and, through
 * SecureStore, an app restart: on return it shows what is left, or "hazır".
 *
 * A local "süre doldu" notification is scheduled only when expo-notifications
 * is in the build AND permission is already granted (and not turned off in
 * profile). This file never asks for permission.
 */
import { Platform, Vibration } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  guideToolBySlug, parseStoredTimer, startTimer, type KitchenTimer, type TimerKind,
} from './guide-tools';
import { ANDROID_CHANNEL_ID, getNotificationPermission, getPushPreference, notificationsModule } from './notifications';

const STORE_KEY = 'tariften_kitchen_timers_v1';
const KINDS: TimerKind[] = ['egg', 'pasta'];
/** One id per timer run: the provider dedupes taps by id, so a reused id would swallow the next tap. */
const notificationId = (timer: KitchenTimer) => `tariften-kitchen-timer-${timer.kind}-${timer.endsAt}`;
const TOOL_SLUG: Record<TimerKind, string> = { egg: 'yumurta', pasta: 'makarna' };

type State = Partial<Record<TimerKind, KitchenTimer>>;

let state: State = {};
let hydrated = false;
let hydrating: Promise<void> | null = null;
const listeners = new Set<() => void>();
/** endsAt of timers whose "done" feedback already ran (one buzz, even with two screens mounted). */
const alerted = new Map<TimerKind, number>();

function emit() { listeners.forEach(fn => fn()); }

async function persist() {
  try {
    const value = JSON.stringify(state);
    if (value === '{}') await SecureStore.deleteItemAsync(STORE_KEY);
    else await SecureStore.setItemAsync(STORE_KEY, value);
  } catch { /* best effort: the timer still runs in memory */ }
}

export function hydrateKitchenTimers(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydrating) return hydrating;
  hydrating = (async () => {
    let raw: string | null = null;
    try { raw = await SecureStore.getItemAsync(STORE_KEY); } catch { raw = null; }
    let parsed: Record<string, unknown> = {};
    try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }
    const now = Date.now();
    for (const kind of KINDS) {
      if (state[kind]) continue; // a timer started before hydration wins
      const timer = parseStoredTimer(parsed?.[kind], now);
      if (timer && timer.kind === kind) {
        state[kind] = timer;
        // Finished while the app was closed: the notification already did its job.
        if (timer.endsAt <= now) alerted.set(kind, timer.endsAt);
      }
    }
    hydrated = true;
    hydrating = null;
    emit();
  })();
  return hydrating;
}

export function getKitchenTimer(kind: TimerKind): KitchenTimer | null {
  return state[kind] || null;
}

export function isKitchenTimersHydrated(): boolean {
  return hydrated;
}

export function subscribeKitchenTimers(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function cancelNotification(timer: KitchenTimer | undefined) {
  const N = notificationsModule();
  if (!N || !timer) return;
  const id = notificationId(timer);
  try { await N.cancelScheduledNotificationAsync(id); } catch { /* none scheduled */ }
  try { await N.dismissNotificationAsync(id); } catch { /* not delivered */ }
}

/** Local notification at the end time; silently skipped without permission. */
async function scheduleNotification(timer: KitchenTimer, title: string, body: string) {
  const N = notificationsModule();
  if (!N) return;
  try {
    const [permission, preference] = await Promise.all([getNotificationPermission(), getPushPreference()]);
    if (permission.status !== 'granted' || preference === false) return;
    if (state[timer.kind]?.endsAt !== timer.endsAt || timer.endsAt <= Date.now()) return; // cancelled meanwhile
    const tool = guideToolBySlug(TOOL_SLUG[timer.kind]);
    await N.scheduleNotificationAsync({
      identifier: notificationId(timer),
      content: {
        title,
        body,
        sound: true,
        data: { type: 'kitchen_timer', url: `/rehber/araclar?arac=${tool?.slug || TOOL_SLUG[timer.kind]}` },
      },
      trigger: Platform.OS === 'android'
        ? { type: N.SchedulableTriggerInputTypes.DATE, date: timer.endsAt, channelId: ANDROID_CHANNEL_ID }
        : { type: N.SchedulableTriggerInputTypes.DATE, date: timer.endsAt },
    });
  } catch { /* the in-app countdown still works */ }
}

export function startKitchenTimer(kind: TimerKind, durationSec: number, label: string, notice: { title: string; body: string }): KitchenTimer | null {
  const timer = startTimer(kind, durationSec, label, Date.now());
  if (!timer) return null;
  const previous = state[kind];
  state = { ...state, [kind]: timer };
  alerted.delete(kind);
  emit();
  void (async () => {
    await cancelNotification(previous);
    await scheduleNotification(timer, notice.title, notice.body);
  })();
  void persist();
  return timer;
}

/** Stops a running timer or clears a finished one. */
export function clearKitchenTimer(kind: TimerKind): void {
  const previous = state[kind];
  if (!previous) return;
  const next = { ...state };
  delete next[kind];
  state = next;
  alerted.delete(kind);
  Vibration.cancel();
  emit();
  void cancelNotification(previous);
  void persist();
}

/**
 * Called by every mounted timer view when it sees the timer finish. Only the
 * first call per timer buzzes, and only if it finished in the last minute
 * (coming back after a long time just shows "hazır").
 */
export function signalKitchenTimerDone(kind: TimerKind, now = Date.now()): void {
  const timer = state[kind];
  if (!timer || timer.endsAt > now || alerted.get(kind) === timer.endsAt) return;
  alerted.set(kind, timer.endsAt);
  if (now - timer.endsAt <= 60_000) Vibration.vibrate([0, 400, 200, 400, 200, 400]);
}
