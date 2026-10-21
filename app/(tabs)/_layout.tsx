import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '../../context/AuthContext';
import { useResponsive } from '../../hooks/useResponsive';
import GlobalCreateAction from '../../components/navigation/GlobalCreateAction';
import FloatingTabBar from '../../components/navigation/FloatingTabBar';
import { colors, fonts } from '../../constants/theme';

/**
 * Visible tabs: Keşfet · Defterim · ＋ · Bu Hafta · Alışveriş (floating pill).
 * Tarifler, Dolap, Menüler and Profil stay real routes (deep links, pushes)
 * but are reached from Keşfet, Defterim and the header avatar.
 */
const hiddenTabs: { name: string; title: string; ownHeader?: boolean }[] = [
  { name: 'recipes', title: 'Tarifler', ownHeader: true },
  { name: 'pantry', title: 'Dolap', ownHeader: true },
  { name: 'menus', title: 'Menüler', ownHeader: true },
  { name: 'profile', title: 'Profil' },
];

export default function TabLayout() {
  const router = useRouter();
  const { user } = useAuth();
  const { isTablet } = useResponsive();
  const [createOpen, setCreateOpen] = useState(false);
  const headerTitleSize = isTablet ? 21 : 18;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Tabs
        tabBar={props => <FloatingTabBar {...props} onCreate={() => setCreateOpen(true)} createOpen={createOpen} />}
        screenOptions={{
          headerStyle: { backgroundColor: colors.canvas },
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.headingBold, fontSize: headerTitleSize },
          sceneStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Keşfet',
            headerTitle: () => (
              <Image
                source={require('../../assets/logo.svg')}
                style={headerStyles.logoImage}
                contentFit="contain"
                accessibilityLabel="Tariften"
              />
            ),
            headerTitleAlign: 'left',
            headerRight: () => (
              <View style={headerStyles.rightContainer}>
                <TouchableOpacity onPress={() => router.push('/recipes')} style={headerStyles.circle}
                  accessibilityRole="button" accessibilityLabel="Tarif ara">
                  <Ionicons name="search" size={19} color={colors.ink} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push(user ? '/profile' : '/login')} style={headerStyles.circle}
                  accessibilityRole="button" accessibilityLabel={user ? 'Profilim' : 'Giriş yap'}>
                  {user?.avatar_url ? (
                    <Image source={{ uri: user.avatar_url }} style={headerStyles.userAvatar} contentFit="cover" />
                  ) : user ? (
                    <View style={headerStyles.initial}>
                      <Ionicons name="person" size={17} color={colors.brand} />
                    </View>
                  ) : (
                    <Ionicons name="person-outline" size={19} color={colors.ink} />
                  )}
                </TouchableOpacity>
              </View>
            ),
          }}
        />
        <Tabs.Screen name="defterim" options={{ title: 'Defterim', headerShown: false }} />
        <Tabs.Screen name="bu-hafta" options={{ title: 'Bu Hafta', headerShown: false }} />
        <Tabs.Screen name="alisveris" options={{ title: 'Alışveriş', headerShown: false }} />
        {hiddenTabs.map(tab => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title, href: null, headerShown: !tab.ownHeader }} />
        ))}
      </Tabs>
      <GlobalCreateAction visible={createOpen} onClose={() => setCreateOpen(false)} />
    </View>
  );
}

const headerStyles = StyleSheet.create({
  logoImage: { height: 28, width: 138 },
  rightContainer: { flexDirection: 'row', gap: 8, paddingRight: 16, alignItems: 'center' },
  circle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  userAvatar: { width: 40, height: 40 },
  initial: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
});
