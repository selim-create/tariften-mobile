/**
 * Tariften design tokens — one source for colour, type, radius, spacing and
 * elevation. Mirrors the web (Tailwind @theme) so both surfaces feel like one
 * product: brand red #db4c3f, warm cream surfaces, Poppins headings with an
 * italic brand accent, Inter for reading text.
 */
import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  brand: '#db4c3f',
  brandDark: '#b03d32',
  brandSoft: '#fdf1ea',
  ink: '#1f1a17',
  slate900: '#0f172a',
  text: '#1f2933',
  textMuted: '#64748b',
  textFaint: '#94a3b8',
  canvas: '#fcfbf9',
  surface: '#ffffff',
  cream: '#f6efe8',
  creamDeep: '#efe4d8',
  line: '#ece7e1',
  lineStrong: '#e2d9cf',
  success: '#16a34a',
  successSoft: '#ecfdf3',
  warning: '#b45309',
  warningSoft: '#fff7e6',
  overlay: 'rgba(15, 23, 42, 0.45)',
} as const;

/** Font family names registered in app/_layout.tsx (useFonts). */
export const fonts = {
  heading: 'Poppins_600SemiBold',
  headingBold: 'Poppins_700Bold',
  headingItalic: 'Poppins_600SemiBold_Italic',
  headingBoldItalic: 'Poppins_700Bold_Italic',
  headingMedium: 'Poppins_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand } as TextStyle,
  display: { fontFamily: fonts.headingBold, fontSize: 34, lineHeight: 38, letterSpacing: -1, color: colors.ink } as TextStyle,
  title: { fontFamily: fonts.headingBold, fontSize: 26, lineHeight: 31, letterSpacing: -0.6, color: colors.ink } as TextStyle,
  heading: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 25, letterSpacing: -0.3, color: colors.ink } as TextStyle,
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text } as TextStyle,
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 22, color: colors.text } as TextStyle,
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted } as TextStyle,
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text } as TextStyle,
};

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: { shadowColor: '#3b2a20', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } },
    default: { elevation: 2 },
  }),
  floating: Platform.select<ViewStyle>({
    ios: { shadowColor: '#1f1a17', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 12 } },
    default: { elevation: 10 },
  }),
} as const;
