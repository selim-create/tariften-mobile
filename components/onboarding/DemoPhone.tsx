import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View,
  type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { Image, type ImageProps } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import DemoMedia, { DishArt, MEDIA_FALLBACK_GRADIENT } from './DemoMedia';
import { EASE_OUT, useLoop } from './motion';
import { AccentText } from '../ui/ScreenTitle';
import { LinearGradient } from 'expo-linear-gradient';
import { demoRecipeImage } from '../../assets/onboarding';
import {
  AKTAR_BUTTON, ANDROID_SHARE_TARGET, DEMO_RECIPE, IOS_MORE_LABEL, IOS_SHARE_TARGET, PREPARING_LINES, placeTag, trUpper,
  type DemoScene, type Rect, type TagSide,
} from '../../lib/onboarding-core';
import { colors, fonts, shadow } from '../../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * A neutral, self-drawn phone for the "Paylaş → Tariften" walkthrough. No
 * real app's look, name or logo is drawn: a generic short-video screen, a
 * generic in-app menu, a system-style share sheet and Tariften's own Tarif
 * Aktar screen. Only the highlighted target is interactive and accessible;
 * everything else is decoration hidden from screen readers.
 *
 * Everything inside is drawn on a 240 pt wide grid and scaled with the phone
 * (`px`, `fs`), so the mock keeps its proportions on every device; the
 * "Dokun" tag is measured and placed by `placeTag` so it always stays inside
 * the screen and clear of the caption and the sheets' rows.
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
/** Where the active target sits on the phone screen, and which side its tag prefers. */
type TargetInfo = { rect: Rect; prefer: TagSide };

type Ctx = DemoPhoneProps & {
  s: number;
  px: (n: number) => number;
  fs: (n: number) => number;
  screenRef: React.RefObject<View | null>;
  onTargetRect: (info: TargetInfo | null) => void;
  onAvoidRect: (rect: Rect | null) => void;
};

export default function DemoPhone(props: DemoPhoneProps) {
  const { scene, width, height } = props;
  const s = width / 240;
  const px = useCallback((n: number) => Math.round(n * s * 2) / 2, [s]);
  // Proportional type: the mock is a picture of a phone, it scales as one.
  const fs = useCallback((n: number) => Math.max(5.5, Math.round(n * s * 10) / 10), [s]);
  const screenRef = useRef<View>(null);
  const [target, setTarget] = useState<TargetInfo | null>(null);
  const [avoid, setAvoid] = useState<Rect | null>(null);
  const waiting = props.prepared === null;
  useEffect(() => { setTarget(null); }, [scene, width, height, waiting]);
  const avoidList = useMemo(() => (scene === 'video' && avoid ? [avoid] : []), [scene, avoid]);

  const bezel = px(6);
  const screen = { width: width - bezel * 2, height: height - bezel * 2 };
  const ctx: Ctx = { ...props, s, px, fs, screenRef, onTargetRect: setTarget, onAvoidRect: setAvoid };
  const light = scene === 'aktar';
  const sheet = scene !== 'video' && scene !== 'aktar';

  return (
    <View style={[styles.frame, { width, height, borderRadius: px(36), padding: bezel }]}>
      <Pressable ref={screenRef} onPress={props.onMiss} accessible={false}
        style={[styles.screen, { borderRadius: px(30) }, light && styles.screenLight]}>
        {scene === 'aktar' ? <AktarScene {...ctx} /> : <VideoScene {...ctx} />}
        {scene === 'appMenu' ? <AppMenuSheet key="appMenu" {...ctx} /> : null}
        {scene === 'systemSheet' ? <SystemSheet key="systemSheet" {...ctx} /> : null}
        {scene === 'moreApps' ? <MoreAppsSheet key="moreApps" {...ctx} /> : null}
        {scene === 'androidSheet' ? <AndroidSheet key="androidSheet" {...ctx} /> : null}
        <StatusBarMock px={px} fs={fs} light={light} dimmed={sheet} />
        {target && waiting ? (
          <TapTag key={`${scene}-${width}`} ctx={ctx} info={target}
            avoid={avoidList}
            bounds={{ x: px(6), y: px(34), width: screen.width - px(12), height: screen.height - px(34) - px(5) }} />
        ) : null}
      </Pressable>
      {/* Hardware hint, purely decorative. */}
      <View pointerEvents="none" style={[styles.island, { width: px(62), height: px(17), top: bezel + px(7), borderRadius: px(9), marginLeft: -px(31) }]} />
    </View>
  );
}

