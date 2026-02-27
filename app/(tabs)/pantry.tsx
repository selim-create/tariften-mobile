import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { analyzePantry, createRecipe, generateAIRecipe, getPantry, updatePantry } from '../../lib/api';
import { PantryItem } from '../../lib/types';
import LoadingSpinner from '../../components/LoadingSpinner';

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

  if (!token) {
    return (
      <View style={styles.notLoggedIn}>
        <Ionicons name="basket-outline" size={72} color="#e74c3c" style={styles.notLoggedInIcon} />
        <Text style={styles.notLoggedInTitle}>Dolap Asistanı</Text>
        <Text style={styles.notLoggedInText}>
          {'Mutfağını Yönet\nEvdeki malzemeleri gir, israfı önle ve tasarruf et.'}
        </Text>
        <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
          <Text style={styles.loginButtonText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <SafeAreaView style={styles.container}>
      {/* Save Status Indicator */}
      {saveStatus === 'saving' && (
        <View style={styles.saveIndicatorSaving}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.saveIndicatorText}>Kaydediliyor...</Text>
        </View>
      )}
      {saveStatus === 'error' && (
        <View style={styles.saveIndicatorError}>
          <Ionicons name="close" size={12} color="#fff" />
          <Text style={styles.saveIndicatorText}>Kayıt Hatası</Text>
        </View>
      )}

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e74c3c" />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Mutfağını Yönet</Text>
            <Text style={styles.headerSubtitle}>
              Evdeki malzemeleri gir, israfı önle ve tasarruf et.
            </Text>
          </View>
          <View style={styles.stockBadge}>
            <Ionicons name="basket-outline" size={12} color="#9a3412" />
            <Text style={styles.stockBadgeText}>{items.length} Malzeme Stokta</Text>
          </View>
        </View>

        {/* Quick Add Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Hızlı Stok Ekle</Text>
            <TouchableOpacity
              style={styles.scanButton}
              onPress={handleReceiptScan}
              disabled={analyzing}
            >
              <Ionicons name="camera-outline" size={14} color="#e74c3c" />
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
              placeholderTextColor="#999"
              returnKeyType="done"
            />
            <TouchableOpacity style={styles.addBtn} onPress={handleManualAdd}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <Text style={styles.tipText}>
            💡 İpucu: "Muz 3 gün" yazarsan tarihi otomatik ayarlarım.
          </Text>
        </View>

        {/* AI Action Buttons */}
        <View style={styles.aiSection}>
          <Text style={styles.aiSectionTitle}>✨ Yapay Zeka Şef</Text>

          <TouchableOpacity
            style={styles.rescueButtonWrapper}
            onPress={() => handleAiAction('rescue')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#ef4444', '#f97316']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.rescueButton}
            >
              <View style={styles.aiButtonIconContainer}>
                <Ionicons name="flame" size={24} color="#fff" />
              </View>
              <View>
                <Text style={styles.rescueButtonTitle}>Bozulacakları Kurtar</Text>
                <Text style={styles.rescueButtonSub}>Kritik ürünler için tarif.</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.suggestButton}
            onPress={() => handleAiAction('suggest')}
            activeOpacity={0.85}
          >
            <View style={styles.aiButtonIconContainerGray}>
              <Ionicons name="restaurant-outline" size={24} color="#555" />
            </View>
            <View>
              <Text style={styles.suggestButtonTitle}>Rastgele Tarif Öner</Text>
              <Text style={styles.suggestButtonSub}>Dolaptakilerle ne yapabilirim?</Text>
            </View>
          </TouchableOpacity>

          {/* Critical Progress Bar */}
          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressLabel}>Kritik (Hemen Tüket)</Text>
              <Text style={styles.progressCount}>{expiredCount}</Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressExpired, { width: `${expiredPct}%` }]} />
              <View style={[styles.progressWarning, { width: `${warningPct}%` }]} />
            </View>
          </View>
        </View>

        {/* Item List */}
        <View style={styles.listSection}>
          {items.length > 0 ? (
            items.map((item) => {
              const info = calculateStatus(item.expiresIn);
              return (
                <View key={item.id} style={styles.pantryItem}>
                  <View style={styles.itemLeft}>
                    <View style={[styles.statusDot, getStatusDotStyle(info.status)]} />
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <TouchableOpacity
                        style={styles.itemDateRow}
                        onPress={() => {
                          setEditingItemId(String(item.id));
                          setTempDateInput(item.expiresIn || '');
                          setShowDateModal(true);
                        }}
                      >
                        <Ionicons name="calendar-outline" size={10} color="#999" />
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
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeItem(item.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ccc" />
                  </TouchableOpacity>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <Ionicons name="basket-outline" size={52} color="#d1d5db" />
              <Text style={styles.emptyText}>Dolabın boş görünüyor.</Text>
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
          <View style={styles.dateModalBox}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDateModal(false)}>
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
            <Text style={styles.dateModalTitle}>⏰ Tarihi Güncelle</Text>
            <TextInput
              style={styles.dateInput}
              value={tempDateInput}
              onChangeText={setTempDateInput}
              placeholder="YYYY-AA-GG (ör: 2025-06-15)"
              placeholderTextColor="#999"
            />
            <TouchableOpacity style={styles.saveDateBtn} onPress={saveDate}>
              <Text style={styles.saveDateBtnText}>Kaydet</Text>
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
        <View style={styles.aiModalOverlay}>
          <View style={styles.aiModalContent}>
            <View style={styles.aiRobotIcon}>
              <Ionicons name="hardware-chip-outline" size={40} color="#e74c3c" />
            </View>
            <Text style={styles.aiModalTitle}>Şef Dolabına Bakıyor...</Text>
            <Text style={styles.aiModalSubtitle}>{aiStatus.message}</Text>
            <ActivityIndicator size="large" color="#e74c3c" style={{ marginTop: 16 }} />
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
          <View style={styles.resultModalBox}>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setModal({ ...modal, show: false })}
            >
              <Ionicons name="close" size={20} color="#666" />
            </TouchableOpacity>
            <View
              style={[
                styles.resultIcon,
                modal.type === 'success' ? styles.resultIconSuccess : styles.resultIconError,
              ]}
            >
              <Ionicons
                name={modal.type === 'success' ? 'checkmark' : 'close'}
                size={32}
                color={modal.type === 'success' ? '#22c55e' : '#ef4444'}
              />
            </View>
            <Text style={styles.resultTitle}>
              {modal.type === 'success' ? 'Başarılı!' : 'Hata'}
            </Text>
            <Text style={styles.resultMessage}>{modal.message}</Text>
            <TouchableOpacity
              style={styles.resultOkBtn}
              onPress={() => setModal({ ...modal, show: false })}
            >
              <Text style={styles.resultOkBtnText}>Tamam</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcfcfc',
  },
  scrollView: {
    flex: 1,
  },
  // Save indicator
  saveIndicatorSaving: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 50,
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveIndicatorError: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    zIndex: 50,
    backgroundColor: '#dc2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  saveIndicatorText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  stockBadge: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stockBadgeText: {
    color: '#9a3412',
    fontSize: 11,
    fontWeight: '700',
  },
  // Card
  card: {
    margin: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  scanButtonText: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1e293b',
  },
  addBtn: {
    width: 48,
    height: 48,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipText: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 8,
    marginLeft: 4,
  },
  // AI Section
  aiSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  aiSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  rescueButtonWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  rescueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  aiButtonIconContainer: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rescueButtonTitle: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  rescueButtonSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  suggestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  aiButtonIconContainerGray: {
    width: 48,
    height: 48,
    backgroundColor: '#f1f5f9',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  suggestButtonTitle: {
    fontWeight: '700',
    color: '#1e293b',
    fontSize: 15,
  },
  suggestButtonSub: {
    color: '#64748b',
    fontSize: 12,
  },
  // Progress bar
  progressCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  progressCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ef4444',
  },
  progressBar: {
    flexDirection: 'row',
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressExpired: {
    backgroundColor: '#ef4444',
    height: '100%',
  },
  progressWarning: {
    backgroundColor: '#facc15',
    height: '100%',
  },
  // Item list
  listSection: {
    marginHorizontal: 16,
    marginBottom: 32,
  },
  pantryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  dotFresh: {
    backgroundColor: '#22c55e',
  },
  dotWarning: {
    backgroundColor: '#eab308',
  },
  dotExpired: {
    backgroundColor: '#ef4444',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  itemDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  itemDateText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '500',
  },
  itemDateExpired: {
    color: '#ef4444',
  },
  itemDateWarning: {
    color: '#eab308',
  },
  removeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    backgroundColor: '#f9fafb',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: '#6b7280',
    fontWeight: '500',
  },
  // Not logged in
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
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  notLoggedInText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
  },
  loginButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  loginButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // Date modal
  dateModalBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    position: 'relative',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
  dateModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
    marginTop: 4,
  },
  dateInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1e293b',
    marginBottom: 16,
  },
  saveDateBtn: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveDateBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  // AI modal
  aiModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  aiModalContent: {
    alignItems: 'center',
  },
  aiRobotIcon: {
    width: 80,
    height: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  aiModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  aiModalSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  // Result modal
  resultModalBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    position: 'relative',
  },
  resultIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  resultIconSuccess: {
    backgroundColor: '#dcfce7',
  },
  resultIconError: {
    backgroundColor: '#fee2e2',
  },
  resultTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  resultMessage: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  resultOkBtn: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  resultOkBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
