import React, { memo, useMemo } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  defaultSystemFonts, RenderHTMLConfigProvider, RenderHTMLSource, TRenderEngineProvider,
  type MixedStyleDeclaration, type MixedStyleRecord,
} from 'react-native-render-html';
import { tableColumnWidths, type GuideBlock } from '../../lib/guides';
import { colors, fonts, radius } from '../../constants/theme';

type TableBlock = Extract<GuideBlock, { kind: 'table' }>;
type VideoBlock = Extract<GuideBlock, { kind: 'video' }>;
type CalloutBlock = Extract<GuideBlock, { kind: 'callout' }>;

const SYSTEM_FONTS = [...defaultSystemFonts, fonts.body, fonts.bodyMedium, fonts.bodySemi, fonts.bodyBold, fonts.heading, fonts.headingBold, fonts.headingItalic];

/** Scrollable native table: header on cream, quiet zebra rows, one label per row for VoiceOver. */
function GuideTable({ block, width }: { block: TableBlock; width: number }) {
  const inner = width - 2;
  const widths = useMemo(() => tableColumnWidths(block.head, block.rows, inner), [block, inner]);
  const total = widths.reduce((sum, w) => sum + w, 0);
  const scrolls = total > inner + 1;
  const rowLabel = (cells: string[]) => cells
    .map((cell, i) => (block.head[i] ? `${block.head[i]}: ${cell || '-'}` : cell))
    .filter(Boolean).join(', ');
  return (
    <View style={styles.tableBlock}>
      <View style={styles.tableFrame}>
        <ScrollView horizontal scrollEnabled={scrolls} showsHorizontalScrollIndicator={scrolls} bounces={false}>
          <View>
            {block.head.length ? (
              <View style={[styles.tr, styles.thRow]} accessibilityRole="header">
                {block.head.map((cell, i) => (
                  <Text key={i} style={[styles.cell, styles.th, { width: widths[i] }, i > 0 && styles.cellLine]}>{cell}</Text>
                ))}
              </View>
            ) : null}
            {block.rows.map((row, r) => (
              <View key={r} style={[styles.tr, r > 0 || block.head.length ? styles.trLine : null, r % 2 === 1 && styles.zebra]}
                accessible accessibilityLabel={rowLabel(row)}>
                {row.map((cell, i) => (
                  <Text key={i} style={[styles.cell, { width: widths[i] }, i > 0 && styles.cellLine]}>{cell}</Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
      {scrolls ? (
        <View style={styles.tableHint} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <Ionicons name="swap-horizontal" size={13} color={colors.textFaint} />
          <Text style={styles.tableHintText}>Tabloyu yana kaydırabilirsin</Text>
        </View>
      ) : null}
      {block.caption ? <Text style={styles.caption}>{block.caption}</Text> : null}
    </View>
  );
}

/** Embeds are never played inline: a calm card opens the video in the browser sheet. */
function VideoCard({ block, onOpen }: { block: VideoBlock; onOpen: (url: string) => void }) {
  const provider = block.provider === 'youtube' ? 'YouTube' : 'Vimeo';
  return (
    <Pressable onPress={() => onOpen(block.url)} style={({ pressed }) => [styles.video, pressed && { opacity: 0.88 }]}
      accessibilityRole="link" accessibilityLabel={`Videoyu izle${block.title ? `: ${block.title}` : ''}, ${provider}`}
      accessibilityHint="Videoyu tarayıcıda açar">
      <View style={styles.play}><Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.videoTitle}>Videoyu izle</Text>
        <Text style={styles.videoLine} numberOfLines={2}>{block.title ? `${block.title} · ` : ''}{provider}</Text>
      </View>
      <Ionicons name="open-outline" size={17} color={colors.textMuted} />
    </Pressable>
  );
}

function Callout({ block, width }: { block: CalloutBlock; width: number }) {
  const warning = block.tone === 'warning';
  const html = useMemo(() => ({ html: `<div class="tariften-callout">${block.html}</div>` }), [block.html]);
  return (
    <View style={[styles.callout, warning ? styles.warning : styles.tip]}>
      <View style={styles.calloutHead}>
        <Ionicons name={warning ? 'alert-circle' : 'bulb'} size={16} color={warning ? colors.warning : colors.brand} />
        <Text style={[styles.calloutLabel, { color: warning ? colors.warning : colors.brand }]}>{block.label}</Text>
      </View>
      <RenderHTMLSource source={html} contentWidth={width - 36} />
    </View>
  );
}

function HtmlChunk({ html, width }: { html: string; width: number }) {
  const source = useMemo(() => ({ html }), [html]);
  return <RenderHTMLSource source={source} contentWidth={width} />;
}

/**
 * Guide body. One render engine for the whole article, many small sources:
 * h2s are native so the İçindekiler list can scroll to them (onHeadingLayout
 * reports each one's y inside this view).
 */
function GuideArticle({ blocks, width, onHeadingLayout, onLink, onOpenUrl }: {
  blocks: GuideBlock[];
  width: number;
  onHeadingLayout: (id: string, y: number) => void;
  onLink: (href: string) => void;
  onOpenUrl: (url: string) => void;
}) {
  const renderersProps = useMemo(() => ({
    img: { enableExperimentalPercentWidth: true },
    a: { onPress: (_: unknown, href: string) => { if (href) onLink(href); } },
  }), [onLink]);

  return (
    <TRenderEngineProvider systemFonts={SYSTEM_FONTS} baseStyle={baseStyle} tagsStyles={tagsStyles}
      classesStyles={classesStyles} enableCSSInlineProcessing={false}>
      <RenderHTMLConfigProvider renderersProps={renderersProps} enableExperimentalMarginCollapsing>
        <View>
          {blocks.map((block, index) => {
            switch (block.kind) {
              case 'heading':
                return (
                  <View key={block.id} onLayout={(e: LayoutChangeEvent) => onHeadingLayout(block.id, e.nativeEvent.layout.y)}
                    style={index === 0 ? styles.headingFirst : styles.heading}>
                    <Text style={styles.h2} accessibilityRole="header">{block.text}</Text>
                  </View>
                );
              case 'callout':
                return <Callout key={index} block={block} width={width} />;
              case 'table':
                return <GuideTable key={index} block={block} width={width} />;
              case 'video':
                return <VideoCard key={index} block={block} onOpen={onOpenUrl} />;
              default:
                return <HtmlChunk key={index} html={block.html} width={width} />;
            }
          })}
        </View>
      </RenderHTMLConfigProvider>
    </TRenderEngineProvider>
  );
}

export default memo(GuideArticle);

const baseStyle: MixedStyleDeclaration = { fontFamily: fonts.body, fontSize: 17, lineHeight: 28, color: '#334155' };

const tagsStyles: MixedStyleRecord = {
  p: { marginTop: 0, marginBottom: 18 },
  h3: { fontFamily: fonts.heading, color: colors.ink, fontSize: 19, lineHeight: 25, letterSpacing: -0.2, marginTop: 22, marginBottom: 8 },
  h4: { fontFamily: fonts.heading, color: colors.ink, fontSize: 17, lineHeight: 23, marginTop: 18, marginBottom: 6 },
  h5: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 16, marginTop: 16, marginBottom: 6 },
  h6: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 15, marginTop: 16, marginBottom: 6 },
  strong: { fontFamily: fonts.bodyBold, color: colors.ink },
  b: { fontFamily: fonts.bodyBold, color: colors.ink },
  em: { fontStyle: 'italic' },
  i: { fontStyle: 'italic' },
  a: { fontFamily: fonts.bodySemi, color: colors.brand, textDecorationLine: 'none' },
  ul: { marginTop: 0, marginBottom: 18, paddingLeft: 6 },
  ol: { marginTop: 0, marginBottom: 18, paddingLeft: 6 },
  li: { marginBottom: 6 },
  blockquote: {
    marginTop: 8, marginBottom: 20, marginLeft: 0, marginRight: 0, paddingLeft: 16,
    borderLeftWidth: 3, borderLeftColor: colors.brand,
    fontFamily: fonts.headingItalic, fontSize: 18, lineHeight: 27, color: colors.ink,
  },
  figure: { marginTop: 6, marginBottom: 18, marginLeft: 0, marginRight: 0 },
  figcaption: { fontSize: 13, lineHeight: 18, color: colors.textMuted, textAlign: 'center', marginTop: 6 },
  img: { borderRadius: 16 },
  hr: { borderBottomWidth: 1, borderBottomColor: colors.line, marginTop: 20, marginBottom: 24 },
  code: { backgroundColor: colors.cream, fontFamily: 'monospace', fontSize: 14, color: colors.ink },
  mark: { backgroundColor: colors.warningSoft, color: colors.ink },
};

const classesStyles: MixedStyleRecord = {
  'tariften-callout': { fontFamily: fonts.body, fontSize: 16, lineHeight: 25, color: colors.text },
};

const styles = StyleSheet.create({
  heading: { paddingTop: 18, paddingBottom: 10 },
  headingFirst: { paddingBottom: 10 },
  h2: { fontFamily: fonts.headingBold, color: colors.ink, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  callout: { borderRadius: radius.lg, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, marginBottom: 20 },
  tip: { backgroundColor: colors.brandSoft },
  warning: { backgroundColor: colors.warningSoft },
  calloutHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  calloutLabel: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase' },
  tableBlock: { marginTop: 4, marginBottom: 22 },
  tableFrame: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, overflow: 'hidden' },
  tr: { flexDirection: 'row' },
  thRow: { backgroundColor: colors.cream },
  trLine: { borderTopWidth: 1, borderTopColor: colors.line },
  zebra: { backgroundColor: colors.canvas },
  cell: { paddingHorizontal: 12, paddingVertical: 10, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  cellLine: { borderLeftWidth: 1, borderLeftColor: colors.line },
  th: { fontFamily: fonts.bodySemi, color: colors.ink },
  tableHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  tableHintText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 8 },
  video: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, marginBottom: 22,
    borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  videoTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.ink },
  videoLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2 },
});
