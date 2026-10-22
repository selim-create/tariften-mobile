/**
 * Push notifications on the device (expo-notifications) + Core registration.
 *
 * Rules (see docs/NOTIFICATIONS_MOBILE.md):
 *  - The OS permission prompt is NEVER requested on app launch. Only
 *    `requestNotificationPermission()` asks, and only two places call it: the
 *    "Tarifin hazır olunca haber verelim mi?" sheet after a video import
 *    starts, and the profile toggle.
 *  - On launch / sign-in we only *read* the permission and, if already
 *    granted, refresh the Expo token on Core.
 *  - Sign-out DELETEs the token with the still-valid JWT.
 *  - A build without the native module (an older dev client) degrades to the
 *    in-app inbox only; it never crashes.
 */
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { requireOptionalNativeModule } from 'expo';
import type * as ExpoNotifications from 'expo-notifications';
import {
  isValidDeviceId, parseLastRegistration, planTokenSync,
  type LastRegistration, type PermissionStatus, type SyncAction,
} from './notifications-core';
import { deletePushToken, registerPushToken } from './notifications-api';

type NotificationsModule = typeof ExpoNotifications;

const KEY_DEVICE = 'tariften_push_device_id';
const KEY_PREF = 'tariften_push_pref';
const KEY_LAST = 'tariften_push_last';
const KEY_DECLINED = 'tariften_push_import_declined_at';

/** Android channel; also the FCM default channel in app.json (expo-notifications plugin). */
export const ANDROID_CHANNEL_ID = 'default';

let cachedModule: NotificationsModule | null | undefined;
/** expo-notifications, or null on web / a native build that does not contain it yet. */
export function notificationsModule(): NotificationsModule | null {
  if (cachedModule !== undefined) return cachedModule;
  cachedModule = null;
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    try {
      // requireNativeModule inside expo-notifications throws at import time on an
      // old binary; check first so the JS bundle still runs until the rebuild.
      if (requireOptionalNativeModule('ExpoPushTokenManager') && requireOptionalNativeModule('ExpoNotificationPermissionsModule')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        cachedModule = require('expo-notifications') as NotificationsModule;
      }
    } catch {
      cachedModule = null;
    }
  }
  return cachedModule;
}

export function pushSupported(): boolean {
  return notificationsModule() !== null;
}

async function readStore(key: string): Promise<string | null> {
  try { return await SecureStore.getItemAsync(key); } catch { return null; }
}
async function writeStore(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch { /* best effort */ }
}

/**
 * Foreground: no system banner or sound — NotificationsProvider shows a calm
 * in-app banner instead. The notification still lands in Notification Center.
 */
let handlerConfigured = false;
export function configureForegroundPresentation(): void {
  const N = notificationsModule();
  if (!N || handlerConfigured) return;
  handlerConfigured = true;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export type PermissionState = { status: PermissionStatus; canAskAgain: boolean };

/** Reads the permission; never prompts. */
export async function getNotificationPermission(): Promise<PermissionState> {
  const N = notificationsModule();
  if (!N) return { status: 'unavailable', canAskAgain: false };
  try {
    const p = await N.getPermissionsAsync();
    const iosProvisional = p.ios?.status === N.IosAuthorizationStatus.PROVISIONAL;
    const status: PermissionStatus = p.granted || iosProvisional ? 'granted' : p.status === 'denied' ? 'denied' : 'undetermined';
    return { status, canAskAgain: p.canAskAgain !== false };
  } catch {
    return { status: 'unavailable', canAskAgain: false };
  }
}

async function ensureAndroidChannel(N: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  // Android 13+ shows the permission prompt only once a channel exists.
  await N.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Tarif bildirimleri',
    description: 'Aktardığın tarif hazır olduğunda ya da kontrol beklediğinde.',
    importance: N.AndroidImportance.DEFAULT,
    lightColor: '#db4c3f',
    showBadge: true,
  }).catch(() => undefined);
}

/**
 * Shows the OS prompt. Call ONLY from the import sheet's "Haber ver" button or
 * the profile toggle (enforced by scripts/check-notifications.test.cjs).
 */
export async function requestNotificationPermission(): Promise<PermissionState> {
  const N = notificationsModule();
  if (!N) return { status: 'unavailable', canAskAgain: false };
  await ensureAndroidChannel(N);
  try {
    await N.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: true, allowSound: true } });
  } catch { /* fall through to a fresh read */ }
  return getNotificationPermission();
}

