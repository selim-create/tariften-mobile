import React from 'react';
import RecipeTextImportScreen from './import';

/**
 * Single + menu entry: start with a social link, switch to text in the
 * existing two-tab editor. Legacy /recipe/import and /recipe/social work.
 */
export default function UnifiedRecipeImportScreen() {
  return <RecipeTextImportScreen initialMethod="social" />;
}
