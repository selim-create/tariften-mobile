import analytics from '@react-native-firebase/analytics';

export async function logScreenView(screenName: string): Promise<void> {
  await analytics().logScreenView({ screen_name: screenName, screen_class: screenName });
}

export async function logEvent(eventName: string, params?: Record<string, string | number | boolean>): Promise<void> {
  await analytics().logEvent(eventName, params);
}

export async function logRecipeView(recipeId: string, recipeName: string): Promise<void> {
  await analytics().logEvent('recipe_view', { recipe_id: recipeId, recipe_name: recipeName });
}

export async function logSearch(query: string): Promise<void> {
  await analytics().logSearch({ search_term: query });
}

export async function logSignUp(method: string): Promise<void> {
  await analytics().logSignUp({ method });
}

export async function logLogin(method: string): Promise<void> {
  await analytics().logLogin({ method });
}

export async function logMenuCreate(): Promise<void> {
  await analytics().logEvent('menu_create');
}
