import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../../constants/theme';

export interface ContentAction {
  key: string;
  label: string;
  hint?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}

/** The "⋯" menu: a short bottom sheet in the same style as the other sheets. */
export default function ContentActionsSheet({ visible, kicker, title, actions, onClose }: {
  visible: boolean; kicker: string; title: string; actions: ContentAction[]; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Text style={styles.kicker}>{kicker}</Text>
          {title ? <Text style={styles.title} numberOfLines={2}>{title}</Text> : null}
          <View style={styles.card}>
            {actions.map((action, index) => (
              <Pressable key={action.key} onPress={action.onPress}
                style={({ pressed }) => [styles.row, index > 0 && styles.rowLine, pressed && { backgroundColor: colors.cream }]}
                accessibilityRole="button" accessibilityLabel={action.label} accessibilityHint={action.hint}>
                <View style={styles.icon}><Ionicons name={action.icon} size={17} color={colors.ink} /></View>
                <View style={styles.copy}>
                  <Text style={styles.label}>{action.label}</Text>
                  {action.hint ? <Text style={styles.hint}>{action.hint}</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.cancel} accessibilityRole="button">
            <Text style={styles.cancelText}>Vazgeç</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 12 },
  grabber: { width: 38, height: 4, borderRadius: 3, backgroundColor: colors.lineStrong, alignSelf: 'center', marginBottom: 16 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 19, lineHeight: 25, color: colors.ink, marginTop: 6 },
  card: {
    marginTop: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 10 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  hint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  cancel: {
    height: 50, marginTop: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  cancelText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
});
