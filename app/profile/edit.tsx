import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { updateAvatar, updateProfile } from '../../lib/api';
import { colors, fonts, radius } from '../../constants/theme';

const DIET_OPTIONS = [
  { value: '', label: 'Seçiniz' },
  { value: 'none', label: 'Hepçil' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vejetaryen' },
  { value: 'gluten_free', label: 'Glutensiz' },
  { value: 'keto', label: 'Ketojenik' },
];

const EXPERIENCE_OPTIONS = [
  { value: '', label: 'Seçiniz' },
  { value: 'beginner', label: 'Acemi' },
  { value: 'intermediate', label: 'Orta' },
  { value: 'pro', label: 'Usta' },
];

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user, token, refreshUser } = useAuth();

  const [fullname, setFullname] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [diet, setDiet] = useState('');
  const [experience, setExperience] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setFullname(user.user_display_name || '');
      setEmail(user.user_email || '');
      setBio(user.bio || '');
      // Older app builds saved 'omnivore' / 'expert'; Core and the web use 'none' / 'pro'.
      setDiet(user.diet === 'omnivore' ? 'none' : (user.diet || ''));
      setExperience(user.experience === 'expert' ? 'pro' : (user.experience || ''));
    }
  }, [user]);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('İzin Gerekli', 'Fotoğraf seçmek için galeri erişimine izin verin.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!token) return;

    if (newPassword && newPassword !== confirmPassword) {
      Alert.alert('Hata', 'Şifreler eşleşmiyor.');
      return;
    }

    setLoading(true);
    try {
      if (avatarUri) {
        await updateAvatar(token, avatarUri);
      }

      const profileData: Record<string, unknown> = {
        fullname,
        email,
        bio,
        diet,
        experience,
      };
      if (newPassword) {
        profileData.password = newPassword;
      }

      await updateProfile(token, profileData);

      await refreshUser();

      Alert.alert('Başarılı', 'Profiliniz güncellendi.', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Profil güncellenemedi.';
      Alert.alert('Hata', message);
    } finally {
      setLoading(false);
    }
  };

  if (!user || !token) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>Giriş yapmanız gerekiyor.</Text>
        <TouchableOpacity style={styles.centeredButton} onPress={() => router.push('/login')} accessibilityRole="button">
          <Text style={styles.saveButtonText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentAvatar = avatarUri || user.avatar_url || null;
  const initial = (user.user_display_name || user.user_email || 'T').trim().charAt(0).toLocaleUpperCase('tr-TR');

  const chips = (options: { value: string; label: string }[], value: string, onChange: (v: string) => void) => (
    <View style={styles.chips}>
      {options.filter(option => option.value).map(option => {
        const selected = value === option.value;
        return (
          <TouchableOpacity key={option.value} onPress={() => onChange(selected ? '' : option.value)}
            style={[styles.chip, selected && styles.chipActive]}
            accessibilityRole="radio" accessibilityState={{ checked: selected }}>
            {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            <Text style={[styles.chipText, selected && styles.chipTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickAvatar}
          accessibilityRole="button" accessibilityLabel="Profil fotoğrafını değiştir">
          {currentAvatar
            ? <Image source={{ uri: currentAvatar }} style={styles.avatar} contentFit="cover" />
            : <View style={[styles.avatar, styles.monogram]}><Text style={styles.monogramText}>{initial}</Text></View>}
          <View style={styles.avatarEditButton}>
            <Ionicons name="camera-outline" size={16} color={colors.ink} />
          </View>
        </TouchableOpacity>
        <Text style={styles.avatarHint}>Fotoğrafı değiştirmek için dokun</Text>
      </View>

      {/* Kişisel Bilgiler */}
      <View style={styles.section}>
        <Text style={styles.kicker}>Hesap</Text>
        <Text style={styles.sectionTitle}>Kişisel Bilgiler</Text>

        <Text style={styles.label}>Kullanıcı Adı</Text>
        <View style={styles.readonlyInput}>
          <Text style={styles.readonlyPrefix}>@</Text>
          <Text style={styles.readonlyText}>{user.user_login || user.user_nicename}</Text>
          <Ionicons name="lock-closed-outline" size={14} color={colors.textFaint} style={{ marginLeft: 'auto' }} />
        </View>

        <Text style={styles.label}>Ad Soyad</Text>
        <TextInput
          style={styles.input}
          value={fullname}
          onChangeText={setFullname}
          placeholder="Ad Soyad"
          placeholderTextColor={colors.textFaint}
        />

        <Text style={styles.label}>E-posta</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta"
          placeholderTextColor={colors.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Hakkımda</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bio}
          onChangeText={setBio}
          placeholder="Kendinizden bahsedin..."
          placeholderTextColor={colors.textFaint}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* Mutfak Tercihleri */}
      <View style={styles.section}>
        <Text style={styles.kicker}>Mutfak</Text>
        <Text style={styles.sectionTitle}>Mutfak Tercihleri</Text>

        <Text style={styles.label}>Beslenme Tipi</Text>
        {chips(DIET_OPTIONS, diet, setDiet)}

        <Text style={[styles.label, { marginTop: 16 }]}>Mutfak Deneyimi</Text>
        {chips(EXPERIENCE_OPTIONS, experience, setExperience)}

        {/* Diet and experience here stay in sync with the kitchen profile on Core. */}
        <TouchableOpacity style={styles.kitchenLink} onPress={() => router.push('/profile/kitchen')}
          accessibilityRole="button" accessibilityLabel="Mutfak profilinin tamamını düzenle">
          <View style={{ flex: 1 }}>
            <Text style={styles.kitchenLinkTitle}>Mutfak profilinin tamamı</Text>
            <Text style={styles.kitchenLinkText}>Hane, sevmediklerin, ekipman ve alerjiler</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.ink} />
        </TouchableOpacity>
      </View>

      {/* Şifre Değiştirme */}
      <View style={styles.section}>
        <Text style={styles.kicker}>Güvenlik</Text>
        <Text style={styles.sectionTitle}>Şifre Değiştirme</Text>

        <Text style={styles.label}>Yeni Şifre</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Yeni şifre (opsiyonel)"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
        />

        <Text style={styles.label}>Yeni Şifre (Tekrar)</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Şifreyi tekrar girin"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
        />
      </View>

      {/* Kaydet */}
      <TouchableOpacity style={[styles.saveButton, loading && styles.saveButtonDisabled]} onPress={handleSave} disabled={loading}
        accessibilityRole="button">
        <Text style={styles.saveButtonText}>{loading ? 'Kaydediliyor...' : 'Kaydet'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas, gap: 14, padding: 24 },
  centeredText: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink },
  centeredButton: { height: 48, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: colors.brand, justifyContent: 'center' },
  avatarSection: { alignItems: 'center', paddingTop: 12, paddingBottom: 20 },
  avatarWrapper: { position: 'relative', marginBottom: 10 },
  avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.cream },
  monogram: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  monogramText: { fontFamily: fonts.headingBold, fontSize: 40, color: '#fff' },
  avatarEditButton: {
    position: 'absolute', bottom: 2, right: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.canvas,
  },
  avatarHint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  section: {
    padding: 18, marginBottom: 14, borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.brand },
  sectionTitle: { fontFamily: fonts.headingBold, fontSize: 19, color: colors.ink, marginTop: 2, marginBottom: 16 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text, marginBottom: 7 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14, minHeight: 50,
    fontFamily: fonts.body, fontSize: 15, color: colors.ink, backgroundColor: colors.canvas, marginBottom: 14,
  },
  textArea: { height: 104, paddingTop: 12 },
  readonlyInput: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, minHeight: 50, backgroundColor: colors.cream, marginBottom: 14,
  },
  readonlyPrefix: { fontFamily: fonts.body, fontSize: 15, color: colors.textMuted, marginRight: 2 },
  readonlyText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5, height: 38, paddingHorizontal: 14, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  chipTextActive: { color: '#fff' },
  kitchenLink: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, marginTop: 18, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radius.lg, backgroundColor: colors.cream,
  },
  kitchenLinkTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  kitchenLinkText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 1 },
  saveButton: { marginTop: 8, backgroundColor: colors.brand, borderRadius: radius.pill, height: 54, alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontFamily: fonts.bodySemi, color: '#ffffff', fontSize: 16 },
});
