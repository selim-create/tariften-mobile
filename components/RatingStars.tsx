import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RatingStarsProps {
  rating: number;
  maxStars?: number;
  size?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
}

export default function RatingStars({
  rating,
  maxStars = 5,
  size = 20,
  interactive = false,
  onRate,
}: RatingStarsProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: maxStars }, (_, i) => {
        const filled = i < Math.round(rating);
        const icon = filled ? 'star' : 'star-outline';
        const color = filled ? '#f59e0b' : '#cccccc';

        if (interactive && onRate) {
          return (
            <TouchableOpacity key={i} onPress={() => onRate(i + 1)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <Ionicons name={icon} size={size} color={color} />
            </TouchableOpacity>
          );
        }

        return <Ionicons key={i} name={icon} size={size} color={color} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 2,
  },
});
