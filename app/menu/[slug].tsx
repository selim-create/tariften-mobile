import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getMenu } from '../../lib/api';
import { Menu } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import LoadingSpinner from '../../components/LoadingSpinner';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SectionStyle {
  icon: string;
  label: string;
  description: string;
}

const sectionStyles: Record<string, SectionStyle> = {
  starter: { icon: '🍲', label: 'Başlangıç', description: 'İştah açıcı hafif lezzetler' },
  side: { icon: '🍋', label: 'Ara Sıcak & Meze', description: 'Sofrayı zenginleştiren tatlar' },
  salad: { icon: '🌿', label: 'Salata', description: 'Taze ve ferah eşlikçiler' },
  main: { icon: '🍴', label: 'Ana Yemek', description: 'Sofranın yıldızları' },
  dessert: { icon: '🍨', label: 'Tatlı', description: 'Mutlu sonlar' },
  drink: { icon: '🍷', label: 'İçecek', description: 'Tamamlayıcı yudumlar' },
  soup: { icon: '🍲', label: 'Çorba', description: 'Sıcacık başlangıçlar' },
  meze: { icon: '🍋', label: 'Mezeler', description: 'Sofrayı açan lezzetler' },
  hot_appetizer: { icon: '🔥', label: 'Ara Sıcak', description: 'Sıcak başlangıçlar' },
  breakfast_main: { icon: '🥚', label: 'Ana Kahvaltılıklar', description: 'Güne enerji veren tatlar' },
  breakfast_side: { icon: '🧀', label: 'Hafif Yanlar', description: 'Kahvaltıyı tamamlayanlar' },
  savory: { icon: '🍪', label: 'Tuzlular', description: 'Tuzlu atıştırmalıklar' },
  sweet: { icon: '🎂', label: 'Tatlılar', description: 'Tatlı molası' },
  cold_canape: { icon: '🌾', label: 'Soğuk Kanapeler', description: 'Zarif lokmalar' },
  hot_bites: { icon: '🔥', label: 'Sıcak İkramlar', description: 'Sıcak servis edilenler' },
  dip_sauce: { icon: '🍚', label: 'Dip & Soslar', description: 'Eşlikçi soslar' },
};

export default function MenuDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMenu = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await getMenu(slug);
      setMenu(data);
    } catch (error) {
      console.error('Menu load error:', error);
    } finally {
      setLoading(false);
    }
  }, [slug]);

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

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Immersive Header */}
      <View style={styles.headerContainer}>
        {menu.image ? (
          <Image source={{ uri: menu.image }} style={styles.headerImage} contentFit="cover" transition={300} />
        ) : (
          <View style={styles.headerImagePlaceholder} />
        )}
        <View style={styles.headerOverlay} />
        <View style={styles.headerContent}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backButtonText}>← Menülere Dön</Text>
          </TouchableOpacity>
          <View style={styles.headerBadges}>
            {menu.concept ? (
              <View style={styles.conceptBadge}>
                <Text style={styles.conceptBadgeText}>{menu.concept}</Text>
              </View>
            ) : null}
            {menu.guest_count ? (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>👥 {menu.guest_count} Kişilik</Text>
              </View>
            ) : null}
            {menu.event_type ? (
              <View style={styles.metaBadge}>
                <Text style={styles.metaBadgeText}>{menu.event_type}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.headerTitle}>{menu.title}</Text>
        </View>
      </View>

      {/* Content Body */}
      <View style={styles.contentCard}>
        <View style={styles.kitchenLabel}>
          <Text style={styles.kitchenLabelText}>Mutfaktan</Text>
        </View>
        <Text style={styles.quoteText}>
          "Davetlilerinizi büyüleyecek, dengeli ve unutulmaz bir lezzet yolculuğu için özenle seçildi."
        </Text>
        {menu.description ? (
          <Text style={styles.description}>{menu.description}</Text>
        ) : null}

        {/* Sections */}
        {menu.sections?.map((section, idx) => {
          const style = sectionStyles[section.type] || {
            icon: '🍽️',
            label: section.title || section.type,
            description: '',
          };
          return (
            <View key={idx} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionIconContainer}>
                  <Text style={styles.sectionIcon}>{style.icon}</Text>
                </View>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>{style.label}</Text>
                  {style.description ? (
                    <Text style={styles.sectionDescription}>{style.description}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.sectionDivider} />
              {section.recipes?.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </View>
          );
        })}

        {/* Bottom Actions */}
        <View style={styles.bottomCard}>
          <Text style={styles.bottomCardTitle}>Hazır mısınız? 🥂</Text>
          <Text style={styles.bottomCardSubtitle}>Bu menüyü sofralarınıza taşıyın.</Text>
        </View>
      </View>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  headerContainer: {
    width: SCREEN_WIDTH,
    height: 320,
    position: 'relative',
  },
  headerImage: {
    width: '100%',
    height: '100%',
  },
  headerImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2a2a2a',
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  headerContent: {
    ...StyleSheet.absoluteFillObject,
    padding: 20,
    justifyContent: 'flex-end',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  headerBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  conceptBadge: {
    backgroundColor: '#e74c3c',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  conceptBadgeText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '700',
  },
  metaBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  metaBadgeText: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 34,
  },
  contentCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
  },
  kitchenLabel: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff0f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 12,
  },
  kitchenLabelText: {
    fontSize: 12,
    color: '#e74c3c',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  quoteText: {
    fontSize: 14,
    color: '#888888',
    fontStyle: 'italic',
    lineHeight: 21,
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#444444',
    lineHeight: 23,
    marginBottom: 24,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionIcon: {
    fontSize: 22,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  sectionDescription: {
    fontSize: 12,
    color: '#888888',
    marginTop: 2,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginBottom: 12,
  },
  bottomCard: {
    backgroundColor: '#fff8f8',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fde8e8',
  },
  bottomCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 6,
  },
  bottomCardSubtitle: {
    fontSize: 14,
    color: '#888888',
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
