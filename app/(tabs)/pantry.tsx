import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
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
import { useAuth } from '../../context/AuthContext';
import { analyzePantry, generateAIRecipe, getPantry, updatePantry } from '../../lib/api';
import { PantryItem } from '../../lib/types';
import LoadingSpinner from '../../components/LoadingSpinner';
import { useRouter } from 'expo-router';

export default function PantryScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemQuantity, setNewItemQuantity] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');

  const loadPantry = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const data = await getPantry(token);
      setItems(data);
    } catch (error) {
      console.error('Pantry load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadPantry();
  }, [loadPantry]);

  const onRefresh = () => {
    setRefreshing(true);
    loadPantry();
  };

  const addItem = async () => {
    if (!token || !newItemName.trim()) return;
    const newItem: PantryItem = {
      id: Date.now(),
      name: newItemName.trim(),
      quantity: newItemQuantity || 1,
      unit: newItemUnit.trim() || 'adet',
    };

    const updatedItems = [...items, newItem];
    setItems(updatedItems);
    setAddModalVisible(false);
    setNewItemName('');
    setNewItemQuantity('');
    setNewItemUnit('');

    try {
      await updatePantry(token, updatedItems);
    } catch (error: unknown) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'Kiler güncellenemedi');
      setItems(items);
    }
  };

  const removeItem = async (id: number) => {
    if (!token) return;
    const updatedItems = items.filter((item) => item.id !== id);
    setItems(updatedItems);
    try {
      await updatePantry(token, updatedItems);
    } catch (error: unknown) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'Kiler güncellenemedi');
      setItems(items);
    }
  };

  const handleAnalyze = async () => {
    if (!token) return;
    setAnalyzing(true);
    try {
      const ingredientNames = items.map((item) => item.name).join(', ');
      const result = await generateAIRecipe(token, ingredientNames);
      if (result?.slug) {
        router.push(`/recipe/${result.slug}`);
      } else {
        Alert.alert('Başarılı', 'AI tarif önerileri hazırlandı.');
      }
    } catch (error: unknown) {
      Alert.alert('Hata', error instanceof Error ? error.message : 'AI analizi yapılamadı');
    } finally {
      setAnalyzing(false);
    }
  };

  if (!token) {
    return (
      <View style={styles.notLoggedIn}>
        <Text style={styles.notLoggedInIcon}>🧺</Text>
        <Text style={styles.notLoggedInTitle}>Kilerinizi Yönetin</Text>
        <Text style={styles.notLoggedInText}>Kiler özelliğini kullanmak için giriş yapın.</Text>
        <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/login')}>
          <Text style={styles.loginButtonText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Kilerim ({items.length})</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.analyzeButton, analyzing && styles.buttonDisabled]}
            onPress={handleAnalyze}
            disabled={analyzing || items.length === 0}
          >
            {analyzing ? (
              <LoadingSpinner size="small" />
            ) : (
              <Text style={styles.analyzeButtonText}>🤖 AI Tarif</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.addButton} onPress={() => setAddModalVisible(true)}>
            <Ionicons name="add" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.pantryItem}>
            <View style={styles.pantryItemInfo}>
              <Text style={styles.pantryItemName}>{item.name}</Text>
              <Text style={styles.pantryItemMeta}>
                {item.quantity} {item.unit}
              </Text>
            </View>
            <TouchableOpacity onPress={() => removeItem(item.id)} style={styles.removeButton}>
              <Ionicons name="trash-outline" size={18} color="#e74c3c" />
            </TouchableOpacity>
          </View>
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e74c3c" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🧺</Text>
            <Text style={styles.emptyText}>Kileriniz boş.</Text>
            <Text style={styles.emptySubtext}>Malzeme eklemek için + butonuna tıklayın.</Text>
          </View>
        }
      />

      {/* Add Item Modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Malzeme Ekle</Text>
            <TouchableOpacity onPress={() => setAddModalVisible(false)}>
              <Ionicons name="close" size={24} color="#1a1a1a" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.inputLabel}>Malzeme Adı *</Text>
            <TextInput
              style={styles.textInput}
              value={newItemName}
              onChangeText={setNewItemName}
              placeholder="Örn: Domates"
              placeholderTextColor="#999"
              autoFocus
            />
            <Text style={styles.inputLabel}>Miktar</Text>
            <TextInput
              style={styles.textInput}
              value={newItemQuantity}
              onChangeText={setNewItemQuantity}
              placeholder="Örn: 3"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            <Text style={styles.inputLabel}>Birim</Text>
            <TextInput
              style={styles.textInput}
              value={newItemUnit}
              onChangeText={setNewItemUnit}
              placeholder="Örn: adet, kg, lt"
              placeholderTextColor="#999"
            />
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.submitButton, !newItemName.trim() && styles.buttonDisabled]}
              onPress={addItem}
              disabled={!newItemName.trim()}
            >
              <Text style={styles.submitButtonText}>Ekle</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  analyzeButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  analyzeButtonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  list: {
    padding: 16,
    flexGrow: 1,
  },
  pantryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  pantryItemInfo: {
    flex: 1,
  },
  pantryItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  pantryItemMeta: {
    fontSize: 13,
    color: '#666666',
    marginTop: 2,
  },
  removeButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999999',
  },
  notLoggedIn: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
  },
  notLoggedInIcon: {
    fontSize: 64,
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
  modal: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalBody: {
    flex: 1,
    padding: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1a1a1a',
    marginBottom: 16,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e5e5',
  },
  submitButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
});
