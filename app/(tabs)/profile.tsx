import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { getInteractions, getUserRecipes } from '../../lib/api';
import { Recipe } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import LoadingSpinner from '../../components/LoadingSpinner';

type ProfileTab = 'favorites' | 'cooked' | 'my_recipes';
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function ProfileScreen() {
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileTab>('favorites');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecipes = useCallback(
    async (tab: ProfileTab) => {
      if (!token) return;
      setRecipes([]);
      setLoading(true);
      try {
        let data: Recipe[] = [];
        if (tab === 'favorites') {
          data = await getInteractions(token, 'favorite');
        } else if (tab === 'cooked') {
          data = await getInteractions(token, 'cooked');
        } else if (tab === 'my_recipes') {
          data = await getUserRecipes(token);
        }
        setRecipes(data);
      } catch (error) {
        console.error('Profile recipes load error:', error);
        setRecipes([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (user && token) {
      loadRecipes(activeTab);
    }
  }, [user, token, activeTab, loadRecipes]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadRecipes(activeTab);
  }, [activeTab, loadRecipes]);

  const handleLogout = () => {
    Alert.alert('Çıkış Yap', 'Hesabınızdan çıkmak istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış Yap',
        style: 'destructive',
        onPress: logout,
      },
    ]);
  };

  if (!user || !token) {
    return (
      <View style={styles.notLoggedIn}>
        <Ionicons name="person-circle-outline" size={80} color="#e74c3c" style={styles.notLoggedInIcon} />
        <Text style={styles.notLoggedInTitle}>Hesabınıza Giriş Yapın</Text>
        <Text style={styles.notLoggedInText}>
          Favori tariflerinizi, pişirdiklerinizi ve kendi tariflerinizi görüntülemek için giriş yapın.
        </Text>
        <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
          <Text style={styles.loginButtonText}>Giriş Yap</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.registerButton} onPress={() => router.push('/register')}>
          <Text style={styles.registerButtonText}>Hesap Oluştur</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tabs: { key: ProfileTab; label: string; icon: IoniconName; iconActive: IoniconName }[] = [
    { key: 'favorites', label: 'Favoriler', icon: 'heart-outline', iconActive: 'heart' },
    { key: 'cooked', label: 'Pişirdiklerim', icon: 'restaurant-outline', iconActive: 'restaurant' },
    { key: 'my_recipes', label: 'Tariflerim', icon: 'document-text-outline', iconActive: 'document-text' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            {user.avatar_url && user.avatar_url.length > 0 ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <Image
                source={{ uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.user_display_name || 'U')}&background=db4c3f&color=fff&size=160` }}
                style={styles.avatar}
                contentFit="cover"
              />
            )}
            <TouchableOpacity style={styles.editAvatarButton} onPress={() => router.push('/profile/edit')}>
              <Ionicons name="settings-outline" size={14} color="#555555" />
            </TouchableOpacity>
          </View>
          <Text style={styles.displayName}>{user.user_display_name}</Text>
          <Text style={styles.email}>{user.user_email}</Text>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={16} color="#666666" />
            <Text style={styles.logoutText}>Çıkış Yap</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Ionicons
                name={activeTab === tab.key ? tab.iconActive : tab.icon}
                size={20}
                color={activeTab === tab.key ? '#e74c3c' : '#999999'}
              />
              <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recipes */}
        {loading ? (
          <LoadingSpinner />
        ) : (
          <FlatList
            data={recipes}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <RecipeCard recipe={item} />}
            contentContainerStyle={styles.recipesList}
            scrollEnabled={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e74c3c" />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {activeTab === 'favorites' && 'Henüz favori tarifiniz yok.'}
                  {activeTab === 'cooked' && 'Henüz pişirdiğiniz tarif yok.'}
                  {activeTab === 'my_recipes' && 'Henüz tarif oluşturmadınız.'}
                </Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() =>
                    activeTab === 'my_recipes'
                      ? router.push('/recipe/create')
                      : router.push('/')
                  }
                >
                  <Text style={styles.emptyButtonText}>
                    {activeTab === 'my_recipes' ? 'Tarif Oluştur' : 'Tariflere Göz At'}
                  </Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  profileHeader: {
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 10,
    right: -2,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 12,
    padding: 4,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  logoutText: {
    fontSize: 13,
    color: '#666666',
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 2,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#e74c3c',
  },
  tabLabel: {
    fontSize: 11,
    color: '#999999',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#e74c3c',
  },
  recipesList: {
    padding: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#999999',
    marginBottom: 12,
  },
  emptyButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  notLoggedIn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
  },
  notLoggedInIcon: {
    marginBottom: 16,
  },
  notLoggedInTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 12,
    textAlign: 'center',
  },
  notLoggedInText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  loginButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  loginButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  registerButton: {
    borderWidth: 1.5,
    borderColor: '#e74c3c',
    borderRadius: 12,
    paddingHorizontal: 40,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  registerButtonText: {
    color: '#e74c3c',
    fontWeight: '700',
    fontSize: 16,
  },
});
