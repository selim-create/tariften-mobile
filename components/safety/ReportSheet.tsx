import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts, radius } from '../../constants/theme';
import {
  REPORT_DETAILS_MAX, REPORT_OTHER_MIN, REPORT_REASONS, SafetyError, detailsLength, reportDetailsProblem, submitReport,
  type ReportReason, type ReportResult, type ReportTargetType,
} from '../../lib/report-block-api';

export interface ReportTarget {
  type: ReportTargetType;
  id: number;
}

const TITLES: Record<ReportTargetType, string> = {
  recipe: 'Bu tarifi neden bildiriyorsun?',
  comment: 'Bu yorumu neden bildiriyorsun?',
  user: 'Bu üyeyi neden bildiriyorsun?',
};

/**
 * Bildir: reasons in the contract order, optional details (required for
 * "Diğer"), keyboard-safe. The parent shows the server's sentence as a toast.
 */
export default function ReportSheet({ visible, target, onClose, onReported, onGone, onLogin }: {
  visible: boolean;
  target: ReportTarget | null;
  onClose: () => void;
  onReported: (result: ReportResult, target: ReportTarget) => void;
  /** 404: the content is gone or no longer visible to this member. */
  onGone: (message: string, target: ReportTarget) => void;
  onLogin: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const memberToken = user && token ? token : null;
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SafetyError | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Every report starts clean.
  useEffect(() => {
    if (!visible) return;
    setReason(null); setDetails(''); setError(null); setBusy(false);
  }, [visible, target?.type, target?.id]);

  const length = detailsLength(details);
  const tooLong = length > REPORT_DETAILS_MAX;
  const needsDetails = reason === 'other';
  const problem = reportDetailsProblem(reason, details);

  const send = async () => {
    if (!target || busy) return;
    if (!memberToken) { onLogin(); return; }
    if (problem) { setError(new SafetyError(problem, 'invalid', 400)); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await submitReport(memberToken, {
        target_type: target.type, target_id: target.id, reason: reason as ReportReason, details,
      });
      onReported(result, target);
    } catch (cause) {
      const failure = cause instanceof SafetyError ? cause : new SafetyError('Bildirim şu anda gönderilemedi. Birazdan tekrar dene.', 'unavailable');
      if (failure.code === 'not_found') { onGone(failure.message, target); return; }
      setError(failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={busy ? undefined : onClose}>
      <KeyboardAvoidingView style={sheet.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={sheet.scrim} onPress={busy ? undefined : onClose} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={[sheet.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} accessibilityViewIsModal>
          <View style={sheet.grabber} />
          <ScrollView ref={scrollRef} style={sheet.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={sheet.kicker}>Bildir</Text>
            <Text style={sheet.title}>{TITLES[target?.type ?? 'recipe']}</Text>
            <Text style={sheet.hint}>Kimin bildirdiğini paylaşmayız. Ekibimiz en geç 24 saat içinde inceler.</Text>

            <View style={sheet.reasons} accessibilityRole="radiogroup">
              {REPORT_REASONS.map((item, index) => {
                const selected = reason === item.key;
                return (
                  <Pressable key={item.key} onPress={() => { setReason(item.key); setError(null); }} disabled={busy}
                    style={({ pressed }) => [sheet.reason, index > 0 && sheet.reasonLine, pressed && { backgroundColor: colors.cream }]}
                    accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: busy }} accessibilityLabel={item.label}>
                    <Text style={[sheet.reasonText, selected && sheet.reasonTextOn]}>{item.label}</Text>
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20}
                      color={selected ? colors.brand : colors.textFaint} />
                  </Pressable>
                );
              })}
            </View>

            <Text style={sheet.label}>{needsDetails ? 'Ne oldu?' : 'Eklemek istediğin bir şey var mı?'}
              <Text style={sheet.labelHint}>{needsDetails ? `  · en az ${REPORT_OTHER_MIN} karakter` : '  · isteğe bağlı'}</Text>
            </Text>
            <TextInput
              value={details}
              onChangeText={text => { setDetails(text); if (error?.code === 'invalid') setError(null); }}
              onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250)}
              multiline
              editable={!busy}
              textAlignVertical="top"
              placeholder={needsDetails ? 'Kısaca anlat; ekibimiz buna göre inceleyecek.' : 'Örn. Tarif başka bir siteden kopyalanmış.'}
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="Bildirim açıklaması"
              style={[sheet.input, tooLong && sheet.inputError]}
            />
            <View style={sheet.counterRow}>
              <Text style={[sheet.error, !error && { opacity: 0 }]} accessibilityLiveRegion="polite" numberOfLines={4}>
                {error?.message || ' '}
              </Text>
              <Text style={[sheet.counter, tooLong && sheet.counterOver]} accessibilityLabel={`${length} / ${REPORT_DETAILS_MAX} karakter`}>
                {length.toLocaleString('tr-TR')} / {REPORT_DETAILS_MAX.toLocaleString('tr-TR')}
              </Text>
            </View>
            {error?.code === 'auth' ? (
              <TouchableOpacity onPress={onLogin} style={sheet.loginLink} accessibilityRole="button">
                <Text style={sheet.loginLinkText}>Giriş yap</Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>

          <View style={sheet.actions}>
            <TouchableOpacity onPress={onClose} disabled={busy} style={sheet.secondary} accessibilityRole="button">
              <Text style={sheet.secondaryText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { void send(); }} disabled={busy || !!problem}
              style={[sheet.primary, (busy || !!problem) && sheet.primaryDisabled]}
              accessibilityRole="button" accessibilityState={{ disabled: busy || !!problem, busy }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={sheet.primaryText}>Gönder</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheet = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '92%', backgroundColor: colors.canvas, borderTopLeftRadius: 30, borderTopRightRadius: 30,
    paddingHorizontal: 20, paddingTop: 12,
  },
  scroll: { flexGrow: 0 },
  grabber: { width: 38, height: 4, borderRadius: 3, backgroundColor: colors.lineStrong, alignSelf: 'center', marginBottom: 16 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 21, lineHeight: 27, color: colors.ink, marginTop: 6 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 4 },
  reasons: {
    marginTop: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden',
  },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14 },
  reasonLine: { borderTopWidth: 1, borderTopColor: colors.line },
  reasonText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  reasonTextOn: { fontFamily: fonts.bodySemi },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink, marginTop: 18 },
  labelHint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  input: {
    minHeight: 92, maxHeight: 180, marginTop: 8, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong,
    backgroundColor: colors.surface, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.ink,
  },
  inputError: { borderColor: colors.brand },
  counterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8 },
  error: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.brand },
  counter: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint },
  counterOver: { color: colors.brand },
  loginLink: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  loginLinkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: {
    flex: 1, height: 50, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  primary: { flex: 1.4, height: 50, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
});
