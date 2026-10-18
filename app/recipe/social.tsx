import React from 'react';
import RecipeTextImportScreen from './import';

/** Dedicated social entry; shared editor retains the same Core/API safeguards. */
export default function SocialRecipeImportScreen() {
  return <RecipeTextImportScreen initialMethod="social" />;
}
