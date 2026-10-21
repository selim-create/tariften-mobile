import React, { useEffect, useRef } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts, radius, type } from '../../constants/theme';

type Destination = '/recipe/create' | '/recipe/aktar' | '/menu/create' | '/(tabs)/recipes?quick=1';
type Icon = React.ComponentProps<typeof Ionicons>['name'];

const ACTIONS: { route: Destination; title: string; description: string; icon: Icon; tint: string; tile: string }[] = [
  {
    route: '/recipe/aktar',
    title: 'Tarif Aktar',
    description: 'Reels, TikTok ya da YouTube linkini yapıştır; tarifi biz çıkaralım.',
    icon: 'link',
    tint: colors.brand,
    tile: '#fdecE6',
  },
  {
    route: '/(tabs)/recipes?quick=1',
    title: 'AI ile Tarif Oluştur',
    description: 'Bir tarif adı ya da elindeki malzemeler yeter.',
    icon: 'sparkles',
    tint: '#b7791f',
    tile: '#fff4dc',
  },
  {
    route: '/recipe/create',
    title: 'Tarifimi Kendim Yazacağım',
    description: 'Malzemeleri, adımları ve fotoğrafı sen belirle.',
    icon: 'create',
    tint: '#3f6f8f',
    tile: '#eaf3f8',
  },
  {
    route: '/menu/create',
    title: 'Menü Oluştur',
    description: 'Günlük sofran ya da özel davetin için menü hazırla.',
    icon: 'restaurant',
    tint: '#387b64',
    tile: '#e9f5ee',
  },
];

/**
 * The create sheet opened by the centre button of the floating tab bar.
 * All destinations are real routes; no placeholder image/social imports.
 */
export default function GlobalCreateAction({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { user, token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const navigationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (navigationTimer.current) clearTimeout(navigationTimer.current);
  }, []);

  const close = () => onClose();
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
              <Text style={type.kicker}>Mutfağına ekle</Text>
              <Text style={styles.heading}>
                Bugün ne <Text style={styles.headingAccent}>pişiriyoruz?</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={close} style={styles.close}
              accessibilityRole="button" accessibilityLabel="Menüyü kapat">
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.optionScroll} contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
            {ACTIONS.map((action, index) => (
              <TouchableOpacity
                key={action.route}
                onPress={() => navigate(action.route)}
                accessibilityRole="button"
                accessibilityLabel={action.title}
                accessibilityHint={action.description}
                activeOpacity={0.8}
                style={[styles.option, index === 0 && styles.primaryOption]}>
                <View style={[styles.iconTile, { backgroundColor: action.tile }]}>
                  <Ionicons name={action.icon} size={22} color={action.tint} />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{action.title}</Text>
                  <Text style={styles.optionDesc}>{action.description}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: colors.canvas, borderTopLeftRadius: 32, borderTopRightRadius: 32,
  },
  grabber: { width: 38, height: 4, borderRadius: 3, backgroundColor: colors.lineStrong, alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 18 },
  headerCopy: { flex: 1, gap: 6 },
  heading: { fontFamily: fonts.headingBold, fontSize: 26, lineHeight: 32, letterSpacing: -0.6, color: colors.ink },
  headingAccent: { fontFamily: fonts.headingBoldItalic, color: colors.brand },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  optionScroll: { flexGrow: 0 },
  options: { gap: 10, paddingBottom: 4 },
  option: {
    flexDirection: 'row', alignItems: 'center', minHeight: 76,
    backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1,
    borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 13, gap: 13,
  },
  primaryOption: { borderColor: '#f0c8bd' },
  iconTile: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, minWidth: 0, gap: 3 },
  optionTitle: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 20, color: colors.ink },
  optionDesc: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted },
});
