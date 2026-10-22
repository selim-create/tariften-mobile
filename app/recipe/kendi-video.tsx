import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '../../context/AuthContext';
import { fetchAccountQuotas, reached, resetDate, useQuotas } from '../../lib/quotas';
import {
  OWN_VIDEO_NOTE_MAX, formatDuration, formatMegabytes, uploadPercent, validateOwnVideo, type OwnVideoCandidate,
} from '../../lib/own-video';
import { OwnVideoUploadError, uploadOwnVideo } from '../../lib/own-video-api';
import { isFeatureUnavailable, markFeatureAvailable, markFeatureUnavailable, useFeatureAvailability } from '../../lib/feature-availability';
import { useNotifications } from '../../components/notifications/NotificationsProvider';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';

type PickedVideo = OwnVideoCandidate & { uri: string };

/**
 * "+" → Kendi videondan tarif. Pick one MP4/MOV (≤3:00, ≤200 MB), upload it with
 * progress and a stable request_id, then continue in the existing video job
 * screen (/recipe/aktar?job=<id>) which polls, reviews and publishes.
 */
export default function OwnVideoRecipeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const quotas = useQuotas(token);
  const { offerAfterImport } = useNotifications();
  useFeatureAvailability();
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [jobFailed, setJobFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(isFeatureUnavailable('own_video'));
  // One request_id per picked video: re-uploading the same video never costs a second credit.
  const requestIdRef = useRef<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => { cancelRef.current?.(); }, []);

  const aiLeft = quotas.data?.quotas.recipe_ai_day;
  const outOfCredits = reached(quotas.data, 'recipe_ai_day');

  const pickVideo = async () => {
    if (uploading || picking) return;
    setPicking(true);
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        allowsMultipleSelection: false,
        // Keep the original file (HEVC is accepted); avoids a slow re-encode on iOS.
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      let fileSize: number | null = typeof asset.fileSize === 'number' ? asset.fileSize : null;
      if (fileSize === null) {
        const info = await FileSystem.getInfoAsync(asset.uri).catch(() => null);
        fileSize = info && info.exists && typeof info.size === 'number' ? info.size : null;
      }
      const candidate: PickedVideo = {
        uri: asset.uri, durationMs: asset.duration ?? null, fileSize, mimeType: asset.mimeType ?? null, fileName: asset.fileName ?? null,
      };
      const problem = validateOwnVideo(candidate);
      setJobFailed(false);
      setProgress(0);
      if (problem) { setVideo(null); requestIdRef.current = null; setError(problem); return; }
      setVideo(candidate);
      requestIdRef.current = randomUUID();
    } catch {
      setError('Galeri açılamadı. Tekrar dene.');
    } finally {
      setPicking(false);
    }
  };

  const upload = async () => {
    if (!token) { router.push('/login'); return; }
    if (!video || uploading) return;
    const problem = validateOwnVideo(video);
    if (problem) { setError(problem); return; }
    setUploading(true);
    setError('');
    setProgress(0);
    try {
      // Free pre-check: never send up to 200 MB when today's AI credit is used up.
      const rights = await fetchAccountQuotas(token);
      if (reached(rights, 'recipe_ai_day')) {
        setError('Bugünkü yapay zekâ tarif hakkını kullandın. Yenilenme: ' + resetDate(rights, 'recipe_ai_day'));
        return;
      }
      const requestId = requestIdRef.current || randomUUID();
      requestIdRef.current = requestId;
      const task = uploadOwnVideo(token, video, requestId, note, (sent, expected) => setProgress(uploadPercent(sent, expected)));
      cancelRef.current = task.cancel;
      const job = await task.promise;
      markFeatureAvailable('own_video');
      if (job.status === 'failed') {
        setJobFailed(true);
        setError(job.failedMessage || 'Bu video işlenemedi.');
        return;
      }
      if (job.isNew) offerAfterImport();
      router.replace(`/recipe/aktar?job=${job.jobId}`);
    } catch (cause) {
      if (cause instanceof OwnVideoUploadError) {
        if (cause.code === 'cancelled') { setError('Yükleme durduruldu. İstersen aynı videoyu yeniden yükleyebilirsin.'); return; }
        if (cause.unavailable) { markFeatureUnavailable('own_video'); setUnavailable(true); }
      }
      setError(cause instanceof Error ? cause.message : 'Video yüklenemedi. Tekrar dene.');
    } finally {
      cancelRef.current = null;
      setUploading(false);
      void quotas.refresh();
    }
  };

  const reset = () => {
    setVideo(null);
    setNote('');
    setError('');
    setProgress(0);
    setJobFailed(false);
    requestIdRef.current = null;
  };

  if (unavailable) {
    return <View style={[styles.root, styles.soon]}>
      <View style={styles.soonIcon}><Ionicons name="videocam-outline" size={30} color={colors.brand} /></View>
      <Text style={styles.soonKicker}>Yakında</Text>
      <Text style={styles.soonTitle}>Kendi videondan tarif çok yakında burada.</Text>
      <Text style={styles.soonText}>Şimdilik Instagram, TikTok ya da YouTube bağlantısıyla aktarabilirsin.</Text>
      <TouchableOpacity style={styles.soonButton} accessibilityRole="button" onPress={() => router.replace('/recipe/aktar')}>
        <Text style={styles.soonButtonText}>Bağlantıyla aktar</Text>
      </TouchableOpacity>
    </View>;
  }

  const details = video ? [formatDuration(video.durationMs), formatMegabytes(video.fileSize)].filter(Boolean).join(' · ') : '';
  return <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Kendi videondan tarif</Text>
        <AccentText style={styles.heading}>{'Çektiğin videoyu *tarife* çevir.'}</AccentText>
        <Text style={styles.subtitle}>
          Mutfakta çektiğin bir videoyu seç. Malzemeleri ve adımları çıkaralım; kontrol edip yayımlamak sana kalsın.
        </Text>
        <View style={styles.stageRow}>
          <Text style={styles.stageActive}>1 · Videon</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
          <Text style={styles.stageInactive}>2 · Tarifini kontrol et</Text>
        </View>
      </View>

      <View style={styles.card}>
        {video ? <View style={styles.videoRow}>
          <View style={styles.videoIcon}><Ionicons name="videocam" size={22} color={colors.brand} /></View>
          <View style={styles.videoCopy}>
            <Text style={styles.videoTitle}>Videon hazır</Text>
            {details ? <Text style={styles.videoMeta}>{details}</Text> : null}
          </View>
          {!uploading ? <TouchableOpacity style={styles.smallButton} onPress={pickVideo} accessibilityRole="button">
            <Text style={styles.smallButtonText}>Değiştir</Text>
          </TouchableOpacity> : null}
        </View> : <TouchableOpacity style={styles.pickTile} onPress={pickVideo} disabled={picking} accessibilityRole="button"
          accessibilityLabel="Galeriden video seç">
          <View style={styles.pickIcon}>{picking ? <ActivityIndicator color={colors.brand} /> : <Ionicons name="film-outline" size={24} color={colors.brand} />}</View>
          <Text style={styles.pickTitle}>Galeriden video seç</Text>
          <Text style={styles.hint}>MP4 veya MOV · en fazla 3 dakika · en fazla 200 MB</Text>
        </TouchableOpacity>}

        {uploading ? <View style={styles.progressBox} accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: progress }}>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
          <Text style={styles.progressText}>{progress < 100 ? `Yükleniyor… %${progress}` : 'Yüklendi, sıraya alınıyor…'}</Text>
        </View> : null}

        <Text style={styles.fieldLabel}>NOT · İSTEĞE BAĞLI</Text>
        <TextInput value={note} onChangeText={setNote} editable={!uploading} multiline maxLength={OWN_VIDEO_NOTE_MAX}
          placeholder="Örn. 4 kişilik, ölçüleri videoda söylüyorum" placeholderTextColor={colors.textFaint}
          textAlignVertical="top" style={[styles.input, styles.multi]} accessibilityLabel="İsteğe bağlı not" />
      </View>

      <View style={styles.howTo}>
        {[
          { icon: 'cloud-upload-outline' as const, text: 'Videon güvenli bir şekilde yüklenir; kimseyle paylaşılmaz.' },
          { icon: 'sparkles-outline' as const, text: 'Malzemeler, ölçüler ve adımlar videondan çıkarılır (1–2 dakika).' },
          { icon: 'trash-outline' as const, text: 'İş bitince video silinir. Tarifini kontrol edip yayımlarsın.' },
        ].map(item => <View key={item.icon} style={styles.howRow}>
          <Ionicons name={item.icon} size={18} color={colors.ink} />
          <Text style={styles.howText}>{item.text}</Text>
        </View>)}
      </View>
      {aiLeft && aiLeft.available && aiLeft.remaining !== null ? <Text style={styles.quota}>
        {outOfCredits ? `Bugünkü yapay zekâ tarif hakkını kullandın. Yenilenme: ${resetDate(quotas.data, 'recipe_ai_day')}`
          : `Bugün kalan yapay zekâ tarif hakkın: ${aiLeft.remaining}`}
      </Text> : null}
    </ScrollView>

    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {error ? <Text accessibilityRole="alert" style={styles.footerError}>{error}</Text> : null}
      {uploading ? <TouchableOpacity style={styles.secondaryButton} accessibilityRole="button" onPress={() => cancelRef.current?.()}>
        <Text style={styles.secondaryText}>Yüklemeyi durdur</Text>
      </TouchableOpacity> : jobFailed ? <TouchableOpacity style={styles.mainButton} accessibilityRole="button" onPress={() => { reset(); void pickVideo(); }}>
        <Ionicons name="refresh" size={18} color="#fff" />
        <Text style={styles.mainButtonText}>Yeni video yükle</Text>
      </TouchableOpacity> : <TouchableOpacity style={[styles.mainButton, (!video || outOfCredits || quotas.loading) && styles.disabled]}
        disabled={!video || outOfCredits || quotas.loading} accessibilityRole="button" onPress={() => { void upload(); }}>
        <Ionicons name="cloud-upload-outline" size={19} color="#fff" />
        <Text style={styles.mainButtonText}>Videoyu yükle ve tarife çevir</Text>
      </TouchableOpacity>}
    </View>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  scroll: { paddingHorizontal: 20, paddingTop: 8, gap: 16, paddingBottom: 36 },
  hero: { paddingTop: 4 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  heading: { fontFamily: fonts.headingBold, fontSize: 31, lineHeight: 37, letterSpacing: -0.9, color: colors.ink, marginTop: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 8 },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  stageActive: { fontFamily: fonts.bodySemi, color: colors.brand, backgroundColor: colors.brandSoft, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, fontSize: 12, overflow: 'hidden' },
  stageInactive: { fontFamily: fonts.bodyMedium, color: colors.textFaint, fontSize: 12 },
  card: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 18, gap: 12, ...shadow.card },
  pickTile: { minHeight: 150, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: '#e7c3b6', backgroundColor: '#fffaf7', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  pickIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  pickTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  hint: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line },
  videoIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  videoCopy: { flex: 1, gap: 2 },
  videoTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  videoMeta: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  smallButton: { height: 36, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: 'center', backgroundColor: colors.surface },
  smallButtonText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  progressBox: { gap: 7 },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: colors.cream, overflow: 'hidden' },
  progressFill: { height: 10, borderRadius: 5, backgroundColor: colors.brand },
  progressText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  fieldLabel: { fontFamily: fonts.bodySemi, color: colors.textMuted, fontSize: 10, letterSpacing: 1.4, marginTop: 4 },
  input: { borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, minHeight: 50, paddingHorizontal: 14, color: colors.ink, backgroundColor: colors.canvas, fontFamily: fonts.body, fontSize: 15 },
  multi: { minHeight: 84, paddingVertical: 12, lineHeight: 21 },
  howTo: { padding: 18, borderRadius: radius.xl, backgroundColor: '#f8f1ea', gap: 12 },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  howText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  quota: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  bottomBar: { backgroundColor: colors.canvas, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, gap: 8 },
  footerError: { fontFamily: fonts.bodySemi, color: '#b54237', fontSize: 13, lineHeight: 18 },
  mainButton: { minHeight: 54, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, paddingHorizontal: 16 },
  mainButtonText: { fontFamily: fonts.bodySemi, color: '#fff', fontSize: 15 },
  secondaryButton: { minHeight: 54, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 15 },
  disabled: { opacity: 0.45 },
  soon: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  soonIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  soonKicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  soonTitle: { fontFamily: fonts.headingBold, fontSize: 22, lineHeight: 28, color: colors.ink, textAlign: 'center' },
  soonText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  soonButton: { marginTop: 10, height: 48, paddingHorizontal: 22, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, justifyContent: 'center', backgroundColor: colors.surface },
  soonButtonText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
});
