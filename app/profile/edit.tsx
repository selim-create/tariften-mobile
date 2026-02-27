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

const DIET_OPTIONS = [
  { value: '', label: 'Seçiniz' },
  { value: 'omnivore', label: 'Hepçil' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'vegetarian', label: 'Vejetaryen' },
  { value: 'gluten_free', label: 'Glutensiz' },
  { value: 'keto', label: 'Ketojenik' },
];

const EXPERIENCE_OPTIONS = [
  { value: '', label: 'Seçiniz' },
  { value: 'beginner', label: 'Acemi' },
  { value: 'intermediate', label: 'Orta' },
  { value: 'expert', label: 'Usta' },
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
  const [showDietPicker, setShowDietPicker] = useState(false);
  const [showExperiencePicker, setShowExperiencePicker] = useState(false);

  useEffect(() => {
    if (user) {
      setFullname(user.user_display_name || '');
      setEmail(user.user_email || '');
      setBio(user.bio || '');
      setDiet(user.diet || '');
      setExperience(user.experience || '');
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
      </View>
    );
  }

  const currentAvatar =
    avatarUri ||
    user.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user.user_display_name || 'U')}&background=db4c3f&color=fff&size=160`;

  const selectedDietLabel = DIET_OPTIONS.find((o) => o.value === diet)?.label || 'Seçiniz';
  const selectedExperienceLabel = EXPERIENCE_OPTIONS.find((o) => o.value === experience)?.label || 'Seçiniz';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarWrapper}>
          <Image source={{ uri: currentAvatar }} style={styles.avatar} contentFit="cover" />
          <TouchableOpacity style={styles.avatarEditButton} onPress={handlePickAvatar}>
            <Ionicons name="camera-outline" size={16} color="#555555" />
          </TouchableOpacity>
        </View>
        <Text style={styles.avatarHint}>Fotoğraf değiştirmek için tıklayın</Text>
      </View>

      {/* Kişisel Bilgiler */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kişisel Bilgiler</Text>

        <Text style={styles.label}>Kullanıcı Adı</Text>
        <View style={styles.readonlyInput}>
          <Text style={styles.readonlyPrefix}>@</Text>
          <Text style={styles.readonlyText}>{user.user_login || user.user_nicename}</Text>
        </View>

        <Text style={styles.label}>Ad Soyad</Text>
        <TextInput
          style={styles.input}
          value={fullname}
          onChangeText={setFullname}
          placeholder="Ad Soyad"
          placeholderTextColor="#aaaaaa"
        />

        <Text style={styles.label}>E-posta</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta"
          placeholderTextColor="#aaaaaa"
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Hakkımda</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bio}
          onChangeText={setBio}
          placeholder="Kendinizden bahsedin..."
          placeholderTextColor="#aaaaaa"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* Mutfak Tercihleri */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mutfak Tercihleri</Text>

        <Text style={styles.label}>Beslenme Tipi</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setShowDietPicker(!showDietPicker)}>
          <Text style={[styles.pickerText, !diet && styles.pickerPlaceholder]}>{selectedDietLabel}</Text>
          <Ionicons name={showDietPicker ? 'chevron-up' : 'chevron-down'} size={16} color="#666666" />
        </TouchableOpacity>
        {showDietPicker && (
          <View style={styles.pickerOptions}>
            {DIET_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.pickerOption, diet === option.value && styles.pickerOptionActive]}
                onPress={() => {
                  setDiet(option.value);
                  setShowDietPicker(false);
                }}
              >
                <Text style={[styles.pickerOptionText, diet === option.value && styles.pickerOptionTextActive]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={styles.label}>Mutfak Deneyimi</Text>
        <TouchableOpacity style={styles.picker} onPress={() => setShowExperiencePicker(!showExperiencePicker)}>
          <Text style={[styles.pickerText, !experience && styles.pickerPlaceholder]}>{selectedExperienceLabel}</Text>
          <Ionicons name={showExperiencePicker ? 'chevron-up' : 'chevron-down'} size={16} color="#666666" />
        </TouchableOpacity>
        {showExperiencePicker && (
          <View style={styles.pickerOptions}>
            {EXPERIENCE_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[styles.pickerOption, experience === option.value && styles.pickerOptionActive]}
                onPress={() => {
                  setExperience(option.value);
                  setShowExperiencePicker(false);
                }}
              >
                <Text
                  style={[styles.pickerOptionText, experience === option.value && styles.pickerOptionTextActive]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Şifre Değiştirme */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Şifre Değiştirme</Text>

        <Text style={styles.label}>Yeni Şifre</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="Yeni şifre (opsiyonel)"
          placeholderTextColor="#aaaaaa"
          secureTextEntry
        />

        <Text style={styles.label}>Yeni Şifre (Tekrar)</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Şifreyi tekrar girin"
          placeholderTextColor="#aaaaaa"
          secureTextEntry
        />
      </View>

      {/* Kaydet */}
      <TouchableOpacity style={[styles.saveButton, loading && styles.saveButtonDisabled]} onPress={handleSave} disabled={loading}>
        <Text style={styles.saveButtonText}>{loading ? 'Kaydediliyor...' : 'Kaydet'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centeredText: {
    fontSize: 15,
    color: '#666666',
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  avatarEditButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 16,
    padding: 6,
  },
  avatarHint: {
    fontSize: 12,
    color: '#999999',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555555',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
    backgroundColor: '#fafafa',
    marginBottom: 14,
  },
  textArea: {
    height: 90,
    paddingTop: 10,
  },
  readonlyInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    marginBottom: 14,
  },
  readonlyPrefix: {
    fontSize: 15,
    color: '#999999',
    marginRight: 2,
  },
  readonlyText: {
    fontSize: 15,
    color: '#999999',
  },
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fafafa',
    marginBottom: 6,
  },
  pickerText: {
    fontSize: 15,
    color: '#1a1a1a',
  },
  pickerPlaceholder: {
    color: '#aaaaaa',
  },
  pickerOptions: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
  },
  pickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  pickerOptionActive: {
    backgroundColor: '#fff0ee',
  },
  pickerOptionText: {
    fontSize: 15,
    color: '#1a1a1a',
  },
  pickerOptionTextActive: {
    color: '#e74c3c',
    fontWeight: '600',
  },
  saveButton: {
    margin: 16,
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});
