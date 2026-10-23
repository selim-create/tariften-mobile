import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import {
  KITCHEN_STEPS, KITCHEN_STEP_COUNT, KitchenDraft, KitchenOption, KitchenProfile, KitchenProfileError,
  KitchenProfileOptions, TAG_ERROR_COPY, addTag, allergenConsentMissing, buildStepPayload, consentDateTr,
  getKitchenProfile, mergeStepIntoDraft, profileToDraft, removeTag, setAllergenReaction, setKitchenFlash,
  splitLabel, stepCta, stepForField, stepHousehold, stepIsDirty, tagLength, toggleAllergen, toggleDiet, toggleValue,
  updateKitchenProfile, KitchenExperience, KitchenTimePreference, AllergenReaction,
} from '../../lib/kitchen-profile';
import { shouldOfferWelcomeOnboarding } from '../../lib/onboarding';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Decoration only: labels always come from Core's option catalogue.
const TIME_ICON: Record<string, IoniconName> = { under_20: 'flash-outline', under_45: 'time-outline', no_limit: 'cafe-outline' };
const LEVEL_ICON: Record<string, IoniconName> = { beginner: 'leaf-outline', intermediate: 'flame-outline', pro: 'ribbon-outline' };

interface FieldError { field: string | null; message: string }

/**
 * "Mutfağını tanıyalım": an optional five-step kitchen profile. Every step can
 * be skipped, each "Devam" saves only that step (partial PUT), the last one
 * marks the profile complete. Once complete the same screen is an editor.
 * Allergens are health data: nothing is sent before explicit consent.
 */
