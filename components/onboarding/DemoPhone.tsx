import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { DISH_GRADIENT, DishArt } from './DemoRecipeCard';
import { EASE_OUT, useLoop } from './motion';
import { AccentText } from '../ui/ScreenTitle';
import {
  AKTAR_BUTTON, ANDROID_SHARE_TARGET, DEMO_RECIPE, IOS_MORE_LABEL, IOS_SHARE_TARGET, PREPARING_LINES, type DemoScene,
} from '../../lib/onboarding-core';
import { colors, fonts, shadow } from '../../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * A neutral, self-drawn phone for the "Paylaş → Tariften" walkthrough. No
 * real app's look, name or logo is drawn: a generic short-video screen, a
 * generic in-app menu, a system-style share sheet and Tariften's own Tarif
 * Aktar screen. Only the highlighted target is interactive and accessible;
 * everything else is decoration hidden from screen readers.
 */
export type DemoPhoneProps = {
  scene: DemoScene;
  width: number;
  height: number;
  target: string;
  a11yHint: string;
  onTarget: () => void;
  onMiss: () => void;
  reduceMotion: boolean;
  /** Bumps on a missed tap to nudge the target. */
  nudge: number;
  /** null while waiting for the tap; 0..3 while the demo recipe is "prepared". */
  prepared: number | null;
};

const TARIFTEN_ICON = require('../../assets/icon.png');

export default function DemoPhone(props: DemoPhoneProps) {
  const { scene, width, height } = props;
  const s = width / 240;
  const px = (n: number) => Math.round(n * s);
  const fs = (n: number) => Math.max(8, Math.round(n * s * 10) / 10);
  const ctx: Ctx = { ...props, s, px, fs };
  const light = scene === 'aktar';

  return (
    <View style={[styles.frame, { width, height, borderRadius: px(36), padding: px(6) }]}>
      <Pressable onPress={props.onMiss} accessible={false} style={[styles.screen, { borderRadius: px(30) }, light && styles.screenLight]}>
        {scene === 'aktar' ? <AktarScene {...ctx} /> : <VideoScene {...ctx} />}
        {scene === 'appMenu' ? <AppMenuSheet key="appMenu" {...ctx} /> : null}
        {scene === 'systemSheet' ? <SystemSheet key="systemSheet" {...ctx} /> : null}
        {scene === 'moreApps' ? <MoreAppsSheet key="moreApps" {...ctx} /> : null}
        {scene === 'androidSheet' ? <AndroidSheet key="androidSheet" {...ctx} /> : null}
        <StatusBarMock px={px} fs={fs} light={light} />
      </Pressable>
      {/* Hardware hints, purely decorative. */}
      <View pointerEvents="none" style={[styles.island, { width: px(62), height: px(17), top: px(13), borderRadius: px(9), marginLeft: -px(31) }]} />
    </View>
  );
}

type Ctx = DemoPhoneProps & { s: number; px: (n: number) => number; fs: (n: number) => number };

function StatusBarMock({ px, fs, light }: { px: (n: number) => number; fs: (n: number) => number; light: boolean }) {
  const tint = light ? colors.ink : '#fff';
  return (
    <View pointerEvents="none" style={[styles.status, { height: px(34), paddingHorizontal: px(20) }]}
      accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(10), color: tint }}>09:41</Text>
      <View style={{ flexDirection: 'row', gap: px(3), alignItems: 'center' }}>
        <Ionicons name="cellular" size={px(10)} color={tint} />
        <Ionicons name="wifi" size={px(10)} color={tint} />
        <Ionicons name="battery-full" size={px(13)} color={tint} />
      </View>
    </View>
  );
}

// ---- the highlighted target -----------------------------------------------------------------

