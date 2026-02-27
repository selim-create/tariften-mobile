import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface ImagePlaceholderProps {
  title?: string;
  variant?: 'card' | 'detail';
  style?: StyleProp<ViewStyle>;
}

export function isPlaceholderImage(url?: string | null): boolean {
  if (!url) return true;
  if (url.trim() === '') return true;
  if (url.includes('placehold.co')) return true;
  if (url.includes('placeholder')) return true;
  return false;
}

export default function ImagePlaceholder({
  title = 'Lezzetli Tarif',
  variant = 'card',
  style,
}: ImagePlaceholderProps) {

  if (variant === 'detail') {
    return (
      <View style={[detailStyles.container, style]}>
        <LinearGradient
          colors={['#1f2937', '#111827', '#000000']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Turuncu glow sağ alt */}
        <View style={detailStyles.glowOrange} />
        {/* Sarı glow sol üst */}
        <View style={detailStyles.glowYellow} />

        <View style={detailStyles.content}>
          {/* Ikon kutusu */}
          <View style={detailStyles.iconBox}>
            <Ionicons name="restaurant" size={32} color="#f97316" />
          </View>

          <Text style={detailStyles.label}>GÖRSEL HAZIRLANIYOR</Text>

          <Text style={detailStyles.title} numberOfLines={3}>
            {title}
          </Text>

          <Text style={detailStyles.description}>
            Bu lezzetli tarifin fotoğrafı fırında, pişmek üzere!{'\n'}Çok yakında burada olacak.
          </Text>

          <View style={detailStyles.brandRow}>
            <View style={detailStyles.brandIcon}>
              <Text style={detailStyles.brandIconText}>t</Text>
            </View>
            <Text style={detailStyles.brandText}>tariften.com</Text>
          </View>
        </View>
      </View>
    );
  }

  // Card varyantı
  return (
    <View style={[cardStyles.container, style]}>
      <View style={cardStyles.iconCircle}>
        <Ionicons name="restaurant" size={20} color="#fb923c" />
      </View>
      <Text style={cardStyles.label}>GÖRSEL HAZIRLANIYOR</Text>
      <Text style={cardStyles.description}>Bu lezzet fırında, yakında burada!</Text>
    </View>
  );
}

const detailStyles = StyleSheet.create({
  container: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  glowOrange: {
    position: 'absolute',
    bottom: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(234, 88, 12, 0.15)',
  },
  glowYellow: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(202, 138, 4, 0.08)',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 32,
    zIndex: 1,
  },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: 'rgba(31, 41, 55, 0.5)',
    borderWidth: 1,
    borderColor: 'rgba(75, 85, 99, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  label: {
    color: '#f97316',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 8,
  },
  title: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 32,
    marginBottom: 12,
    maxWidth: 260,
  },
  description: {
    color: 'rgba(156, 163, 175, 1)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    maxWidth: 260,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.5,
  },
  brandIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(55, 65, 81, 1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandIconText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  brandText: {
    color: 'rgba(107, 114, 128, 1)',
    fontSize: 13,
    fontWeight: '500',
  },
});

const cardStyles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#f9fafb',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  label: {
    color: '#ea580c',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 4,
  },
  description: {
    color: '#9ca3af',
    fontSize: 11,
    textAlign: 'center',
    maxWidth: 150,
  },
});
