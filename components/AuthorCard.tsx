import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Author } from '../lib/types';
import { colors, fonts, radius } from '../constants/theme';

interface AuthorCardProps {
  author: Author;
  /** Small caps line above the name. */
  label?: string;
}

export default function AuthorCard({ author, label = 'Tarifi Hazırlayan' }: AuthorCardProps) {
  const name = String(author.name || '').trim();
  return (
    <View style={styles.card}>
      {author.avatar ? (
        <Image source={{ uri: author.avatar }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>{(name[0] ?? 'T').toLocaleUpperCase('tr-TR')}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.name}>{name || 'Tariften'}</Text>
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
    flexDirection: 'row', alignItems: 'flex-start', gap: 14, padding: 16,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line,
  },
  avatar: { width: 52, height: 52, borderRadius: 26, flexShrink: 0 },
  avatarPlaceholder: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brand,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  avatarInitial: { fontFamily: fonts.headingBold, fontSize: 21, color: '#ffffff' },
  info: { flex: 1 },
  label: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textFaint, marginBottom: 2 },
  name: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink, marginBottom: 4 },
  bio: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textMuted },
});
