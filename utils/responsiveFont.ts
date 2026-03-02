/**
 * Responsive font helper.
 * Scales `baseSize` by `scale` (defaults to 1 – no scaling when not provided).
 * Typical usage: rf(15, fontScale) where fontScale comes from useResponsive().
 */
export function rf(baseSize: number, scale: number = 1): number {
  return Math.round(baseSize * scale);
}
