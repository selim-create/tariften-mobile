import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { forgotPassword } from '../lib/api';
import { AccentText } from '../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../constants/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setIsSent(true);
    } catch (error) {
      Alert.alert('Bağlantı gönderilemedi', error instanceof Error ? error.message : 'Lütfen biraz sonra tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!isSent ? (
          <View>
            <View style={styles.badge}><Ionicons name="key-outline" size={22} color={colors.brand} /></View>
            <Text style={styles.kicker}>Şifre sıfırlama</Text>
            <AccentText style={styles.title}>{'Şifreni mi *unuttun?*'}</AccentText>
            <Text style={styles.description}>
              Kayıtlı e-posta adresini gir, sana sıfırlama bağlantısı gönderelim.
            </Text>

            <View style={styles.card}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>E-posta</Text>
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="ornek@email.com"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  accessibilityLabel="E-posta"
                />
              </View>

              <TouchableOpacity
                style={[styles.submitButton, (!email.trim() || loading) && styles.buttonDisabled]}
                onPress={handleSubmit}
                disabled={!email.trim() || loading}
                accessibilityRole="button"
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.submitButtonText}>Bağlantı Gönder</Text>
                    <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                  </>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.backLink} onPress={() => router.back()} accessibilityRole="button">
              <Ionicons name="arrow-back" size={16} color={colors.ink} />
              <Text style={styles.backLinkText}>Giriş sayfasına dön</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={[styles.badge, styles.badgeSuccess]}><Ionicons name="mail-open-outline" size={22} color={colors.success} /></View>
            <Text style={[styles.kicker, { color: colors.success }]}>E-posta Gönderildi!</Text>
            <AccentText style={styles.title}>{'Gelen kutuna *bak.*'}</AccentText>
            <Text style={styles.description}>
              <Text style={styles.emailText}>{email}</Text> adresine bir sıfırlama bağlantısı gönderdik. Gelen kutunuzu kontrol edin.
            </Text>

            <TouchableOpacity
              style={styles.returnButton}
              onPress={() => router.replace('/login')}
              accessibilityRole="button"
            >
              <Text style={styles.returnButtonText}>Giriş Sayfasına Dön</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  badge: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  badgeSuccess: { backgroundColor: colors.successSoft },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 34, lineHeight: 39, letterSpacing: -1.1, color: colors.ink, marginTop: 10 },
  description: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.textMuted, marginTop: 10 },
  emailText: { fontFamily: fonts.bodySemi, color: colors.ink },
  card: {
    marginTop: 24, padding: 18, gap: 16, borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  inputGroup: { gap: 7 },
  inputLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  input: {
    height: 52, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 16,
    fontFamily: fonts.body, fontSize: 15, color: colors.ink, backgroundColor: colors.canvas,
  },
  submitButton: {
    height: 54, borderRadius: radius.pill, backgroundColor: colors.brand,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  submitButtonText: { fontFamily: fonts.bodySemi, color: '#ffffff', fontSize: 16 },
  backLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 18 },
  backLinkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  returnButton: {
    height: 54, borderRadius: radius.pill, backgroundColor: colors.ink, marginTop: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  returnButtonText: { fontFamily: fonts.bodySemi, color: '#ffffff', fontSize: 16 },
});