function StatusBarMock({ px, fs, light, dimmed }: { px: (n: number) => number; fs: (n: number) => number; light: boolean; dimmed: boolean }) {
  const tint = light ? colors.ink : '#fff';
  return (
    <View pointerEvents="none" style={[styles.status, { height: px(34), paddingHorizontal: px(20) }, dimmed && styles.statusDim]}
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

/** Brand red at a low alpha: the soft halo inside the ring. */
const HALO = 'rgba(219,76,63,0.10)';

function Target({ ctx, children, radius, style, tag = 'left' }: {
  ctx: Ctx; children: React.ReactNode; radius: number; style?: StyleProp<ViewStyle>; tag?: TagSide | 'none';
}) {
  const { px, reduceMotion, nudge, screenRef, onTargetRect, width } = ctx;
  const pulse = useLoop(1800, !reduceMotion, EASE_OUT);
  const bump = useRef(new Animated.Value(0)).current;
  const box = useRef<View>(null);

  useEffect(() => {
    if (!nudge || reduceMotion) return;
    bump.setValue(0);
    Animated.sequence([
      Animated.timing(bump, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.spring(bump, { toValue: 0, friction: 3, tension: 160, useNativeDriver: true }),
    ]).start();
  }, [nudge, reduceMotion, bump]);

  // Measure once the sheet has slid in (≈280 ms), in the phone screen's coordinates.
  useEffect(() => {
    if (tag === 'none') { onTargetRect(null); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      const node = box.current;
      const screen = screenRef.current;
      if (!node || !screen) return;
      node.measureLayout(screen, (x, y, w, h) => {
        if (alive) onTargetRect({ rect: { x, y, width: w, height: h }, prefer: tag });
      }, () => undefined);
    }, reduceMotion ? 40 : 340);
    return () => { alive = false; clearTimeout(timer); };
  }, [tag, width, reduceMotion, screenRef, onTargetRect]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.55, 0] });
  const scale = bump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const pad = px(4);
  const ring = { top: -pad, left: -pad, right: -pad, bottom: -pad, borderRadius: radius + pad };

  return (
    <Animated.View style={[style, { transform: [{ scale }] }]}>
      <View ref={box} collapsable={false}>
        <Pressable onPress={ctx.onTarget} accessibilityRole="button" accessibilityLabel={ctx.target} accessibilityHint={ctx.a11yHint}
          hitSlop={px(8)} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
          <View pointerEvents="none" style={[styles.halo, ring]} />
          {!reduceMotion ? (
            <Animated.View pointerEvents="none" style={[styles.ringPulse, ring, {
              borderWidth: Math.max(1.5, px(2)), opacity: ringOpacity, transform: [{ scale: ringScale }],
            }]} />
          ) : null}
          <View pointerEvents="none" style={[styles.ringStatic, ring, { borderWidth: Math.max(1.5, px(2)) }]} />
          {children}
        </Pressable>
      </View>
    </Animated.View>
  );
}

