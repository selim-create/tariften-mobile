import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import LokmaIngredientIcon from '../components/LokmaIngredientIcon';
import { AccentText } from '../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../constants/theme';

const DIET_OPTIONS = [
  { label: 'Hepçil', value: 'none' },
  { label: 'Vegan', value: 'vegan' },
  { label: 'Vejetaryen', value: 'vegetarian' },
  { label: 'Glutensiz', value: 'gluten_free' },
  { label: 'Ketojenik', value: 'keto' },
];

const LEVEL_OPTIONS = [
  { label: 'Acemi', value: 'beginner' },
  { label: 'Orta', value: 'intermediate' },
  { label: 'Usta', value: 'pro' },
];

export default function RegisterScreen() {
  const router = useRouter();
  const { register, loginWithApple } = useAuth();
  const { isTablet } = useResponsive();
  const [formData, setFormData] = useState({
    username: '',
    fullname: '',
    email: '',
    password: '',
    diet: '',
    level: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handleRegister = async () => {
    if (!formData.username || formData.username.length < 3) {
      Alert.alert('Hata', 'Kullanıcı adı en az 3 karakter olmalıdır.');
      return;
    }
    if (!formData.fullname.trim()) {
      Alert.alert('Hata', 'Ad Soyad alanını doldurun.');
      return;
    }
    if (!formData.email.trim()) {
      Alert.alert('Hata', 'E-posta alanını doldurun.');
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      Alert.alert('Hata', 'Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setLoading(true);
    try {
      const signedIn = await register(formData);
      if (signedIn) {
        // Core signed the new member in: straight to the optional kitchen profile.
        router.replace({ pathname: '/profile/kitchen', params: { welcome: '1' } });
      } else {
        setShowModal(true);
      }
    } catch (error: unknown) {
      const rawMessage = error instanceof Error ? error.message : '';
      const cleanMessage = rawMessage.replace(/<[^>]*>/g, '').trim();
      let userMessage = cleanMessage || 'Kayıt yapılamadı.';
      if (cleanMessage.toLowerCase().includes('email') || cleanMessage.toLowerCase().includes('e-posta')) {
        userMessage = 'Bu e-posta adresi zaten kullanılıyor.';
      } else if (cleanMessage.toLowerCase().includes('username') || cleanMessage.toLowerCase().includes('kullanıcı adı')) {
        userMessage = 'Bu kullanıcı adı zaten kullanılıyor.';
      }
      Alert.alert('Kayıt Başarısız', userMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    console.log('Google Sign-In: Kurulum gerekli');
    Alert.alert('Yakında', 'Google ile giriş özelliği yakında eklenecek.');
  };

  const handleAppleSignIn = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (credential.identityToken) {
        const fullName = credential.fullName?.givenName || credential.fullName?.familyName
          ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
          : undefined;
        await loginWithApple(credential.identityToken, fullName);
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      if (error.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Hata', 'Apple ile giriş yapılamadı.');
      }
    }
  };

  const chip = (selected: boolean, label: string, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isTablet && styles.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.formContainer, isTablet && styles.formContainerTablet]}>
        <View style={styles.hero}>
          <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {['domates', 'fesleğen', 'zeytinyağı'].map(name => (
              <View key={name} style={styles.artDot}><LokmaIngredientIcon name={name} size={22} /></View>
            ))}
          </View>
          <Text style={styles.kicker}>Standart Üye ol</Text>
          <AccentText style={styles.title}>{'Defterini *aç.*'}</AccentText>
          <Text style={styles.subtitle}>Aktardığın videolar, yazdığın tarifler ve kurduğun sofralar tek defterde toplansın.</Text>
        </View>

        {/* Social Buttons */}
        <View style={styles.socialRow}>
          {Platform.OS === 'ios' ? (
            <TouchableOpacity style={[styles.socialButton, styles.appleButton]} onPress={handleAppleSignIn}
              accessibilityRole="button" accessibilityLabel="Apple ile devam et">
              <Ionicons name="logo-apple" size={18} color="#ffffff" />
              <Text style={[styles.socialButtonText, styles.appleButtonText]}>Apple</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.socialButton, styles.socialButtonDisabled]} disabled>
              <Ionicons name="logo-apple" size={18} color={colors.textFaint} />
              <Text style={[styles.socialButtonText, styles.socialButtonTextDisabled]}>Apple</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.socialButton} onPress={handleGoogleSignIn}
            accessibilityRole="button" accessibilityLabel="Google ile devam et">
            <Ionicons name="logo-google" size={17} color={colors.ink} />
            <Text style={styles.socialButtonText}>Google</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>veya e-posta ile</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.form}>
          {/* Ad Soyad + Kullanıcı Adı */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.inputLabel}>Ad Soyad</Text>
              <TextInput
                style={styles.input}
                value={formData.fullname}
                onChangeText={(v) => setFormData((p) => ({ ...p, fullname: v }))}
                placeholder="Adınız Soyadınız"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Ad Soyad"
              />
            </View>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
              <TextInput
                style={styles.input}
                value={formData.username}
                onChangeText={(v) => setFormData((p) => ({ ...p, username: v }))}
                placeholder="kullanici_adi"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                accessibilityLabel="Kullanıcı adı"
              />
            </View>
          </View>

          {/* E-posta */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>E-posta</Text>
            <TextInput
              style={styles.input}
              value={formData.email}
              onChangeText={(v) => setFormData((p) => ({ ...p, email: v }))}
              placeholder="ornek@email.com"
              placeholderTextColor={colors.textFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              accessibilityLabel="E-posta"
            />
          </View>

          {/* Şifre */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Şifre</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={formData.password}
                onChangeText={(v) => setFormData((p) => ({ ...p, password: v }))}
                placeholder="En az 6 karakter"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!showPassword}
                returnKeyType="next"
                accessibilityLabel="Şifre"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}
                accessibilityRole="button" accessibilityLabel={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Diyet + Mutfak Deneyimi */}
          <View style={styles.optional}>
            <Text style={styles.optionalTitle}>Biraz da mutfağını tanıyalım</Text>
            <Text style={styles.optionalText}>İsteğe bağlı; önerileri sana göre ayarlamak için.</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Diyet (opsiyonel)</Text>
              <View style={styles.chipRow}>
                {DIET_OPTIONS.map((opt) => chip(formData.diet === opt.value, opt.label, () =>
                  setFormData((p) => ({ ...p, diet: p.diet === opt.value ? '' : opt.value }))))}
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mutfak Deneyimi (opsiyonel)</Text>
              <View style={styles.chipRow}>
                {LEVEL_OPTIONS.map((opt) => chip(formData.level === opt.value, opt.label, () =>
                  setFormData((p) => ({ ...p, level: p.level === opt.value ? '' : opt.value }))))}
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.registerButton, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.registerButtonText}>Hesap Oluştur</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.legalText}>
            Kayıt olarak{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL('https://tariften.com/terms')}>
              Kullanım Koşulları
            </Text>
            {' '}ve{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL('https://tariften.com/privacy')}>
              Gizlilik Politikası
            </Text>
            {'\'nı kabul etmiş olursunuz.'}
          </Text>

          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.replace('/login')}
            accessibilityRole="button"
          >
            <Text style={styles.loginLinkText}>
              Zaten hesabın var mı?{' '}
              <Text style={styles.loginLinkBold}>Giriş Yap</Text>
            </Text>
          </TouchableOpacity>
        </View>
        </View>
      </ScrollView>

      {/* Success Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="checkmark" size={30} color="#ffffff" />
            </View>
            <AccentText style={styles.modalTitle}>{'Defterin *hazır!*'}</AccentText>
            <Text style={styles.modalMessage}>Kayıt Başarılı! Hesabınız oluşturuldu. Giriş yapabilirsiniz.</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowModal(false);
                router.replace('/login');
              }}
              accessibilityRole="button"
            >
              <Text style={styles.modalButtonText}>Giriş Yap</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  scrollContentTablet: { alignItems: 'center' },
  formContainer: { width: '100%' },
  formContainerTablet: { maxWidth: 520 },
  hero: { marginBottom: 26 },
  art: { flexDirection: 'row', marginBottom: 18 },
  artDot: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.canvas, marginRight: -8,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 36, lineHeight: 41, letterSpacing: -1.2, color: colors.ink, marginTop: 10 },
  subtitle: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.textMuted, marginTop: 10 },
  socialRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  socialButton: {
    flex: 1, height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  appleButton: { backgroundColor: colors.ink, borderColor: colors.ink },
  appleButtonText: { color: '#ffffff' },
  socialButtonDisabled: { opacity: 0.5 },
  socialButtonText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  socialButtonTextDisabled: { color: colors.textFaint },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 10 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  dividerText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  form: { gap: 16 },
  row: { flexDirection: 'row', gap: 10 },
  flex1: { flex: 1 },
  inputGroup: { gap: 7 },
  inputLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  input: {
    height: 52, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14,
    fontFamily: fonts.body, fontSize: 15, color: colors.ink, backgroundColor: colors.surface,
  },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center', height: 52, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, backgroundColor: colors.surface,
  },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  eyeButton: { width: 48, height: '100%', alignItems: 'center', justifyContent: 'center' },
  optional: {
    gap: 14, padding: 16, borderRadius: radius.xl, backgroundColor: '#f8f1ea', marginTop: 4,
  },
  optionalTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink },
  optionalText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: -10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 38, paddingHorizontal: 15, borderRadius: radius.pill, justifyContent: 'center',
    borderWidth: 1, borderColor: '#eadfd5', backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  chipTextSelected: { color: '#ffffff' },
  registerButton: {
    height: 54, borderRadius: radius.pill, backgroundColor: colors.brand, marginTop: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  registerButtonText: { fontFamily: fonts.bodySemi, color: '#ffffff', fontSize: 16 },
  legalText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint, textAlign: 'center' },
  legalLink: { fontFamily: fonts.bodySemi, color: colors.textMuted, textDecorationLine: 'underline' },
  loginLink: { alignItems: 'center', paddingVertical: 10 },
  loginLinkText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  loginLinkBold: { fontFamily: fonts.bodySemi, color: colors.brand },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 28 },
  modalCard: {
    width: '100%', maxWidth: 400, alignItems: 'center', padding: 28, borderRadius: radius.xl,
    backgroundColor: colors.canvas, ...shadow.floating,
  },
  modalIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modalTitle: { fontFamily: fonts.headingBold, fontSize: 26, letterSpacing: -0.6, color: colors.ink, textAlign: 'center' },
  modalMessage: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 22 },
  modalButton: { alignSelf: 'stretch', height: 52, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  modalButtonText: { fontFamily: fonts.bodySemi, color: '#ffffff', fontSize: 16 },
});
