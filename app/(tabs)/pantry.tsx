import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { analyzePantry, createRecipe, generateAIRecipe, getPantry, updatePantry } from '../../lib/api';
import { PantryItem } from '../../lib/types';
import { useTabBarSpace } from '../../components/navigation/FloatingTabBar';
import LoadingSpinner from '../../components/LoadingSpinner';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { AccentText } from '../../components/ui/ScreenTitle';
import { colors, fonts, radius, shadow } from '../../constants/theme';

type Shelf = 'all' | 'expired' | 'warning' | 'fresh';
const SHELVES: { key: Shelf; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'expired', label: 'Hemen tüket' },
  { key: 'warning', label: 'Bu hafta' },
  { key: 'fresh', label: 'Taze' },
];

// --- TYPES ---
type SaveStatus = 'saved' | 'saving' | 'error';
type ModalType = 'success' | 'error';

interface ModalState {
  show: boolean;
  type: ModalType;
  message: string;
}

interface AiStatus {
  loading: boolean;
  message: string;
}

// Regex for parsing expiry expressions like "Süt 3 gün", "Muz 2 hafta", "Peynir 1 ay"
const EXPIRY_DATE_PATTERN = /^(.*?)\s+(\d+)\s*(gün|gun|day|hafta|week|ay|month)s?$/i;

// --- DATE HELPERS ---
const formatDateLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateLocal = (dateStr: string): Date | null => {
  if (!dateStr || dateStr === '0000-00-00') return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
};

const addDays = (days: number): string => {
  const result = new Date();
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + days);
  return formatDateLocal(result);
};