/** The "Dokun" tag: measured, then placed beside the target inside the screen (or not drawn at all). */
function TapTag({ ctx, info, bounds, avoid }: { ctx: Ctx; info: TargetInfo; bounds: Rect; avoid: Rect[] }) {
  const { px, fs, reduceMotion } = ctx;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const appear = useRef(new Animated.Value(0)).current;
  const bob = useLoop(1200, !reduceMotion);
  const caret = px(5);
  const placement = useMemo(() => (size ? placeTag({
    target: info.rect, tag: size, bounds, prefer: info.prefer, sides: [info.prefer], gap: px(6), caret, avoid,
  }) : null), [size, info, bounds.x, bounds.y, bounds.width, bounds.height, avoid, px, caret]); // eslint-disable-line react-hooks/exhaustive-deps

  const placed = placement !== null;
  useEffect(() => {
    if (!placed) return;
    appear.setValue(reduceMotion ? 1 : 0);
    if (!reduceMotion) Animated.timing(appear, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [placed, reduceMotion, appear]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(prev => (prev && Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5 ? prev : { width, height }));
  };

  const side = placement?.side ?? info.prefer;
  const toward = { left: 1, right: -1, top: 1, bottom: -1 }[side];
  const drift = bob.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, toward * px(2.5), 0] });
  const vertical = side === 'top' || side === 'bottom';
  const k = caret * 1.42; // a rotated square pokes out by k / √2 ≈ caret
  const caretStyle: ViewStyle = !placement ? {} : vertical
    ? { left: placement.caret - k / 2, [side === 'top' ? 'bottom' : 'top']: -k / 2 }
    : { top: placement.caret - k / 2, [side === 'left' ? 'right' : 'left']: -k / 2 };

  return (
    <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={[styles.tag, { paddingHorizontal: px(9), minHeight: px(22), borderRadius: px(11), paddingVertical: px(3) },
        placement
          ? { left: placement.x, top: placement.y, opacity: appear, transform: vertical ? [{ translateY: drift }] : [{ translateX: drift }] }
          : styles.measuring]}>
      {placement ? <View style={[styles.caret, { width: k, height: k, borderRadius: px(1) }, caretStyle]} /> : null}
      <Text maxFontSizeMultiplier={1.35} numberOfLines={1} style={[styles.tagText, { fontSize: Math.max(10, fs(10)) }]}>Dokun</Text>
    </Animated.View>
  );
}

// ---- shared bits ----------------------------------------------------------------------------

function SlideUp({ ctx, children, style, handle = true }: {
  ctx: Ctx; children: React.ReactNode; style?: StyleProp<ViewStyle>; handle?: boolean;
}) {
  const v = useRef(new Animated.Value(ctx.reduceMotion ? 0 : 1)).current;
  useEffect(() => {
    if (ctx.reduceMotion) { v.setValue(0); return; }
    Animated.timing(v, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, ctx.reduceMotion]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, ctx.height * 0.7] });
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, { opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} />
      <Animated.View style={[styles.sheet, { borderTopLeftRadius: ctx.px(22), borderTopRightRadius: ctx.px(22), paddingBottom: ctx.px(16), transform: [{ translateY }] }, style]}>
        {handle ? <View style={[styles.handle, { width: ctx.px(34), height: ctx.px(4), marginVertical: ctx.px(7) }]} /> : null}
        {children}
      </Animated.View>
    </>
  );
}

/** An app tile: iOS-like rounded square (or round on Android / in-app menus), neutral glyph, no logos. */
function Tile({ ctx, icon, label, image, round, muted }: {
  ctx: Ctx; icon?: IoniconName; label?: string; image?: number; round?: boolean; muted?: boolean;
}) {
  const { px, fs } = ctx;
  const size = px(40);
  const radius = round ? size / 2 : size * 0.235;
  return (
    <View style={{ alignItems: 'center', width: px(50) }}>
      {image ? (
        <Image source={image} style={{ width: size, height: size, borderRadius: radius }} contentFit="cover" accessible={false} />
      ) : (
        <View style={[styles.tile, muted && styles.tileMuted, { width: size, height: size, borderRadius: radius }]}>
          {icon ? <Ionicons name={icon} size={px(19)} color={colors.ink} /> : null}
        </View>
      )}
      {label ? (
        <Text allowFontScaling={false} numberOfLines={2} style={[styles.tileLabel, { fontSize: fs(8), marginTop: px(5), lineHeight: fs(10.5) }]}>{label}</Text>
      ) : null}
    </View>
  );
}

function Decor({ children, style, onLayout }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onLayout?: (e: LayoutChangeEvent) => void }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={style} onLayout={onLayout}>
      {children}
    </View>
  );
}

/** A small still of the dish for link previews: the photo when supplied, else the plate. */
function Thumb({ ctx, size }: { ctx: Ctx; size: number }) {
  const style = { width: size, height: size, borderRadius: ctx.px(7), overflow: 'hidden' as const };
  if (demoRecipeImage) return <Image source={demoRecipeImage as ImageProps['source']} style={style} contentFit="cover" accessible={false} />;
  return (
    <LinearGradient colors={MEDIA_FALLBACK_GRADIENT} locations={[0, 0.3, 1]} style={[style, styles.center]}>
      <DishArt size={size * 0.8} />
    </LinearGradient>
  );
}

