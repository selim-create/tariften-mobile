import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="recipe/[slug]"
          options={{
            headerShown: true,
            headerTitle: '',
            headerBackTitle: 'Geri',
            headerTintColor: '#e74c3c',
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
  );
}
