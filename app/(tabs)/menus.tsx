import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getMenus } from '../../lib/api';
import { Menu } from '../../lib/types';
import MenuCard from '../../components/MenuCard';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function MenusScreen() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const loadMenus = useCallback(async () => {
    try {
      const data = await getMenus();
      setMenus(data);
    } catch (error) {
      console.error('Menus load error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMenus();
  }, [loadMenus]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMenus();
  }, [loadMenus]);

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <FlatList
      data={menus}
      keyExtractor={(item) => item.id.toString()}
      renderItem={({ item }) => <MenuCard menu={item} />}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#e74c3c" />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Henüz menü bulunmuyor.</Text>
        </View>
      }
      ListHeaderComponent={
        <View>
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>✨ İLHAM VEREN SOFRALAR</Text>
            </View>
            <Text style={styles.heroTitle}>Davet Sofralarınızı{'\n'}Sanata Dönüştürün.</Text>
            <Text style={styles.heroSubtitle}>
              Yapay zeka şefimizin tasarladığı, birbiriyle uyumlu ve dengeli menüleri keşfedin ya da kendi hayalinizdeki sofrayı yaratın.
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => router.push('/menu/create')}
              activeOpacity={0.85}
            >
              <Text style={styles.createButtonText}>➕ Yeni Menü Oluştur</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Son Eklenen Menüler</Text>
            <Text style={styles.sectionCount}>Toplam {menus.length} menü</Text>
          </View>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: '#ffffff',
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  hero: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    marginTop: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  heroBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  heroBadgeText: {
    fontSize: 11,
    color: '#e74c3c',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    lineHeight: 34,
    marginBottom: 12,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#aaaaaa',
    lineHeight: 20,
    marginBottom: 20,
  },
  createButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  sectionCount: {
    fontSize: 13,
    color: '#888888',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#666666',
  },
});
