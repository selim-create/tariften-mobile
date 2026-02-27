import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useAuth } from '../../context/AuthContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  name: string;
  title: string;
  icon: IoniconName;
  iconOutline: IoniconName;
}

const otherTabs: TabConfig[] = [
  { name: 'recipes', title: 'Tarifler', icon: 'restaurant', iconOutline: 'restaurant-outline' },
  { name: 'pantry', title: 'Dolap', icon: 'basket', iconOutline: 'basket-outline' },
  { name: 'menus', title: 'Menüler', icon: 'book', iconOutline: 'book-outline' },
  { name: 'profile', title: 'Profil', icon: 'person', iconOutline: 'person-outline' },
];

export default function TabLayout() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#e74c3c',
        tabBarInactiveTintColor: '#999999',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e5e5e5',
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#ffffff',
        },
        headerTintColor: '#1a1a1a',
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
        },
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
            />
          ),
          headerRight: () => (
            <View style={headerStyles.rightContainer}>
              <TouchableOpacity onPress={() => router.push('/recipes')} style={headerStyles.iconButton}>
                <Ionicons name="search-outline" size={22} color="#1a1a1a" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/profile')} style={headerStyles.iconButton}>
                <Ionicons name="heart-outline" size={22} color="#1a1a1a" />
              </TouchableOpacity>
              {user?.avatar_url && user.avatar_url.length > 0 ? (
                <TouchableOpacity onPress={() => router.push('/profile')} style={headerStyles.iconButton}>
                  <Image
                    source={{ uri: user.avatar_url }}
                    style={headerStyles.userAvatar}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              ) : user ? (
                <TouchableOpacity onPress={() => router.push('/profile')} style={headerStyles.iconButton}>
                  <Image
                    source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.user_display_name || 'U')}&background=db4c3f&color=fff&size=56` }}
                    style={headerStyles.userAvatar}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => router.push('/profile')} style={headerStyles.iconButton}>
                  <Ionicons name="person-circle-outline" size={28} color="#1a1a1a" />
                </TouchableOpacity>
              )}
            </View>
          ),
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      {otherTabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? tab.icon : tab.iconOutline} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const headerStyles = StyleSheet.create({
  logoImage: {
    height: 30,
    width: 120,
  },
  rightContainer: {
    flexDirection: 'row',
    gap: 4,
    paddingRight: 12,
    alignItems: 'center',
  },
  iconButton: {
    padding: 4,
  },
  userAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
});
