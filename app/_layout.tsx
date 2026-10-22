import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  Poppins_500Medium, Poppins_600SemiBold, Poppins_600SemiBold_Italic, Poppins_700Bold, Poppins_700Bold_Italic,
} from '@expo-google-fonts/poppins';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useEffect } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { ShareIntentProvider } from 'expo-share-intent';
import ShareIntentWatcher from '../components/navigation/ShareIntentWatcher';
import { NotificationsProvider } from '../components/notifications/NotificationsProvider';
import { colors, fonts } from '../constants/theme';

// Keep the native splash (brand tile on cream) until the brand fonts are in,
// so the first frame is already the real screen. No-op without the module.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  // Brand fonts (same pairing as the web). Render a plain canvas for the few
  // milliseconds they load so text never flashes in the system font.
  const [fontsLoaded, fontError] = useFonts({
    Poppins_500Medium, Poppins_600SemiBold, Poppins_600SemiBold_Italic, Poppins_700Bold, Poppins_700Bold_Italic,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });
  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  // "Paylaş → Tariften": the provider must sit above every other provider.
  return (
    <ShareIntentProvider options={{ resetOnBackground: true }}>
      {ready ? <AppShell /> : <View style={{ flex: 1, backgroundColor: colors.canvas }} />}
    </ShareIntentProvider>
  );
}

function AppShell() {
  return (
    <SafeAreaProvider>
    <ErrorBoundary>
      <AuthProvider>
      {/* Push + in-app notifications: reads (never requests) permission on launch, routes taps. */}
      <NotificationsProvider>
        <StatusBar style="dark" />
        <ShareIntentWatcher />
        <Stack screenOptions={{
          headerShown: false,
          // One quiet header for every stacked screen: canvas, no hairline,
          // ink back arrow, Poppins title.
          headerStyle: { backgroundColor: colors.canvas },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.headingBold, fontSize: 17, color: colors.ink },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.canvas },
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="share" options={{ headerShown: false, animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen
          name="recipe/create"
          options={{ headerShown: true, headerTitle: 'Tarif Oluştur' }}
        />
        <Stack.Screen
          name="recipe/edit/[id]"
          options={{ headerShown: true, headerTitle: 'Tarifi Düzenle' }}
        />
        <Stack.Screen
          name="recipe/aktar"
          options={{
            headerShown: true,
            headerTitle: 'Tarif Aktar',
          }}
        />
        <Stack.Screen
          name="recipe/import"
          options={{
            headerShown: true,
            headerTitle: 'Tarif Aktar',
          }}
        />
        <Stack.Screen
          name="recipe/fotograf"
          options={{ headerShown: true, headerTitle: 'Fotoğraftan Tarif' }}
        />
        <Stack.Screen
          name="recipe/defter"
          options={{ headerShown: true, headerTitle: 'Defterden Tarif' }}
        />
        <Stack.Screen
          name="recipe/kendi-video"
          options={{ headerShown: true, headerTitle: 'Kendi Videondan Tarif' }}
        />
        <Stack.Screen
          name="recipe/[slug]"
          options={{
            // Full-bleed editorial hero: the recipe itself renders its own
            // accessible safe-area back button over the image.
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="menu/create"
          options={{
            headerShown: true,
            headerTitle: 'Yeni Menü',
          }}
        />
        {/* Menus and the blog draw their own editorial headers with safe-area back buttons. */}
        <Stack.Screen name="menu/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="blog/index" options={{ headerShown: false }} />
        <Stack.Screen name="blog/[slug]" options={{ headerShown: false }} />
        {/* Mutfak Rehberi: own safe-area headers (list, tools) and a floating top bar (article). */}
        <Stack.Screen name="rehber/index" options={{ headerShown: false }} />
        <Stack.Screen name="rehber/[slug]" options={{ headerShown: false }} />
        <Stack.Screen name="rehber/araclar" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{
            headerShown: true,
            headerTitle: '',
          }}
        />
        <Stack.Screen
          name="register"
          options={{
            headerShown: true,
            headerTitle: '',
          }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{
            headerShown: true,
            headerTitle: '',
          }}
        />
        <Stack.Screen
          name="collections/index"
          options={{
            headerShown: true,
            headerTitle: 'Koleksiyonlar',
          }}
        />
        <Stack.Screen
          name="notifications"
          options={{
            headerShown: true,
            headerTitle: 'Bildirimler',
          }}
        />
        {/* Kitchen profile draws its own safe-area header with progress. */}
        <Stack.Screen name="profile/kitchen" options={{ headerShown: false }} />
        {/* Notlarım: private recipe notes (Core 1.0.59). */}
        <Stack.Screen
          name="profile/notes"
          options={{
            headerShown: true,
            headerTitle: 'Notlarım',
          }}
        />
        {/* Engellenen üyeler: the member's block list (Core 1.0.67). */}
        <Stack.Screen
          name="profile/blocks"
          options={{
            headerShown: true,
            headerTitle: 'Engellenen üyeler',
          }}
        />
        <Stack.Screen
          name="profile/edit"
          options={{
            headerShown: true,
            headerTitle: 'Profili Düzenle',
          }}
        />
        </Stack>
      </NotificationsProvider>
      </AuthProvider>
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}
