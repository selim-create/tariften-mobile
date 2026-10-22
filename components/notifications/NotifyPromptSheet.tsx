import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow } from '../../constants/theme';

/**
 * The only automatic permission moment: right after a video import starts.
 * We explain first; the OS prompt appears only after "Haber ver".
 */
export default function NotifyPromptSheet({ visible, onAccept, onDecline }: {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDecline} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onDecline} accessibilityLabel="Kapat" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} accessibilityViewIsModal>
        <View style={styles.handle} />
        <View style={styles.icon}><Ionicons name="notifications-outline" size={22} color={colors.brand} /></View>
        <Text style={styles.title}>Tarifin hazır olunca haber verelim mi?</Text>
        <Text style={styles.body}>
          Video incelemesi birkaç dakika sürebilir. Uygulamadan çıkabilirsin; tarifin hazır olduğunda ya da
          kontrolünü beklediğinde tek bir bildirim göndeririz.
        </Text>
        <Text style={styles.note}>Kampanya ya da reklam bildirimi göndermeyiz. Profil’den istediğin zaman kapatabilirsin.</Text>
        <TouchableOpacity style={styles.primary} onPress={onAccept} accessibilityRole="button">
          <Text style={styles.primaryText}>Haber ver</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={onDecline} accessibilityRole="button">
          <Text style={styles.secondaryText}>Şimdi değil</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.canvas, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: 24, paddingTop: 10, gap: 10, ...shadow.floating,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginBottom: 8 },
  icon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.headingBold, fontSize: 21, lineHeight: 27, letterSpacing: -0.4, color: colors.ink, marginTop: 4 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
  note: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  primary: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  secondary: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.textMuted },
});
