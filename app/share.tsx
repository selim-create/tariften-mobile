import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useShareIntentContext } from 'expo-share-intent';
import { sharedContent } from '../lib/share-link';
import { AccentText } from '../components/ui/ScreenTitle';
import { colors, fonts, radius } from '../constants/theme';

type Phase = 'reading' | 'nothing' | 'unsupported';

/** Platform name from a canonical link, for the waiting line only. */
function platformOf(url: string): string | null {
  if (/instagram\.com\//.test(url)) return 'Instagram';
  if (/tiktok\.com\//.test(url)) return 'TikTok';
  if (/youtu(\.be|be\.com)\//.test(url)) return 'YouTube';
  return null;
}

/**
 * "Paylaş → Tariften": the share sheet lands here. The shared link (or recipe
 * text) is handed to Tarif Aktar, already filled in; nothing is analysed or
 * charged until the user starts it there.
 */
export default function ShareScreen() {
  const router = useRouter();
  const { isReady, hasShareIntent, shareIntent, resetShareIntent, error } = useShareIntentContext();
  const [phase, setPhase] = useState<Phase>('reading');
  const [platform, setPlatform] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current || !hasShareIntent) return;
    handled.current = true;
    const { url, text } = sharedContent(shareIntent);
    resetShareIntent();
    if (url) {
      setPlatform(platformOf(url));
      router.replace({ pathname: '/recipe/aktar', params: { url } });
    } else if (text && text.length >= 40) {
      router.replace({ pathname: '/recipe/import', params: { text } });
    } else {
      setPhase('unsupported');
    }
  }, [hasShareIntent, shareIntent, resetShareIntent, router]);

  // Opened without anything to read (or the module is missing): say so, don't spin forever.
  useEffect(() => {
    if (hasShareIntent) return;
    const timer = setTimeout(() => { if (!handled.current) setPhase('nothing'); }, isReady ? 1800 : 3500);
    return () => clearTimeout(timer);
  }, [hasShareIntent, isReady]);

  const title = phase === 'reading' ? 'Tarifin *geliyor…*'
    : phase === 'unsupported' ? 'Burada tarif *bulamadık*' : 'Paylaşım *ulaşmadı*';
  const line = phase === 'reading'
    ? (platform ? `${platform} bağlantısı Tarif Aktar'a taşınıyor.` : 'Paylaştığın bağlantı Tarif Aktar\'a taşınıyor.')
    : phase === 'unsupported'
      ? 'Instagram Reels, TikTok ya da YouTube videosunu, veya bir tarif sayfasının bağlantısını paylaş.'
      : (error ? 'Paylaşılan içerik okunamadı. Bağlantıyı kopyalayıp Tarif Aktar\'a yapıştırabilirsin.' : 'Bağlantıyı kopyalayıp Tarif Aktar\'a yapıştırabilirsin.');

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <Image source={require('../assets/splash-icon.png')} style={styles.mark} accessibilityIgnoresInvertColors />
        <AccentText style={styles.title}>{title}</AccentText>
        <Text style={styles.line}>{line}</Text>
        {phase === 'reading' ? <ActivityIndicator color={colors.brand} style={{ marginTop: 22 }} /> : (
          <View style={styles.actions}>
            <Pressable onPress={() => router.replace('/recipe/aktar')} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.9 }]}
              accessibilityRole="button">
              <Ionicons name="link-outline" size={18} color="#fff" />
              <Text style={styles.primaryText}>Tarif Aktar'ı aç</Text>
            </Pressable>
            <Pressable onPress={() => router.replace('/')} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.85 }]}
              accessibilityRole="button">
              <Text style={styles.secondaryText}>Keşfet'e dön</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  mark: { width: 176, height: 176, marginBottom: 6 },
  title: { fontFamily: fonts.headingBold, fontSize: 30, lineHeight: 36, letterSpacing: -0.8, color: colors.ink, textAlign: 'center' },
  line: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center', marginTop: 10 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 28 },
  primary: {
    height: 52, borderRadius: radius.pill, backgroundColor: colors.brand,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  secondary: { height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
});