function LinkPreview({ ctx, close }: { ctx: Ctx; close?: boolean }) {
  const { px, fs } = ctx;
  return (
    <Decor style={[styles.preview, { gap: px(9), paddingHorizontal: px(12), paddingTop: px(12), paddingBottom: px(11) }]}>
      <Thumb ctx={ctx} size={px(34)} />
      <View style={{ flex: 1 }}>
        <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: fs(10), color: colors.ink }}>{DEMO_RECIPE.caption}</Text>
        <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: fs(8.5), color: colors.textMuted, marginTop: px(1) }}>Video bağlantısı</Text>
      </View>
      {close ? (
        <View style={[styles.closeDot, { width: px(22), height: px(22), borderRadius: px(11) }]}>
          <Ionicons name="close" size={px(12)} color={colors.textMuted} />
        </View>
      ) : null}
    </Decor>
  );
}

// ---- scenes ---------------------------------------------------------------------------------

function VideoScene(ctx: Ctx) {
  const { px, fs, reduceMotion, scene, onAvoidRect } = ctx;
  // The overlay (handle, caption, rail) belongs to the video screen only: under a sheet it is
  // hidden, so nothing half-covered pokes out above the sheet.
  const chrome = scene === 'video';
  const shadowText = styles.onPhoto;
  const railItem = (icon: IoniconName, label: string | null, size = 23) => (
    <View style={{ alignItems: 'center', width: px(44) }}>
      <Ionicons name={icon} size={px(size)} color="#fff" style={shadowText} />
      {label ? <Text allowFontScaling={false} style={[styles.railLabel, shadowText, { fontSize: fs(8), marginTop: px(2) }]}>{label}</Text> : null}
    </View>
  );
  return (
    <View style={StyleSheet.absoluteFill}>
      <DemoMedia reduceMotion={reduceMotion} scrim="video" progress={{ top: px(38), side: px(14), height: px(2.5) }} />
      {chrome ? (
        <>
          {/* Caption */}
          <Decor style={[styles.caption, { left: px(14), right: px(66), bottom: px(20) }]}
            onLayout={(e: LayoutChangeEvent) => onAvoidRect(e.nativeEvent.layout)}>
            <View style={{ gap: px(6) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(6) }}>
                <View style={[styles.avatar, { width: px(22), height: px(22), borderRadius: px(11) }]}>
                  <Text allowFontScaling={false} style={{ fontFamily: fonts.bodyBold, fontSize: fs(10), color: colors.brand }}>E</Text>
                </View>
                <Text allowFontScaling={false} style={[shadowText, { fontFamily: fonts.bodySemi, fontSize: fs(10), color: '#fff' }]}>{DEMO_RECIPE.creator}</Text>
              </View>
              <Text allowFontScaling={false} numberOfLines={2} style={[shadowText, { fontFamily: fonts.body, fontSize: fs(9.5), lineHeight: fs(13.5), color: '#fff' }]}>
                {DEMO_RECIPE.caption} · tarif açıklamada
              </Text>
            </View>
          </Decor>
          {/* Right rail: share sits high enough that its tag clears the caption. */}
          <View style={[styles.rail, { right: px(8), bottom: px(18), gap: px(13) }]}>
            <Decor>{railItem('heart', '12,4 B')}</Decor>
            <Decor>{railItem('chatbubble-ellipses', '318')}</Decor>
            <Target ctx={ctx} radius={px(22)} tag="left">
              <View style={{ paddingVertical: px(3) }}>{railItem('arrow-redo', 'Paylaş')}</View>
            </Target>
            <Decor>{railItem('bookmark', '2.140', 21)}</Decor>
            <Decor>{railItem('ellipsis-horizontal', null, 19)}</Decor>
          </View>
        </>
      ) : null}
    </View>
  );
}

