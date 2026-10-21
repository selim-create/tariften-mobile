import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { beginMenu, readMenu, findMenu, advanceMenu, retryMenu, type MenuJob } from '../../lib/menu-jobs';
import { fetchAccountQuotas, reached, resetDate, useQuotas } from '../../lib/quotas';
import { Ionicons } from '@expo/vector-icons';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';

const MEAL_TYPES = ['Kahvaltı', 'Öğle Yemeği', 'Beş Çayı', 'Akşam Yemeği', 'Kokteyl'];
const DIET_OPTIONS = ['Normal', 'Vejetaryen', 'Vegan', 'Glutensiz', 'Düşük Karb'];
// The same examples the input's placeholder already offers, as one-tap starters.
const CONCEPT_IDEAS = ['Yılbaşı', 'Vegan Brunch', 'İtalyan Gecesi'];
const STEP_LABELS = ['Konsept', 'Detaylar', 'Onay'];

export default function CreateMenuScreen() {
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<MenuJob | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [recoveryDone, setRecoveryDone] = useState(false);
  const busy = useRef(false);
  const quotas = useQuotas(token);
  const savedKey = `tariften_menu_job_${user?.id || 0}`;


  const [concept, setConcept] = useState('');
  const [guestCount, setGuestCount] = useState(4);
  const [eventType, setEventType] = useState('Akşam Yemeği');
  const [diet, setDiet] = useState('Normal');

  useEffect(() => {
    // Wait for the stored session before sending a guest to sign in.
    if (!authLoading && (!user || !token)) {
      router.replace('/(tabs)/profile');
    }
  }, [authLoading, user, token, router]);

  // SecureStore is account-scoped; never open another user's pending job.
  useEffect(() => {
    if (!token || !user?.id) { setRecoveryDone(false); setJob(null); return; }
    let active = true;
    setRecoveryDone(false);
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync(savedKey);
        if (!raw) return;
        const saved = JSON.parse(raw) as { id?: number; requestId?: string; concept?: string; guestCount?: number; eventType?: string; diet?: string };
        if (saved.concept) setConcept(saved.concept);
        if (saved.guestCount) setGuestCount(saved.guestCount);
        if (saved.eventType) setEventType(saved.eventType);
        if (saved.diet) setDiet(saved.diet);
        const recovered = saved.id ? await readMenu(token, saved.id)
          : saved.requestId ? await findMenu(token, saved.requestId) : null;
        if (!active) return;
        if (recovered) {
          setJob(recovered);
          setStep(3);
          if (recovered.status === 'ready') {
            await SecureStore.deleteItemAsync(savedKey);
            router.replace(`/menu/${recovered.slug}`);
          }
        } else {
          setErrorMessage('Önceki menü bulunamadı. Yeni menü oluşturmadan önce kayıtlarınızı kontrol edin.');
        }
      } catch (err) {
        if (active) setErrorMessage(err instanceof Error ? err.message : 'Önceki menü kontrol edilemedi.');
      } finally { if (active) setRecoveryDone(true); }
    })();
    return () => { active = false; };
  }, [token, user?.id, savedKey, router]);

  const runJob = async (initial: MenuJob) => {
    if (!token) return;
    let current = initial;
    let unchanged = 0;
    for (let attempts = 0; attempts < 100; attempts++) {
      if (current.status === 'ready') {
        await SecureStore.deleteItemAsync(savedKey);
        await quotas.refresh();
        router.replace(`/menu/${current.slug}`);
        return;
      }
      if (current.status === 'needs_attention') {
        setErrorMessage(current.message || 'Bazı tarifler oluşturulamadı. Menü taslakta korunuyor.');
        return;
      }
      const completed = current.completed;
      try {
        current = await advanceMenu(token, current.id);
      } catch (error) {
        // A timed-out HTTP connection does not mean a paid recipe was lost.
        try {
          const saved = await readMenu(token, current.id);
          current = saved;
          setJob(saved);
          if (saved.completed > completed || saved.status !== 'generating') continue;
        } catch {
          throw new Error('Bağlantı kesildi. Menü kaydedildi; biraz sonra Kaldığım Yerden Devam Et seçeneğini kullanın.');
        }
        throw error;
      }
      setJob(current);
      const previous = await SecureStore.getItemAsync(savedKey);
      const data = previous ? JSON.parse(previous) as Record<string, unknown> : {};
      await SecureStore.setItemAsync(savedKey, JSON.stringify({ ...data, id: current.id }));
      if (current.completed === completed) {
        unchanged++;
        // A PHP worker may still be billed while its claim is active.
        // Do not spin through 100 repeated requests against one claimed item.
        if (unchanged >= 3) {
          throw new Error('Önceki tarif işlemi sunucuda sürüyor olabilir. Menü kaydedildi; biraz sonra aynı işten devam edebilirsiniz.');
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        unchanged = 0;
      }
    }
    throw new Error('İşlem beklenenden uzun sürdü; mevcut menü kaydedildi. Sonra tekrar devam edebilirsiniz.');
  };

  const handleCreate = async () => {
    if (!token || !user?.id || !recoveryDone || busy.current) return;
    busy.current = true;
    setErrorMessage('');
    setLoading(true);
    try {
      if (job) {
        if (job.status === 'needs_attention') {
          Alert.alert(
            'Ücretli yeniden deneme',
            'Başarısız tariflerin yeniden üretilmesi API maliyeti oluşturabilir. Devam edilsin mi?',
            [
              { text: 'Vazgeç', style: 'cancel' },
              { text: 'Devam Et', onPress: () => { void handleRetry(); } },
            ]
          );
          return;
        }
        await runJob(job);
        return;
      }
      const stored = await SecureStore.getItemAsync(savedKey);
      if (!stored) {
        const available = await fetchAccountQuotas(token).catch(() => null);
        if (reached(available, 'menu_month')) {
          setErrorMessage('Bu ayki menü hakkın doldu. Yeni hak: ' + resetDate(available, 'menu_month'));
          return;
        }
      }
      const form = { concept, guest_count: guestCount, event_type: eventType, diet, cuisine: 'Türk' };
      const requestId = stored
        ? (JSON.parse(stored) as { requestId: string }).requestId
        : Crypto.randomUUID();
      if (!stored) await SecureStore.setItemAsync(savedKey, JSON.stringify({
        requestId, concept, guestCount, eventType, diet,
      }));
      let started: MenuJob | null = null;
      try {
        started = await beginMenu(token, form, requestId);
      } catch (error) {
        // Do not create a second job when the first response was lost.
        try { started = await findMenu(token, requestId); } catch { /* preserve original error */ }
        if (!started) throw error;
      }
      setJob(started);
      await SecureStore.setItemAsync(savedKey, JSON.stringify({
        requestId, id: started.id, concept, guestCount, eventType, diet,
      }));
      await quotas.refresh();
      await runJob(started);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Menü oluşturulamadı; kayıtlı işiniz korunuyor.');
    } finally {
      setLoading(false);
      busy.current = false;
    }
  };

  const handleRetry = async () => {
    if (!token || !job || busy.current) return;
    busy.current = true;
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await retryMenu(token, job.id);
      setJob(result);
      await runJob(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Yeniden deneme başarısız.');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  if (loading) {
    const progress = job && job.total > 0 ? Math.min(1, job.completed / job.total) : 0;
    return (
      <View style={styles.loadingContainer}>
        <View style={styles.loadingArt}>
          {['zeytinyağı', 'domates', 'limon'].map((name, i) => (
            <View key={name} style={[styles.loadingDot, { marginLeft: i ? -10 : 0 }]}><LokmaIngredientIcon name={name} size={26} /></View>
          ))}
        </View>
        <AccentText style={styles.loadingTitle}>{'Sofran *hazırlanıyor…*'}</AccentText>
        <Text style={styles.loadingSubtitle}>{concept} · {guestCount} Kişi</Text>
        {job ? (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} /></View>
            <Text style={styles.loadingSubtitle}>{job.completed} / {job.total} tarif hazır. Tamamlananlar kaydedildi.</Text>
          </View>
        ) : null}
        <ActivityIndicator size="large" color={colors.brand} style={styles.spinner} />
      </View>
    );
  }

  const titles = ['Bugün neyi *kutluyoruz?*', 'Biraz *detay* verelim.', 'Her şey *hazır.*'];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled">
      {/* Progress */}
      <View style={styles.progressBar} accessibilityLabel={`Adım ${step} / 3: ${STEP_LABELS[step - 1]}`}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={styles.progressStep}>
            <View style={[styles.progressLine, step >= s && styles.progressLineActive]} />
            <Text style={[styles.progressLabel, step === s && styles.progressLabelActive]}>
              {String(s).padStart(2, '0')} · {STEP_LABELS[s - 1]}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.kicker}>Yeni menü</Text>
      <AccentText style={styles.stepTitle}>{titles[step - 1]}</AccentText>

      {/* Step 1 - Concept */}
      {step === 1 && (
        <View style={styles.stepContainer}>
          <Text style={styles.stepSubtitle}>
            Özel bir davet, romantik bir akşam yemeği veya sadece kendinizi şımartacağınız bir pazar kahvaltısı...
          </Text>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>KONSEPT</Text>
            <TextInput
              style={styles.input}
              placeholder="Örn: Yılbaşı, Vegan Brunch, İtalyan Gecesi..."
              placeholderTextColor={colors.textFaint}
              value={concept}
              onChangeText={setConcept}
              multiline
            />
            <View style={styles.chipRow}>
              {CONCEPT_IDEAS.map(idea => (
                <TouchableOpacity key={idea} style={[styles.chip, concept === idea && styles.chipActive]}
                  onPress={() => setConcept(idea)} activeOpacity={0.8}>
                  <Text style={[styles.chipText, concept === idea && styles.chipTextActive]}>{idea}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.primaryButton, !concept.trim() && styles.primaryButtonDisabled]}
            onPress={() => setStep(2)}
            disabled={!concept.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Devam Et</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelButtonText}>Vazgeç</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step 2 - Details */}
      {step === 2 && (
        <View style={styles.stepContainer}>
          <View style={styles.card}>
            <Text style={styles.fieldLabel}>KİŞİ SAYISI</Text>
            <View style={styles.guestCountRow}>
              <TouchableOpacity
                style={[styles.countButton, guestCount <= 1 && styles.countButtonDisabled]}
                onPress={() => setGuestCount(Math.max(1, guestCount - 1))}
                disabled={guestCount <= 1}
                accessibilityRole="button" accessibilityLabel="Kişi sayısını azalt"
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={20} color={colors.ink} />
              </TouchableOpacity>
              <View style={styles.countCenter}>
                <Text style={styles.countValue}>{guestCount}</Text>
                <Text style={styles.countUnit}>kişilik</Text>
              </View>
              <TouchableOpacity
                style={[styles.countButton, guestCount >= 20 && styles.countButtonDisabled]}
                onPress={() => setGuestCount(Math.min(20, guestCount + 1))}
                disabled={guestCount >= 20}
                accessibilityRole="button" accessibilityLabel="Kişi sayısını artır"
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={20} color={colors.ink} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.fieldLabel}>ÖĞÜN TİPİ</Text>
            <View style={styles.chipRow}>
              {MEAL_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.chip, eventType === type && styles.chipActive]}
                  onPress={() => setEventType(type)}
                  accessibilityRole="radio" accessibilityState={{ checked: eventType === type }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, eventType === type && styles.chipTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 8 }]}>DİYET TERCİHİ</Text>
            <View style={styles.chipRow}>
              {DIET_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.chip, diet === option && styles.chipActive]}
                  onPress={() => setDiet(option)}
                  accessibilityRole="radio" accessibilityState={{ checked: diet === option }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, diet === option && styles.chipTextActive]}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(1)} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={18} color={colors.ink} />
              <Text style={styles.secondaryButtonText}>Geri</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButtonFlex} onPress={() => setStep(3)} activeOpacity={0.85}>
              <Text style={styles.primaryButtonText}>Son Adım</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Step 3 - Confirm */}
      {step === 3 && (
        <View style={styles.stepContainer}>
          <Text style={styles.stepSubtitle}>Menünü kontrol et; tarifler sırayla hazırlanır ve her biri hazır olunca kaydedilir.</Text>
          <View style={styles.summaryCard}>
            <SummaryRow label="Konsept" value={concept} />
            <SummaryRow label="Kişi Sayısı" value={`${guestCount} Kişi`} />
            <SummaryRow label="Öğün Tipi" value={eventType} />
            <SummaryRow label="Diyet Tercihi" value={diet} last />
          </View>
          {job && <View style={styles.noteCard}><Ionicons name="bookmark-outline" size={17} color={colors.ink} /><Text style={styles.noteText}>Kayıtlı menü: {job.completed} / {job.total} tarif hazır.</Text></View>}
          {!!errorMessage && <View style={[styles.noteCard, styles.errorCard]}><Ionicons name="alert-circle-outline" size={17} color={colors.warning} /><Text style={styles.errorText}>{errorMessage}</Text></View>}
          <TouchableOpacity
            style={[styles.createButton, (!recoveryDone || (!job && reached(quotas.data, 'menu_month'))) && { opacity: 0.45 }]}
            onPress={handleCreate}
            disabled={!recoveryDone || (!job && reached(quotas.data, 'menu_month'))}
            activeOpacity={0.85}>
            <Ionicons name={job ? 'refresh' : 'sparkles'} size={18} color="#fff" />
            <Text style={styles.primaryButtonText}>{job ? (job.status === 'needs_attention' ? 'Başarısızları Yeniden Dene' : 'Kaldığım Yerden Devam Et') : 'Menüyü Oluştur'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(2)} activeOpacity={0.85}>
            <Text style={styles.secondaryButtonText}>Düzenle</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelButtonText}>Vazgeç</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.summaryRow, !last && styles.summaryRowLine]}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 48 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.canvas, padding: 32 },
  loadingArt: { flexDirection: 'row', marginBottom: 20 },
  loadingDot: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.canvas,
  },
  loadingTitle: { fontFamily: fonts.headingBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7, color: colors.ink, textAlign: 'center', marginBottom: 8 },
  loadingSubtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginBottom: 12 },
  progressWrap: { alignSelf: 'stretch', gap: 10, marginTop: 10 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.creamDeep, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
  spinner: { marginTop: 14 },
  progressBar: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  progressStep: { flex: 1, gap: 7 },
  progressLine: { height: 4, borderRadius: 2, backgroundColor: colors.creamDeep },
  progressLineActive: { backgroundColor: colors.brand },
  progressLabel: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textFaint },
  progressLabelActive: { fontFamily: fonts.bodySemi, color: colors.ink },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  stepTitle: { fontFamily: fonts.headingBold, fontSize: 31, lineHeight: 37, letterSpacing: -0.9, color: colors.ink, marginTop: 8, marginBottom: 6 },
  stepContainer: { gap: 16, marginTop: 6 },
  stepSubtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 12, ...shadow.card },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 14, fontFamily: fonts.body, fontSize: 15,
    lineHeight: 22, color: colors.ink, minHeight: 96, textAlignVertical: 'top', backgroundColor: colors.canvas,
  },
  fieldLabel: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.4, color: colors.textMuted },
  guestCountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  countButton: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineStrong,
    justifyContent: 'center', alignItems: 'center',
  },
  countButtonDisabled: { opacity: 0.4 },
  countCenter: { alignItems: 'center' },
  countValue: { fontFamily: fonts.headingBold, fontSize: 34, lineHeight: 40, color: colors.ink },
  countUnit: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    height: 38, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill,
    paddingHorizontal: 15, backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.ink, backgroundColor: colors.ink },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  chipTextActive: { color: '#ffffff' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  primaryButton: {
    backgroundColor: colors.brand, borderRadius: radius.pill, minHeight: 54, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryButtonFlex: {
    flex: 1, backgroundColor: colors.brand, borderRadius: radius.pill, minHeight: 54, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryButtonDisabled: { backgroundColor: colors.lineStrong },
  primaryButtonText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#ffffff' },
  secondaryButton: {
    borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface, borderRadius: radius.pill, minHeight: 54,
    paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  secondaryButtonText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  summaryCard: {
    backgroundColor: colors.surface, borderRadius: radius.xl, paddingHorizontal: 18, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 16, paddingVertical: 14 },
  summaryRowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  summaryLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  summaryValue: { flexShrink: 1, textAlign: 'right', fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  noteCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.cream },
  noteText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.ink },
  errorCard: { backgroundColor: colors.warningSoft },
  errorText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: '#925326' },
  createButton: {
    backgroundColor: colors.brand, borderRadius: radius.pill, minHeight: 56, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  cancelButton: { paddingVertical: 12, alignItems: 'center' },
  cancelButtonText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.textMuted },
});