function Target({ ctx, children, radius, style, tag = 'left' }: {
  ctx: Ctx; children: React.ReactNode; radius: number; style?: StyleProp<ViewStyle>; tag?: 'left' | 'top' | 'none';
}) {
  const { px, fs, reduceMotion, nudge } = ctx;
  const pulse = useLoop(1500, !reduceMotion, EASE_OUT);
  const bob = useLoop(1100, !reduceMotion);
  const bump = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!nudge || reduceMotion) return;
    bump.setValue(0);
    Animated.sequence([
      Animated.timing(bump, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(bump, { toValue: 0, friction: 3, tension: 160, useNativeDriver: true }),
    ]).start();
  }, [nudge, reduceMotion, bump]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.32] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.85, 0] });
  const scale = bump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const bobX = bob.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -px(3), 0] });
  const bobY = bob.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -px(3), 0] });
  const pad = px(5);

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <Pressable onPress={ctx.onTarget} accessibilityRole="button" accessibilityLabel={ctx.target} accessibilityHint={ctx.a11yHint}
        hitSlop={px(8)} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
        <View pointerEvents="none" style={[styles.ringStatic, { top: -pad, left: -pad, right: -pad, bottom: -pad, borderRadius: radius + pad, borderWidth: Math.max(2, px(2.5)) }]} />
        {!reduceMotion ? (
          <Animated.View pointerEvents="none" style={[styles.ringPulse, {
            top: -pad, left: -pad, right: -pad, bottom: -pad, borderRadius: radius + pad, borderWidth: Math.max(2, px(3)),
            opacity: ringOpacity, transform: [{ scale: ringScale }],
          }]} />
        ) : null}
        {children}
      </Pressable>
      {tag !== 'none' ? (
        <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
          style={[tag === 'left' ? [styles.tagLeft, { right: '100%', marginRight: px(10) }] : [styles.tagTop, { bottom: '100%', marginBottom: px(10) }],
            { transform: tag === 'left' ? [{ translateX: bobX }] : [{ translateY: bobY }] }]}>
          <View style={[styles.tag, { paddingHorizontal: px(8), height: px(22), borderRadius: px(11) }]}>
            <Text allowFontScaling={false} style={[styles.tagText, { fontSize: fs(10) }]}>Dokun</Text>
          </View>
          <View style={tag === 'left'
            ? [styles.caretRight, { borderLeftWidth: px(6), borderTopWidth: px(5), borderBottomWidth: px(5) }]
            : [styles.caretDown, { borderTopWidth: px(6), borderLeftWidth: px(5), borderRightWidth: px(5) }]} />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

// ---- shared bits ----------------------------------------------------------------------------

function SlideUp({ ctx, children, style }: { ctx: Ctx; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(ctx.reduceMotion ? 0 : 1)).current;
  useEffect(() => {
    if (ctx.reduceMotion) { v.setValue(0); return; }
    Animated.timing(v, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, ctx.reduceMotion]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, ctx.height * 0.6] });
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} />
      <Animated.View style={[styles.sheet, { borderTopLeftRadius: ctx.px(20), borderTopRightRadius: ctx.px(20), paddingBottom: ctx.px(18), transform: [{ translateY }] }, style]}>
        <View style={[styles.handle, { width: ctx.px(34), height: ctx.px(4), marginVertical: ctx.px(7) }]} />
        {children}
      </Animated.View>
    </>
  );
}

function Tile({ ctx, icon, tint, color = colors.ink, label, image, round }: {
  ctx: Ctx; icon?: IoniconName; tint: string; color?: string; label?: string; image?: number; round?: boolean;
}) {
  const { px, fs } = ctx;
  const size = px(40);
  return (
    <View style={{ alignItems: 'center', width: px(50) }}>
      {image ? (
        <Image source={image} style={{ width: size, height: size, borderRadius: px(10) }} contentFit="cover" accessible={false} />
      ) : (
        <View style={{ width: size, height: size, borderRadius: round ? size / 2 : px(10), backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
          {icon ? <Ionicons name={icon} size={px(19)} color={color} /> : null}
        </View>
      )}
      {label ? <Text allowFontScaling={false} numberOfLines={2} style={[styles.tileLabel, { fontSize: fs(8.5), marginTop: px(4), lineHeight: fs(11) }]}>{label}</Text> : null}
    </View>
  );
}

function LinkPreview({ ctx }: { ctx: Ctx }) {
  const { px, fs } = ctx;
  return (
    <View style={[styles.preview, { gap: px(8), paddingHorizontal: px(12), paddingBottom: px(10) }]}>
      <LinearGradient colors={DISH_GRADIENT} style={{ width: px(34), height: px(34), borderRadius: px(8), alignItems: 'center', justifyContent: 'center' }}>
        <DishArt size={px(28)} />
      </LinearGradient>
      <View style={{ flex: 1 }}>
        <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: fs(10), color: colors.ink }}>{DEMO_RECIPE.caption}</Text>
        <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: fs(8.5), color: colors.textMuted }}>Video bağlantısı</Text>
      </View>
      <View style={{ width: px(20), height: px(20), borderRadius: px(10), backgroundColor: '#e7e4e0', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="close" size={px(12)} color={colors.textMuted} />
      </View>
    </View>
  );
}

