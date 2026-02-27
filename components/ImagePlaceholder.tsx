import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ImagePlaceholderProps {
  title: string;
  style?: StyleProp<ViewStyle>;
}

const COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#c0392b',
];

function getColorFromTitle(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(title: string): string {
  return title
    .split(' ')
    .filter((w) => w.length > 0)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function isPlaceholderImage(url?: string | null): boolean {
  return (
    !url ||
    url.includes('placehold.co') ||
    url.includes('images.unsplash.com') ||
    url.includes('pexels.com')
  );
}

export default function ImagePlaceholder({ title, style }: ImagePlaceholderProps) {
  const bgColor = getColorFromTitle(title);
  return (
    <View style={[styles.container, { backgroundColor: bgColor }, style]}>
      <Ionicons name="restaurant" size={48} color="rgba(255,255,255,0.25)" style={styles.icon} />
      <Text style={styles.initials}>{getInitials(title)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    position: 'absolute',
  },
  initials: {
    fontSize: 40,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 2,
  },
});
