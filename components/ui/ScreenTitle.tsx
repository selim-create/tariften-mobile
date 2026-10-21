import React from 'react';
import { StyleSheet, Text, TextStyle, View } from 'react-native';
import { colors, fonts, type } from '../../constants/theme';

/** Renders "Haftanın *sofrası*" with the starred part in italic brand red. */
export function AccentText({ children, style, accentStyle }: { children: string; style?: TextStyle; accentStyle?: TextStyle }) {
  const parts = children.split(/\*([^*]+)\*/);
  return (
    <Text style={style}>
      {parts.map((part, i) => i % 2 === 1
        ? <Text key={i} style={[styles.accent, accentStyle]}>{part}</Text>
        : <Text key={i}>{part}</Text>)}
    </Text>
  );
}

/** Editorial screen header: kicker, large title with one italic accent, optional line and action. */
export default function ScreenTitle({ kicker, title, subtitle, right }: {
  kicker: string; title: string; subtitle?: string; right?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        <Text style={type.kicker}>{kicker}</Text>
        <AccentText style={styles.title}>{title}</AccentText>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 },
  copy: { flex: 1, gap: 8 },
  title: { fontFamily: fonts.headingBold, fontSize: 32, lineHeight: 37, letterSpacing: -0.9, color: colors.ink },
  accent: { fontFamily: fonts.headingBoldItalic, color: colors.brand },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted },
  right: { paddingTop: 2 },
});