/** The video app's own share menu (generic). Its "Paylaş…" opens the phone's share sheet. */
function AppMenuSheet(ctx: Ctx) {
  const { px, fs } = ctx;
  const people = [['A', 'Ayşe'], ['M', 'Mert'], ['E', 'Ece'], ['D', 'Deniz']];
  return (
    // Bottom room for the tag under "Paylaş…" (the home-indicator area of a real sheet).
    <SlideUp ctx={ctx} style={{ paddingBottom: px(46) }}>
      <Decor>
        <Text allowFontScaling={false} style={[styles.sheetTitle, { fontSize: fs(10.5), marginBottom: px(12) }]}>Gönder</Text>
        <View style={[styles.row, { paddingHorizontal: px(12), marginBottom: px(12) }]}>
          {people.map(([letter, name]) => (
            <View key={name} style={{ alignItems: 'center', width: px(50) }}>
              <View style={[styles.person, { width: px(40), height: px(40), borderRadius: px(20) }]}>
                <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(12), color: colors.ink }}>{letter}</Text>
              </View>
              <Text allowFontScaling={false} style={[styles.tileLabel, { fontSize: fs(8), marginTop: px(5) }]}>{name}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.hair, { marginHorizontal: px(12), marginBottom: px(12) }]} />
      </Decor>
      <View style={[styles.row, { paddingHorizontal: px(12) }]}>
        <Decor style={[styles.row, { flex: 3 }]}>
          <Tile ctx={ctx} icon="link-outline" label="Kopyala" round muted />
          <Tile ctx={ctx} icon="download-outline" label="Kaydet" round muted />
          <Tile ctx={ctx} icon="chatbubble-outline" label="Mesaj" round muted />
        </Decor>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Target ctx={ctx} radius={px(20)} tag="bottom">
            <Tile ctx={ctx} icon="share-outline" label="Paylaş…" round muted />
          </Target>
        </View>
      </View>
    </SlideUp>
  );
}

/** The phone's own share sheet, iOS style: link header, app row, action list. Neutral tiles only. */
function SystemSheet(ctx: Ctx) {
  const { px, fs } = ctx;
  return (
    <SlideUp ctx={ctx} style={styles.sheetGrouped} handle={false}>
      <LinkPreview ctx={ctx} close />
      <Decor style={[styles.hair, { marginBottom: px(12) }]}><View /></Decor>
      <View style={[styles.row, { paddingHorizontal: px(10) }]}>
        <Decor style={[styles.row, { flex: 3 }]}>
          <Tile ctx={ctx} icon="chatbubble" label="Mesajlar" />
          <Tile ctx={ctx} icon="mail" label="Posta" />
          <Tile ctx={ctx} icon="document-text" label="Notlar" />
        </Decor>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Target ctx={ctx} radius={px(10)} tag="bottom">
            <Tile ctx={ctx} icon="ellipsis-horizontal" label={IOS_MORE_LABEL} muted />
          </Target>
        </View>
      </View>
      {/* Room for the tag under "Daha Fazla", then the action list. */}
      <Decor style={[styles.group, { marginHorizontal: px(10), marginTop: px(42), borderRadius: px(11) }]}>
        {([['Kopyala', 'copy-outline'], ['Yer İşaretlerine Ekle', 'book-outline']] as const).map(([label, icon], i) => (
          <View key={label} style={[styles.groupRow, { height: px(32), paddingHorizontal: px(12) }, i > 0 && styles.groupLine]}>
            <Text allowFontScaling={false} numberOfLines={1} style={{ flex: 1, fontFamily: fonts.body, fontSize: fs(9.5), color: colors.ink }}>{label}</Text>
            <Ionicons name={icon} size={px(14)} color={colors.ink} />
          </View>
        ))}
      </Decor>
    </SlideUp>
  );
}

