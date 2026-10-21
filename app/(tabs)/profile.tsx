import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import QuotaCard from '../../components/QuotaCard';
import { useQuotas } from '../../lib/quotas';
import { deleteAccount, getInteractions } from '../../lib/api';
import { Recipe } from '../../lib/types';
import RecipeCard from '../../components/RecipeCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import MyKitchenLibrary from '../../components/account/MyKitchenLibrary';
import { useTabBarSpace } from '../../components/navigation/FloatingTabBar';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';

type ProfileTab = 'my_recipes' | 'my_menus' | 'favorites' | 'cooked';
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function ProfileScreen() {
  const tabSpace = useTabBarSpace();
  const router = useRouter();
  // Editorial page: draws its own safe-area header (back to Defterim, settings).
  const { user, token, logout } = useAuth();
  const quotas = useQuotas(token);
  const [activeTab, setActiveTab] = useState<ProfileTab>('my_recipes');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadRecipes = useCallback(
    async (tab: ProfileTab) => {
      if (!token || tab === 'my_recipes' || tab === 'my_menus') return;
      setLoading(true);
      try {
        let data: Recipe[] = [];
        if (tab === 'favorites') {
          data = await getInteractions(token, 'favorite');
        } else if (tab === 'cooked') {
          data = await getInteractions(token, 'cooked');
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

  // Returning after publication or interaction edits must always refresh the
  // currently displayed personal tab; no stale screen-local cache.
  useFocusEffect(useCallback(() => {
    if (user && token && (activeTab === 'favorites' || activeTab === 'cooked')) {
      void loadRecipes(activeTab);
    }
  }, [user?.id, token, activeTab, loadRecipes]));

  const onRefresh = useCallback(() => {
    if (activeTab === 'favorites' || activeTab === 'cooked') {
      setRefreshing(true);
      void loadRecipes(activeTab);
    }
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

  const handleDeleteAccount = () => {
    Alert.alert(
      'Hesabı Sil',
      'Hesabınızı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Hesabımı Sil',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await deleteAccount(token);
              logout();
            } catch (error) {
              Alert.alert('Hata', error instanceof Error ? error.message : 'Hesap silinemedi.');
            }
          },
        },
      ]
    );
  };

  if (!user || !token) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: tabSpace }}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.circle} onPress={() => router.navigate('/defterim')}
              accessibilityRole="button" accessibilityLabel="Defterim'e dön">
              <Ionicons name="chevron-back" size={21} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <View style={styles.guestHead}>
            <Text style={styles.kicker}>Profil</Text>
            <AccentText style={styles.pageTitle}>{'Mutfağına *hoş geldin*'}</AccentText>
          </View>
          <View style={styles.guest}>
            <View style={styles.guestArt}>
              {['domates', 'fesleğen', 'limon'].map(name => <LokmaIngredientIcon key={name} name={name} size={30} />)}
            </View>
            <Text style={styles.guestTitle}>Hesabınıza Giriş Yapın</Text>
            <Text style={styles.guestText}>
              Favori tariflerinizi, pişirdiklerinizi ve kendi tariflerinizi görüntülemek için giriş yapın.
            </Text>
            <TouchableOpacity style={styles.primary} onPress={() => router.push('/login')} accessibilityRole="button">
              <Text style={styles.primaryText}>Giriş Yap</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={() => router.push('/register')} accessibilityRole="button">
              <Text style={styles.secondaryText}>Standart Üye ol</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const tabs: { key: ProfileTab; label: string; icon: IoniconName; iconActive: IoniconName }[] = [
    { key: 'my_recipes', label: 'Tariflerim', icon: 'document-text-outline', iconActive: 'document-text' },
    { key: 'my_menus', label: 'Sofralarım', icon: 'book-outline', iconActive: 'book' },
    { key: 'favorites', label: 'Favoriler', icon: 'heart-outline', iconActive: 'heart' },
    { key: 'cooked', label: 'Pişirdiklerim', icon: 'restaurant-outline', iconActive: 'restaurant' },
  ];
  const displayName = (user.user_display_name || '').trim();
  const initial = (displayName || user.user_email || 'T').charAt(0).toLocaleUpperCase('tr-TR');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabSpace }}
        refreshControl={<RefreshControl refreshing={refreshing && (activeTab === 'favorites' || activeTab === 'cooked')}
          onRefresh={onRefresh} tintColor={colors.brand} />}>
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.circle} onPress={() => router.navigate('/defterim')}
            accessibilityRole="button" accessibilityLabel="Defterim'e dön">
            <Ionicons name="chevron-back" size={21} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.circle} onPress={() => router.push('/profile/edit')}
            accessibilityRole="button" accessibilityLabel="Profili düzenle">
            <Ionicons name="settings-outline" size={19} color={colors.ink} />
          </TouchableOpacity>
        </View>

        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <Pressable onPress={() => router.push('/profile/edit')} style={styles.avatarWrap}
            accessibilityRole="button" accessibilityLabel="Profil fotoğrafını değiştir">
            {user.avatar_url && user.avatar_url.length > 0 ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.monogram]}><Text style={styles.monogramText}>{initial}</Text></View>
            )}
            <View style={styles.avatarEdit}><Ionicons name="camera-outline" size={14} color={colors.ink} /></View>
          </Pressable>
          <Text style={styles.kicker}>Profil</Text>
          <Text style={styles.displayName}>{displayName || 'Tariften üyesi'}</Text>
          <Text style={styles.email}>{user.user_email}</Text>
          {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
          <View style={styles.headActions}>
            <TouchableOpacity style={styles.pill} onPress={() => router.push('/profile/edit')} accessibilityRole="button">
              <Ionicons name="create-outline" size={16} color={colors.ink} />
              <Text style={styles.pillText}>Profili düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pill} onPress={handleLogout} accessibilityRole="button">
              <Ionicons name="log-out-outline" size={16} color={colors.ink} />
              <Text style={styles.pillText}>Çıkış Yap</Text>
            </TouchableOpacity>
          </View>
        </View>

        <QuotaCard data={quotas.data} error={quotas.error} loading={quotas.loading} />

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsContainer}>
          {tabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Ionicons name={active ? tab.iconActive : tab.icon} size={16} color={active ? '#fff' : colors.text} />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Kitchen library reads never silently trim the owner's first 10 or 12 items. */}
        {(activeTab === 'my_recipes' || activeTab === 'my_menus') ? (
          <MyKitchenLibrary kind={activeTab === 'my_recipes' ? 'recipes' : 'menus'}
            token={token} userId={user.id} />
        ) : loading ? (
          <LoadingSpinner />
        ) : (
          <FlatList
            data={recipes}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => <RecipeCard recipe={item} variant="row" />}
            contentContainerStyle={styles.recipesList}
            scrollEnabled={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTitle}>
                  {activeTab === 'favorites' && 'Henüz favori tarifiniz yok.'}
                  {activeTab === 'cooked' && 'Henüz pişirdiğiniz tarif yok.'}
                </Text>
                <Text style={styles.emptyText}>
                  {activeTab === 'favorites' ? 'Tarif sayfasındaki kalbe dokun; tarif buraya gelsin.' : 'Bir tarifi pişirdikten sonra “Pişirdim” olarak işaretle.'}
                </Text>
                <TouchableOpacity
                  style={styles.emptyButton}
                  onPress={() => router.push('/recipes')}
                >
                  <Text style={styles.emptyButtonText}>
                    {'Tarifleri Keşfet'}
                  </Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}

        {/* Settings Section */}
        <View style={styles.settingsSection}>
          <Text style={styles.settingsSectionTitle}>Yasal & Bilgilendirme</Text>
          <View style={styles.settingsCard}>
            {[
              { icon: 'document-outline' as IoniconName, label: 'Hakkımızda', url: 'https://tariften.com/about' },
              { icon: 'mail-outline' as IoniconName, label: 'İletişim & Reklam', url: 'https://tariften.com/contact' },
              { icon: 'reader-outline' as IoniconName, label: 'Kullanım Koşulları', url: 'https://tariften.com/terms' },
              { icon: 'lock-closed-outline' as IoniconName, label: 'Gizlilik Politikası', url: 'https://tariften.com/privacy' },
              { icon: 'shield-outline' as IoniconName, label: 'KVKK Aydınlatma Metni', url: 'https://tariften.com/kvkk' },
            ].map((item, index) => (
              <TouchableOpacity
                key={item.url}
                style={[styles.settingsRow, index > 0 && styles.settingsRowLine]}
                onPress={() => Linking.openURL(item.url).catch(() => Alert.alert('Hata', 'Sayfa açılamadı.'))}
                accessibilityRole="link"
              >
                <View style={styles.settingsIcon}><Ionicons name={item.icon} size={17} color={colors.ink} /></View>
                <Text style={styles.settingsRowText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.settingsSectionTitle}>Hesap İşlemleri</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow} onPress={handleDeleteAccount} accessibilityRole="button">
              <View style={[styles.settingsIcon, styles.deleteIcon]}><Ionicons name="trash-outline" size={17} color={colors.brand} /></View>
              <Text style={[styles.settingsRowText, styles.deleteText]}>Hesabımı Sil</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.versionText}>Tariften v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 6 },
  circle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  pageTitle: { fontFamily: fonts.headingBold, fontSize: 32, lineHeight: 37, letterSpacing: -0.9, color: colors.ink, marginTop: 8 },
  profileHeader: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 8 },
  avatarWrap: { marginBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.cream },
  monogram: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  monogramText: { fontFamily: fonts.headingBold, fontSize: 38, color: '#fff' },
  avatarEdit: {
    position: 'absolute', right: -2, bottom: 2, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.canvas, ...shadow.card,
  },
  displayName: { fontFamily: fonts.headingBold, fontSize: 28, lineHeight: 34, letterSpacing: -0.7, color: colors.ink, marginTop: 6, textAlign: 'center' },
  email: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, marginTop: 4 },
  bio: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text, textAlign: 'center', marginTop: 10 },
  headActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 16, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong,
  },
  pillText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
  tabsContainer: { gap: 8, paddingHorizontal: 20, paddingTop: 26, paddingBottom: 4 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 15, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.text },
  tabLabelActive: { color: '#fff' },
  recipesList: { paddingHorizontal: 20, paddingTop: 14, gap: 10 },
  emptyContainer: {
    alignItems: 'center', padding: 24, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong,
  },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  emptyButton: { backgroundColor: colors.brand, borderRadius: radius.pill, paddingHorizontal: 22, height: 46, justifyContent: 'center' },
  emptyButtonText: { fontFamily: fonts.bodySemi, color: '#ffffff', fontSize: 15 },
  guestHead: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 18 },
  guest: {
    marginHorizontal: 20, padding: 24, borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center',
  },
  guestArt: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  guestTitle: { fontFamily: fonts.headingBold, fontSize: 20, lineHeight: 26, color: colors.ink, textAlign: 'center' },
  guestText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  primary: { alignSelf: 'stretch', height: 52, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 16, color: '#fff' },
  secondary: { alignSelf: 'stretch', height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.ink },
  settingsSection: { marginTop: 30, paddingHorizontal: 20 },
  settingsSectionTitle: {
    fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', color: colors.textMuted,
    marginTop: 18, marginBottom: 10,
  },
  settingsCard: { borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 54 },
  settingsRowLine: { borderTopWidth: 1, borderTopColor: colors.line },
  settingsIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  deleteIcon: { backgroundColor: colors.brandSoft },
  settingsRowText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  deleteText: { color: colors.brand },
  versionText: { fontFamily: fonts.body, textAlign: 'center', fontSize: 12, color: colors.textFaint, paddingVertical: 24 },
});
