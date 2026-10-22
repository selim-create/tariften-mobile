import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { GuideToolInfo, GuideToolKey } from '../../lib/guide-tools';
import { colors, fonts, radius } from '../../constants/theme';
import ConverterTool from './ConverterTool';
import DryingTool from './DryingTool';
import EggTool from './EggTool';
import PastaTool from './PastaTool';

/** The interactive body of one tool. */
export function GuideToolBody({ toolKey }: { toolKey: GuideToolKey }) {
  switch (toolKey) {
    case 'egg_doneness': return <EggTool />;
    case 'pasta_timer': return <PastaTool />;
    case 'drying_guide': return <DryingTool />;
    case 'measure_converter': return <ConverterTool />;
    default: return null;
  }
}

/**
 * Calm card around a tool: icon, title, one line, the tool itself and an
 * optional "Tüm araçlar" link (in articles).
 */
export default function GuideToolCard({ tool, onAllTools, kicker = 'Etkileşimli araç' }: {
  tool: GuideToolInfo;
  onAllTools?: () => void;
  kicker?: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name={tool.icon as React.ComponentProps<typeof Ionicons>['name']} size={20} color={colors.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title} accessibilityRole="header">{tool.title}</Text>
        </View>
      </View>
      <Text style={styles.description}>{tool.description}</Text>
      <View style={styles.body}>
        <GuideToolBody toolKey={tool.key} />
      </View>
      {onAllTools ? (
        <Pressable onPress={onAllTools} style={({ pressed }) => [styles.all, pressed && { opacity: 0.7 }]} accessibilityRole="link"
          accessibilityLabel="Tüm mutfak araçları">
          <Ionicons name="grid-outline" size={15} color={colors.ink} />
          <Text style={styles.allText}>Tüm mutfak araçları</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8, borderRadius: radius.lg, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, letterSpacing: -0.3, color: colors.ink, marginTop: 2 },
  description: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted, marginTop: 12 },
  body: { marginTop: 18, paddingBottom: 10 },
  all: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, borderTopWidth: 1, borderTopColor: colors.line, marginTop: 8,
  },
  allText: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
});
