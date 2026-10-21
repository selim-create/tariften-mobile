import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import RecipeTextImportScreen from './import';

/**
 * Single + menu entry: start with a social link, switch to text in the
 * existing two-tab editor. Legacy /recipe/import and /recipe/social work.
 * "Paylaş → Tariften" arrives here with the shared link in `url`.
 */
export default function UnifiedRecipeImportScreen() {
  const { url } = useLocalSearchParams<{ url?: string }>();
  return <RecipeTextImportScreen initialMethod="social" initialUrl={typeof url === 'string' ? url : undefined} />;
}
