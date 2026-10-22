import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GUIDE_TOOLS, guideToolBySlug, type GuideToolInfo, type TimerKind } from '../../lib/guide-tools';
import GuideToolCard from '../../components/guide-tools/GuideToolCard';
import { useKitchenTimerActive } from '../../components/guide-tools/ToolUI';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius } from '../../constants/theme';

const TIMER_OF: Partial<Record<GuideToolInfo['key'], TimerKind>> = { egg_doneness: 'egg', pasta_timer: 'pasta' };

function ToolTile({ tool, selected, onPress }: { tool: GuideToolInfo; selected: boolean; onPress: () => void }) {
  const active = useKitchenTimerActive(TIMER_OF[tool.key] || null);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, selected && styles.tileOn, pressed && !selected && { opacity: 0.8 }]}
      accessibilityRole="tab" accessibilityState={{ selected }}
      accessibilityLabel={`${tool.title}${active ? ', zamanlayıcı açık' : ''}`}>
      <View style={[styles.tileIcon, selected && styles.tileIconOn]}>
        <Ionicons name={tool.icon as React.ComponentProps<typeof Ionicons>['name']} size={19} color={selected ? '#fff' : colors.brand} />
      </View>
      <Text style={styles.tileTitle} numberOfLines={2}>{tool.title}</Text>
      {active ? (
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Zamanlayıcı açık</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Mutfak araçları: the four interactive kitchen tools in one place.
 * `?arac=yumurta|makarna|kurutma|olcu` opens one directly (tool cards in
 * guides and the local timer notification link here).
 */
export default function GuideToolsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ arac?: string }>();
  const selected = guideToolBySlug(params.arac) || GUIDE_TOOLS[0];

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets>
        <TouchableOpacity style={styles.circle} onPress={() => (router.canGoBack() ? router.back() : router.replace('/rehber'))}
          accessibilityRole="button" accessibilityLabel="Geri dön">
          <Ionicons name="chevron-back" size={21} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.kicker}>Mutfak Rehberi</Text>
        <AccentText style={styles.title}>{'Mutfak *araçları.*'}</AccentText>
        <Text style={styles.subtitle}>Süre, sıcaklık ve ölçü: tezgâhın başında hızlıca bakman için. Sonuçlar her zaman güvenli aralıkta kalır.</Text>

        <View style={styles.grid} accessibilityRole="tablist">
          {GUIDE_TOOLS.map(tool => (
            <ToolTile key={tool.key} tool={tool} selected={tool.key === selected.key}
              onPress={() => router.setParams({ arac: tool.slug })} />
          ))}
        </View>

        <GuideToolCard key={selected.key} tool={selected} kicker="Araç" />

        <TouchableOpacity onPress={() => router.push('/rehber')} style={styles.allLink} accessibilityRole="link">
          <Text style={styles.allText}>Mutfak Rehberi'ndeki yazılar</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.ink} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { paddingHorizontal: 20, paddingTop: 6, width: '100%', maxWidth: 720, alignSelf: 'center' },
  circle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, marginBottom: 18,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 36, lineHeight: 40, letterSpacing: -1.2, color: colors.ink, marginTop: 10 },
  subtitle: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textMuted, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24, marginBottom: 18 },
  tile: {
    flexBasis: '47%', flexGrow: 1, minHeight: 104, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, gap: 10,
  },
  tileOn: { borderColor: colors.ink, borderWidth: 1.5 },
  tileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  tileIconOn: { backgroundColor: colors.brand },
  tileTitle: { fontFamily: fonts.heading, fontSize: 14, lineHeight: 19, color: colors.ink },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  liveText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.brandDark },
  allLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48, marginTop: 20 },
  allText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
});
