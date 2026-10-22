'use strict';
/**
 * P15 push + in-app notifications: payload routing, permission gating ("never
 * on launch"), the push-token registration state machine, Core API shapes and
 * source contracts (sign-out DELETE, cold-start tap, no 6th tab, native guard).
 * Contract: tariften-core docs/NOTIFICATIONS.md (Core 1.0.51).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const out = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  cache.set(file, mod.exports);
  const localRequire = request => {
    if (request.startsWith('./')) return load(path.join(path.dirname(file), request.slice(2) + '.ts'));
    return {};
  };
  Function('module', 'exports', 'require', out)(mod, mod.exports, localRequire);
  cache.set(file, mod.exports);
  return mod.exports;
}
const core = load('lib/notifications-core.ts');
const api = load('lib/notifications-api.ts');

const TOKEN = 'ExponentPushToken[abcdefghijklmnop]';
const TOKEN2 = 'ExpoPushToken[zyxwvutsrqponmlk]';

// ---------------------------------------------------------------------------
// Routing

test('push payload routes: ready → recipe, review/failed → transfer screen for the job', () => {
  assert.equal(core.routeForNotification({ notification_id: 812, type: 'recipe_ready', recipe_slug: 'kuru-domatesli-gnocchi', job_id: 431, url: '/recipe/kuru-domatesli-gnocchi' }), '/recipe/kuru-domatesli-gnocchi');
  assert.equal(core.routeForNotification({ notification_id: 809, type: 'recipe_review', recipe_slug: null, job_id: 428, url: '/recipe/aktar?job=428' }), '/recipe/aktar?job=428');
  assert.equal(core.routeForNotification({ notification_id: 7, type: 'recipe_failed', job_id: '55' }), '/recipe/aktar?job=55', 'FCM may stringify ids');
  assert.equal(core.routeForNotification({ type: 'recipe_ready', recipe_slug: 'mercimek-çorbası' }), `/recipe/${encodeURIComponent('mercimek-çorbası')}`, 'Turkish slug is encoded');
  assert.equal(core.routeForNotification({ type: 'recipe_ready', recipe_slug: 'with space' }), '/notifications', 'not a slug');
});

test('inbox items route through target when data is thin', () => {
  assert.equal(core.routeForNotification({ id: 1, type: 'recipe_ready', target: { type: 'recipe', id: 5310, slug: 'fırın-makarna' }, data: { type: 'recipe_ready' } }), `/recipe/${encodeURIComponent('fırın-makarna')}`);
  assert.equal(core.routeForNotification({ id: 2, type: 'recipe_review', target: { type: 'video_job', id: 428, slug: null }, data: {} }), '/recipe/aktar?job=428');
});

test('unknown types or unsafe data fall back to known app routes, then the inbox', () => {
  assert.equal(core.routeForNotification({ type: 'promo', url: '/recipe/aktar?job=9' }), '/recipe/aktar?job=9');
  assert.equal(core.routeForNotification({ type: 'promo', url: '/recipe/menemen' }), '/recipe/menemen');
  for (const url of ['https://evil.test/recipe/x', '/recipe/aktar?job=0', '/recipe/x/../../login', '//evil.test', '/login', '/recipe/import', 'javascript:alert(1)']) {
    assert.equal(core.routeForNotification({ type: 'promo', url }), core.INBOX_PATH, url);
  }
  assert.equal(core.routeForNotification({ type: 'recipe_ready' }), '/notifications');
  assert.equal(core.routeForNotification({ type: 'recipe_review', job_id: -3 }), '/notifications');
  assert.equal(core.routeForNotification(null), '/notifications');
  assert.equal(core.routeForNotification({ type: 'recipe_ready', recipe_slug: '../login' }), '/notifications');
});

test('normalizeTarget reads notification ids from push data and inbox items', () => {
  assert.equal(core.normalizeTarget({ notification_id: '812', type: 'recipe_ready' }).notificationId, 812);
  assert.equal(core.normalizeTarget({ id: 809, type: 'recipe_review', data: { job_id: 428 } }).notificationId, 809);
  assert.equal(core.normalizeTarget({ id: 5, type: 'recipe_ready' }).notificationId, null, 'a bare id in push data is not trusted as a notification id');
});

// ---------------------------------------------------------------------------
// Permission gating

const base = { permission: 'undetermined', canAskAgain: true, preference: null, declinedAt: null, now: 1_800_000_000_000 };

test('the OS prompt is never shown on launch, in any state', () => {
  for (const permission of ['granted', 'denied', 'undetermined', 'unavailable']) {
    for (const canAskAgain of [true, false]) {
      for (const preference of [null, true, false]) {
        assert.equal(core.promptDecision({ ...base, moment: 'launch', permission, canAskAgain, preference }), 'none');
      }
    }
  }
});

test('after a video import starts: explanation sheet once, then quiet', () => {
  assert.equal(core.promptDecision({ ...base, moment: 'import_started' }), 'sheet');
  assert.equal(core.promptDecision({ ...base, moment: 'import_started', permission: 'granted' }), 'none');
  assert.equal(core.promptDecision({ ...base, moment: 'import_started', preference: false }), 'none', 'turned off in profile');
  assert.equal(core.promptDecision({ ...base, moment: 'import_started', permission: 'denied', canAskAgain: false }), 'none', 'never nag a hard deny');
  assert.equal(core.promptDecision({ ...base, moment: 'import_started', declinedAt: base.now - 24 * 3600e3 }), 'none', '"Şimdi değil" cooldown');
  assert.equal(core.promptDecision({ ...base, moment: 'import_started', declinedAt: base.now - core.IMPORT_PROMPT_COOLDOWN_MS - 1 }), 'sheet');
  assert.equal(core.promptDecision({ ...base, moment: 'import_started', permission: 'unavailable' }), 'none');
});

test('profile toggle: OS prompt when allowed, system settings otherwise', () => {
  assert.equal(core.promptDecision({ ...base, moment: 'settings_toggle' }), 'os');
  assert.equal(core.promptDecision({ ...base, moment: 'settings_toggle', permission: 'denied', canAskAgain: false }), 'settings');
  assert.equal(core.promptDecision({ ...base, moment: 'settings_toggle', permission: 'granted' }), 'none');
  assert.equal(core.promptDecision({ ...base, moment: 'settings_toggle', permission: 'denied', canAskAgain: true, declinedAt: base.now }), 'os', 'explicit toggle ignores the import cooldown');
});

// ---------------------------------------------------------------------------
// Token registration state machine

const now = 1_800_000_000_000;
const signedIn = { signedIn: true, userKey: '42', preference: null, permission: 'granted', pushToken: TOKEN, last: null, now };

test('registers when enabled and never registered; skips when signed out', () => {
  assert.deepEqual(core.planTokenSync(signedIn), { kind: 'register', token: TOKEN });
  assert.deepEqual(core.planTokenSync({ ...signedIn, signedIn: false, userKey: null }), { kind: 'none', reason: 'signed_out' });
});

test('fresh registration is not re-sent; force, token change, account switch and age re-send', () => {
  const last = { token: TOKEN, userKey: '42', at: now - 60_000 };
  assert.deepEqual(core.planTokenSync({ ...signedIn, last }), { kind: 'none', reason: 'fresh' });
  assert.deepEqual(core.planTokenSync({ ...signedIn, last, force: true }), { kind: 'register', token: TOKEN });
  assert.deepEqual(core.planTokenSync({ ...signedIn, last, pushToken: TOKEN2 }), { kind: 'register', token: TOKEN2 });
  assert.deepEqual(core.planTokenSync({ ...signedIn, last, userKey: '43' }), { kind: 'register', token: TOKEN });
  assert.deepEqual(core.planTokenSync({ ...signedIn, last: { ...last, at: now - core.REGISTRATION_REFRESH_MS } }), { kind: 'register', token: TOKEN });
  assert.deepEqual(core.planTokenSync({ ...signedIn, last: { ...last, at: now + 60_000 } }), { kind: 'register', token: TOKEN }, 'clock skew re-sends');
});

test('turning push off (or losing permission) DELETEs the last registered token', () => {
  const last = { token: TOKEN, userKey: '42', at: now };
  assert.deepEqual(core.planTokenSync({ ...signedIn, preference: false, last }), { kind: 'unregister', token: TOKEN });
  assert.deepEqual(core.planTokenSync({ ...signedIn, permission: 'denied', last }), { kind: 'unregister', token: TOKEN });
  assert.deepEqual(core.planTokenSync({ ...signedIn, preference: false }), { kind: 'none', reason: 'disabled' });
});

test('no token or a malformed token never reaches Core', () => {
  assert.deepEqual(core.planTokenSync({ ...signedIn, pushToken: null }), { kind: 'none', reason: 'no_token' });
  assert.deepEqual(core.planTokenSync({ ...signedIn, pushToken: 'ExponentPushToken[short]' }), { kind: 'none', reason: 'no_token' });
});

test('stored registration parsing is defensive', () => {
  assert.deepEqual(core.parseLastRegistration(JSON.stringify({ token: TOKEN, userKey: '42', at: 5 })), { token: TOKEN, userKey: '42', at: 5 });
  for (const raw of [null, '', '{', '[]', JSON.stringify({ token: 'x', userKey: '42', at: 5 }), JSON.stringify({ token: TOKEN, userKey: '', at: 5 })]) {
    assert.equal(core.parseLastRegistration(raw), null, String(raw));
  }
  assert.equal(core.isValidDeviceId('6F1C2A3B-1111-4222-8333-944455556666'), true);
  assert.equal(core.isValidDeviceId('bad id'), false);
});

// ---------------------------------------------------------------------------
// Inbox parsing + Turkish relative time

test('inbox page parses the Core sample and computes routes and unread', () => {
  const page = core.parseInboxPage({
    success: true,
    items: [
      { id: 812, type: 'recipe_ready', title: 'Tarifin hazır: Kuru Domatesli Gnocchi', body: 'Aktardığın tarif yayımlandı.',
        target: { type: 'recipe', id: 5310, slug: 'kuru-domatesli-gnocchi' },
        data: { type: 'recipe_ready', job_id: 431, job_status: 'published', recipe_slug: 'kuru-domatesli-gnocchi', recipe_id: 5310, url: '/recipe/kuru-domatesli-gnocchi' },
        created_at: '2026-10-22T11:04:51Z', read_at: null, read: false },
      { id: 809, type: 'recipe_review', title: 'Tarifin kontrolünü bekliyor', body: 'Fırın Makarna hazır.',
        target: { type: 'video_job', id: 428, slug: null },
        data: { type: 'recipe_review', job_id: 428, job_status: 'needs_review', recipe_slug: null, url: '/recipe/aktar?job=428' },
        created_at: '2026-10-22T10:41:07Z', read_at: '2026-10-22T10:45:00Z', read: true },
      { id: 0, title: 'bozuk' },
    ],
    page: 1, per_page: 20, total: 2, total_pages: 1, unread_count: 1,
  });
  assert.equal(page.items.length, 2);
  assert.equal(page.unreadCount, 1);
  assert.deepEqual(page.items.map(i => [i.id, i.read, i.path]), [
    [812, false, '/recipe/kuru-domatesli-gnocchi'],
    [809, true, '/recipe/aktar?job=428'],
  ]);
  assert.throws(() => core.parseInboxPage({ success: true }), /beklenen biçimde/);
});

test('badge label and relative Turkish times', () => {
  assert.equal(core.badgeLabel(0), '');
  assert.equal(core.badgeLabel(3), '3');
  assert.equal(core.badgeLabel(12), '9+');
  const t = Date.parse('2026-10-22T15:00:00');
  const iso = d => new Date(d).toISOString();
  assert.equal(core.relativeTimeTr(iso(t - 20e3), t), 'şimdi');
  assert.equal(core.relativeTimeTr(iso(t - 5 * 60e3), t), '5 dk önce');
  assert.equal(core.relativeTimeTr(iso(t - 3 * 3600e3), t), '3 sa önce');
  assert.equal(core.relativeTimeTr(iso(Date.parse('2026-10-21T20:00:00')), t), 'dün');
  assert.equal(core.relativeTimeTr(iso(Date.parse('2026-10-18T12:00:00')), t), '4 gün önce');
  assert.equal(core.relativeTimeTr(iso(Date.parse('2026-10-02T12:00:00')), t), '2 Ekim');
  assert.equal(core.relativeTimeTr(iso(Date.parse('2025-08-30T12:00:00')), t), '30 Ağustos 2025');
  assert.equal(core.relativeTimeTr('not a date', t), '');
});

// ---------------------------------------------------------------------------
// Core API shapes (stubbed fetch)

function stubFetch(responses) {
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift() || { status: 200, json: { success: true } };
    return { ok: next.status >= 200 && next.status < 300, status: next.status, json: async () => next.json };
  };
  return calls;
}

test('POST/DELETE /me/push-tokens send exactly the contract fields', async () => {
  const calls = stubFetch([{ status: 201, json: { success: true, created: true } }, { status: 200, json: { success: true, deleted: true } }]);
  await api.registerPushToken('jwt', { token: TOKEN, platform: 'ios', deviceId: 'bad id' });
  assert.equal(calls[0].url, 'https://api.tariften.com/wp-json/tariften/v1/me/push-tokens');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer jwt');
  assert.deepEqual(calls[0].body, { token: TOKEN, platform: 'ios' }, 'invalid device_id is omitted, not sent');
  assert.equal(await api.deletePushToken('jwt', TOKEN), true);
  assert.equal(calls[1].init.method, 'DELETE');
  assert.deepEqual(calls[1].body, { token: TOKEN });
  await assert.rejects(api.registerPushToken('jwt', { token: 'nope', platform: 'ios' }), /geçersiz/);
});

test('register with a valid device id; Core 400 surfaces its message', async () => {
  const calls = stubFetch([{ status: 400, json: { code: 'push_token_invalid', message: 'Geçersiz anahtar.' } }]);
  await assert.rejects(api.registerPushToken('jwt', { token: TOKEN, platform: 'android', deviceId: 'abc-123' }), /Geçersiz anahtar/);
  assert.deepEqual(calls[0].body, { token: TOKEN, platform: 'android', device_id: 'abc-123' });
});

test('inbox GET clamps paging; read accepts ids (deduped, ≤100) or all, never both', async () => {
  const calls = stubFetch([
    { status: 200, json: { items: [], unread_count: 0, page: 1, total_pages: 0 } },
    { status: 200, json: { success: true, updated: 2, unread_count: 3 } },
    { status: 200, json: { success: true, updated: 3, unread_count: 0 } },
  ]);
  await api.fetchNotifications('jwt', 0, 500);
  assert.match(calls[0].url, /\/me\/notifications\?page=1&per_page=50$/);
  assert.equal(await api.markNotificationsRead('jwt', { ids: [5, 5, '6', -1, 0] }), 3);
  assert.deepEqual(calls[1].body, { ids: [5, 6] });
  assert.equal(await api.markNotificationsRead('jwt', { all: true }), 0);
  assert.deepEqual(calls[2].body, { all: true });
  assert.equal(await api.markNotificationsRead('jwt', { ids: [] }), null, 'nothing to send');
  assert.equal(calls.length, 3);
  const many = Array.from({ length: 150 }, (_, i) => i + 1);
  const more = stubFetch([{ status: 200, json: { unread_count: 0 } }]);
  await api.markNotificationsRead('jwt', { ids: many });
  assert.equal(more[0].body.ids.length, 100);
});

// ---------------------------------------------------------------------------
// Source contracts

const SOURCE_DIRS = ['app', 'components', 'context', 'lib'];
function sources() {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(rel);
    }
  };
  SOURCE_DIRS.forEach(walk);
  return out;
}

test('only lib/notifications.ts requests the OS permission; only the sheet and the toggle call it', () => {
  for (const file of sources()) {
    const src = read(file);
    // Mic/speech/camera permissions elsewhere are unrelated; any notification-aware file must not prompt.
    const notificationAware = /expo-notifications|lib\/notifications'|notifications\/NotificationsProvider'/.test(src);
    if (notificationAware && file !== path.join('lib', 'notifications.ts')) {
      assert.doesNotMatch(src, /requestPermissionsAsync/, file);
    }
    if (/requestNotificationPermission\(/.test(src)) {
      assert.ok([path.join('lib', 'notifications.ts'), path.join('components', 'notifications', 'NotificationsProvider.tsx')].includes(file), file);
    }
  }
  const provider = read('components/notifications/NotificationsProvider.tsx');
  const firstAllowed = provider.indexOf('const acceptPrompt = useCallback(');
  assert.ok(firstAllowed > 0);
  assert.doesNotMatch(provider.slice(0, firstAllowed), /requestNotificationPermission\(/, 'launch/sign-in/listener code never prompts');
  assert.equal((provider.match(/requestNotificationPermission\(/g) || []).length, 2, 'sheet "Haber ver" + profile toggle');
  assert.match(provider, /moment: 'import_started'/);
  assert.match(provider, /moment: 'settings_toggle'/);
  assert.match(provider, /getNotificationPermission\(\)/);
  assert.doesNotMatch(read('app/_layout.tsx'), /requestNotificationPermission|requestPermissionsAsync|getExpoPushTokenAsync/);
});

test('the permission moment is right after a NEW video import job starts', () => {
  const page = read('app/recipe/import.tsx');
  assert.match(page, /const started = !existing \|\| retry;/);
  const start = page.indexOf('await startVideoRecipeJob(token, url, requestId');
  const offer = page.indexOf('if (started) offerAfterImport();');
  assert.ok(start > 0 && offer > start, 'offer comes after the job is accepted by Core');
  assert.equal((page.match(/offerAfterImport\(\)/g) || []).length, 1);
  const sheet = read('components/notifications/NotifyPromptSheet.tsx');
  assert.match(sheet, /Tarifin hazır olunca haber verelim mi\?/);
  assert.match(sheet, /Haber ver/);
  assert.match(sheet, /Şimdi değil/);
});

test('notification taps: warm + cold start, default action only, read on Core, deduped', () => {
  const provider = read('components/notifications/NotificationsProvider.tsx');
  assert.match(provider, /addNotificationResponseReceivedListener/);
  assert.match(provider, /getLastNotificationResponseAsync\(\)/);
  assert.match(provider, /DEFAULT_ACTION_IDENTIFIER/);
  assert.match(provider, /routeForNotification\(data\)/);
  assert.match(provider, /markNotificationsRead\(auth, \{ ids: \[id\] \}\)/);
  assert.match(provider, /handled\.current\.has\(id\)/);
  assert.match(provider, /clearLastNotificationResponseAsync/);
  assert.match(provider, /if \(!pendingResponse \|\| !navReady \|\| isLoading\) return;/, 'cold start waits for navigation and the stored session');
  assert.match(provider, /addPushTokenListener/);
  assert.match(provider, /syncPushRegistration\(token, userKey, \{ force: true \}\)/, 'sign-in / launch re-registers');
});

test('foreground pushes become a calm in-app banner, not a system alert', () => {
  const lib = read('lib/notifications.ts');
  assert.match(lib, /shouldShowBanner: false/);
  assert.match(lib, /shouldPlaySound: false/);
  const provider = read('components/notifications/NotificationsProvider.tsx');
  assert.match(provider, /addNotificationReceivedListener/);
  assert.match(provider, /<InAppBanner /);
});

test('sign-out DELETEs the push token before the JWT is dropped', () => {
  const auth = read('context/AuthContext.tsx');
  const logout = auth.slice(auth.indexOf('const logout = async () => {'));
  const del = logout.indexOf('await unregisterPushOnSignOut(token);');
  const drop = logout.indexOf('await SecureStore.deleteItemAsync(TOKEN_KEY);');
  assert.ok(del > 0 && drop > del);
  const lib = read('lib/notifications.ts');
  assert.match(lib, /export async function unregisterPushOnSignOut/);
  assert.match(lib, /deletePushToken\(authToken, last\.token, 4000\)/, 'bounded so sign-out never hangs');
});

test('device id is a random id kept in SecureStore; projectId comes from extra.eas.projectId', () => {
  const lib = read('lib/notifications.ts');
  assert.match(lib, /randomUUID\(\)/);
  assert.match(lib, /tariften_push_device_id/);
  assert.match(lib, /SecureStore\.setItemAsync/);
  assert.match(lib, /extra\?\.eas\?\.projectId/);
  assert.match(lib, /getExpoPushTokenAsync\(\{ projectId: projectId\(\) \}\)/);
});

test('old binaries without the native module keep running (no static runtime import)', () => {
  for (const file of sources()) {
    const src = read(file);
    assert.doesNotMatch(src, /^import (?!type )[^;]*from 'expo-notifications'/m, file);
  }
  const lib = read('lib/notifications.ts');
  assert.match(lib, /requireOptionalNativeModule\('ExpoPushTokenManager'\)/);
  assert.ok(lib.indexOf("requireOptionalNativeModule('ExpoPushTokenManager')") < lib.indexOf("require('expo-notifications')"));
});

test('inbox screen, entry point and settings toggle; no 6th tab', () => {
  const layout = read('app/_layout.tsx');
  assert.match(layout, /name="notifications"/);
  assert.match(layout, /headerTitle: 'Bildirimler'/);
  assert.ok(layout.indexOf('<AuthProvider>') < layout.indexOf('<NotificationsProvider>'), 'provider needs the session');
  const tabs = read('app/(tabs)/_layout.tsx');
  assert.match(tabs, /router\.push\('\/notifications'\)/);
  assert.match(tabs, /notifications-outline/);
  assert.match(tabs, /badgeLabel\(unreadCount\)/);
  assert.doesNotMatch(tabs, /name="notifications"/);
  assert.deepEqual([...tabs.matchAll(/<Tabs\.Screen name="([^"]+)"/g)].map(m => m[1]), ['defterim', 'bu-hafta', 'alisveris']);
  const screen = read('app/notifications.tsx');
  for (const expected of [/Tümünü okundu say/, /RefreshControl/, /Henüz bildirim yok/, /relativeTimeTr\(/, /styles\.dot/, /markNotificationsRead\(token, \{ all: true \}\)/]) {
    assert.match(screen, expected);
  }
  const profile = read('app/(tabs)/profile.tsx');
  assert.match(profile, /Tarifim hazır olunca haber ver/);
  assert.match(profile, /<Switch/);
  assert.match(profile, /setPushEnabled\(on\)/);
  assert.match(profile, /openNotificationSettings/);
});

test('transfer screen resumes a job from ?job= without starting a paid analysis', () => {
  const page = read('app/recipe/import.tsx');
  assert.match(page, /job\?: string/);
  assert.match(page, /const jobParam = positiveId\(params\.job\);/);
  const resume = page.slice(page.indexOf('const resumeVideoJob'), page.indexOf('const requestSocialPreview'));
  assert.match(resume, /getVideoRecipeJob\(token, id, controller\.signal\)/);
  assert.doesNotMatch(resume, /startVideoRecipeJob|offerAfterImport/);
  assert.match(page, /retryableFailure \? 'Yeniden dene'/);
});

test('expo-notifications is the SDK 55 version with its config plugin in both variants', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.dependencies['expo-notifications'], /^~55\./);
  const appJson = JSON.parse(read('app.json')).expo;
  const plugin = appJson.plugins.find(p => Array.isArray(p) && p[0] === 'expo-notifications');
  assert.ok(plugin, 'plugin configured');
  assert.equal(plugin[1].color, '#db4c3f');
  assert.equal(plugin[1].defaultChannel, 'default');
  assert.match(read('lib/notifications.ts'), /ANDROID_CHANNEL_ID = 'default'/);
  const icon = fs.readFileSync(path.join(root, plugin[1].icon));
  assert.equal(icon.readUInt32BE(16), 96);
  assert.equal(icon.readUInt32BE(20), 96);
  const config = require('../app.config.js');
  const previous = process.env.APP_VARIANT;
  try {
    process.env.APP_VARIANT = 'development';
    const dev = config({ config: appJson });
    assert.ok(dev.plugins.some(p => Array.isArray(p) && p[0] === 'expo-notifications'));
    assert.equal(dev.extra.eas.projectId, appJson.extra.eas.projectId);
  } finally {
    if (previous === undefined) delete process.env.APP_VARIANT; else process.env.APP_VARIANT = previous;
  }
  const doc = read('docs/NOTIFICATIONS_MOBILE.md');
  for (const expected of [/APNs/, /FCM V1/, /google-services\.json/, /npm run ios:sim:rebuild/, /eas build/]) assert.match(doc, expected);
});
