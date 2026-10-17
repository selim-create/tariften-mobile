import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import RecipeManualEditor from '../../../components/recipe/RecipeManualEditor';

export default function RecipeEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipeId = Number(id);
  return <RecipeManualEditor recipeId={Number.isSafeInteger(recipeId) && recipeId > 0 ? recipeId : undefined} />;
}