export function openNotificationSettings(): void {
  Linking.openSettings().catch(() => undefined);
}

/** null = never chosen; false = member turned push off in profile. */
export async function getPushPreference(): Promise<boolean | null> {
  const raw = await readStore(KEY_PREF);
  return raw === 'on' ? true : raw === 'off' ? false : null;
}
export async function setPushPreference(on: boolean): Promise<void> {
  await writeStore(KEY_PREF, on ? 'on' : 'off');
}

export async function getImportPromptDeclinedAt(): Promise<number | null> {
  const raw = Number(await readStore(KEY_DECLINED));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}
export async function markImportPromptDeclined(now = Date.now()): Promise<void> {
  await writeStore(KEY_DECLINED, String(now));
}

/** Stable random per-install id so Core can replace this device's old token. */
export async function getDeviceId(): Promise<string | null> {
  const existing = await readStore(KEY_DEVICE);
  if (isValidDeviceId(existing)) return existing;
  try {
    const id = randomUUID();
    await writeStore(KEY_DEVICE, id);
    return id;
  } catch {
    return null;
  }
}

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: unknown } } | undefined;
  const fromExtra = extra?.eas?.projectId;
  if (typeof fromExtra === 'string' && fromExtra) return fromExtra;
  const fromEas = Constants.easConfig?.projectId;
  return typeof fromEas === 'string' && fromEas ? fromEas : undefined;
}

async function currentExpoPushToken(N: NotificationsModule): Promise<string | null> {
  try {
    const result = await N.getExpoPushTokenAsync({ projectId: projectId() });
    return typeof result?.data === 'string' ? result.data : null;
  } catch {
    // Simulator without APNs, missing FCM credentials, offline: inbox still works.
    return null;
  }
}

let syncing: Promise<SyncAction> | null = null;

/**
 * Brings Core in line with the device. Never prompts. Safe to call often:
 * concurrent calls share one run, and a fresh registration is not re-sent
 * unless `force` (launch, sign-in, token change, toggle on).
 */
export function syncPushRegistration(authToken: string | null, userKey: string | null, options: { force?: boolean } = {}): Promise<SyncAction> {
  if (syncing && !options.force) return syncing;
  // A forced run (sign-in, token change) waits for the current one, then runs with its own inputs.
  const previous = syncing ?? Promise.resolve(null);
  const run: Promise<SyncAction> = previous.catch(() => null).then(async (): Promise<SyncAction> => {
    const N = notificationsModule();
    const [permission, preference, last] = await Promise.all([
      getNotificationPermission(), getPushPreference(), readStore(KEY_LAST).then(parseLastRegistration),
    ]);
    const enabled = !!N && permission.status === 'granted' && preference !== false;
    const pushToken = enabled && authToken && N ? await currentExpoPushToken(N) : null;
    const action = planTokenSync({
      signedIn: !!authToken, userKey, preference, permission: permission.status,
      pushToken, last, now: Date.now(), force: options.force,
    });
    if (!authToken) return action;
    try {
      if (action.kind === 'register' && userKey) {
        await registerPushToken(authToken, {
          token: action.token,
          platform: Platform.OS === 'ios' ? 'ios' : 'android',
          deviceId: await getDeviceId(),
        });
        const next: LastRegistration = { token: action.token, userKey, at: Date.now() };
        await writeStore(KEY_LAST, JSON.stringify(next));
      } else if (action.kind === 'unregister') {
        await deletePushToken(authToken, action.token);
        await writeStore(KEY_LAST, null);
      }
    } catch {
      // Network/Core errors: try again on the next foreground or sign-in.
    }
    return action;
  });
  syncing = run;
  run.finally(() => { if (syncing === run) syncing = null; }).catch(() => undefined);
  return run;
}

/**
 * Sign-out: remove this device's token from the account while the JWT is
 * still valid, then forget it locally. Bounded so sign-out never hangs.
 */
export async function unregisterPushOnSignOut(authToken: string | null): Promise<void> {
  const last = parseLastRegistration(await readStore(KEY_LAST));
  await writeStore(KEY_LAST, null);
  if (!authToken || !last) return;
  try { await deletePushToken(authToken, last.token, 4000); } catch { /* best effort */ }
}