/** "Daha Fazla": the full app list, with our share extension in it. */
function MoreAppsSheet(ctx: Ctx) {
  const { px, fs } = ctx;
  const rows: [IoniconName, string][] = [['chatbubble', 'Mesajlar'], ['mail', 'Posta'], ['document-text', 'Notlar']];
  const rowStyle = [styles.listRow, { height: px(40), paddingHorizontal: px(12), gap: px(10) }];
  const icon = { width: px(26), height: px(26), borderRadius: px(26) * 0.235 };
  return (
    <SlideUp ctx={ctx} style={[styles.sheetGrouped, { top: ctx.height * 0.22 }]} handle={false}>
      <Decor style={[styles.listHead, { paddingHorizontal: px(14), paddingTop: px(12), marginBottom: px(10) }]}>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.body, fontSize: fs(10), color: colors.brand, width: px(40) }}>Düzenle</Text>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(10.5), color: colors.ink }}>Uygulamalar</Text>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(10), color: colors.brand, width: px(40), textAlign: 'right' }}>Bitti</Text>
      </Decor>
      <Decor style={{ paddingHorizontal: px(24), marginBottom: px(5) }}>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bodyMedium, fontSize: fs(8), color: colors.textMuted }}>Öneriler</Text>
      </Decor>
      {/* No clipping around the target: its ring draws just outside the row. */}
      <View style={{ marginHorizontal: px(10) }}>
        <Target ctx={ctx} radius={px(11)} tag="bottom">
          <View style={[rowStyle, styles.targetRow, { borderRadius: px(11) }]}>
            <Image source={TARIFTEN_ICON} style={icon} contentFit="cover" accessible={false} />
            <Text allowFontScaling={false} numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bodySemi, fontSize: fs(10), color: colors.ink }}>{IOS_SHARE_TARGET}</Text>
            <Ionicons name="chevron-forward" size={px(12)} color={colors.textFaint} />
          </View>
        </Target>
      </View>
      {/* Room for the tag under the row, then the rest of the list. */}
      <Decor style={[styles.group, { marginHorizontal: px(10), marginTop: px(42), borderRadius: px(11) }]}>
        {rows.map(([name, label], i) => (
          <View key={label} style={[rowStyle, i > 0 && styles.groupLine]}>
            <View style={[styles.tile, icon]}><Ionicons name={name} size={px(13)} color={colors.ink} /></View>
            <Text allowFontScaling={false} style={{ fontFamily: fonts.body, fontSize: fs(10), color: colors.ink }}>{label}</Text>
          </View>
        ))}
      </Decor>
    </SlideUp>
  );
}

