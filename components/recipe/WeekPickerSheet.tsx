import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius } from '../../constants/theme';
import { localDay, weekDays } from '../../lib/kitchen-store';

const DAY_LONG = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Pick a day of this week or the next to cook a recipe. */
export default function WeekPickerSheet({ visible, title, onClose, onPick }: {
  visible: boolean; title: string; onClose: () => void; onPick: (day: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [next, setNext] = useState(false);
  const base = new Date();
  if (next) base.setDate(base.getDate() + 7);
  const days = weekDays(base);
  const today = localDay();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modal}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Text style={styles.kicker}>Haftaya ekle</Text>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          <View style={styles.switch}>
            {[false, true].map(value => (
              <Pressable key={String(value)} onPress={() => setNext(value)} style={[styles.switchItem, next === value && styles.switchActive]}
                accessibilityRole="tab" accessibilityState={{ selected: next === value }}>
                <Text style={[styles.switchText, next === value && styles.switchTextActive]}>{value ? 'Gelecek hafta' : 'Bu hafta'}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.days}>
            {days.map((d, i) => {
              const key = localDay(d);
              const past = key < today;
              return (
                <Pressable key={key} disabled={past} onPress={() => onPick(key)}
                  style={({ pressed }) => [styles.day, past && { opacity: 0.35 }, pressed && styles.dayPressed]}
                  accessibilityRole="button" accessibilityLabel={`${DAY_LONG[i]} ${d.getDate()}`}>
                  <Text style={styles.dayName}>{DAY_LONG[i]}{key === today ? ' · Bugün' : ''}</Text>
                  <Text style={styles.dayDate}>{d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}</Text>
                  <Ionicons name="add-circle" size={22} color={colors.brand} />
                </Pressable>
              );
            })}
          </View>
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
  title: { fontFamily: fonts.headingBold, fontSize: 21, lineHeight: 27, color: colors.ink, marginTop: 6 },
  switch: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.pill, backgroundColor: colors.cream, marginTop: 16, marginBottom: 12 },
  switchItem: { flex: 1, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  switchActive: { backgroundColor: colors.surface },
  switchText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.textMuted },
  switchTextActive: { color: colors.ink },
  days: { gap: 8 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  dayPressed: { borderColor: colors.brand },
  dayName: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  dayDate: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
});