// ---- scenes ---------------------------------------------------------------------------------

function VideoScene(ctx: Ctx) {
  const { px, fs, width, height, reduceMotion, scene } = ctx;
  const drift = useLoop(5200, !reduceMotion);
  const play = useLoop(6000, !reduceMotion, Easing.linear);
  const zoom = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.06, 1] });
  const fill = play.interpolate({ inputRange: [0, 1], outputRange: [-(width - px(40)), 0] });
  const interactive = scene === 'video';
  const rail: { icon: IoniconName; label: string }[] = [
    { icon: 'heart', label: '12,4 B' },
    { icon: 'chatbubble-ellipses', label: '318' },
  ];
  return (
    <View style={StyleSheet.absoluteFill}>
      <LinearGradient colors={DISH_GRADIENT} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', paddingTop: height * 0.22 }]}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={{ transform: [{ scale: zoom }] }}>
          <DishArt size={width * 0.74} />
        </Animated.View>
      </View>
      {/* Playback bar */}
      <View pointerEvents="none" style={[styles.track, { top: px(40), left: px(20), right: px(20), height: px(2.5) }]}>
        <Animated.View style={[styles.trackFill, { transform: [{ translateX: reduceMotion ? -(width - px(40)) * 0.4 : fill }] }]} />
      </View>
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.55)']} style={[styles.bottomShade, { height: height * 0.38 }]} />
      {/* Caption */}
      <View pointerEvents="none" style={[styles.caption, { left: px(14), right: px(64), bottom: px(22), gap: px(5) }]}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(6) }}>
          <View style={{ width: px(22), height: px(22), borderRadius: px(11), backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
            <Text allowFontScaling={false} style={{ fontFamily: fonts.bodyBold, fontSize: fs(10), color: colors.brand }}>E</Text>
          </View>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(10), color: '#fff' }}>{DEMO_RECIPE.creator}</Text>
        </View>
        <Text allowFontScaling={false} numberOfLines={2} style={{ fontFamily: fonts.body, fontSize: fs(10), lineHeight: fs(14), color: '#fff' }}>
          {DEMO_RECIPE.caption} · tarif açıklamada
        </Text>
      </View>
      {/* Right rail */}
      <View style={[styles.rail, { right: px(10), bottom: px(26), gap: px(14) }]}>
        {rail.map(item => (
          <View key={item.icon} style={{ alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
            <Ionicons name={item.icon} size={px(24)} color="#fff" />
            <Text allowFontScaling={false} style={[styles.railLabel, { fontSize: fs(8.5) }]}>{item.label}</Text>
          </View>
        ))}
        {interactive ? (
          <Target ctx={ctx} radius={px(22)} tag="left">
            <View style={{ alignItems: 'center', width: px(44), paddingVertical: px(3) }}>
              <Ionicons name="arrow-redo" size={px(24)} color="#fff" />
              <Text allowFontScaling={false} style={[styles.railLabel, { fontSize: fs(8.5) }]}>Paylaş</Text>
            </View>
          </Target>
        ) : (
          <View style={{ alignItems: 'center', width: px(44) }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Ionicons name="arrow-redo" size={px(24)} color="#fff" />
            <Text allowFontScaling={false} style={[styles.railLabel, { fontSize: fs(8.5) }]}>Paylaş</Text>
          </View>
        )}
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center' }}>
          <Ionicons name="ellipsis-horizontal" size={px(20)} color="#fff" />
        </View>
      </View>
    </View>
  );
}

/** The video app's own share menu (generic). Its "Paylaş…" opens the phone's share sheet. */
function AppMenuSheet(ctx: Ctx) {
  const { px, fs } = ctx;
  const people = [['A', 'Ayşe'], ['M', 'Mert'], ['E', 'Ece'], ['D', 'Deniz']];
  return (
    <SlideUp ctx={ctx}>
      <Text allowFontScaling={false} style={[styles.sheetTitle, { fontSize: fs(11), marginBottom: px(10) }]}>Gönder</Text>
      <View style={[styles.row, { paddingHorizontal: px(12), marginBottom: px(12) }]} pointerEvents="none"
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {people.map(([letter, name]) => (
          <View key={name} style={{ alignItems: 'center', width: px(50) }}>
            <View style={{ width: px(38), height: px(38), borderRadius: px(19), backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' }}>
              <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(12), color: colors.ink }}>{letter}</Text>
            </View>
            <Text allowFontScaling={false} style={[styles.tileLabel, { fontSize: fs(8.5), marginTop: px(4) }]}>{name}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.hair, { marginHorizontal: px(12), marginBottom: px(12) }]} />
      <View style={[styles.row, { paddingHorizontal: px(12) }]}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.row, { flex: 3 }]}>
          <Tile ctx={ctx} icon="link-outline" tint="#f1eeea" label="Kopyala" round />
          <Tile ctx={ctx} icon="download-outline" tint="#f1eeea" label="Kaydet" round />
          <Tile ctx={ctx} icon="chatbubble-outline" tint="#f1eeea" label="Mesaj" round />
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Target ctx={ctx} radius={px(20)} tag="top">
            <Tile ctx={ctx} icon="share-outline" tint="#f1eeea" label="Paylaş…" round />
          </Target>
        </View>
      </View>
    </SlideUp>
  );
}

