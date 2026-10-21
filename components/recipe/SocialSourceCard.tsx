import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { RecipeSocialSource } from '../../lib/types';
import { capturedDateTr, PLATFORM_LABEL, profileUrl, trustedMetrics } from '../../lib/social-format';
import { colors, fonts, radius } from '../../constants/theme';

const ICON: Record<RecipeSocialSource['platform'], React.ComponentProps<typeof Ionicons>['name']> = {
  instagram: 'logo-instagram', tiktok: 'logo-tiktok', youtube: 'logo-youtube',
};

/**
 * Credits the creator of an imported recipe: who, where, and the audience
 * numbers as they were when the recipe was brought into Tariften.
 */
export default function SocialSourceCard({ source }: { source: RecipeSocialSource }) {
  const metrics = trustedMetrics(source);
  const profile = profileUrl(source);
  const captured = capturedDateTr(source.metrics_captured_at);
  const handle = source.creator_handle ? `@${source.creator_handle}` : null;
  const name = source.creator_name && source.creator_name !== source.creator_handle ? source.creator_name : null;
  const platform = PLATFORM_LABEL[source.platform];
  const inPlatform = source.platform === 'tiktok' ? "TikTok'ta" : `${platform}'da`;

  const open = (url: string | null) => { if (url) void Linking.openURL(url); };

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Pressable onPress={() => open(profile)} disabled={!profile} style={styles.head}
        accessibilityRole={profile ? 'link' : undefined}
        accessibilityLabel={profile ? `${handle || name || platform} profilini ${inPlatform} aç` : undefined}>
        <View style={styles.icon}><Ionicons name={ICON[source.platform]} size={20} color={colors.brand} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>Orijinal tarif</Text>
          <Text style={styles.who} numberOfLines={1}>{name || handle || `${platform} videosu`}</Text>
          {name && handle ? <Text style={styles.handle} numberOfLines={1}>{handle}</Text> : null}
        </View>
        {profile ? <Ionicons name="arrow-forward" size={18} color={colors.brand} /> : null}
      </Pressable>

      {metrics.length > 0 && (
        <View style={styles.metrics}>
          {metrics.map((m, i) => (
            <View key={m.key} style={[styles.metric, i > 0 && styles.metricLine]}>
              <Text style={styles.metricValue}>{m.value}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.foot}>
        {metrics.length > 0 ? (
          <Text style={styles.note}>
            {captured ? `${captured} tarihinde, Tariften'e aktarıldığı anki değerler.` : "Tariften'e aktarıldığı anki değerler."} Canlı istatistik değildir.
          </Text>
        ) : <View style={{ flex: 1 }} />}
        <Pressable onPress={() => open(source.url)} hitSlop={8} accessibilityRole="link" accessibilityLabel={`Videoyu ${inPlatform} aç`}>
          <Text style={styles.link}>{inPlatform} aç</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textFaint },
  who: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink, marginTop: 1 },
  handle: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  metrics: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  metric: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  metricLine: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.lineStrong },
  metricValue: { fontFamily: fonts.headingBold, fontSize: 18, color: colors.ink },
  metricLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 1 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11, backgroundColor: colors.canvas, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  note: { flex: 1, fontFamily: fonts.body, fontSize: 11, lineHeight: 15, color: colors.textFaint },
  link: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.brand },
});
