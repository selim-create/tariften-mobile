/**
 * The iOS share extension opens Tariften with `<scheme>://dataUrl=<key>…`.
 * That is not a screen: send it to /share, which reads the shared link.
 * Every other link keeps its normal route.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (typeof path === 'string' && path.includes('dataUrl=')) return '/share';
    return path;
  } catch {
    return '/';
  }
}
