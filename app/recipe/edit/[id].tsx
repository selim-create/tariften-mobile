import React from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import RecipeManualEditor from '../../../components/recipe/RecipeManualEditor';

export default function RecipeEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipeId = Number(id);
  if (!id || !Number.isSafeInteger(recipeId) || recipeId < 1) {
    return <View style={{ flex: 1, padding: 24, backgroundColor: '#fffbf7', justifyContent: 'center' }}>
      <Text style={{ color: '#ac4a3a', textAlign: 'center', fontSize: 14 }}>Düzenlenecek tarifin bağlantısı geçersiz.</Text>
    </View>;
  }
  return <RecipeManualEditor recipeId={recipeId} />;
}