const calculateStatus = (expiryDateString: string | null | undefined): { status: string; text: string } => {
  if (!expiryDateString || expiryDateString === '0000-00-00' || expiryDateString === '')
    return { status: 'fresh', text: 'Tarih Yok' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = parseDateLocal(expiryDateString);
  if (!expiry) return { status: 'fresh', text: 'Geçersiz' };

  const diffTime = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { status: 'expired', text: `${Math.abs(diffDays)} gün geçti` };
  if (diffDays === 0) return { status: 'expired', text: 'Bugün son!' };
  if (diffDays <= 3) return { status: 'expired', text: `${diffDays} gün kaldı` };
  if (diffDays <= 7) return { status: 'warning', text: `${diffDays} gün kaldı` };
  return { status: 'fresh', text: `${diffDays} gün kaldı` };
};

export default function PantryScreen() {
  const tabSpace = useTabBarSpace();
  const { token } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<PantryItem[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Save status
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const isDirty = useRef<boolean>(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modals
  const [modal, setModal] = useState<ModalState>({ show: false, type: 'success', message: '' });
  const [showDateModal, setShowDateModal] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [tempDateInput, setTempDateInput] = useState('');
  const [aiStatus, setAiStatus] = useState<AiStatus>({ loading: false, message: '' });
  const [shelf, setShelf] = useState<Shelf>('all');

  const showModalMessage = (type: ModalType, message: string) => {
    setModal({ show: true, type, message });
  };

  const loadPantry = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await getPantry(token);
      if (data && Array.isArray(data)) {
        const cleanData = data.map((i: PantryItem) => ({
          ...i,
          expiresIn: i.expiresIn === '0000-00-00' || !i.expiresIn ? '' : i.expiresIn,
          status: calculateStatus(i.expiresIn).status as 'fresh' | 'warning' | 'expired',
        }));
        setItems(cleanData);
      }
    } catch (error) {
      console.error('Pantry load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setIsLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    loadPantry();
  }, [loadPantry]);

  // Debounce save
  const updateItems = (newItems: PantryItem[]) => {
    setItems(newItems);
    isDirty.current = true;
    setSaveStatus('saving');
  };

  useEffect(() => {
    if (!isLoaded || !isDirty.current || !token) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const payload = items.map((i) => ({
          name: i.name,
          quantity: i.quantity || '',
          unit: i.unit || '',
          status: i.status,
          expiresIn: i.expiresIn || '',
        }));
        await updatePantry(token, payload as PantryItem[]);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
      isDirty.current = false;
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [items, token, isLoaded]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPantry();
  };

  // Quick add
  const handleManualAdd = () => {
    if (!inputValue.trim()) return;
    const rawInputs = inputValue
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s);
    const newItems: PantryItem[] = [];

    rawInputs.forEach((input, index) => {
      const match = input.match(EXPIRY_DATE_PATTERN);
      let name = input;
      let expiryDate = addDays(7);

      if (match) {
        name = match[1].trim();
        const amount = parseInt(match[2]);
        const unit = match[3].toLowerCase();
        let daysToAdd = 0;
        if (unit === 'gün' || unit === 'gun' || unit === 'day') {
          daysToAdd = amount;
        } else if (unit === 'hafta' || unit === 'week') {
          daysToAdd = amount * 7;
        } else if (unit === 'ay' || unit === 'month') {
          daysToAdd = amount * 30;
        }
        if (daysToAdd > 0) expiryDate = addDays(daysToAdd);
      }

      const status = calculateStatus(expiryDate);
      newItems.push({
        id: Date.now() + index,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        quantity: '',
        unit: '',
        status: status.status as 'fresh' | 'warning' | 'expired',
        expiresIn: expiryDate,
      });
    });

    updateItems([...newItems, ...items]);
    setInputValue('');
  };

  // Receipt scanning
  const handleReceiptScan = async () => {
    if (!token) {
      showModalMessage('error', 'Fiş okuma özelliği için giriş yapmalısınız.');
      return;
    }

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showModalMessage('error', 'Galeri erişim izni gerekiyor.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        base64: false,
      });

      if (result.canceled || !result.assets?.[0]) return;

      setAnalyzing(true);
      const asset = result.assets[0];

      // Resize and compress image
      const manipResult = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      const base64 = manipResult.base64;
      if (!base64) throw new Error('Görsel işlenemedi');

      const resizedBase64 = `data:image/jpeg;base64,${base64}`;
      const analyzedItems = await analyzePantry(token, '', resizedBase64);

      const newItems: PantryItem[] = (analyzedItems || []).map(
        (item: { name: string; expiry_date?: string; quantity?: string }, index: number) => {
          const date = item.expiry_date || addDays(7);
          return {
            id: Date.now() + index,
            name: item.name,
            quantity: item.quantity || '',
            unit: '',
            status: calculateStatus(date).status as 'fresh' | 'warning' | 'expired',
            expiresIn: date,
          };
        }
      );

      updateItems([...newItems, ...items]);
      showModalMessage('success', `${newItems.length} ürün fişten eklendi!`);
    } catch (e) {
      console.error('Receipt scan error:', e);
      showModalMessage('error', 'Fiş analiz edilemedi.');
    } finally {
      setAnalyzing(false);
    }
  };

  const removeItem = (id: number) => {
    updateItems(items.filter((item) => item.id !== id));
  };

  const saveDate = () => {
    if (editingItemId && tempDateInput) {
      const updatedList = items.map((item) => {
        if (String(item.id) === editingItemId) {
          const analysis = calculateStatus(tempDateInput);
          return {
            ...item,
            expiresIn: tempDateInput,
            status: analysis.status as 'fresh' | 'warning' | 'expired',
          };
        }
        return item;
      });
      updateItems(updatedList);
      setShowDateModal(false);
    }
  };

  const handleAiAction = async (type: 'rescue' | 'suggest') => {
    if (!token) {
      showModalMessage('error', 'Bu özellik için giriş yapmalısınız.');
      return;
    }

    let prompt = '';
    if (type === 'rescue') {
      const critical = items.filter(
        (i) =>
          calculateStatus(i.expiresIn).status === 'expired' ||
          calculateStatus(i.expiresIn).status === 'warning'
      );
      if (critical.length === 0) {
        showModalMessage('success', 'Harika! Şu an kurtarılması gereken acil bir ürün yok.');
        return;
      }
      prompt = critical.map((i) => i.name).join(', ');
    } else {
      if (items.length === 0) {
        showModalMessage('error', 'Dolabın boş! Önce malzeme ekle.');
        return;
      }
      prompt = items.map((i) => i.name).join(', ');
    }

    setAiStatus({
      loading: true,
      message: type === 'rescue' ? 'Kurtarıcı tarif hazırlanıyor...' : 'AI Şef düşünüyor...',
    });
    setShowAIModal(true);

    try {
      const aiResponse = await generateAIRecipe(token, prompt);
      if (aiResponse?.success && aiResponse?.recipe) {
        const saveResponse = await createRecipe(token, aiResponse.recipe);
        setShowAIModal(false);
        if (saveResponse?.success) {
          router.push(`/recipe/${saveResponse.slug || saveResponse.id}`);
        } else {
          showModalMessage('error', 'Tarif kaydedilemedi.');
        }
      } else {
        setShowAIModal(false);
        showModalMessage('error', 'Yapay zeka yanıt veremedi.');
      }
    } catch {
      setShowAIModal(false);
      showModalMessage('error', 'Bir hata oluştu.');
    }
  };

  // Progress bar values
  const expiredCount = items.filter((i) => calculateStatus(i.expiresIn).status === 'expired').length;
  const warningCount = items.filter((i) => calculateStatus(i.expiresIn).status === 'warning').length;
  const totalItems = items.length || 1;
  const expiredPct = (expiredCount / totalItems) * 100;
  const warningPct = (warningCount / totalItems) * 100;

  const freshCount = items.length - expiredCount - warningCount;
  const shelfCount: Record<Shelf, number> = { all: items.length, expired: expiredCount, warning: warningCount, fresh: freshCount };
  const visibleItems = shelf === 'all' ? items : items.filter((i) => calculateStatus(i.expiresIn).status === shelf);

  const getStatusDotStyle = (status: string) => {
    switch (status) {
      case 'fresh':
        return styles.dotFresh;
      case 'warning':
        return styles.dotWarning;
      case 'expired':
        return styles.dotExpired;
      default:
        return styles.dotFresh;
    }
  };

  const backToNotebook = () => router.navigate('/defterim');
  const topBar = (
    <View style={styles.topRow}>
      <TouchableOpacity style={styles.circle} onPress={backToNotebook} accessibilityRole="button" accessibilityLabel="Defterim'e dön">
        <Ionicons name="chevron-back" size={21} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.art} pointerEvents="none">
        {['süt', 'yumurta', 'domates'].map((name, i) => (
          <View key={name} style={[styles.artDot, { marginLeft: i ? -8 : 0 }]}><LokmaIngredientIcon name={name} size={22} /></View>
        ))}
      </View>
    </View>
  );

  if (!token) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={[styles.pad, { paddingBottom: tabSpace }]}>
          {topBar}
          <Text style={styles.kicker}>Dolap</Text>
          <AccentText style={styles.title}>{'Evde ne *var?*'}</AccentText>
          <View style={styles.guest}>
            <View style={styles.guestArt}>
              {['süt', 'peynir', 'muz'].map((name) => <LokmaIngredientIcon key={name} name={name} size={30} />)}
            </View>
            <Text style={styles.guestTitle}>Dolap Asistanı</Text>
            <Text style={styles.guestText}>
              {'Mutfağını Yönet\nEvdeki malzemeleri gir, israfı önle ve tasarruf et.'}
            </Text>
            <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')} accessibilityRole="button">
              <Text style={styles.loginButtonText}>Giriş Yap</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Save Status Indicator */}
      {saveStatus === 'saving' && (
        <View style={[styles.saveIndicator, { bottom: tabSpace }]}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.saveIndicatorText}>Kaydediliyor...</Text>
        </View>
      )}
      {saveStatus === 'error' && (
        <View style={[styles.saveIndicator, styles.saveIndicatorError, { bottom: tabSpace }]}>
          <Ionicons name="close" size={12} color="#fff" />
          <Text style={styles.saveIndicatorText}>Kayıt Hatası</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.pad, { paddingBottom: tabSpace }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {topBar}

        {/* Header */}
        <Text style={styles.kicker}>Dolap · {items.length} Malzeme Stokta</Text>
        <AccentText style={styles.title}>{'Evde ne *var?*'}</AccentText>
        <Text style={styles.subtitle}>Mutfağını Yönet: evdeki malzemeleri gir, israfı önle ve tasarruf et.</Text>

        {/* Freshness summary */}
        {items.length > 0 && (
          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryCell}>
                <Text style={[styles.summaryValue, { color: colors.brand }]}>{expiredCount}</Text>
                <Text style={styles.summaryLabel}>Kritik (Hemen Tüket)</Text>
              </View>
              <View style={[styles.summaryCell, styles.summaryLine]}>
                <Text style={[styles.summaryValue, { color: colors.warning }]}>{warningCount}</Text>
                <Text style={styles.summaryLabel}>7 gün içinde</Text>
              </View>
              <View style={[styles.summaryCell, styles.summaryLine]}>
                <Text style={[styles.summaryValue, { color: colors.success }]}>{freshCount}</Text>
                <Text style={styles.summaryLabel}>Taze</Text>
              </View>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressExpired, { width: `${expiredPct}%` }]} />
              <View style={[styles.progressWarning, { width: `${warningPct}%` }]} />
            </View>
          </View>
        )}

        {/* Quick Add Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Hızlı Stok Ekle</Text>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={handleReceiptScan}
              disabled={analyzing}
              accessibilityRole="button"
            >
              {analyzing ? <ActivityIndicator size="small" color={colors.ink} /> : <Ionicons name="receipt-outline" size={15} color={colors.ink} />}
              <Text style={styles.scanButtonText}>
                {analyzing ? 'Fiş Okunuyor...' : 'Fiş Okut'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.quickInput}
              value={inputValue}
              onChangeText={setInputValue}
              onSubmitEditing={handleManualAdd}
              placeholder='"Süt 3 gün", "Yumurta", "Peynir"'
              placeholderTextColor={colors.textFaint}
              returnKeyType="done"
              accessibilityLabel="Dolaba malzeme ekle"
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleManualAdd} accessibilityRole="button" accessibilityLabel="Ekle">
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.tipText}>
            İpucu: "Muz 3 gün" yazarsan tarihi otomatik ayarlarım. Virgülle birden çok malzeme ekleyebilirsin.
          </Text>
        </View>

        {/* AI Action Buttons */}
        <Text style={styles.sectionKicker}>Yapay Zeka Şef</Text>
        <AccentText style={styles.sectionTitle}>{'Dolaptakilerle *ne pişer?*'}</AccentText>
        <View style={styles.aiRow}>
          <Pressable
            style={({ pressed }) => [styles.rescueButton, pressed && { opacity: 0.92 }]}
            onPress={() => handleAiAction('rescue')}
            accessibilityRole="button"
          >
            <View style={styles.rescueIcon}>
              <Ionicons name="flame" size={20} color={colors.brand} />
            </View>
            <Text style={styles.rescueButtonTitle}>Bozulacakları Kurtar</Text>
            <Text style={styles.rescueButtonSub}>Kritik ürünler için tarif.</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.suggestButton, pressed && { opacity: 0.92 }]}
            onPress={() => handleAiAction('suggest')}
            accessibilityRole="button"
          >
            <View style={styles.suggestIcon}>
              <Ionicons name="restaurant-outline" size={20} color={colors.ink} />
            </View>
            <Text style={styles.suggestButtonTitle}>Rastgele Tarif Öner</Text>
            <Text style={styles.suggestButtonSub}>Dolaptakilerle ne yapabilirim?</Text>
          </Pressable>
        </View>

        {/* Item List */}
        <View style={styles.listHead}>
          <Text style={styles.listTitle}>Dolabın</Text>
          <Text style={styles.listCount}>{items.length} malzeme</Text>
        </View>
        {items.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shelvesScroll} contentContainerStyle={styles.shelves}>
            {SHELVES.map((s) => {
              const active = shelf === s.key;
              return (
                <Pressable key={s.key} onPress={() => setShelf(s.key)} style={[styles.shelf, active && styles.shelfActive]}
                  accessibilityRole="tab" accessibilityState={{ selected: active }}>
                  <Text style={[styles.shelfText, active && styles.shelfTextActive]}>{s.label}</Text>
                  <Text style={[styles.shelfCount, active && styles.shelfCountActive]}>{shelfCount[s.key]}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
        <View style={styles.listSection}>
          {items.length > 0 ? (
            visibleItems.length > 0 ? visibleItems.map((item) => {
              const info = calculateStatus(item.expiresIn);
              return (
                <View key={item.id} style={styles.pantryItem}>
                  <View style={styles.itemIcon}>
                    <LokmaIngredientIcon name={item.name} size={26} />
                    <View style={[styles.statusDot, getStatusDotStyle(info.status)]} />
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <TouchableOpacity
                      style={styles.itemDateRow}
                      onPress={() => {
                        setEditingItemId(String(item.id));
                        setTempDateInput(item.expiresIn || '');
                        setShowDateModal(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name} son kullanma tarihini güncelle`}
                    >
                      <Ionicons name="calendar-outline" size={12} color={colors.textFaint} />
                      <Text
                        style={[
                          styles.itemDateText,
                          info.status === 'expired' && styles.itemDateExpired,
                          info.status === 'warning' && styles.itemDateWarning,
                        ]}
                      >
                        {item.expiresIn ? info.text : 'Tarih Yok (7 gün)'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeItem(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`${item.name} dolaptan çıkar`}
                  >
                    <Ionicons name="trash-outline" size={17} color={colors.textFaint} />
                  </TouchableOpacity>
                </View>
              );
            }) : (
              <View style={styles.emptyShelf}>
                <Text style={styles.emptyShelfText}>Bu rafta şu an malzeme yok.</Text>
              </View>
            )
          ) : (
            <View style={styles.emptyContainer}>
              <View style={styles.guestArt}>
                {['un', 'yumurta', 'tereyağı'].map((name) => <LokmaIngredientIcon key={name} name={name} size={28} />)}
              </View>
              <Text style={styles.emptyText}>Dolabın boş görünüyor.</Text>
              <Text style={styles.emptySub}>Yukarıdan ilk malzemeni ekle ya da market fişini okut.</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Date Modal */}
      <Modal
        visible={showDateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDateModal(false)} accessibilityRole="button" accessibilityLabel="Kapat">
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.modalKicker}>Son kullanma</Text>
            <Text style={styles.modalTitle}>Tarihi Güncelle</Text>
            <TextInput
              style={styles.dateInput}
              value={tempDateInput}
              onChangeText={setTempDateInput}
              placeholder="YYYY-AA-GG (ör: 2025-06-15)"
              placeholderTextColor={colors.textFaint}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={saveDate} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* AI Loading Modal */}
      <Modal
        visible={showAIModal && aiStatus.loading}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { alignItems: 'center' }]}>
            <View style={styles.aiArt}>
              {['domates', 'soğan', 'sarımsak'].map((name) => <LokmaIngredientIcon key={name} name={name} size={30} />)}
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center' }]}>Şef Dolabına Bakıyor...</Text>
            <Text style={styles.modalText}>{aiStatus.message}</Text>
            <ActivityIndicator size="large" color={colors.brand} style={{ marginTop: 16 }} />
          </View>
        </View>
      </Modal>

      {/* Success/Error Modal */}
      <Modal
        visible={modal.show}
        transparent
        animationType="fade"
        onRequestClose={() => setModal({ ...modal, show: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { alignItems: 'center' }]}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setModal({ ...modal, show: false })}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
            <View
              style={[
                styles.resultIcon,
                modal.type === 'success' ? styles.resultIconSuccess : styles.resultIconError,
              ]}
            >
              <Ionicons
                name={modal.type === 'success' ? 'checkmark' : 'close'}
                size={30}
                color={modal.type === 'success' ? colors.success : colors.brand}
              />
            </View>
            <Text style={[styles.modalTitle, { textAlign: 'center' }]}>
              {modal.type === 'success' ? 'Başarılı!' : 'Hata'}
            </Text>
            <Text style={styles.modalText}>{modal.message}</Text>
            <TouchableOpacity
              style={[styles.primaryBtn, styles.inkBtn, { alignSelf: 'stretch' }]}
              onPress={() => setModal({ ...modal, show: false })}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  scrollView: { flex: 1 },
  pad: { paddingHorizontal: 20 },

  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, marginBottom: 18 },
  circle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
  },
  art: { flexDirection: 'row' },
  artDot: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.canvas,
  },
  kicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand },
  title: { fontFamily: fonts.headingBold, fontSize: 36, lineHeight: 41, letterSpacing: -1.2, color: colors.ink, marginTop: 8 },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: 8 },

  saveIndicator: {
    position: 'absolute', alignSelf: 'center', zIndex: 50, backgroundColor: colors.ink,
    paddingHorizontal: 14, height: 34, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6,
    ...shadow.floating,
  },
  saveIndicatorError: { backgroundColor: '#b42318' },
  saveIndicatorText: { fontFamily: fonts.bodySemi, color: '#fff', fontSize: 12 },

  summary: {
    marginTop: 20, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row' },
  summaryCell: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 2 },
  summaryLine: { borderLeftWidth: 1, borderLeftColor: colors.line },
  summaryValue: { fontFamily: fonts.headingBold, fontSize: 22 },
  summaryLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted },
  progressBar: { flexDirection: 'row', height: 5, backgroundColor: colors.successSoft },
  progressExpired: { backgroundColor: colors.brand, height: '100%' },
  progressWarning: { backgroundColor: '#e7a93c', height: '100%' },

  card: {
    marginTop: 16, backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18,
    borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink },
  scanButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 13,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.canvas,
  },
  scanButtonText: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 13 },
  inputRow: { flexDirection: 'row', gap: 8 },
  quickInput: {
    flex: 1, height: 50, backgroundColor: colors.canvas, borderWidth: 1, borderColor: colors.line,
    borderRadius: radius.pill, paddingHorizontal: 18, fontFamily: fonts.body, fontSize: 15, color: colors.ink,
  },
  addBtn: { width: 50, height: 50, backgroundColor: colors.brand, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  tipText: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: colors.textMuted, marginTop: 10, marginLeft: 4 },

  sectionKicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2.2, textTransform: 'uppercase', color: colors.brand, marginTop: 30 },
  sectionTitle: { fontFamily: fonts.headingBold, fontSize: 25, lineHeight: 30, letterSpacing: -0.6, color: colors.ink, marginTop: 6 },
  aiRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  rescueButton: { flex: 1, padding: 16, borderRadius: radius.xl, backgroundColor: colors.ink, gap: 4 },
  rescueIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  rescueButtonTitle: { fontFamily: fonts.heading, color: '#fff', fontSize: 15, lineHeight: 20 },
  rescueButtonSub: { fontFamily: fonts.body, color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 17 },
  suggestButton: {
    flex: 1, padding: 16, borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, gap: 4, ...shadow.card,
  },
  suggestIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  suggestButtonTitle: { fontFamily: fonts.heading, color: colors.ink, fontSize: 15, lineHeight: 20 },
  suggestButtonSub: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12, lineHeight: 17 },

  listHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 32 },
  listTitle: { fontFamily: fonts.headingBold, fontSize: 22, letterSpacing: -0.4, color: colors.ink },
  listCount: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  shelvesScroll: { marginHorizontal: -20, marginTop: 12 },
  shelves: { gap: 8, paddingHorizontal: 20 },
  shelf: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 15, borderRadius: radius.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  shelfActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  shelfText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.text },
  shelfTextActive: { color: '#fff' },
  shelfCount: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  shelfCountActive: { color: 'rgba(255,255,255,0.6)' },
  listSection: { marginTop: 14, gap: 8 },
  pantryItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 10, paddingRight: 6,
  },
  itemIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center' },
  statusDot: {
    position: 'absolute', right: -2, top: -2, width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: colors.surface,
  },
  dotFresh: { backgroundColor: colors.success },
  dotWarning: { backgroundColor: '#e7a93c' },
  dotExpired: { backgroundColor: colors.brand },
  itemInfo: { flex: 1, minWidth: 0 },
  itemName: { fontFamily: fonts.heading, fontSize: 16, color: colors.ink },
  itemDateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, alignSelf: 'flex-start', paddingVertical: 2 },
  itemDateText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
  itemDateExpired: { color: colors.brand },
  itemDateWarning: { color: colors.warning },
  removeButton: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  emptyShelf: { padding: 20, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, alignItems: 'center' },
  emptyShelfText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  emptyContainer: {
    alignItems: 'center', paddingVertical: 32, paddingHorizontal: 20, borderRadius: radius.xl,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, gap: 6,
  },
  emptyText: { fontFamily: fonts.heading, fontSize: 17, color: colors.ink },
  emptySub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },

  guest: {
    marginTop: 22, padding: 24, borderRadius: radius.xl, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center',
  },
  guestArt: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  guestTitle: { fontFamily: fonts.headingBold, fontSize: 20, color: colors.ink, textAlign: 'center' },
  guestText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  loginButton: {
    alignSelf: 'stretch', height: 52, borderRadius: radius.pill, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center', marginTop: 22,
  },
  loginButtonText: { fontFamily: fonts.bodySemi, color: '#ffffff', fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: colors.canvas, borderRadius: radius.xl, padding: 24, width: '100%', maxWidth: 380 },
  modalCloseBtn: { position: 'absolute', top: 14, right: 14, padding: 6, zIndex: 2 },
  modalKicker: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: colors.brand },
  modalTitle: { fontFamily: fonts.headingBold, fontSize: 22, color: colors.ink, marginTop: 4, marginBottom: 14 },
  modalText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
  dateInput: {
    height: 50, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 15, color: colors.ink, marginBottom: 14,
  },
  primaryBtn: { height: 52, backgroundColor: colors.brand, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  inkBtn: { backgroundColor: colors.ink },
  primaryBtnText: { fontFamily: fonts.bodySemi, color: '#fff', fontSize: 15 },
  aiArt: { flexDirection: 'row', gap: 10, marginBottom: 16, marginTop: 6 },
  resultIcon: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  resultIconSuccess: { backgroundColor: colors.successSoft },
  resultIconError: { backgroundColor: colors.brandSoft },
});
