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
import { useAuth } from '../context/AuthContext';

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
  const { register } = useAuth();
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
      await register(formData);
      setShowModal(true);
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
        <View style={styles.logo}>
          <Text style={styles.logoText}>tariften</Text>
          <Text style={styles.logoSubtitle}>Hesap oluşturun</Text>
        </View>

        {/* Social Buttons */}
        <View style={styles.socialRow}>
          <TouchableOpacity style={styles.socialButton} onPress={handleGoogleSignIn}>
            <Text style={styles.socialButtonText}>🔵 Google</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.socialButton, styles.socialButtonDisabled]} disabled>
            <Text style={[styles.socialButtonText, styles.socialButtonTextDisabled]}>🍎 Apple</Text>
            <Text style={styles.soonBadge}>Yakında</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>veya e-posta</Text>
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
                placeholderTextColor="#999"
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.inputLabel}>Kullanıcı Adı</Text>
              <TextInput
                style={styles.input}
                value={formData.username}
                onChangeText={(v) => setFormData((p) => ({ ...p, username: v }))}
                placeholder="kullanici_adi"
                placeholderTextColor="#999"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
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
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
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
                placeholderTextColor="#999"
                secureTextEntry={!showPassword}
                returnKeyType="next"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Diyet + Mutfak Deneyimi */}
          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.inputLabel}>Diyet (opsiyonel)</Text>
              <View style={styles.selectContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {DIET_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[styles.chip, formData.diet === opt.value && styles.chipSelected]}
                      onPress={() =>
                        setFormData((p) => ({ ...p, diet: p.diet === opt.value ? '' : opt.value }))
                      }
                    >
                      <Text style={[styles.chipText, formData.diet === opt.value && styles.chipTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mutfak Deneyimi (opsiyonel)</Text>
            <View style={styles.chipRow}>
              {LEVEL_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, formData.level === opt.value && styles.chipSelected]}
                  onPress={() =>
                    setFormData((p) => ({ ...p, level: p.level === opt.value ? '' : opt.value }))
                  }
                >
                  <Text style={[styles.chipText, formData.level === opt.value && styles.chipTextSelected]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.registerButton, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.registerButtonText}>Hesap Oluştur</Text>
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
          >
            <Text style={styles.loginLinkText}>
              Zaten hesabın var mı?{' '}
              <Text style={styles.loginLinkBold}>Giriş Yap</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Success Modal */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Text style={styles.modalIconText}>✅</Text>
            </View>
            <Text style={styles.modalTitle}>Kayıt Başarılı!</Text>
            <Text style={styles.modalMessage}>Hesabınız oluşturuldu. Giriş yapabilirsiniz.</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setShowModal(false);
                router.replace('/login');
              }}
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
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 16,
  },
  logo: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '900',
    color: '#e74c3c',
    letterSpacing: -1,
  },
  logoSubtitle: {
    fontSize: 16,
    color: '#666666',
    marginTop: 4,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  socialButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  socialButtonDisabled: {
    opacity: 0.5,
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  socialButtonTextDisabled: {
    color: '#999',
  },
  soonBadge: {
    fontSize: 10,
    color: '#999',
    marginLeft: 4,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e5e5',
  },
  dividerText: {
    fontSize: 12,
    color: '#999',
  },
  form: {
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#f9f9f9',
  },
  passwordContainer: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    backgroundColor: '#f9f9f9',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#1a1a1a',
  },
  eyeButton: {
    paddingHorizontal: 14,
  },
  eyeIcon: {
    fontSize: 18,
  },
  selectContainer: {
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#f9f9f9',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    backgroundColor: '#f9f9f9',
  },
  chipSelected: {
    borderColor: '#e74c3c',
    backgroundColor: '#fef2f2',
  },
  chipText: {
    fontSize: 13,
    color: '#666666',
  },
  chipTextSelected: {
    color: '#e74c3c',
    fontWeight: '600',
  },
  registerButton: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  registerButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  loginLink: {
    alignItems: 'center',
    paddingVertical: 8,
    marginBottom: 20,
  },
  loginLinkText: {
    fontSize: 14,
    color: '#666666',
  },
  loginLinkBold: {
    color: '#e74c3c',
    fontWeight: '700',
  },
  legalText: {
    fontSize: 11,
    color: '#999999',
    textAlign: 'center',
    marginTop: 4,
  },
  legalLink: {
    color: '#e74c3c',
    textDecorationLine: 'underline',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
  },
  modalIcon: {
    marginBottom: 16,
  },
  modalIconText: {
    fontSize: 56,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '100%',
  },
  modalButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});