/** Android's share sheet: Tariften appears with the app's name. */
function AndroidSheet(ctx: Ctx) {
  const { px, fs } = ctx;
  return (
    <SlideUp ctx={ctx} style={{ paddingBottom: px(46) }}>
      <LinkPreview ctx={ctx} />
      <Decor style={[styles.hair, { marginHorizontal: px(12), marginBottom: px(10) }]}><View /></Decor>
      <Decor>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(8.5), color: colors.textMuted, paddingHorizontal: px(14), marginBottom: px(10) }}>
          Uygulamalar
        </Text>
      </Decor>
      <View style={[styles.row, { paddingHorizontal: px(10) }]}>
        <Decor><Tile ctx={ctx} icon="chatbubble" label="Mesajlar" round muted /></Decor>
        <Decor><Tile ctx={ctx} icon="mail" label="Posta" round muted /></Decor>
        <Target ctx={ctx} radius={px(20)} tag="bottom">
          <Tile ctx={ctx} image={TARIFTEN_ICON} label={ANDROID_SHARE_TARGET} round />
        </Target>
        <Decor><Tile ctx={ctx} icon="document-text" label="Notlar" round muted /></Decor>
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
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas, paddingTop: px(40), paddingHorizontal: px(14) }]}>
      <Decor>
        <View style={[styles.listHead, { marginBottom: px(14) }]}>
          <View style={[styles.miniCircle, { width: px(24), height: px(24), borderRadius: px(12) }]}>
            <Ionicons name="chevron-back" size={px(13)} color={colors.ink} />
          </View>
          <Text allowFontScaling={false} style={{ fontFamily: fonts.heading, fontSize: fs(10.5), color: colors.ink }}>Tarif Aktar</Text>
          <View style={{ width: px(24) }} />
        </View>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(7.5), letterSpacing: 1.4 * ctx.s, color: colors.brand }}>{trUpper('Videodan tarif')}</Text>
        <AccentText allowFontScaling={false} style={{ fontFamily: fonts.headingBold, fontSize: fs(17), lineHeight: fs(21), letterSpacing: -0.4 * ctx.s, color: colors.ink, marginTop: px(4) }}>
          {'Videoyu *tarife* çevir.'}
        </AccentText>
        <Text allowFontScaling={false} style={{ fontFamily: fonts.body, fontSize: fs(9), lineHeight: fs(13), color: colors.textMuted, marginTop: px(4) }}>
          Malzemeler ve adımlar hazırlanır; son kararı sen verirsin.
        </Text>
        <View style={[styles.aktarCard, { marginTop: px(14), padding: px(10), borderRadius: px(14), gap: px(8) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(8) }}>
            <Thumb ctx={ctx} size={px(30)} />
            <View style={{ flex: 1 }}>
              <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: fs(9.5), color: colors.ink }}>{DEMO_RECIPE.caption}</Text>
              <Text allowFontScaling={false} numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: fs(8), color: colors.textMuted, marginTop: px(1) }}>{DEMO_RECIPE.creator}</Text>
            </View>
          </View>
          <View style={[styles.linkField, { height: px(28), borderRadius: px(9), paddingHorizontal: px(8), gap: px(6) }]}>
            <Ionicons name="link-outline" size={px(12)} color={colors.textMuted} />
            <Text allowFontScaling={false} numberOfLines={1} style={{ flex: 1, fontFamily: fonts.body, fontSize: fs(9), color: colors.ink }}>{`https://…/video/${DEMO_RECIPE.slug}`}</Text>
            <Ionicons name="checkmark-circle" size={px(12)} color={colors.brand} />
          </View>
        </View>
        {/* What happens next; ticks while the sample is "prepared". */}
        <Text allowFontScaling={false} style={{ fontFamily: fonts.bodySemi, fontSize: fs(7.5), letterSpacing: 1.2 * ctx.s, color: colors.textMuted, marginTop: px(16), marginBottom: px(8) }}>
          {trUpper('Sonra ne olur?')}
        </Text>
        <View style={{ gap: px(8) }}>
          {PREPARING_LINES.map((line, i) => {
            const done = (prepared ?? 0) > i;
            return (
              <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: px(7) }}>
                <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={px(13)} color={done ? colors.brand : colors.textFaint} />
                <Text allowFontScaling={false} numberOfLines={1} style={{ flex: 1, fontFamily: done ? fonts.bodySemi : fonts.body, fontSize: fs(9), color: done ? colors.ink : colors.textMuted }}>{line}</Text>
              </View>
            );
          })}
        </View>
      </Decor>
      <View style={[styles.aktarFooter, { left: px(14), right: px(14), bottom: px(18) }]}>
        {busy ? <Decor>{button}</Decor> : (
          <Target ctx={ctx} radius={px(20)} tag="top">{button}</Target>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: colors.ink, ...shadow.floating },
  screen: { flex: 1, overflow: 'hidden', backgroundColor: colors.ink },
  screenLight: { backgroundColor: colors.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
  island: { position: 'absolute', left: '50%', backgroundColor: colors.ink },
  status: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusDim: { opacity: 0.7 },
  onPhoto: { textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  caption: { position: 'absolute' },
  avatar: { backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fff' },
  rail: { position: 'absolute', alignItems: 'center' },
  railLabel: { fontFamily: fonts.bodySemi, color: '#fff' },
  dim: { backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface },
  sheetGrouped: { backgroundColor: colors.cream },
  handle: { alignSelf: 'center', borderRadius: 2, backgroundColor: colors.lineStrong },
  sheetTitle: { fontFamily: fonts.bodySemi, color: colors.ink, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hair: { height: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  person: { backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  tile: {
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  tileMuted: { backgroundColor: colors.cream, borderColor: colors.cream },
  tileLabel: { fontFamily: fonts.body, color: colors.ink, textAlign: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center' },
  closeDot: { backgroundColor: colors.creamDeep, alignItems: 'center', justifyContent: 'center' },
  group: { backgroundColor: colors.surface, overflow: 'hidden' },
  groupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  groupLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.lineStrong },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listRow: { flexDirection: 'row', alignItems: 'center' },
  targetRow: { backgroundColor: colors.surface },
  halo: { position: 'absolute', backgroundColor: HALO },
  ringStatic: { position: 'absolute', borderColor: colors.brand },
  ringPulse: { position: 'absolute', borderColor: colors.brand },
  tag: { position: 'absolute', backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', ...shadow.card },
  measuring: { left: 0, top: 0, opacity: 0 },
  tagText: { fontFamily: fonts.bodySemi, color: '#fff', letterSpacing: 0.2 },
  caret: { position: 'absolute', backgroundColor: colors.brand, transform: [{ rotate: '45deg' }] },
  miniCircle: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  aktarCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  linkField: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.lineStrong },
  aktarFooter: { position: 'absolute' },
  mainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
});
