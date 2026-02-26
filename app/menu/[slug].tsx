import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { getMenu } from '../../lib/api';
import { Menu } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function MenuDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const navigation = useNavigation();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMenu = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await getMenu(slug);
      setMenu(data);
      if (data) {
        navigation.setOptions({ title: data.title });
      }
    } catch (error) {
      console.error('Menu load error:', error);
    } finally {
      setLoading(false);
    }
  }, [slug, navigation]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  if (loading) return <LoadingSpinner fullScreen />;

  if (!menu) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Menü bulunamadı.</Text>
      </View>
    );
  }

  const sectionTypeLabels: Record<string, string> = {
    starter: 'Başlangıç',
    main: 'Ana Yemek',
    side: 'Yan Yemek',
    dessert: 'Tatlı',
    drink: 'İçecek',
    soup: 'Çorba',
    meze: 'Meze',
    hot_appetizer: 'Sıcak Başlangıç',
    salad: 'Salata',
    breakfast_main: 'Kahvaltı Ana',
    breakfast_side: 'Kahvaltı Yan',
    savory: 'Tuzlu',
    sweet: 'Tatlı',
    cold_canape: 'Soğuk Kanape',
    hot_bites: 'Sıcak Atıştırmalık',
    dip_sauce: 'Sos',
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {menu.image ? (
        <Image source={{ uri: menu.image }} style={styles.image} contentFit="cover" transition={300} />
      ) : null}

      <View style={styles.content}>
        <Text style={styles.title}>{menu.title}</Text>

        {menu.description ? (
          <Text style={styles.description}>{menu.description}</Text>
        ) : null}

        <View style={styles.metaRow}>
          {menu.event_type ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{menu.event_type}</Text>
            </View>
          ) : null}
          {menu.guest_count ? (
            <Text style={styles.metaText}>👥 {menu.guest_count} kişi</Text>
          ) : null}
          {menu.concept ? (
            <Text style={styles.metaText}>🎯 {menu.concept}</Text>
          ) : null}
        </View>

        {menu.sections?.map((section, idx) => (
          <View key={idx} style={styles.section}>
            <Text style={styles.sectionTitle}>
              {sectionTypeLabels[section.type] || section.title || section.type}
            </Text>
            {section.recipes?.map((recipe) => (
              <RecipeCard key={recipe.id} recipe={recipe} />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  image: {
    width: '100%',
    height: 260,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
    lineHeight: 32,
  },
  description: {
    fontSize: 15,
    color: '#666666',
    lineHeight: 22,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#fff0f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 13,
    color: '#e74c3c',
    fontWeight: '600',
  },
  metaText: {
    fontSize: 13,
    color: '#666666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#e74c3c',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666666',
  },
  bottomPadding: {
    height: 40,
  },
});
