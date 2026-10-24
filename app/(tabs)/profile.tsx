import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
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
import { useBlockFilter } from '../../hooks/useBlockFilter';
import LoadingSpinner from '../../components/LoadingSpinner';
import MyKitchenLibrary from '../../components/account/MyKitchenLibrary';
import { useTabBarSpace } from '../../components/navigation/FloatingTabBar';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import { takeKitchenFlash } from '../../lib/kitchen-profile';
import { openNotificationSettings, useNotifications } from '../../components/notifications/NotificationsProvider';
import { badgeLabel } from '../../lib/notifications-core';
import { storeReviewPageUrl } from '../../lib/review-prompt';

type ProfileTab = 'my_recipes' | 'my_menus' | 'favorites' | 'cooked';

/** Core 1.0.67: published recipes stay, anonymously, under the community account. */
const ACCOUNT_DELETE_CONFIRM = 'Hesabını silmek istediğine emin misin? Bu işlem geri alınamaz.\n\n'
  + 'Yayındaki tariflerin sitede anonim olarak "Tariften Topluluğu" adıyla kalmaya devam eder. '
  + 'Taslakların, özel tariflerin, menülerin ve diğer kişisel içeriklerin silinir; yorumların anonimleştirilir.';
const ACCOUNT_DELETED_MESSAGE = 'Hesabın silindi. Yayındaki tariflerin anonim olarak sitede kalmaya devam edecek.';
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function ProfileScreen() {
  const tabSpace = useTabBarSpace();
  const router = useRouter();
  // Editorial page: draws its own safe-area header (back to Defterim, settings).
  const { user, token, logout } = useAuth();
  const quotas = useQuotas(token);
  const [activeTab, setActiveTab] = useState<ProfileTab>('my_recipes');
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const { visibleRecipes, blocks } = useBlockFilter();
  const shownRecipes = useMemo(() => visibleRecipes(recipes), [visibleRecipes, recipes]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [kitchenFlash, setKitchenFlash] = useState<string | null>(null);
  const notifications = useNotifications();
  const [pushBusy, setPushBusy] = useState(false);
  // Store write-review page; null (no store URL in app.json yet, or no native module) hides the row.
  const reviewUrl = useMemo(() => storeReviewPageUrl(), []);

  useFocusEffect(useCallback(() => { void notifications.refreshPushStatus(); }, [notifications.refreshPushStatus]));

  // The second (and last) place that may show the OS permission prompt.
  const togglePush = async (on: boolean) => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const result = await notifications.setPushEnabled(on);
      if (result === 'needs_settings' || result === 'denied') {
        Alert.alert(
          'Bildirim izni kapalı',
          'Tarifin hazır olduğunda haber verebilmemiz için cihaz ayarlarından Tariften bildirimlerine izin ver.',
          [{ text: 'Vazgeç', style: 'cancel' }, { text: 'Ayarları aç', onPress: openNotificationSettings }],
        );
      } else if (result === 'unavailable') {
        Alert.alert('Bildirimler bu sürümde yok', 'Uygulamanın yeni sürümünü yükleyince açabilirsin. Bildirim kutun yine de çalışır.');
      }
    } finally {
      setPushBusy(false);
    }
  };

  // One short confirmation after the kitchen profile flow returns here.
  useFocusEffect(useCallback(() => {
    const message = takeKitchenFlash();
    if (!message) return undefined;
    setKitchenFlash(message);
    const timer = setTimeout(() => setKitchenFlash(null), 5000);
    return () => clearTimeout(timer);
  }, []));

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
      ACCOUNT_DELETE_CONFIRM,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Hesabımı Sil',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              const result = await deleteAccount(token);
              await logout();
              const message = typeof result?.message === 'string' && result.message.trim() ? result.message.trim() : ACCOUNT_DELETED_MESSAGE;
              Alert.alert('Hesabın silindi', message);
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

        {/* Kitchen profile: optional, so it reads as an invitation until finished. */}
        {kitchenFlash ? (
          <View style={styles.flash} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.flashText}>{kitchenFlash}</Text>
          </View>
        ) : null}
        <Pressable onPress={() => router.push('/profile/kitchen')}
          style={({ pressed }) => [styles.kitchenCard, pressed && { opacity: 0.9 }]}
          accessibilityRole="button"
          accessibilityLabel={user.kitchen_profile_completed ? 'Mutfak profilim, tamamlandı. Düzenle' : 'Mutfak profilim, tamamlanmadı. Başla'}>
          <View style={styles.kitchenArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {['domates', 'fesleğen'].map(name => (
              <View key={name} style={styles.kitchenDot}><LokmaIngredientIcon name={name} size={20} /></View>
            ))}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kitchenTitle}>Mutfak profilim</Text>
            <Text style={styles.kitchenLine} numberOfLines={2}>
              {user.kitchen_profile_completed
                ? 'Hane, beslenme, ekipman ve alerjilerin kayıtlı.'
                : 'Birkaç kısa soruyla önerileri sana göre ayarlayalım.'}
            </Text>
          </View>
          {user.kitchen_profile_completed ? (
            <View style={styles.kitchenDone}>
              <Ionicons name="checkmark" size={13} color={colors.success} />
              <Text style={styles.kitchenDoneText}>Tamam</Text>
            </View>
          ) : (
            <View style={styles.kitchenGo}><Ionicons name="arrow-forward" size={17} color="#fff" /></View>
          )}
        </Pressable>

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
            data={shownRecipes}
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
          <Text style={styles.settingsSectionTitle}>Mutfak</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/rehber')} accessibilityRole="link">
              <View style={styles.settingsIcon}><Ionicons name="library-outline" size={17} color={colors.ink} /></View>
              <Text style={styles.settingsRowText}>Mutfak Rehberi</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.settingsRow, styles.settingsRowLine]} onPress={() => router.push('/profile/notes')}
              accessibilityRole="button" accessibilityLabel="Notlarım, yalnızca senin görebildiğin tarif notları">
              <View style={styles.settingsIcon}><Ionicons name="create-outline" size={17} color={colors.ink} /></View>
              <Text style={styles.settingsRowText}>Notlarım</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </TouchableOpacity>
          </View>

          <Text style={styles.settingsSectionTitle}>Yardım</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow}
              onPress={() => router.push({ pathname: '/onboarding/social', params: { from: 'replay' } })}
              accessibilityRole="button" accessibilityLabel="Nasıl kullanılır? Videodan tarif kaydetmeyi adım adım göster">
              <View style={styles.settingsIcon}><Ionicons name="play-circle-outline" size={17} color={colors.ink} /></View>
              <Text style={styles.settingsRowText}>Nasıl kullanılır?</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </TouchableOpacity>
            {reviewUrl ? (
              <TouchableOpacity style={[styles.settingsRow, styles.settingsRowLine]}
                onPress={() => Linking.openURL(reviewUrl).catch(() => Alert.alert('Hata', 'Mağaza sayfası açılamadı.'))}
                accessibilityRole="link" accessibilityLabel="Tariften'i değerlendir, mağazada yorum yaz">
                <View style={styles.settingsIcon}><Ionicons name="star-outline" size={17} color={colors.ink} /></View>
                <Text style={styles.settingsRowText}>Tariften'i değerlendir</Text>
                <Ionicons name="open-outline" size={15} color={colors.textFaint} />
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.settingsSectionTitle}>Bildirimler</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/notifications')}
              accessibilityRole="button"
              accessibilityLabel={notifications.unreadCount > 0 ? `Bildirim kutusu, ${notifications.unreadCount} okunmamış` : 'Bildirim kutusu'}>
              <View style={styles.settingsIcon}><Ionicons name="notifications-outline" size={17} color={colors.ink} /></View>
              <Text style={styles.settingsRowText}>Bildirim kutusu</Text>
              {badgeLabel(notifications.unreadCount) ? (
                <View style={styles.unreadPill}><Text style={styles.unreadPillText}>{badgeLabel(notifications.unreadCount)}</Text></View>
              ) : null}
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </TouchableOpacity>
            <View style={[styles.settingsRow, styles.settingsRowLine, styles.pushRow]}>
              <View style={styles.settingsIcon}><Ionicons name="restaurant-outline" size={17} color={colors.ink} /></View>
              <View style={{ flex: 1, minWidth: 0, paddingVertical: 10 }}>
                <Text style={styles.settingsRowText}>Tarifim hazır olunca haber ver</Text>
                <Text style={styles.pushHint}>
                  {notifications.pushStatus === 'unavailable'
                    ? 'Bu sürümde anlık bildirim yok; bildirim kutun çalışır.'
                    : 'Videodan aktardığın tarif hazır olduğunda ya da kontrol beklediğinde.'}
                </Text>
              </View>
              <Switch
                value={notifications.pushStatus === 'on'}
                onValueChange={value => { void togglePush(value); }}
                disabled={pushBusy || notifications.pushStatus === 'loading' || notifications.pushStatus === 'unavailable'}
                trackColor={{ true: colors.brand, false: colors.lineStrong }}
                accessibilityLabel="Tarifim hazır olunca anlık bildirim gönder"
              />
            </View>
          </View>

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

          <Text style={styles.settingsSectionTitle}>Gizlilik</Text>
          <View style={styles.settingsCard}>
            <TouchableOpacity style={styles.settingsRow} onPress={() => router.push('/profile/blocks')}
              accessibilityRole="button"
              accessibilityLabel={blocks.ids.size > 0 ? `Engellenen üyeler, ${blocks.ids.size} üye` : 'Engellenen üyeler'}>
              <View style={styles.settingsIcon}><Ionicons name="hand-left-outline" size={17} color={colors.ink} /></View>
              <Text style={styles.settingsRowText}>Engellenen üyeler</Text>
              {blocks.ids.size > 0 ? <Text style={styles.settingsRowMeta}>{blocks.ids.size.toLocaleString('tr-TR')}</Text> : null}
              <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
            </TouchableOpacity>
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
  flash: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 22, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: radius.lg, backgroundColor: colors.successSoft,
  },
  flashText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.ink },
  kitchenCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: 20, marginTop: 22, padding: 14, paddingRight: 12,
    minHeight: 72, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  kitchenArt: { flexDirection: 'row' },
  kitchenDot: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.surface, marginRight: -10,
  },
  kitchenTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink, marginLeft: 6 },
  kitchenLine: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textMuted, marginTop: 2, marginLeft: 6 },
  kitchenGo: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  kitchenDone: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 28, paddingHorizontal: 10, borderRadius: radius.pill,
    backgroundColor: colors.successSoft,
  },
  kitchenDoneText: { fontFamily: fonts.bodySemi, fontSize: 12, color: colors.success },
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
  pushRow: { alignItems: 'center' },
  pushHint: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 2 },
  unreadPill: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  unreadPillText: { fontFamily: fonts.bodyBold, fontSize: 11, color: '#fff' },
  settingsIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  deleteIcon: { backgroundColor: colors.brandSoft },
  settingsRowText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  settingsRowMeta: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  deleteText: { color: colors.brand },
  versionText: { fontFamily: fonts.body, textAlign: 'center', fontSize: 12, color: colors.textFaint, paddingVertical: 24 },
});
