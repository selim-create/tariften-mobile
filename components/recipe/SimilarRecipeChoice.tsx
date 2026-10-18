import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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
            <Ionicons name="close" size={19} color="#826e63" />
          </TouchableOpacity>
          <Text style={styles.kicker}>TARİFTEN · BENZER TARİF</Text>
          <Text accessibilityRole="header" style={styles.title}>Benzer bir tarif zaten var.</Text>
          <Text style={styles.message}><Text style={styles.recipeName}>{title}</Text> tarifine benzeyen bir içerik yayında. Mevcut tarifi görüntüleyebilir veya kendi tarifini ayrıca yayımlayabilirsin.</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.primary} onPress={onViewExisting}>
            <Ionicons name="arrow-forward" color="#fff" size={17} />
            <Text style={styles.primaryText}>Mevcut tarifi görüntüle</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={saving || uncertain}
            style={[styles.secondary, (saving || uncertain) && styles.disabled]} onPress={onCreate}>
            {saving ? <ActivityIndicator color="#b44537" /> : <Ionicons name="checkmark" color="#86574d" size={17} />}
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
  backdrop: { flex: 1, backgroundColor: 'rgba(29,39,46,.64)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  panel: { backgroundColor: '#fffaf6', width: '100%', maxWidth: 420, padding: 25, borderRadius: 26,
    borderWidth: 1, borderColor: '#edddd0', gap: 13 },
  close: { position: 'absolute', top: 17, right: 17, height: 36, width: 36, alignItems: 'center',
    justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#eedecf', zIndex: 2 },
  kicker: { color: '#be4d3f', fontWeight: '900', fontSize: 10, letterSpacing: 1.7, marginTop: 12 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '900', color: '#25383f', marginRight: 20 },
  message: { color: '#7c7069', fontSize: 14, lineHeight: 22, marginBottom: 8 },
  recipeName: { color: '#273b41', fontWeight: '900' },
  primary: { minHeight: 52, borderRadius: 15, backgroundColor: '#db4c3f', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryText: { fontSize: 14, fontWeight: '900', color: '#fff' },
  secondary: { minHeight: 52, borderRadius: 15, borderWidth: 1, borderColor: '#ead8ce',
    backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  secondaryText: { color: '#755851', fontWeight: '800', fontSize: 13 },
  disabled: { opacity: .6 },
  error: { backgroundColor: '#fff0e8', padding: 11, borderRadius: 12, color: '#ad4537', fontSize: 12 },
  footer: { textAlign: 'center', color: '#9a897f', fontSize: 11, lineHeight: 16 },
});
