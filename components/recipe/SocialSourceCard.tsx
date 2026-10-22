import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import type { RecipeSocialSource } from '../../lib/types';
import {
  capturedDateTr, creatorLabel, embedUrl, PLATFORM_COPY, playerPageUrl, profileUrl, trustedMetrics, videoPoster,
} from '../../lib/social-format';
import { colors, fonts, radius } from '../../constants/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const PLATFORM_ICON: Record<RecipeSocialSource['platform'], IconName> = {
  instagram: 'logo-instagram', tiktok: 'logo-tiktok', youtube: 'logo-youtube',
};

const METRIC_ICON: Record<string, IconName> = {
  followers: 'people-outline', views: 'eye-outline', likes: 'heart-outline', comments: 'chatbubble-outline',
};

/**
 * Opens Tariften's dark player page (the platform's own player, framed to the
 * video's shape) in an in-app sheet; the original link is the fallback.
 */
export async function watchSocialVideo(source: RecipeSocialSource) {
  const url = playerPageUrl(source) || embedUrl(source) || source.url;
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: '#ffffff',
      toolbarColor: '#120f0d',
      secondaryToolbarColor: '#120f0d',
      enableBarCollapsing: true,
      dismissButtonStyle: 'close',
    });
  } catch {
    void Linking.openURL(source.url);
  }
}

/**
 * Credits the creator of an imported recipe: who made it, where, a way to
 * watch the original, and the audience numbers as they were when the recipe
 * came into Tariften. Unknown values stay hidden; nothing is estimated and no
 * profile photo is invented (the monogram is drawn from the name itself).
 */
export default function SocialSourceCard({ source }: { source: RecipeSocialSource }) {
  const copy = PLATFORM_COPY[source.platform];
  const metrics = trustedMetrics(source);
  const profile = profileUrl(source);
  const captured = capturedDateTr(source.metrics_captured_at);
  const poster = videoPoster(source);
  const { primary, handle } = creatorLabel(source);
  const monogram = (primary || copy.name).replace(/^@/, '').charAt(0).toLocaleUpperCase('tr-TR');

  const open = (url: string | null) => { if (url) void Linking.openURL(url); };

  return (
    <View style={styles.card} accessibilityLabel={`Tarifin orijinal kaynağı: ${copy.name}`}>
      {poster ? (
        <Pressable onPress={() => void watchSocialVideo(source)} style={styles.poster}
          accessibilityRole="button" accessibilityLabel={`Orijinal videoyu ${copy.at} izle`}>
          <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          <LinearGradient colors={['rgba(31,26,23,0.05)', 'rgba(31,26,23,0.75)']} style={StyleSheet.absoluteFill} />
          <View style={styles.play}><Ionicons name="play" size={24} color={colors.ink} style={{ marginLeft: 3 }} /></View>
        </Pressable>
      ) : null}

      <View style={styles.body}>
        <View style={styles.platformRow}>
          <Ionicons name={PLATFORM_ICON[source.platform]} size={14} color="#f3b8ad" />
          <Text style={styles.kicker}>Orijinal kaynak · {copy.name}</Text>
        </View>

        <Pressable onPress={() => open(profile)} disabled={!profile} style={styles.creator}
          accessibilityRole={profile ? 'link' : undefined}
          accessibilityLabel={profile ? `${primary || copy.name} profilini ${copy.at} aç` : undefined}>
          <View style={styles.monogram}><Text style={styles.monogramText}>{monogram}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{primary || `${copy.name} videosu`}</Text>
              {source.creator_verified === true ? (
                <Ionicons name="checkmark-circle" size={16} color="#7cc4ff" accessibilityLabel="Doğrulanmış hesap" />
              ) : null}
            </View>
            {handle ? <Text style={styles.handle} numberOfLines={1}>{handle}</Text> : null}
          </View>
          {profile ? (
            <View style={styles.profileChip}>
              <Text style={styles.profileChipText}>Profil</Text>
              <Ionicons name="arrow-up-outline" size={13} color="#fff" style={{ transform: [{ rotate: '45deg' }] }} />
            </View>
          ) : null}
        </Pressable>

        <Text style={styles.lead}>
          Bu tarif {copy.from} aktarıldı; malzemeler ve adımlar Tariften'de düzenlendi.
        </Text>

        {metrics.length > 0 && (
          <View style={styles.metrics}>
            {metrics.map((m, i) => (
              <View key={m.key} style={[styles.metric, i > 0 && styles.metricLine]}
                accessible accessibilityLabel={`${m.label} ${m.value}`}>
                <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{m.value}</Text>
                <View style={styles.metricLabelRow}>
                  <Ionicons name={METRIC_ICON[m.key]} size={11} color="rgba(255,255,255,0.55)" />
                  <Text style={styles.metricLabel}>{m.label}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.actions}>
          <Pressable onPress={() => void watchSocialVideo(source)} style={({ pressed }) => [styles.watch, pressed && { opacity: 0.9 }]}
            accessibilityRole="button" accessibilityLabel={`Orijinal videoyu ${copy.at} izle`}>
            <Ionicons name="play" size={15} color={colors.ink} />
            <Text style={styles.watchText}>Videoyu izle</Text>
          </Pressable>
          <Pressable onPress={() => open(source.url)} style={({ pressed }) => [styles.openBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="link" accessibilityLabel={`Videoyu ${copy.at} aç`}>
            <Text style={styles.openText}>{copy.at} aç</Text>
            <Ionicons name="arrow-up-outline" size={14} color="#fff" style={{ transform: [{ rotate: '45deg' }] }} />
          </Pressable>
        </View>

        {metrics.length > 0 ? (
          <Text style={styles.note}>
            {captured ? `${captured} tarihinde, Tariften'e aktarıldığı anki değerler.` : "Tariften'e aktarıldığı anki değerler."} Canlı istatistik değildir.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, backgroundColor: colors.ink, overflow: 'hidden' },
  poster: { height: 188, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2b2420' },
  play: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 18, gap: 14 },
  platformRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: '#f3b8ad' },
  creator: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  monogram: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  monogramText: { fontFamily: fonts.headingBold, fontSize: 19, color: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flexShrink: 1, fontFamily: fonts.headingBold, fontSize: 18, lineHeight: 23, color: '#fff' },
  handle: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  profileChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3, height: 32, paddingHorizontal: 12, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  profileChipText: { fontFamily: fonts.bodySemi, fontSize: 12, color: '#fff' },
  lead: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: 'rgba(255,255,255,0.7)' },
  metrics: {
    flexDirection: 'row', borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)',
  },
  metric: { flex: 1, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center' },
  metricLine: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.14)' },
  metricValue: { fontFamily: fonts.headingBold, fontSize: 17, color: '#fff' },
  metricLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  metricLabel: { fontFamily: fonts.body, fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  actions: { flexDirection: 'row', gap: 10 },
  watch: {
    flex: 1, height: 46, borderRadius: radius.pill, backgroundColor: '#fff',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  watchText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  openBtn: {
    flex: 1, height: 46, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  openText: { fontFamily: fonts.bodySemi, fontSize: 14, color: '#fff' },
  note: { fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: 'rgba(255,255,255,0.45)' },
});
