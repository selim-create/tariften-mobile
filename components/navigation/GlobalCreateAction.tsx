import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';

type Destination = '/recipe/create' | '/recipe/social' | '/recipe/import' | '/menu/create' | '/(tabs)/recipes?quick=1' | '/(tabs)/pantry';
type Icon = React.ComponentProps<typeof Ionicons>['name'];

const ACTIONS: { route: Destination; title: string; description: string; icon: Icon; tint: string }[] = [
  {
    route: '/(tabs)/recipes?quick=1',
    title: 'Hızlı tarif oluştur',
    description: 'Bir tarif adı veya malzemelerini yaz; AI Şef hazırlasın.',
    icon: 'sparkles-outline',
    tint: '#d74c3f',
  },
  {
    route: '/(tabs)/pantry',
    title: 'Dolabımdakilerle tarif bul',
    description: 'Dolabında kayıtlı malzemelerden tarif üret.',
    icon: 'basket-outline',
    tint: '#397b64',
  },
  {
    route: '/recipe/create',
    title: 'Tarifini kendin yaz',
    description: 'Malzemeleri, adımları ve fotoğrafı sen belirle.',
    icon: 'create-outline',
    tint: '#d75445',
  },
  {
    route: '/recipe/social',
    title: 'Sosyal medyadan tarif ekle',
    description: 'Reels, TikTok ve Shorts bağlantısından tarif.',
    icon: 'videocam-outline',
    tint: '#d75445',
  },
  {
    route: '/recipe/import',
    title: 'Tarif metninden aktar',
    description: 'Aklındaki tarifi anlat, birlikte düzenleyelim.',
    icon: 'book-outline',
    tint: '#d7784e',
  },
  {
    route: '/menu/create',
    title: 'Yeni menü oluştur',
    description: 'Davetin veya günlük sofran için bir menü hazırla.',
    icon: 'restaurant-outline',
    tint: '#387b64',
  },
];

/**
 * The action belongs to the shared tab navigator, not the Recipes feed.
 * All destinations are real routes; no placeholder image/social imports.
 */
export default function GlobalCreateAction({ tabBarHeight }: { tabBarHeight: number }) {
  const [visible, setVisible] = useState(false);
  const { user, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
  }, []);

  const close = () => setVisible(false);
  const navigate = (route: Destination) => {
    close();
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
    // Let the native modal finish dismissing before pushing a new stack screen.
    navigationTimer.current = setTimeout(() => {
      router.push(user && token ? route : '/login');
      navigationTimer.current = null;
    }, 300);
  };

  return (
    <>
      <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
        <TouchableOpacity
          style={[styles.fab, { bottom: tabBarHeight + 14 }]}
          accessibilityRole="button"
          accessibilityLabel="Tarif veya menü ekle"
          accessibilityHint="Oluşturma seçeneklerini açar"
          accessibilityState={{ expanded: visible }}
          onPress={() => setVisible(true)}
          activeOpacity={0.88}>
          <Ionicons name="add" size={30} color="#ffffff" />
        </TouchableOpacity>
      </View>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={close}>
        <View style={styles.modal}>
          <Pressable
            style={styles.scrim}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Ekle menüsünü kapat" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 14 }]}
            accessibilityViewIsModal>
            <View style={styles.grabber} />
            <View style={styles.sheetHeader}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>TARİFTEN · MUTFAĞIM</Text>
                <Text style={styles.heading}>Ne eklemek istersin?</Text>
                <Text style={styles.intro}>Mutfaktaki güzel fikirler burada başlar.</Text>
              </View>
              <TouchableOpacity onPress={close} style={styles.close}
                accessibilityRole="button" accessibilityLabel="Menüyü kapat">
                <Ionicons name="close" size={23} color="#7e817c" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.optionScroll} contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
              {ACTIONS.map(action => (
                <TouchableOpacity
                  key={action.route}
                  onPress={() => navigate(action.route)}
                  accessibilityRole="button"
                  accessibilityLabel={action.title}
                  accessibilityHint={action.description}
                  activeOpacity={0.8}
                  style={styles.option}>
                  <View style={styles.iconTile}>
                    <Ionicons name={action.icon} size={24} color={action.tint} />
                  </View>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{action.title}</Text>
                    <Text style={styles.optionDesc}>{action.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color="#bb8b7a" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute', right: 18, width: 58, height: 58, borderRadius: 21,
    backgroundColor: '#df5043', justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: '#ffffff',
    shadowColor: '#8c3c2f', shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 9,
  },
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20, 29, 34, 0.49)' },
  sheet: {
    maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 13,
    backgroundColor: '#fffbf7', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    shadowColor: '#1e1e22', shadowOpacity: 0.1, shadowRadius: 18,
  },
  grabber: { width: 38, height: 4, borderRadius: 3, backgroundColor: '#dfd6ce', alignSelf: 'center', marginBottom: 19 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 20 },
  headerCopy: { flex: 1, gap: 5 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, color: '#d95d4f' },
  heading: { fontSize: 25, lineHeight: 31, fontWeight: '900', color: '#1b2b34', letterSpacing: -0.5 },
  intro: { fontSize: 12, color: '#93867c', lineHeight: 18 },
  close: { width: 39, height: 39, borderRadius: 20, backgroundColor: '#f6efe9', alignItems: 'center', justifyContent: 'center' },
  optionScroll: { flexGrow: 0 },
  options: { gap: 11, paddingBottom: 4 },
  option: {
    flexDirection: 'row', alignItems: 'center', minHeight: 88,
    backgroundColor: '#ffffff', borderColor: '#efe4d8', borderWidth: 1,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 13, gap: 13,
  },
  iconTile: {
    width: 51, height: 51, borderRadius: 17, backgroundColor: '#fff0e6',
    alignItems: 'center', justifyContent: 'center',
  },
  optionCopy: { flex: 1, minWidth: 0, gap: 4 },
  optionTitle: { fontSize: 15, lineHeight: 20, color: '#24352f', fontWeight: '900' },
  optionDesc: { fontSize: 12, lineHeight: 18, color: '#8a938d' },
  footnote: { fontSize: 11, lineHeight: 17, color: '#9d9085', textAlign: 'center', marginTop: 20 },
});
