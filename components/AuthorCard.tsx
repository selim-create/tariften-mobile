import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Author } from '../lib/types';

interface AuthorCardProps {
  author: Author;
}

export default function AuthorCard({ author }: AuthorCardProps) {
  return (
    <View style={styles.card}>
      {author.avatar ? (
        <Image source={{ uri: author.avatar }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>{(author.name[0] ?? 'U').toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.label}>Tarifi Hazırlayan</Text>
        <Text style={styles.name}>{author.name}</Text>
        {author.bio ? (
          <Text style={styles.bio} numberOfLines={3}>
            {author.bio}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f9f9f9',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    flexShrink: 0,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  info: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: '#999999',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  bio: {
    fontSize: 13,
    color: '#666666',
    lineHeight: 19,
  },
});