/** The phone's own share sheet, iOS style (neutral tiles, no real app icons). */
function SystemSheet(ctx: Ctx) {
  const { px, fs } = ctx;
  return (
    <SlideUp ctx={ctx} style={styles.sheetGrey}>
      <LinkPreview ctx={ctx} />
      <View style={[styles.hair, { marginBottom: px(12) }]} />
      <View style={[styles.row, { paddingHorizontal: px(10), marginBottom: px(12) }]}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.row, { flex: 3 }]}>
          <Tile ctx={ctx} icon="mail" tint="#e3ebf6" color="#5b7db1" label="E-posta" />
          <Tile ctx={ctx} icon="chatbubbles" tint="#e3f2e6" color="#3f8f5a" label="Mesaj" />
          <Tile ctx={ctx} icon="document-text" tint="#fbf1d6" color="#b98a1b" label="Notlar" />
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Target ctx={ctx} radius={px(12)} tag="top">
            <Tile ctx={ctx} icon="ellipsis-horizontal" tint="#e4e2df" color={colors.textMuted} label={IOS_MORE_LABEL} />
          </Target>
        </View>
      </View>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={[styles.group, { marginHorizontal: px(10), borderRadius: px(12) }]}>
        {([['Kopyala', 'copy-outline'], ['Yer İşaretlerine Ekle', 'bookmark-outline']] as const).map(([label, icon], i) => (
          <View key={label} style={[styles.groupRow, { height: px(34), paddingHorizontal: px(12) }, i > 0 && styles.groupLine]}>
            <Text allowFontScaling={false} style={{ fontFamily: fonts.body, fontSize: fs(10), color: colors.ink }}>{label}</Text>
            <Ionicons name={icon} size={px(14)} color={colors.ink} />
          </View>
        ))}
      </View>
    </SlideUp>
  );
}

