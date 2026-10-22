import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { safeHttpsUrl } from '../../lib/guides';
import { colors } from '../../constants/theme';

/**
 * Opens a source, a video or an outside link from a guide in the in-app
 * browser sheet (expo-web-browser, already in the native build). https only;
 * the system browser is the fallback.
 */
export async function openExternal(url: string): Promise<void> {
  const safe = safeHttpsUrl(url);
  if (!safe) {
    if (/^mailto:/i.test(url)) void Linking.openURL(url).catch(() => undefined);
    return;
  }
  try {
    await WebBrowser.openBrowserAsync(safe, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: colors.brand,
      dismissButtonStyle: 'close',
      enableBarCollapsing: true,
    });
  } catch {
    void Linking.openURL(safe).catch(() => undefined);
  }
}
