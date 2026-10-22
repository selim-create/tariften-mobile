import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TocEntry } from '../../lib/guides';
import { colors, fonts } from '../../constants/theme';

/** Numbered section list: used inline under the hero and as the İçindekiler sheet. */
export function TocList({ entries, onPick }: { entries: TocEntry[]; onPick: (entry: TocEntry) => void }) {
  return (
    <View>
      {entries.map(entry => (
        <Pressable key={entry.id} onPress={() => onPick(entry)}
          style={({ pressed }) => [styles.row, entry.index > 1 && styles.rowLine, pressed && { opacity: 0.6 }]}
          accessibilityRole="button" accessibilityLabel={`${entry.index}. bölüm: ${entry.text}`}>
          <Text style={styles.num}>{String(entry.index).padStart(2, '0')}</Text>
          <Text style={styles.text}>{entry.text}</Text>
          <Ionicons name="arrow-down" size={14} color={colors.textFaint} />
        </Pressable>
      ))}
    </View>
  );
}

export default function GuideTocSheet({ visible, entries, onClose, onPick }: {
  visible: boolean; entries: TocEntry[]; onClose: () => void; onPick: (entry: TocEntry) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="İçindekileri kapat" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>İçindekiler</Text>
              <Text style={styles.title}>{entries.length} bölüm</Text>
            </View>
            <Pressable onPress={onClose} style={styles.close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Kapat">
              <Ionicons name="close" size={20} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            <TocList entries={entries} onPick={onPick} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: { maxHeight: '78%', backgroundColor: colors.canvas, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 12 },
  grabber: { width: 38, height: 4, borderRadius: 3, backgroundColor: colors.lineStrong, alignSelf: 'center', marginBottom: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 21, lineHeight: 27, color: colors.ink, marginTop: 4 },
  close: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, minHeight: 48 },
  rowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  num: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.brand, width: 22, fontVariant: ['tabular-nums'] },
  text: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.ink },
});
