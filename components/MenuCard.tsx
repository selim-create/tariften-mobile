import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Menu } from '../lib/types';

interface MenuCardProps {
  menu: Menu;
}

export default function MenuCard({ menu }: MenuCardProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/menu/${menu.slug}`)}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
        {menu.image ? (
          <Image
            source={{ uri: menu.image }}
            style={styles.image}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>🍽️</Text>
          </View>
        )}
        {menu.concept ? (
          <View style={styles.conceptBadge}>
            <Text style={styles.conceptBadgeText}>{menu.concept}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.content}>
        {menu.guest_count ? (
          <Text style={styles.guestCount}>👥 {menu.guest_count} Kişilik</Text>
        ) : null}
        <Text style={styles.title} numberOfLines={2}>
          {menu.title}
        </Text>
        {menu.description ? (
          <Text style={styles.description} numberOfLines={3}>
            {menu.description}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <Text style={styles.inspectButton}>İncele →</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  imageContainer: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 200,
  },
  imagePlaceholder: {
    width: '100%',
    height: 200,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontSize: 48,
  },
  conceptBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(231, 76, 60, 0.9)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  conceptBadgeText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '600',
  },
  content: {
    padding: 14,
  },
  guestCount: {
    fontSize: 13,
    color: '#e74c3c',
    fontWeight: '600',
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 19,
    marginBottom: 10,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 10,
    alignItems: 'flex-end',
  },
  inspectButton: {
    fontSize: 14,
    color: '#e74c3c',
    fontWeight: '600',
  },
});
