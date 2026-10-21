import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow } from '../../constants/theme';

type Props = {
  visible: boolean;
  title: string;
  saving: boolean;
  uncertain: boolean;
  error: string;
  onViewExisting: () => void;
  onCreate: () => void;
  onClose: () => void;
};

/** Compact choice only for confirmed, published title matches — not a recipe review form. */
export default function SimilarRecipeChoice({
  visible, title, saving, uncertain, error, onViewExisting, onCreate, onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade"
      onRequestClose={() => { if (!saving) onClose(); }}>
      <View style={styles.backdrop}>
        <View style={styles.panel}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Pencereyi kapat"
            style={styles.close} disabled={saving} onPress={onClose}>
            <Ionicons name="close" size={19} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.kicker}>Benzer tarif</Text>
          <Text accessibilityRole="header" style={styles.title}>Benzer bir tarif zaten var.</Text>
          <Text style={styles.message}><Text style={styles.recipeName}>{title}</Text> tarifine benzeyen bir içerik yayında. Mevcut tarifi görüntüleyebilir veya kendi tarifini ayrıca yayımlayabilirsin.</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={onViewExisting}>
            <Ionicons name="arrow-forward" color="#fff" size={17} />
            <Text style={styles.primaryText}>Mevcut tarifi görüntüle</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={saving || uncertain}
            style={[styles.secondary, (saving || uncertain) && styles.disabled]} onPress={onCreate}>
            {saving ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="add" color={colors.ink} size={18} />}
            <Text style={styles.secondaryText}>{saving ? 'Yeni tarif yayımlanıyor…' : 'Yine de yeni tarif oluştur'}</Text>
          </TouchableOpacity>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {uncertain && <Text accessibilityRole="alert" style={styles.error}>
            Tarif kaydedilmiş olabilir. Yeni istekten önce Profil {'>'} Tariflerim bölümünü kontrol et.
          </Text>}
          <Text style={styles.footer}>Mevcut tarifi açmak yeni bir AI isteği başlatmaz.</Text>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 20 },
  panel: { backgroundColor: colors.canvas, width: '100%', maxWidth: 420, padding: 24, borderRadius: radius.xl, gap: 12, ...shadow.floating },
  close: {
    position: 'absolute', top: 16, right: 16, height: 38, width: 38, alignItems: 'center', justifyContent: 'center',
    borderRadius: 19, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, zIndex: 2,
  },
  kicker: { fontFamily: fonts.bodySemi, color: colors.brand, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', marginTop: 8 },
  title: { fontFamily: fonts.headingBold, fontSize: 25, lineHeight: 31, letterSpacing: -0.6, color: colors.ink, marginRight: 30 },
  message: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 8 },
  recipeName: { fontFamily: fonts.bodySemi, color: colors.ink },
  primary: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  secondary: {
    minHeight: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  secondaryText: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 15 },
  disabled: { opacity: 0.55 },
  error: { fontFamily: fonts.body, backgroundColor: colors.brandSoft, padding: 12, borderRadius: radius.md, color: '#ad4537', fontSize: 13, lineHeight: 18, overflow: 'hidden' },
  footer: { fontFamily: fonts.body, textAlign: 'center', color: colors.textFaint, fontSize: 12, lineHeight: 17 },
});