/** "Daha Fazla": the full app list, with our share extension in it. */
function MoreAppsSheet(ctx: Ctx) {
  const { px, fs } = ctx;
  const rows: [IoniconName, string, string, string][] = [
    ['mail', 'E-posta', '#e3ebf6', '#5b7db1'],
    ['chatbubbles', 'Mesaj', '#e3f2e6', '#3f8f5a'],
    ['document-text', 'Notlar', '#fbf1d6', '#b98a1b'],
  ];
  const rowStyle = [styles.listRow, { height: px(44), paddingHorizontal: px(12), gap: px(10) }];
  return (
    <SlideUp ctx={ctx} style={[styles.sheetGrey, { top: ctx.height * 0.2 }]}>
      <View style={[styles.listHead, { paddingHorizontal: px(14), marginBottom: px(10) }]} pointerEvents="none"
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={{ width: px(36) }} />
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(11), color: colors.ink }}>Uygulamalar</Text>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(10), color: colors.ink, width: px(36), textAlign: 'right' }}>Bitti</Text>
      </View>
      <View style={[styles.group, { marginHorizontal: px(10), borderRadius: px(12) }]}>
        {rows.map(([icon, label, tint, color], i) => (
          <View key={label} style={[rowStyle, i > 0 && styles.groupLine]} pointerEvents="none"
            accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={{ width: px(28), height: px(28), borderRadius: px(7), backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon} size={px(15)} color={color} />
            </View>
            <Text allowFontScaling={false} style={{ fontFamily: fonts.body, fontSize: fs(10.5), color: colors.ink }}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginHorizontal: px(10), marginTop: px(12) }}>
        <Target ctx={ctx} radius={px(12)} tag="none">
          <View style={[rowStyle, styles.targetRow, { borderRadius: px(12) }]}>
            <Image source={TARIFTEN_ICON} style={{ width: px(28), height: px(28), borderRadius: px(7) }} contentFit="cover" accessible={false} />
            <Text allowFontScaling={false} style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: fs(10.5), color: colors.ink }}>{IOS_SHARE_TARGET}</Text>
            <Ionicons name="chevron-forward" size={px(13)} color={colors.textFaint} />
          </View>
        </Target>
      </View>
    </SlideUp>
  );
}

/** Android's share sheet: Tariften appears with the app's name. */
function AndroidSheet(ctx: Ctx) {
  const { px, fs } = ctx;
  return (
    <SlideUp ctx={ctx}>
      <LinkPreview ctx={ctx} />
      <View style={[styles.hair, { marginBottom: px(10) }]} />
      <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(9), color: colors.textMuted, paddingHorizontal: px(14), marginBottom: px(10) }}>
        Uygulamalar
      </Text>
      <View style={[styles.row, { paddingHorizontal: px(10) }]}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Tile ctx={ctx} icon="chatbubbles" tint="#e3f2e6" color="#3f8f5a" label="Mesaj" round />
        </View>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Tile ctx={ctx} icon="mail" tint="#e3ebf6" color="#5b7db1" label="E-posta" round />
        </View>
        <Target ctx={ctx} radius={px(14)} tag="top">
          <Tile ctx={ctx} image={TARIFTEN_ICON} tint={colors.cream} label={ANDROID_SHARE_TARGET} />
        </Target>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Tile ctx={ctx} icon="document-text" tint="#fbf1d6" color="#b98a1b" label="Notlar" round />
        </View>
      </View>
    </SlideUp>
  );
}

