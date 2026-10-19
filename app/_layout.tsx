import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
    <ErrorBoundary>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="recipe/create"
          options={{ headerShown: true, headerTitle: 'Tarif Oluştur', headerBackTitle: 'Tarifler', headerTintColor: '#df5043' }}
        />
        <Stack.Screen
          name="recipe/edit/[id]"
          options={{ headerShown: true, headerTitle: 'Tarifi Düzenle', headerBackTitle: 'Geri', headerTintColor: '#df5043' }}
        />
        <Stack.Screen
          name="recipe/aktar"
          options={{
            headerShown: true,
            headerTitle: 'Tarif Aktar',
            headerBackTitle: 'Geri',
            headerTintColor: '#db4c3f',
          }}
        />
        <Stack.Screen
          name="recipe/import"
          options={{
            headerShown: true,
            headerTitle: 'Akıllı Tarif Aktarımı',
            headerBackTitle: 'Tarifler',
            headerTintColor: '#db4c3f',
          }}
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
            headerBackTitle: 'Vazgeç',
            headerTintColor: '#e74c3c',
          }}
        />
        <Stack.Screen
          name="menu/[slug]"
          options={{
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Geri',
            headerTintColor: '#e74c3c',
          }}
        />
        <Stack.Screen
          name="blog/index"
          options={{
            headerShown: true,
            headerTitle: 'Blog',
            headerBackTitle: 'Geri',
            headerTintColor: '#e74c3c',
          }}
        />
        <Stack.Screen
          name="blog/[slug]"
          options={{
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Blog',
            headerTintColor: '#e74c3c',
          }}
        />
        <Stack.Screen
          name="login"
          options={{
            headerShown: true,
            headerTitle: 'Giriş Yap',
            headerBackTitle: 'Geri',
            headerTintColor: '#e74c3c',
          }}
        />
        <Stack.Screen
          name="register"
          options={{
            headerShown: true,
            headerTitle: 'Kayıt Ol',
            headerBackTitle: 'Geri',
            headerTintColor: '#e74c3c',
          }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{
            headerShown: true,
            headerTitle: 'Şifremi Unuttum',
            headerBackTitle: 'Geri',
            headerTintColor: '#e74c3c',
          }}
        />
        <Stack.Screen
          name="collections/index"
          options={{
            headerShown: true,
            headerTitle: 'Koleksiyonlar',
            headerBackTitle: 'Geri',
            headerTintColor: '#e74c3c',
          }}
        />
        <Stack.Screen
          name="profile/edit"
          options={{
            headerShown: true,
            headerTitle: 'Profili Düzenle',
            headerBackTitle: 'Geri',
            headerTintColor: '#e74c3c',
          }}
        />
        </Stack>
      </AuthProvider>
    </ErrorBoundary>
    </SafeAreaProvider>
  );
}
