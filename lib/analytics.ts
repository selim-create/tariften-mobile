import { initializeApp, getApps } from 'firebase/app';
import { getAnalytics, logEvent as firebaseLogEvent, isSupported } from 'firebase/analytics';
import { Platform } from 'react-native';

const firebaseConfig = {
  apiKey: 'AIzaSyB-H2ylBlqnfaR_fuqO9JK_Oqok9rE8iF0',
  authDomain: 'tariftencom.firebaseapp.com',
  projectId: 'tariftencom',
  storageBucket: 'tariftencom.firebasestorage.app',
  messagingSenderId: '97522202514',
  appId: '1:97522202514:android:311d42d86aac33a650f34b',
};

let analyticsInstance: ReturnType<typeof getAnalytics> | null = null;

async function getFirebaseAnalytics() {
  if (analyticsInstance) return analyticsInstance;

  try {
    if (getApps().length === 0) {
      initializeApp(firebaseConfig);
    }
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics();
    }
  } catch (e) {
    console.warn('[Analytics] Firebase init error:', e);
  }

  return analyticsInstance;
}

export async function logScreenView(screenName: string): Promise<void> {
  try {
    const a = await getFirebaseAnalytics();
    if (a) {
      firebaseLogEvent(a, 'screen_view', {
        screen_name: screenName,
        screen_class: screenName,
        platform: Platform.OS,
      });
    }
  } catch {
    // silently fail
  }
}

export async function logEvent(eventName: string, params?: Record<string, string | number | boolean>): Promise<void> {
  try {
    const a = await getFirebaseAnalytics();
    if (a) {
      firebaseLogEvent(a, eventName, params);
    }
  } catch {
    // silently fail
  }
}

export async function logRecipeView(recipeId: string, recipeName: string): Promise<void> {
  await logEvent('recipe_view', { recipe_id: recipeId, recipe_name: recipeName });
}

export async function logSearch(query: string): Promise<void> {
  await logEvent('search', { search_term: query });
}

export async function logSignUp(method: string): Promise<void> {
  await logEvent('sign_up', { method });
}

export async function logLogin(method: string): Promise<void> {
  await logEvent('login', { method });
}

export async function logMenuCreate(): Promise<void> {
  await logEvent('menu_create');
}
