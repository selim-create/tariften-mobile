import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRootNavigationState, useRouter } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { useAuth } from '../../context/AuthContext';
import {
  INBOX_PATH, isEnabled, normalizeTarget, promptDecision, routeForNotification,
} from '../../lib/notifications-core';
import { fetchNotifications, markNotificationsRead } from '../../lib/notifications-api';
import {
  configureForegroundPresentation, getImportPromptDeclinedAt, getNotificationPermission, getPushPreference,
  markImportPromptDeclined, notificationsModule, openNotificationSettings, requestNotificationPermission,
  setPushPreference, syncPushRegistration,
} from '../../lib/notifications';
import InAppBanner, { type BannerContent } from './InAppBanner';
import NotifyPromptSheet from './NotifyPromptSheet';

export type PushStatus = 'loading' | 'on' | 'off' | 'unavailable';
export type ToggleResult = 'on' | 'off' | 'denied' | 'needs_settings' | 'unavailable';

type NotificationsContextValue = {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  refreshUnread: () => Promise<void>;
  pushStatus: PushStatus;
  refreshPushStatus: () => Promise<void>;
  /** Profile toggle. Turning on may show the OS prompt (or point to Settings). */
  setPushEnabled: (on: boolean) => Promise<ToggleResult>;
  /** Called right after a social video import job starts. Shows the explanation sheet when due. */
  offerAfterImport: () => void;
  /** Marks one notification read on Core and updates the badge. */
  markRead: (id: number) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const UNREAD_REFRESH_MS = 30 * 1000;

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const navReady = !!useRootNavigationState()?.key;
  const userKey = user ? String(user.id) : null;

  const [unreadCount, setUnreadCount] = useState(0);
  const [pushStatus, setPushStatus] = useState<PushStatus>('loading');
  const [banner, setBanner] = useState<BannerContent | null>(null);
  const [promptVisible, setPromptVisible] = useState(false);
  const [pendingResponse, setPendingResponse] = useState<NotificationResponse | null>(null);
  const handled = useRef(new Set<string>());
  const lastUnreadFetch = useRef(0);
  const authRef = useRef<{ token: string | null; userKey: string | null }>({ token, userKey });
  authRef.current = { token, userKey };
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const refreshUnread = useCallback(async () => {
    const auth = authRef.current.token;
    if (!auth) { setUnreadCount(0); return; }
    lastUnreadFetch.current = Date.now();
    try {
      const page = await fetchNotifications(auth, 1, 1);
      if (authRef.current.token === auth) setUnreadCount(page.unreadCount);
    } catch { /* keep the last known badge */ }
  }, []);

  const refreshPushStatus = useCallback(async () => {
    const [permission, preference] = await Promise.all([getNotificationPermission(), getPushPreference()]);
    if (permission.status === 'unavailable') setPushStatus('unavailable');
    else setPushStatus(isEnabled(preference, permission.status) ? 'on' : 'off');
  }, []);

  const markRead = useCallback(async (id: number) => {
    const auth = authRef.current.token;
    if (!auth) return;
    try {
      const count = await markNotificationsRead(auth, { ids: [id] });
      if (count !== null && authRef.current.token === auth) setUnreadCount(count);
    } catch { /* the inbox shows it unread; harmless */ }
  }, []);

  // Launch: configure foreground presentation and read (never request) the permission.
  useEffect(() => {
    configureForegroundPresentation();
    void refreshPushStatus();
  }, [refreshPushStatus]);

  // Sign-in / account switch / launch with a stored session: refresh token on Core and the badge.
  useEffect(() => {
    if (isLoading) return;
    if (!token || !userKey) { setUnreadCount(0); return; }
    void syncPushRegistration(token, userKey, { force: true });
    void refreshUnread();
  }, [token, userKey, isLoading, refreshUnread]);

  // Back in the foreground: badge (throttled) and a non-forced token refresh.
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      void refreshPushStatus();
      const { token: auth, userKey: key } = authRef.current;
      if (!auth) return;
      void syncPushRegistration(auth, key);
      if (Date.now() - lastUnreadFetch.current > UNREAD_REFRESH_MS) void refreshUnread();
    });
    return () => sub.remove();
  }, [refreshPushStatus, refreshUnread]);

  // Native listeners: token rotation, foreground arrival, taps (warm), and the tap that launched the app (cold).
  useEffect(() => {
    const N = notificationsModule();
    if (!N) return;
    const tokenSub = N.addPushTokenListener(() => {
      const { token: auth, userKey: key } = authRef.current;
      if (auth) void syncPushRegistration(auth, key, { force: true });
    });
    const receivedSub = N.addNotificationReceivedListener(notification => {
      const content = notification.request.content;
      void refreshUnread();
      if (pathRef.current === INBOX_PATH) return; // the list itself refreshes
      setBanner({
        key: notification.request.identifier,
        title: content.title || 'Tariften',
        body: content.body || '',
        data: content.data,
      });
    });
    const responseSub = N.addNotificationResponseReceivedListener(response => setPendingResponse(response));
    N.getLastNotificationResponseAsync()
      .then(response => { if (response) setPendingResponse(response); })
      .catch(() => undefined);
    return () => { tokenSub.remove(); receivedSub.remove(); responseSub.remove(); };
  }, [refreshUnread]);

  // Route a tap once navigation and the stored session are ready.
  useEffect(() => {
    if (!pendingResponse || !navReady || isLoading) return;
    const N = notificationsModule();
    const response = pendingResponse;
    setPendingResponse(null);
    if (N && response.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current.has(id)) return;
    handled.current.add(id);
    const data = response.notification.request.content.data;
    setBanner(null);
    router.push(routeForNotification(data));
    const notificationId = normalizeTarget(data).notificationId;
    if (notificationId) void markRead(notificationId);
    N?.clearLastNotificationResponseAsync().catch(() => undefined);
  }, [pendingResponse, navReady, isLoading, router, markRead]);

  const openBanner = useCallback((content: BannerContent) => {
    setBanner(null);
    router.push(routeForNotification(content.data));
    const notificationId = normalizeTarget(content.data).notificationId;
    if (notificationId) void markRead(notificationId);
  }, [router, markRead]);

  const offerAfterImport = useCallback(() => {
    void (async () => {
      const [permission, preference, declinedAt] = await Promise.all([
        getNotificationPermission(), getPushPreference(), getImportPromptDeclinedAt(),
      ]);
      const decision = promptDecision({
        moment: 'import_started', permission: permission.status, canAskAgain: permission.canAskAgain,
        preference, declinedAt, now: Date.now(),
      });
      if (decision === 'sheet') { setPromptVisible(true); return; }
      const { token: auth, userKey: key } = authRef.current;
      if (permission.status === 'granted' && auth) void syncPushRegistration(auth, key);
    })();
  }, []);

  const acceptPrompt = useCallback(async () => {
    setPromptVisible(false);
    const permission = await requestNotificationPermission();
    if (permission.status === 'granted') {
      await setPushPreference(true);
      const { token: auth, userKey: key } = authRef.current;
      if (auth) await syncPushRegistration(auth, key, { force: true });
    } else {
      await markImportPromptDeclined();
    }
    await refreshPushStatus();
  }, [refreshPushStatus]);

  const dismissBanner = useCallback(() => setBanner(null), []);

  const declinePrompt = useCallback(() => {
    setPromptVisible(false);
    void markImportPromptDeclined();
  }, []);

  const setPushEnabled = useCallback(async (on: boolean): Promise<ToggleResult> => {
    const { token: auth, userKey: key } = authRef.current;
    if (!on) {
      await setPushPreference(false);
      if (auth) await syncPushRegistration(auth, key, { force: true }); // DELETE on Core
      await refreshPushStatus();
      return 'off';
    }
    let permission = await getNotificationPermission();
    if (permission.status === 'unavailable') return 'unavailable';
    const decision = promptDecision({
      moment: 'settings_toggle', permission: permission.status, canAskAgain: permission.canAskAgain,
      preference: true, declinedAt: null, now: Date.now(),
    });
    if (decision === 'settings') return 'needs_settings';
    if (decision === 'os') permission = await requestNotificationPermission();
    if (permission.status !== 'granted') { await refreshPushStatus(); return 'denied'; }
    await setPushPreference(true);
    if (auth) await syncPushRegistration(auth, key, { force: true });
    await refreshPushStatus();
    return 'on';
  }, [refreshPushStatus]);

  const value = useMemo<NotificationsContextValue>(() => ({
    unreadCount, setUnreadCount, refreshUnread, pushStatus, refreshPushStatus, setPushEnabled, offerAfterImport, markRead,
  }), [unreadCount, refreshUnread, pushStatus, refreshPushStatus, setPushEnabled, offerAfterImport, markRead]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <InAppBanner content={banner} onPress={openBanner} onDismiss={dismissBanner} />
      <NotifyPromptSheet visible={promptVisible} onAccept={() => { void acceptPrompt(); }} onDecline={declinePrompt} />
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const value = useContext(NotificationsContext);
  if (!value) throw new Error('useNotifications must be used within NotificationsProvider');
  return value;
}

export { openNotificationSettings };