export default function KitchenProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const { user, token, setKitchenProfileCompleted } = useAuth();
  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<KitchenProfileOptions | null>(null);
  const [saved, setSaved] = useState<KitchenProfile | null>(null);
  const [draft, setDraft] = useState<KitchenDraft | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<FieldError | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  // Fixed when the screen opens: finishing the flow should not flip the copy mid-way.
  const [editing, setEditing] = useState(false);

  const isWelcome = welcome === '1';

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getKitchenProfile(token);
      setOptions(data.options);
      setSaved(data.profile);
      setDraft(profileToDraft(data.profile));
      setEditing(!!data.profile.completed_at);
      setKitchenProfileCompleted(!!data.profile.completed_at);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Mutfak profilin yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [token, setKitchenProfileCompleted]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // A brand-new account (welcome=1) sees the short "Paylaş → Tariften" walkthrough
  // once, right after this step — finished, skipped or left. Existing members never do.
  const afterWelcome = useCallback(async (fallback: () => void) => {
    if (isWelcome && user && await shouldOfferWelcomeOnboarding(user.id)) {
      router.replace({ pathname: '/onboarding/social', params: { from: 'welcome' } });
      return;
    }
    fallback();
  }, [isWelcome, user, router]);

  const exit = useCallback(() => {
    void afterWelcome(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/profile');
    });
  }, [router, afterWelcome]);

  const dirty = !!(draft && saved && stepIsDirty(step, draft, saved));

  // Earlier steps are already saved; only the open step can hold unsaved changes.
  const leave = useCallback(() => {
    if (!dirty) { exit(); return; }
    Alert.alert('Bu adımdaki değişiklikler kaydedilmedi', 'Çıkarsan bu adımda yaptığın değişiklikler kaybolur.', [
      { text: 'Kal', style: 'cancel' },
      { text: 'Çık', style: 'destructive', onPress: exit },
    ]);
  }, [dirty, exit]);

  const goToStep = useCallback((index: number) => {
    setStep(index);
    setError(null);
    setTagError(null);
    setTagInput('');
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []);

  const jumpTo = useCallback((index: number) => {
    if (index === step) return;
    if (dirty) {
      setError({ field: null, message: `Önce bu adımı kaydet ya da “${stepCta(step, editing).skip}” ile geç.` });
      return;
    }
    goToStep(index);
  }, [step, dirty, editing, goToStep]);

  const finish = useCallback((profile: KitchenProfile) => {
    setKitchenProfileCompleted(!!profile.completed_at);
    setKitchenFlash(editing ? 'Mutfak profilin güncellendi.' : 'Mutfak profilin hazır. Önerileri buna göre ayarlayacağız.');
    // Pops back to the profile tab when it is below us; otherwise replaces this screen with it.
    void afterWelcome(() => router.dismissTo('/(tabs)/profile'));
  }, [editing, router, setKitchenProfileCompleted, afterWelcome]);

  const advance = useCallback(async (skip: boolean) => {
    if (!token || !saved || !draft || saving) return;
    Keyboard.dismiss();
    setError(null);
    const isLast = step === KITCHEN_STEP_COUNT - 1;
    const stepKey = KITCHEN_STEPS[step].key;

    if (!skip && stepKey === 'allergens' && allergenConsentMissing(draft, saved, consentChecked)) {
      setError({ field: 'allergen_consent', message: 'Alerji bilgini kaydetmek için önce onay vermelisin.' });
      return;
    }

    // A food typed but not yet added still counts when the member taps "Devam".
    let working = draft;
    if (!skip && stepKey === 'dislikes' && options && tagInput.trim()) {
      const pending = addTag(draft.dislikes, tagInput, options.dislikes);
      if (pending.error && pending.error !== 'duplicate') {
        setTagError(TAG_ERROR_COPY[pending.error](options.dislikes));
        return;
      }
      working = { ...draft, dislikes: pending.list };
      setTagInput('');
      setTagError(null);
    }

    let nextDraft = skip ? mergeStepIntoDraft(step, draft, saved) : working;
    const payload = buildStepPayload(step, working, saved, { consentChecked, skip });
    let nextSaved = saved;
    if (payload) {
      setSaving(true);
      try {
        nextSaved = await updateKitchenProfile(token, payload);
        nextDraft = mergeStepIntoDraft(step, nextDraft, nextSaved);
        setSaved(nextSaved);
        if (nextSaved.allergen_consent_at) setConsentChecked(false);
      } catch (e) {
        const err = e instanceof KitchenProfileError ? e : null;
        const message = e instanceof Error ? e.message : 'Kaydedilemedi. Tekrar dene.';
        const field = err?.code === 'allergen_consent_required' ? 'allergen_consent' : err?.field ?? null;
        const target = stepForField(field);
        if (working !== draft) setDraft(working); // keep the food that was just added
        if (target !== null && target !== step) goToStep(target);
        setError({ field, message });
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    setDraft(nextDraft);
    if (isLast) finish(nextSaved);
    else goToStep(step + 1);
  }, [token, saved, draft, saving, step, consentChecked, options, tagInput, goToStep, finish]);

  const withdrawConsent = useCallback(() => {
    if (!token) return;
    Alert.alert(
      'Alerji bilgin silinsin mi?',
      'Kayıtlı alerji ve intoleransların ile verdiğin onay silinir. Önerilerde artık bunlara göre uyarı göstermeyiz.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil', style: 'destructive',
          onPress: async () => {
            setSaving(true);
            setError(null);
            try {
              const next = await updateKitchenProfile(token, { allergen_consent: false });
              setSaved(next);
              setDraft(d => (d ? { ...d, allergens: next.allergens.map(a => ({ ...a })) } : d));
              setConsentChecked(false);
            } catch (e) {
              setError({ field: 'allergens', message: e instanceof Error ? e.message : 'Alerji bilgin silinemedi.' });
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }, [token]);

  const commitTag = useCallback(() => {
    if (!draft || !options) return;
    const result = addTag(draft.dislikes, tagInput, options.dislikes);
    if (result.error) {
      // An empty submit is not a mistake worth a red line.
      setTagError(result.error === 'empty' ? null : TAG_ERROR_COPY[result.error](options.dislikes));
      return;
    }
    setDraft({ ...draft, dislikes: result.list });
    setTagInput('');
    setTagError(null);
  }, [draft, options, tagInput]);

  const update = useCallback(<K extends keyof KitchenDraft>(key: K, value: KitchenDraft[K]) => {
    setDraft(d => (d ? { ...d, [key]: value } : d));
    setError(e => (e && e.field === key ? null : e));
  }, []);

  const errorFor = (...fields: string[]) => (error && error.field && fields.includes(error.field) ? error.message : null);
  const generalError = error && (!error.field || stepForField(error.field) === null) ? error.message : null;

  // ---- states before the form ------------------------------------------------------------

  if (!user || !token) {
    return (
      <Shell insets={insets} onBack={leave}>
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Giriş yapman gerekiyor</Text>
          <Text style={styles.centeredText}>Mutfak profilin hesabına kaydedilir.</Text>
          <Pressable style={styles.primary} onPress={() => router.push('/login')} accessibilityRole="button">
            <Text style={styles.primaryText}>Giriş Yap</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  if (loading || (!loadError && (!options || !saved || !draft))) {
    return (
      <Shell insets={insets} onBack={leave}>
        <View style={styles.centered}><ActivityIndicator color={colors.brand} /></View>
      </Shell>
    );
  }

  if (loadError || !options || !saved || !draft) {
    return (
      <Shell insets={insets} onBack={leave}>
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={28} color={colors.textMuted} />
          <Text style={styles.centeredTitle}>Mutfak profilin açılamadı</Text>
          <Text style={styles.centeredText}>{loadError}</Text>
          <Pressable style={styles.primary} onPress={() => void load()} accessibilityRole="button">
            <Text style={styles.primaryText}>Tekrar dene</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  const current = KITCHEN_STEPS[step];
  const cta = stepCta(step, editing);
  const consentDate = consentDateTr(saved.allergen_consent_at);
  const reactions = options.reactions;

  // ---- step bodies -------------------------------------------------------------------------

  const body = (() => {
    switch (current.key) {
      case 'household': {
        const { min, max } = options.household_size;
        const size = draft.household_size;
        return (
          <>
            <Section title="Hane" hint="Genelde kaç kişi için pişiriyorsun?" error={errorFor('household_size')}>
              <View style={styles.stepper}>
                <RoundButton icon="remove" label="Bir kişi azalt" disabled={size === null || size <= min}
                  onPress={() => update('household_size', stepHousehold(size, -1, min, max))} />
                <View style={styles.stepperValue} accessible accessibilityRole="adjustable"
                  accessibilityLabel="Kişi sayısı" accessibilityValue={{ text: size ? `${size} kişi` : 'Belirtilmedi' }}
                  accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                  onAccessibilityAction={e => update('household_size',
                    stepHousehold(size, e.nativeEvent.actionName === 'increment' ? 1 : -1, min, max))}>
                  <Text style={[styles.stepperNumber, size === null && styles.stepperEmpty]}>{size ?? '–'}</Text>
                  <Text style={styles.stepperUnit}>{size ? 'kişi' : 'belirtilmedi'}</Text>
                </View>
                <RoundButton icon="add" label="Bir kişi artır" disabled={size !== null && size >= max}
                  onPress={() => update('household_size', stepHousehold(size, 1, min, max))} />
              </View>
            </Section>
            <Section title="Zaman" hint="Hafta içi bir yemeğe ne kadar ayırırsın?" error={errorFor('time_preference')}>
              <View style={styles.cards}>
                {options.time_preference.map(option => (
                  <ChoiceCard key={option.value} option={option} icon={TIME_ICON[option.value] ?? 'time-outline'}
                    selected={draft.time_preference === option.value}
                    onPress={() => update('time_preference',
                      draft.time_preference === option.value ? null : option.value as KitchenTimePreference)} />
                ))}
              </View>
            </Section>
          </>
        );
      }
      case 'diets':
        return (
          <Section title="Beslenme biçimi" hint="Birden fazla seçebilirsin." error={errorFor('diets')}>
            <ChipGroup options={options.diets} selected={draft.diets}
              onToggle={value => update('diets', toggleDiet(draft.diets, value))} />
            {draft.diets.includes('vegan') ? (
              <Text style={styles.note}>Vegan seçtiğinde vejetaryen ve pesketaryen ayrıca gerekmez.</Text>
            ) : null}
          </Section>
        );
      case 'dislikes': {
        const limits = options.dislikes;
        const typed = tagLength(tagInput.trim());
        const full = draft.dislikes.length >= limits.max_items;
        return (
          <Section title="Sevmediğin yiyecekler" error={errorFor('dislikes')}
            hint={`En fazla ${limits.max_items} yiyecek, her biri en fazla ${limits.max_length} karakter.`}>
            <View style={[styles.tagInputRow, tagError ? styles.inputInvalid : null]}>
              <TextInput
                style={styles.tagInput}
                value={tagInput}
                onChangeText={v => { setTagInput(v); if (tagError) setTagError(null); }}
                onSubmitEditing={commitTag}
                submitBehavior="submit"
                returnKeyType="done"
                placeholder={full ? 'Liste dolu' : 'Örn. kişniş, mantar, ciğer'}
                placeholderTextColor={colors.textFaint}
                editable={!full}
                maxLength={limits.max_length + 10}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Sevmediğin bir yiyecek"
              />
              <Pressable onPress={commitTag} disabled={full || !tagInput.trim()}
                style={({ pressed }) => [styles.addButton, (full || !tagInput.trim()) && styles.addButtonDisabled, pressed && styles.pressed]}
                accessibilityRole="button" accessibilityLabel="Listeye ekle"
                accessibilityState={{ disabled: full || !tagInput.trim() }}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addButtonText}>Ekle</Text>
              </Pressable>
            </View>
            <View style={styles.counterRow}>
              <Text style={[styles.counter, tagError ? styles.errorText : null]} accessibilityLiveRegion="polite">
                {tagError ?? (typed > 0 ? `${typed}/${limits.max_length} karakter` : ' ')}
              </Text>
              <Text style={styles.counter}>{draft.dislikes.length}/{limits.max_items}</Text>
            </View>
            {draft.dislikes.length ? (
              <View style={styles.chips}>
                {draft.dislikes.map(tag => (
                  <Pressable key={tag} onPress={() => update('dislikes', removeTag(draft.dislikes, tag))}
                    style={({ pressed }) => [styles.tag, pressed && styles.pressed]}
                    accessibilityRole="button" accessibilityLabel={`${tag}, listeden çıkar`}>
                    <Text style={styles.tagText}>{tag}</Text>
                    <Ionicons name="close" size={15} color={colors.textMuted} />
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>Henüz bir şey eklemedin. Hiçbir şeyi dert etmiyorsan bu adımı atlayabilirsin.</Text>
            )}
          </Section>
        );
      }
      case 'equipment':
        return (
          <>
            <Section title="Ekipman" hint="Mutfağında olanları işaretle." error={errorFor('equipment')}>
              <ChipGroup options={options.equipment} selected={draft.equipment}
                onToggle={value => update('equipment', toggleValue(draft.equipment, value))} />
            </Section>
            <Section title="Deneyim" hint="Kendini nerede görüyorsun?" error={errorFor('experience')}>
              <View style={styles.cards}>
                {options.experience.map(option => (
                  <ChoiceCard key={option.value} option={option} icon={LEVEL_ICON[option.value] ?? 'restaurant-outline'}
                    selected={draft.experience === option.value}
                    onPress={() => update('experience',
                      draft.experience === option.value ? null : option.value as KitchenExperience)} />
                ))}
              </View>
            </Section>
          </>
        );
      case 'allergens': {
        const selected = draft.allergens;
        const consentError = errorFor('allergen_consent');
        return (
          <>
            <Section title="Alerjenler" hint="Gıda etiketlerinde bildirilmesi zorunlu 14 alerjen." error={errorFor('allergens')}>
              <ChipGroup options={options.allergens} selected={selected.map(a => a.key)}
                onToggle={key => { update('allergens', toggleAllergen(selected, key)); setError(null); }} />
            </Section>

            {selected.length ? (
              <Section title="Tepki türü" hint="Her biri için alerji mi, intolerans mı?">
                <View style={styles.reactionList}>
                  {selected.map((allergen, index) => {
                    const label = options.allergens.find(o => o.value === allergen.key)?.label ?? allergen.key;
                    return (
                      <View key={allergen.key} style={[styles.reactionRow, index > 0 && styles.reactionRowLine]}>
                        <Text style={styles.reactionLabel} numberOfLines={2}>{label}</Text>
                        <Segmented options={reactions} value={allergen.type} label={label}
                          onChange={type => update('allergens', setAllergenReaction(selected, allergen.key, type as AllergenReaction))} />
                      </View>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            {saved.allergen_consent_at ? (
              <View style={styles.consentDone}>
                <View style={styles.consentDoneHead}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.success} />
                  <Text style={styles.consentDoneText}>Onay verildi{consentDate ? ` · ${consentDate}` : ''}</Text>
                </View>
                <Text style={styles.notice}>{options.allergen_notice}</Text>
                <Pressable onPress={withdrawConsent} disabled={saving} hitSlop={6}
                  style={({ pressed }) => [styles.eraseButton, pressed && styles.pressed]}
                  accessibilityRole="button" accessibilityLabel="Alerji bilgimi sil">
                  <Ionicons name="trash-outline" size={16} color={colors.brand} />
                  <Text style={styles.eraseText}>Alerji bilgimi sil</Text>
                </Pressable>
              </View>
            ) : selected.length ? (
              <View style={[styles.consent, consentError ? styles.consentInvalid : null]}>
                <Text style={styles.notice}>{options.allergen_notice}</Text>
                <Pressable onPress={() => { setConsentChecked(c => !c); setError(null); }}
                  style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: consentChecked }}
                  accessibilityLabel="Bilgilendirmeyi okudum, alerji bilgimin bu amaçla saklanmasını onaylıyorum">
                  <View style={[styles.checkbox, consentChecked && styles.checkboxOn]}>
                    {consentChecked ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
                  </View>
                  <Text style={styles.checkLabel}>Bilgilendirmeyi okudum, alerji bilgimin bu amaçla saklanmasını onaylıyorum.</Text>
                </Pressable>
                {consentError ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{consentError}</Text> : null}
              </View>
            ) : (
              <Text style={styles.privacyLine}>{options.allergen_notice}</Text>
            )}
          </>
        );
      }
    }
  })();

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          <Pressable style={({ pressed }) => [styles.circle, pressed && styles.pressed]} onPress={leave}
            accessibilityRole="button" accessibilityLabel="Geri">
            <Ionicons name="chevron-back" size={21} color={colors.ink} />
          </Pressable>
          <Text style={styles.stepCount} accessibilityLabel={`Adım ${step + 1}, toplam ${KITCHEN_STEP_COUNT}`}>
            {step + 1} / {KITCHEN_STEP_COUNT}
          </Text>
        </View>
        <View style={styles.progress} accessibilityRole="progressbar"
          accessibilityValue={{ min: 1, max: KITCHEN_STEP_COUNT, now: step + 1 }}>
          {KITCHEN_STEPS.map((s, i) => (
            <Pressable key={s.key} style={styles.progressHit} disabled={!editing || saving} hitSlop={{ top: 10, bottom: 10 }}
              onPress={() => jumpTo(i)} accessibilityRole={editing ? 'button' : undefined}
              accessibilityLabel={editing ? `${s.kicker} adımına git` : undefined}
              accessibilityState={editing ? { selected: i === step } : undefined}
              importantForAccessibility={editing ? 'yes' : 'no-hide-descendants'}>
              <View style={[styles.progressSegment, i <= step && styles.progressDone]} />
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
        {isWelcome && step === 0 && !editing ? (
          <View style={styles.welcome}>
            <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {['domates', 'fesleğen', 'zeytinyağı'].map(name => (
                <View key={name} style={styles.artDot}><LokmaIngredientIcon name={name} size={20} /></View>
              ))}
            </View>
            <Text style={styles.welcomeText}>
              Hesabın hazır. Birkaç kısa soruyla önerileri sana göre ayarlayalım; istediğin adımı atlayabilirsin.
            </Text>
          </View>
        ) : null}

        {step === 0 && !isWelcome ? (
          <Text style={styles.overline}>{editing ? 'Mutfak profilin' : 'Mutfağını tanıyalım'}</Text>
        ) : null}
        <Text style={styles.kicker}>{current.kicker}</Text>
        <AccentText style={styles.title} accentStyle={styles.titleAccent}>{current.title}</AccentText>
        <Text style={styles.intro}>{current.intro}</Text>

        <View style={styles.sections}>{body}</View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: keyboardOpen ? 12 : Math.max(insets.bottom, 16) }]}>
        {generalError ? <Text style={[styles.errorText, styles.footerError]} accessibilityLiveRegion="polite">{generalError}</Text> : null}
        <Pressable onPress={() => void advance(false)} disabled={saving}
          style={({ pressed }) => [styles.primary, saving && styles.primaryBusy, pressed && styles.pressed]}
          accessibilityRole="button" accessibilityState={{ busy: saving, disabled: saving }}>
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Text style={styles.primaryText}>{cta.primary}</Text>
              <Ionicons name={step === KITCHEN_STEP_COUNT - 1 ? 'checkmark' : 'arrow-forward'} size={18} color="#fff" />
            </>
          )}
        </Pressable>
        <Pressable onPress={() => void advance(true)} disabled={saving}
          style={({ pressed }) => [styles.skip, pressed && styles.pressed]} accessibilityRole="button">
          <Text style={styles.skipText}>{cta.skip}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---- building blocks -----------------------------------------------------------------------

function Shell({ children, insets, onBack }: { children: React.ReactNode; insets: { top: number }; onBack: () => void }) {
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          <Pressable style={({ pressed }) => [styles.circle, pressed && styles.pressed]} onPress={onBack}
            accessibilityRole="button" accessibilityLabel="Geri">
            <Ionicons name="chevron-back" size={21} color={colors.ink} />
          </Pressable>
        </View>
      </View>
      {children}
    </View>
  );
}

function Section({ title, hint, error, children }: { title: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
      <View style={styles.sectionBody}>{children}</View>
      {error ? <Text style={styles.errorText} accessibilityLiveRegion="polite">{error}</Text> : null}
    </View>
  );
}

function ChipGroup({ options, selected, onToggle }: { options: KitchenOption[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map(option => {
        const on = selected.includes(option.value);
        return (
          <Pressable key={option.value} onPress={() => onToggle(option.value)}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}
            accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={option.label}>
            {on ? <Ionicons name="checkmark" size={15} color="#fff" /> : null}
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ChoiceCard({ option, icon, selected, onPress }: { option: KitchenOption; icon: IoniconName; selected: boolean; onPress: () => void }) {
  const { title, detail } = splitLabel(option.label);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, selected && styles.cardOn, pressed && styles.pressed]}
      accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={option.label}>
      <View style={[styles.cardIcon, selected && styles.cardIconOn]}>
        <Ionicons name={icon} size={18} color={selected ? '#fff' : colors.ink} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{title}</Text>
        {detail ? <Text style={styles.cardDetail}>{detail}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
    </Pressable>
  );
}

function RoundButton({ icon, label, disabled, onPress }: { icon: IoniconName; label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.round, disabled && styles.roundDisabled, pressed && styles.pressed]}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}>
      <Ionicons name={icon} size={22} color={disabled ? colors.textFaint : colors.ink} />
    </Pressable>
  );
}

function Segmented({ options, value, label, onChange }: { options: KitchenOption[]; value: string; label: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup" accessibilityLabel={`${label} için tepki türü`}>
      {options.map(option => {
        const on = option.value === value;
        return (
          <Pressable key={option.value} onPress={() => onChange(option.value)} hitSlop={{ top: 4, bottom: 4 }}
            style={[styles.segment, on && styles.segmentOn]}
            accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={option.label}>
            <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  pressed: { opacity: 0.85 },
  header: { paddingHorizontal: 20, paddingBottom: 10, backgroundColor: colors.canvas },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  circle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  stepCount: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.textMuted, letterSpacing: 0.4 },
  progress: { flexDirection: 'row', gap: 6, marginTop: 6 },
  progressHit: { flex: 1, height: 20, justifyContent: 'center' },
  progressSegment: { height: 4, borderRadius: 2, backgroundColor: colors.creamDeep },
  progressDone: { backgroundColor: colors.brand },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28 },
  welcome: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, marginBottom: 22,
    borderRadius: radius.lg, backgroundColor: colors.cream,
  },
  art: { flexDirection: 'row' },
  artDot: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.cream, marginRight: -8,
  },
  welcomeText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text, marginLeft: 8 },
  overline: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted, marginBottom: 6 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 30, lineHeight: 35, letterSpacing: -0.8, color: colors.ink, marginTop: 8 },
  titleAccent: { fontFamily: fonts.headingBoldItalic, color: colors.brand },
  intro: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 8 },
  sections: { marginTop: 22, gap: 14 },
  section: { padding: 18, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 22, color: colors.ink },
  sectionHint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 3 },
  sectionBody: { marginTop: 14 },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 12 },
  errorText: { fontFamily: fonts.bodyMedium, fontSize: 13, lineHeight: 18, color: colors.brandDark, marginTop: 10 },
  // Stepper
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  round: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineStrong,
  },
  roundDisabled: { backgroundColor: colors.surface, borderColor: colors.line },
  stepperValue: { flex: 1, alignItems: 'center' },
  stepperNumber: { fontFamily: fonts.headingBold, fontSize: 40, lineHeight: 46, letterSpacing: -1, color: colors.ink },
  stepperEmpty: { color: colors.textFaint },
  stepperUnit: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  // Choice cards
  cards: { gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas,
  },
  cardOn: { borderColor: colors.ink, backgroundColor: colors.surface, ...shadow.card },
  cardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream },
  cardIconOn: { backgroundColor: colors.ink },
  cardTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  cardDetail: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.ink },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.ink },
  // Chips
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 15, paddingVertical: 10,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, maxWidth: '100%',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text, flexShrink: 1 },
  chipTextOn: { color: '#fff' },
  // Tags
  tagInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 54, paddingLeft: 14, paddingRight: 5,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.canvas,
  },
  inputInvalid: { borderColor: colors.brand },
  tagInput: { flex: 1, height: '100%', fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 44, paddingHorizontal: 16, borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  addButtonDisabled: { backgroundColor: colors.textFaint },
  addButtonText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#fff' },
  counterRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 8, marginBottom: 12 },
  counter: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.textMuted, flexShrink: 1 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingLeft: 14, paddingRight: 12,
    borderRadius: radius.pill, backgroundColor: colors.cream, maxWidth: '100%',
  },
  tagText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink, flexShrink: 1 },
  empty: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textFaint },
  // Allergen reactions
  reactionList: { marginTop: -4 },
  reactionRow: { gap: 10, paddingVertical: 12 },
  reactionRowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  reactionLabel: { fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 19, color: colors.ink },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: colors.cream },
  segment: { flex: 1, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.surface, ...shadow.card },
  segmentText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textMuted },
  segmentTextOn: { fontFamily: fonts.bodySemi, color: colors.ink },
  // Consent
  consent: { padding: 18, borderRadius: radius.xl, backgroundColor: colors.cream, borderWidth: 1, borderColor: colors.cream },
  consentInvalid: { borderColor: colors.brand },
  notice: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.text },
  privacyLine: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textMuted, paddingHorizontal: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, minHeight: 44, paddingTop: 14 },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.ink, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.ink },
  checkLabel: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: colors.ink },
  consentDone: { padding: 18, borderRadius: radius.xl, backgroundColor: colors.successSoft, gap: 10 },
  consentDoneHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  consentDoneText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.success },
  eraseButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44 },
  eraseText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
  // Footer
  footer: {
    paddingHorizontal: 20, paddingTop: 12, backgroundColor: colors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong,
  },
  footerError: { marginTop: 0, marginBottom: 10 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 54, borderRadius: radius.pill,
    backgroundColor: colors.brand, alignSelf: 'stretch',
  },
  primaryBusy: { opacity: 0.7 },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 16, color: '#fff' },
  skip: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  skipText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.textMuted },
  // States
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 28 },
  centeredTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink, textAlign: 'center' },
  centeredText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginBottom: 8 },
});
