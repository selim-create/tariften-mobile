import React, { memo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { lokmaIngredient } from '../lib/lokma-emoji';
import { lokmaArtUri, LOKMA_SVG_ART } from '../lib/lokma-svg-art';

/**
 * Offline, decorative illustration. Reuses the 89 Web Lokma drawings with
 * Expo Image's native SVG support (SDK 55), avoiding extra native packages.
 * Never replaces recipe text, quantities, evidence or author-provided names.
 */
type Props = { name: string; size?: number };
const FIGURES: Record<string, string> = {
  "🍅": "tomato", "🥕": "carrot", "🧅": "onion", "🧄": "garlic",
  "🧀": "cheese", "🫒": "olive", "🍝": "pasta", "🌿": "herb",
  "🌶️": "pepper", "🍋": "lemon", "🥚": "egg", "🥛": "milk",
  "🫘": "bean", "🧂": "spice", "🥔": "potato", "🐟": "fish",
  "🍞": "bread", "🥦": "broccoli", "🍆": "eggplant",
  "🍄": "mushroom", "🥒": "cucumber", "🥬": "greens",
  "🍗": "chicken", "🥩": "meat", "🍤": "shrimp",
  "🧈": "butter", "🍚": "rice", "🍓": "strawberry",
  "🍊": "orange", "🍎": "apple", "🍌": "banana",
  "🌰": "nut", "🥜": "nut", "🍯": "honey",
  "🍫": "chocolate", "🍬": "sugar",
  "🍒": "cherry", "🫐": "berry", "🍐": "pear", "🍇": "grape",
  "🍉": "watermelon", "🍑": "peach", "🥝": "kiwi", "🍍": "pineapple",
  "🥑": "avocado", "🌽": "corn", "☕": "coffee", "🍵": "tea", "🫗": "liquid",
}

const TINT: Record<string, string> = {
  rose: '#fff0eb', orange: '#fff1e6', sand: '#f7f1e6',
  yellow: '#fff7da', sage: '#edf6ea', blue: '#ecf5f8',
  lavender: '#f5eefb',
};

function LokmaIngredientIcon({ name, size = 28 }: Props) {
  const food = lokmaIngredient(name);
  const figure = food.art || FIGURES[food.emoji] || 'plate';
  const safeFigure = Object.prototype.hasOwnProperty.call(LOKMA_SVG_ART, figure) ? figure : 'plate';
  const [failedFigure, setFailedFigure] = useState<string | null>(null);
  const frame = Math.max(22, size + 9);
  const failed = failedFigure === safeFigure;
  return (
    <View accessible={false} importantForAccessibility="no"
      style={[styles.container, {
        width: frame, height: frame, borderRadius: Math.max(9, frame / 3),
        backgroundColor: TINT[food.tint] || TINT.sand,
      }]}>
      {failed ? <Ionicons name="restaurant-outline" size={size * 0.7} color="#9b8e80" />
        : <Image
            source={{ uri: lokmaArtUri(safeFigure) }}
            style={{ width: size, height: size }}
            contentFit="contain"
            cachePolicy="memory"
            onError={() => setFailedFigure(safeFigure)}
            accessible={false}
          />}
    </View>
  );
}
export default memo(LokmaIngredientIcon);

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
