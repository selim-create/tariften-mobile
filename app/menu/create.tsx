import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { generateAIMenu } from '../../lib/api';

const MEAL_TYPES = ['Kahvaltı', 'Öğle Yemeği', 'Beş Çayı', 'Akşam Yemeği', 'Kokteyl'];
const DIET_OPTIONS = ['Normal', 'Vejetaryen', 'Vegan', 'Glutensiz', 'Düşük Karb'];

export default function CreateMenuScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [concept, setConcept] = useState('');
  const [guestCount, setGuestCount] = useState(4);
  const [eventType, setEventType] = useState('Akşam Yemeği');
  const [diet, setDiet] = useState('Normal');

  useEffect(() => {
    if (!user || !token) {
      router.replace('/(tabs)/profile');
    }
  }, [user, token, router]);

  const handleCreate = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await generateAIMenu(token, {
        concept,
        guest_count: guestCount,
        event_type: eventType,
        diet,
        cuisine: 'Türk',
      });
      const slug = result?.data?.slug || result?.slug;
      if (slug) {
        router.replace(`/menu/${slug}`);
      }
    } catch (error) {
      console.error('Create menu error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingIcon}>✨</Text>
        <Text style={styles.loadingTitle}>Sihir Yapılıyor...</Text>
        <Text style={styles.loadingSubtitle}>{concept} · {guestCount} Kişi</Text>
        <ActivityIndicator size="large" color="#e74c3c" style={styles.spinner} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Progress Bar */}
      <View style={styles.progressBar}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={styles.progressStep}>
            <View style={[styles.progressDot, step >= s && styles.progressDotActive]}>
              <Text style={[styles.progressDotText, step >= s && styles.progressDotTextActive]}>
                {String(s).padStart(2, '0')}
              </Text>
            </View>
            <Text style={[styles.progressLabel, step >= s && styles.progressLabelActive]}>
              {s === 1 ? 'Konsept' : s === 2 ? 'Detaylar' : 'Onay'}
            </Text>
            {s < 3 && <View style={[styles.progressLine, step > s && styles.progressLineActive]} />}
          </View>
        ))}
      </View>

      {/* Step 1 - Concept */}
      {step === 1 && (
        <View style={styles.stepContainer}>
          <Text style={styles.stepTitle}>Bugün neyi kutluyoruz?</Text>
          <Text style={styles.stepSubtitle}>
            Özel bir davet, romantik bir akşam yemeği veya sadece kendinizi şımartacağınız bir pazar kahvaltısı...
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Örn: Yılbaşı, Vegan Brunch, İtalyan Gecesi..."
            placeholderTextColor="#aaaaaa"
            value={concept}
            onChangeText={setConcept}
            multiline
          />
          <TouchableOpacity
            style={[styles.primaryButton, !concept.trim() && styles.primaryButtonDisabled]}
            onPress={() => setStep(2)}
            disabled={!concept.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Devam Et →</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2 - Details */}
      {step === 2 && (
        <View style={styles.stepContainer}>
          <Text style={styles.stepTitle}>Biraz detay verelim.</Text>

          <Text style={styles.fieldLabel}>Kişi Sayısı</Text>
          <View style={styles.guestCountRow}>
            <TouchableOpacity
              style={styles.countButton}
              onPress={() => setGuestCount(Math.max(1, guestCount - 1))}
              activeOpacity={0.7}
            >
              <Text style={styles.countButtonText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.countValue}>{guestCount}</Text>
            <TouchableOpacity
              style={styles.countButton}
              onPress={() => setGuestCount(Math.min(20, guestCount + 1))}
              activeOpacity={0.7}
            >
              <Text style={styles.countButtonText}>+</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Öğün Tipi</Text>
          <View style={styles.chipRow}>
            {MEAL_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.chip, eventType === type && styles.chipActive]}
                onPress={() => setEventType(type)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, eventType === type && styles.chipTextActive]}>{type}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Diyet Tercihi</Text>
          <View style={styles.chipRow}>
            {DIET_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.chip, diet === option && styles.chipActive]}
                onPress={() => setDiet(option)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, diet === option && styles.chipTextActive]}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(1)} activeOpacity={0.85}>
              <Text style={styles.secondaryButtonText}>← Geri</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButtonFlex} onPress={() => setStep(3)} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Son Adım →</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 3 - Confirm */}
      {step === 3 && (
        <View style={styles.stepContainer}>
          <Text style={styles.confirmIcon}>🥂</Text>
          <Text style={styles.stepTitle}>Her şey harika görünüyor!</Text>
          <View style={styles.summaryCard}>
            <SummaryRow label="Konsept" value={concept} />
            <SummaryRow label="Kişi Sayısı" value={`${guestCount} Kişi`} />
            <SummaryRow label="Öğün Tipi" value={eventType} />
            <SummaryRow label="Diyet Tercihi" value={diet} />
          </View>
          <TouchableOpacity style={styles.createButton} onPress={handleCreate} activeOpacity={0.85}>
            <Text style={styles.primaryButtonText}>✨ Menüyü Oluştur</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(2)} activeOpacity={0.85}>
            <Text style={styles.secondaryButtonText}>Düzenle</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 32,
  },
  loadingIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  loadingSubtitle: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 32,
  },
  spinner: {
    marginTop: 8,
  },
  progressBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    marginTop: 8,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  progressDotActive: {
    backgroundColor: '#e74c3c',
  },
  progressDotText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#aaaaaa',
  },
  progressDotTextActive: {
    color: '#ffffff',
  },
  progressLabel: {
    fontSize: 12,
    color: '#aaaaaa',
    fontWeight: '500',
    marginRight: 8,
  },
  progressLabelActive: {
    color: '#1a1a1a',
  },
  progressLine: {
    width: 24,
    height: 2,
    backgroundColor: '#eeeeee',
    marginRight: 8,
  },
  progressLineActive: {
    backgroundColor: '#e74c3c',
  },
  stepContainer: {
    gap: 16,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1a1a1a',
    lineHeight: 32,
  },
  stepSubtitle: {
    fontSize: 14,
    color: '#888888',
    lineHeight: 21,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: '#1a1a1a',
    minHeight: 80,
    textAlignVertical: 'top',
    backgroundColor: '#fafafa',
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: -8,
  },
  guestCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  countButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  countButtonText: {
    fontSize: 22,
    color: '#1a1a1a',
    fontWeight: '500',
    lineHeight: 26,
  },
  countValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1a1a1a',
    minWidth: 40,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fafafa',
  },
  chipActive: {
    borderColor: '#e74c3c',
    backgroundColor: '#fff0f0',
  },
  chipText: {
    fontSize: 13,
    color: '#666666',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#e74c3c',
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  primaryButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonFlex: {
    flex: 1,
    backgroundColor: '#e74c3c',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#cccccc',
  },
  primaryButtonText: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    color: '#666666',
    fontWeight: '600',
  },
  confirmIcon: {
    fontSize: 40,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: '#fafafa',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eeeeee',
    gap: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#888888',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: '700',
  },
  createButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
});