/** Tariften's own Tarif Aktar screen, link already filled in (as after Paylaş → Tariften). */
function AktarScene(ctx: Ctx) {
  const { px, fs, prepared } = ctx;
  const busy = prepared !== null;
  const button = (
    <View style={[styles.mainButton, { height: px(40), borderRadius: px(20), gap: px(6), paddingHorizontal: px(12) }]}>
      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="sparkles" size={px(14)} color="#fff" />}
      <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: fs(10.5), color: '#fff' }}>
        {busy ? 'Videon inceleniyor…' : AKTAR_BUTTON}
      </Text>
    </View>
  );
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas, paddingTop: px(38), paddingHorizontal: px(14) }]}>
      <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <View style={[styles.listHead, { marginBottom: px(12) }]}>
          <Ionicons name="chevron-back" size={px(16)} color={colors.ink} />
          <Text allowFontScaling={false} style={{ fontFamily: fonts.headingBold, fontSize: fs(11), color: colors.ink }}>Tarif Aktar</Text>
          <View style={{ width: px(16) }} />
        </View>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(7.5), letterSpacing: 1.6, color: colors.brand }}>VİDEODAN TARİF</Text>
        <AccentText allowFontScaling={false} style={{ fontFamily: fonts.headingBold, fontSize: fs(17), lineHeight: fs(21), letterSpacing: -0.4, color: colors.ink, marginTop: px(4) }}>
          {'Videoyu *tarife* çevir.'}
        </AccentText>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.body, fontSize: fs(9), lineHeight: fs(13), color: colors.textMuted, marginTop: px(4) }}>
          Malzemeler ve adımlar hazırlanır; son kararı sen verirsin.
        </Text>
        <View style={[styles.aktarCard, { marginTop: px(12), padding: px(10), borderRadius: px(14), gap: px(7) }]}>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(7.5), letterSpacing: 1, color: colors.textMuted }}>PAYLAŞIM BAĞLANTISI</Text>
          <View style={[styles.linkField, { height: px(30), borderRadius: px(10), paddingHorizontal: px(8), gap: px(6) }]}>
            <Ionicons name="link-outline" size={px(13)} color={colors.textMuted} />
            <Text allowFontScaling={false} numberOfLines={1} style={{ flex: 1, fontFamily: fonts.body, fontSize: fs(9.5), color: colors.ink }}>https://…/video/makarna</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(4) }}>
            <Ionicons name="checkmark-circle" size={px(12)} color={colors.success} />
            <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(8.5), color: colors.success }}>Video bağlantısı alındı</Text>
          </View>
          {busy ? (
            <View style={{ gap: px(5), marginTop: px(2) }}>
              {PREPARING_LINES.map((line, i) => {
                const done = (prepared ?? 0) > i;
                return (
                  <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: px(5) }}>
                    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={px(12)} color={done ? colors.success : colors.textFaint} />
                    <Text allowFontScaling={false} style={{ fontFamily: done ? fonts.bodySemi : fonts.body, fontSize: fs(9), color: done ? colors.ink : colors.textMuted }}>{line}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
      <View style={[styles.aktarFooter, { left: px(14), right: px(14), bottom: px(20) }]}>
        {busy ? <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{button}</View> : (
          <Target ctx={ctx} radius={px(20)} tag="top">{button}</Target>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.ink, ...shadow.floating },
  screen: { flex: 1, overflow: 'hidden', backgroundColor: '#1a1310' },
  screenLight: { backgroundColor: colors.canvas },
  island: { position: 'absolute', left: '50%', backgroundColor: colors.ink },
  status: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  track: { position: 'absolute', borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  trackFill: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff' },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  caption: { position: 'absolute' },
  rail: { position: 'absolute', alignItems: 'center' },
  railLabel: { fontFamily: fonts.bodySemi, color: '#fff', marginTop: 2 },
  dim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
  sheetGrey: { backgroundColor: '#f4f2ef' },
  handle: { alignSelf: 'center', borderRadius: 2, backgroundColor: colors.lineStrong },
  sheetTitle: { fontFamily: fonts.bodySemi, color: colors.ink, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  tileLabel: { fontFamily: fonts.body, color: colors.ink, textAlign: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center' },
  group: { backgroundColor: colors.surface },
  groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listRow: { flexDirection: 'row', alignItems: 'center' },
  targetRow: { backgroundColor: colors.surface },
  ringStatic: { position: 'absolute', borderColor: colors.brand },
  ringPulse: { position: 'absolute', borderColor: colors.brand },
  tagLeft: { position: 'absolute', top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center' },
  tagTop: { position: 'absolute', left: -40, right: -40, alignItems: 'center' },
  tag: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  tagText: { fontFamily: fonts.bodySemi, color: '#fff' },
  caretRight: { width: 0, height: 0, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: colors.brand },
  caretDown: { width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: colors.brand },
  aktarCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  linkField: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineStrong },
  aktarFooter: { position: 'absolute' },
  mainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
});
