import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts, radius } from '../../constants/theme';
import {
  RECIPE_NOTE_MAX_LENGTH, RecipeNoteError, deleteMyRecipeNote, getMyRecipeNote, noteDateTr, noteLength,
  saveMyRecipeNote, type RecipeNote,
} from '../../lib/recipe-notes-api';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * "Notum" on the recipe page: a private plain-text note only the member sees
 * (Core 1.0.59, P11). Guests get a quiet sign-in hint and no request is made.
 * The note is kept in memory only, keyed by the signed-in member and recipe;
 * signing out or opening another account never shows someone else's note.
 */
export default function RecipeNoteCard({ recipeId, onToast }: { recipeId: number; onToast?: (message: string) => void }) {
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuth();
  const memberToken = user && token ? token : null;

  const [state, setState] = useState<LoadState>('loading');
  const [note, setNote] = useState<RecipeNote | null>(null);
  const [maxLength, setMaxLength] = useState(RECIPE_NOTE_MAX_LENGTH);
  const [loadError, setLoadError] = useState<RecipeNoteError | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editorError, setEditorError] = useState<RecipeNoteError | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Each load/save belongs to one member + recipe; stale replies are dropped.
  const scopeRef = useRef('');
  const scope = memberToken ? `${user?.id}:${recipeId}` : '';

  useEffect(() => {
    scopeRef.current = scope;
    setNote(null);
    setLoadError(null);
    setEditorVisible(false);
    setEditorError(null);
    setDraft('');
    if (!memberToken || !scope) return undefined;
    setState('loading');
    const controller = new AbortController();
    getMyRecipeNote(memberToken, recipeId, controller.signal).then(
      result => {
        if (controller.signal.aborted || scopeRef.current !== scope) return;
        setNote(result.note);
        setMaxLength(result.maxLength);
        setState('ready');
      },
      (cause: unknown) => {
        if (controller.signal.aborted || scopeRef.current !== scope) return;
        setLoadError(cause instanceof RecipeNoteError ? cause : new RecipeNoteError('Notun yüklenemedi.', 'unavailable'));
        setState('error');
      },
    );
    return () => controller.abort();
  }, [memberToken, recipeId, scope, reloadKey]);

  const openEditor = useCallback(() => {
    setDraft(note?.note ?? '');
    setEditorError(null);
    setEditorVisible(true);
  }, [note]);

  const length = noteLength(draft);
  const tooLong = length > maxLength;
  const dirty = draft.trim() !== (note?.note ?? '').trim();

  const closeEditor = () => {
    if (saving) return;
    if (!dirty) { setEditorVisible(false); return; }
    Alert.alert('Notun kaydedilmedi', 'Yaptığın değişiklikler kaybolacak.', [
      { text: 'Düzenlemeye devam et', style: 'cancel' },
      { text: 'Kaydetmeden çık', style: 'destructive', onPress: () => setEditorVisible(false) },
    ]);
  };

  const save = async () => {
    if (!memberToken || saving || tooLong) return;
    if (!dirty) { setEditorVisible(false); return; }
    const owner = scope;
    setSaving(true);
    setEditorError(null);
    try {
      // An empty note is a delete on Core; no separate DELETE needed.
      const result = await saveMyRecipeNote(memberToken, recipeId, draft);
      if (scopeRef.current !== owner) return;
      setNote(result.note);
      setEditorVisible(false);
      onToast?.(result.note ? 'Notun kaydedildi' : 'Notun silindi');
    } catch (cause) {
      if (scopeRef.current !== owner) return;
      setEditorError(cause instanceof RecipeNoteError ? cause : new RecipeNoteError('Notun kaydedilemedi.', 'unavailable'));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!memberToken || deleting) return;
    Alert.alert('Notu sil', 'Bu tarife yazdığın not silinecek.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil', style: 'destructive',
        onPress: async () => {
          const owner = scope;
          setDeleting(true);
          try {
            await deleteMyRecipeNote(memberToken, recipeId);
            if (scopeRef.current !== owner) return;
            setNote(null);
            setEditorVisible(false);
            onToast?.('Notun silindi');
          } catch (cause) {
            if (scopeRef.current !== owner) return;
            Alert.alert('Not silinemedi', cause instanceof Error ? cause.message : 'Birazdan tekrar dene.');
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (authLoading) return null;

  if (!memberToken) {
    return (
      <Pressable onPress={() => router.push('/login')} style={({ pressed }) => [styles.guest, pressed && { opacity: 0.8 }]}
        accessibilityRole="link" accessibilityLabel="Bu tarife kendine özel not eklemek için giriş yap">
        <Ionicons name="create-outline" size={16} color={colors.textMuted} />
        <Text style={styles.guestText}>Bu tarife kendine not eklemek için <Text style={styles.guestLink}>giriş yap</Text></Text>
      </Pressable>
    );
  }

  const updated = note ? noteDateTr(note.updated_at) : '';

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headIcon}><Ionicons name="create-outline" size={17} color={colors.brand} /></View>
        <View style={styles.headCopy}>
          <Text style={styles.title}>Notum</Text>
          <View style={styles.privateRow}>
            <Ionicons name="lock-closed-outline" size={11} color={colors.textMuted} />
            <Text style={styles.privateText}>Yalnızca sen görürsün</Text>
          </View>
        </View>
        {state === 'ready' && note ? (
          <TouchableOpacity onPress={openEditor} style={styles.editPill} accessibilityRole="button" accessibilityLabel="Notumu düzenle">
            <Text style={styles.editPillText}>Düzenle</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {state === 'loading' ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : state === 'error' ? (
        <View style={styles.body}>
          <Text style={styles.muted}>{loadError?.message || 'Notun yüklenemedi.'}</Text>
          {loadError?.code === 'auth' ? (
            <TouchableOpacity onPress={() => router.push('/login')} style={styles.linkButton} accessibilityRole="button">
              <Text style={styles.linkText}>Giriş yap</Text>
            </TouchableOpacity>
          ) : loadError?.code !== 'not_found' ? (
            <TouchableOpacity onPress={() => setReloadKey(k => k + 1)} style={styles.linkButton} accessibilityRole="button">
              <Text style={styles.linkText}>Tekrar dene</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : note ? (
        <View style={styles.body}>
          <Text style={styles.noteText} selectable>{note.note}</Text>
          <View style={styles.footRow}>
            {updated ? <Text style={styles.meta}>Son düzenleme: {updated}</Text> : <View />}
            <TouchableOpacity onPress={remove} disabled={deleting} hitSlop={8} accessibilityRole="button" accessibilityLabel="Notumu sil">
              {deleting ? <ActivityIndicator size="small" color={colors.textMuted} />
                : <Text style={styles.deleteText}>Sil</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.muted}>Tuzu azalt, 10 dk fazla pişir… Bu tarif için hatırlamak istediklerini yaz.</Text>
          <TouchableOpacity onPress={openEditor} style={styles.addButton} accessibilityRole="button">
            <Ionicons name="add" size={18} color={colors.brand} />
            <Text style={styles.addText}>Not ekle</Text>
          </TouchableOpacity>
        </View>
      )}

      <NoteEditorSheet
        visible={editorVisible}
        value={draft}
        onChange={text => { setDraft(text); if (editorError?.code === 'too_long' || editorError?.code === 'invalid') setEditorError(null); }}
        length={length}
        maxLength={maxLength}
        tooLong={tooLong}
        saving={saving}
        error={editorError}
        isNew={!note}
        onCancel={closeEditor}
        onSave={() => { void save(); }}
        onLogin={() => { setEditorVisible(false); router.push('/login'); }}
      />
    </View>
  );
}

function NoteEditorSheet({
  visible, value, onChange, length, maxLength, tooLong, saving, error, isNew, onCancel, onSave, onLogin,
}: {
  visible: boolean; value: string; onChange: (text: string) => void; length: number; maxLength: number; tooLong: boolean;
  saving: boolean; error: RecipeNoteError | null; isNew: boolean; onCancel: () => void; onSave: () => void; onLogin: () => void;
}) {
  const insets = useSafeAreaInsets();
  const clearing = !isNew && value.trim() === '';
  const nearLimit = length > maxLength * 0.9;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={sheet.modal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={sheet.scrim} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Kapat" />
        <View style={[sheet.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]} accessibilityViewIsModal>
          <View style={sheet.grabber} />
          <Text style={sheet.kicker}>Notum</Text>
          <Text style={sheet.title}>{isNew ? 'Bu tarife not ekle' : 'Notunu düzenle'}</Text>
          <Text style={sheet.hint}>Yalnızca sen görürsün. Düz metin; en fazla {maxLength.toLocaleString('tr-TR')} karakter.</Text>
          <TextInput
            value={value}
            onChangeText={onChange}
            multiline
            autoFocus
            editable={!saving}
            textAlignVertical="top"
            placeholder="Örn. Tuzu azalt, 10 dk fazla pişir."
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Tarif notun"
            style={[sheet.input, tooLong && sheet.inputError]}
          />
          <View style={sheet.counterRow}>
            <Text style={[sheet.error, !error && !tooLong && { opacity: 0 }]} accessibilityLiveRegion="polite" numberOfLines={3}>
              {tooLong ? `Not en fazla ${maxLength.toLocaleString('tr-TR')} karakter olabilir.` : error?.message || ' '}
            </Text>
            <Text style={[sheet.counter, nearLimit && sheet.counterNear, tooLong && sheet.counterOver]}
              accessibilityLabel={`${length} / ${maxLength} karakter`}>
              {length.toLocaleString('tr-TR')} / {maxLength.toLocaleString('tr-TR')}
            </Text>
          </View>
          {error?.code === 'auth' ? (
            <TouchableOpacity onPress={onLogin} style={sheet.loginLink} accessibilityRole="button">
              <Text style={sheet.loginLinkText}>Giriş yap</Text>
            </TouchableOpacity>
          ) : null}
          <View style={sheet.actions}>
            <TouchableOpacity onPress={onCancel} disabled={saving} style={sheet.secondary} accessibilityRole="button">
              <Text style={sheet.secondaryText}>Vazgeç</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSave} disabled={saving || tooLong || (isNew && value.trim() === '')}
              style={[sheet.primary, (saving || tooLong || (isNew && value.trim() === '')) && sheet.primaryDisabled]}
              accessibilityRole="button" accessibilityState={{ disabled: saving || tooLong, busy: saving }}>
              {saving ? <ActivityIndicator color="#fff" />
                : <Text style={sheet.primaryText}>{clearing ? 'Notu sil' : 'Kaydet'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 20, marginTop: 24, padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  headCopy: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.ink },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  privateText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  editPill: {
    height: 34, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  editPillText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  loading: { paddingVertical: 18, alignItems: 'center' },
  body: { marginTop: 14 },
  muted: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted },
  noteText: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, minHeight: 24 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  deleteText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.brand },
  addButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 46, marginTop: 14,
    borderRadius: radius.pill, borderWidth: 1, borderColor: '#f0c8bd', backgroundColor: colors.brandSoft,
  },
  addText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
  linkButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  linkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
  guest: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 22, minHeight: 44 },
  guestText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textMuted },
  guestLink: { fontFamily: fonts.bodySemi, color: colors.brand },
});

const sheet = StyleSheet.create({
  modal: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.canvas, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 20, paddingTop: 12 },
  grabber: { width: 38, height: 4, borderRadius: 3, backgroundColor: colors.lineStrong, alignSelf: 'center', marginBottom: 16 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 21, lineHeight: 27, color: colors.ink, marginTop: 6 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 4 },
  input: {
    minHeight: 140, maxHeight: 260, marginTop: 14, padding: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong,
    backgroundColor: colors.surface, fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.ink,
  },
  inputError: { borderColor: colors.brand },
  counterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8 },
  error: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.brand },
  counter: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textFaint },
  counterNear: { color: colors.warning },
  counterOver: { color: colors.brand },
  loginLink: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  loginLinkText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondary: {
    flex: 1, height: 50, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  primary: { flex: 1.4, height: 50, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
});
