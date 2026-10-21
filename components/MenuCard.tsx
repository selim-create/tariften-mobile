import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Menu } from '../lib/types';
import ImagePlaceholder, { isPlaceholderImage } from './ImagePlaceholder';
import { colors, fonts, radius } from '../constants/theme';

interface MenuCardProps {
  menu: Menu;
}

/** Recipes in the menu, counted from its own sections (0 when the list omits them). */
export function menuRecipeCount(menu: Pick<Menu, 'sections'>) {
  return (menu.sections || []).reduce((sum, section) => sum + (section.recipes?.length || 0), 0);
}

/**
 * Archive card for a menu: a large photograph with the guest count on it,
 * then occasion, title and the menu's own description.
 */
export default function MenuCard({ menu }: MenuCardProps) {
  const router = useRouter();
  const photo = !isPlaceholderImage(menu.image);
  const guests = Number(menu.guest_count) || 0;
  const recipes = menuRecipeCount(menu);
  const kicker = [menu.event_type || null, recipes > 0 ? `${recipes} tarif` : null].filter(Boolean).join(' · ');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
      onPress={() => router.push(`/menu/${menu.slug}`)}
      accessibilityRole="link"
      accessibilityLabel={menu.title}
    >
      <View style={styles.media}>
        {photo ? (
          <>
            <Image source={{ uri: menu.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            <LinearGradient colors={['transparent', 'rgba(0,0,0,0.28)']} style={StyleSheet.absoluteFill} />
          </>
        ) : (
          <ImagePlaceholder title={menu.title} style={StyleSheet.absoluteFill} />
        )}
        {guests > 0 ? (
          <View style={styles.guests}>
            <Ionicons name="people" size={13} color={colors.ink} />
            <Text style={styles.guestsText}>{guests} kişilik</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.body}>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        <Text style={styles.title} numberOfLines={2}>{menu.title}</Text>
        {menu.description ? <Text style={styles.description} numberOfLines={2}>{menu.description}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 30 },
  media: { aspectRatio: 16 / 11, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.cream },
  guests: {
    position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 5,
    height: 30, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.95)',
  },
  guestsText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.ink },
  body: { paddingTop: 14, paddingHorizontal: 2, gap: 6 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 21, lineHeight: 26, letterSpacing: -0.4, color: colors.ink },
  description: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted },
});
