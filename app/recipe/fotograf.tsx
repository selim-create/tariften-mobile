import React from 'react';
import PhotoRecipeFlow from '../../components/recipe/PhotoRecipeFlow';

/** "+" → Fotoğraftan tarif: one dish photo → AI Tahmini Tarif → private-by-default save. */
export default function PhotoRecipeScreen() {
  return <PhotoRecipeFlow mode="dish" />;
}
