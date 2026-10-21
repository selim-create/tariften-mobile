import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../context/AuthContext';
import { useResponsive } from '../hooks/useResponsive';
import LokmaIngredientIcon from '../components/LokmaIngredientIcon';
import { AccentText } from '../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const { login, loginWithApple } = useAuth();
  const { isTablet } = useResponsive();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Return to where sign-in was asked for (e.g. a shared link waiting in
  // Tarif Aktar); open the app's home only when there is nowhere to return.
  const finish = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Hata', 'E-posta ve şifre gereklidir.');
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      finish();
    } catch (error: unknown) {
      const rawMessage = error instanceof Error ? error.message : '';
      const cleanMessage = rawMessage.replace(/<[^>]*>/g, '').trim();
      let userMessage = 'E-posta veya şifre hatalı.';
      if (cleanMessage.toLowerCase().includes('parola') || cleanMessage.toLowerCase().includes('password')) {
        userMessage = 'Şifreniz hatalı. Lütfen tekrar deneyin.';
      } else if (cleanMessage.toLowerCase().includes('kullanıcı') || cleanMessage.toLowerCase().includes('user')) {
        userMessage = 'Kullanıcı bulunamadı. E-posta adresinizi kontrol edin.';
      }
      Alert.alert('Giriş Başarısız', userMessage);
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
        finish();
      }
    } catch (error: any) {
      if (error.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Hata', 'Apple ile giriş yapılamadı.');
      }
    }
  };

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
            {['un', 'yumurta', 'tereyağı'].map(name => (
              <View key={name} style={styles.artDot}><LokmaIngredientIcon name={name} size={22} /></View>
            ))}
          </View>
          <Text style={styles.kicker}>Giriş yap</Text>
          <AccentText style={styles.title}>{'Mutfağa *hoş geldin.*'}</AccentText>
          <Text style={styles.subtitle}>Tariflerin, kaydettiklerin ve sofraların seni bekliyor.</Text>
        </View>

        {/* Social Buttons */}
        <View style={styles.socialRow}>
          {Platform.OS === 'ios' ? (
            <TouchableOpacity style={[styles.socialButton, styles.appleButton]} onPress={handleAppleSignIn}
              accessibilityRole="button" accessibilityLabel="Apple ile giriş yap">
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
            accessibilityRole="button" accessibilityLabel="Google ile giriş yap">
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
              autoComplete="email"
              returnKeyType="next"
              accessibilityLabel="E-posta"
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>Şifre</Text>
              <TouchableOpacity onPress={() => router.push('/forgot-password')} hitSlop={8}>
                <Text style={styles.forgotLink}>Şifremi Unuttum</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                accessibilityLabel="Şifre"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}
                accessibilityRole="button" accessibilityLabel={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.loginButtonText}>Giriş Yap</Text>
                <Ionicons name="arrow-forward" size={18} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerCard}
            onPress={() => router.replace('/register')}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.registerCardTitle}>Hesabın yok mu?</Text>
              <Text style={styles.registerCardText}>Standart Üye ol; tariflerini ve aktarımlarını bir yerde topla.</Text>
            </View>
            <View style={styles.registerCardGo}>
              <Text style={styles.registerLinkBold}>Kayıt Olun</Text>
              <Ionicons name="arrow-forward" size={15} color={colors.brand} />
            </View>
          </TouchableOpacity>

          <Text style={styles.legalText}>
            Giriş yaparak{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL('https://tariften.com/terms')}>
              Kullanım Koşulları
            </Text>
            {' '}ve{' '}
            <Text style={styles.legalLink} onPress={() => Linking.openURL('https://tariften.com/privacy')}>
              Gizlilik Politikası
            </Text>
            {'\'nı kabul etmiş olursunuz.'}
          </Text>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scrollContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  scrollContentTablet: { alignItems: 'center' },
  formContainer: { width: '100%' },
  formContainerTablet: { maxWidth: 480 },
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
  inputGroup: { gap: 7 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inputLabel: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  forgotLink: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.brand },
  input: {
    height: 52, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 16,
    fontFamily: fonts.body, fontSize: 15, color: colors.ink, backgroundColor: colors.surface,
  },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center', height: 52, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.md, backgroundColor: colors.surface,
  },
  passwordInput: { flex: 1, height: '100%', paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  eyeButton: { width: 48, height: '100%', alignItems: 'center', justifyContent: 'center' },
  loginButton: {
    height: 54, borderRadius: radius.pill, backgroundColor: colors.brand, marginTop: 6,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  loginButtonText: { fontFamily: fonts.bodySemi, color: '#ffffff', fontSize: 16 },
  registerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 16,
    borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  registerCardTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink },
  registerCardText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 3 },
  registerCardGo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  registerLinkBold: { fontFamily: fonts.bodySemi, color: colors.brand, fontSize: 14 },
  legalText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint, textAlign: 'center', marginTop: 12 },
  legalLink: { fontFamily: fonts.bodySemi, color: colors.textMuted, textDecorationLine: 'underline' },
});
