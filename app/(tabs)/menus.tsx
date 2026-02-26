import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getMenus } from '../../lib/api';
import { Menu } from '../../lib/types';
import MenuCard from '../../components/MenuCard';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function MenusScreen() {
  const [menus, setMenus] = useState<Menu[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        <View style={styles.listHeader}>
          <Text style={styles.subtitle}>Özel günler ve davetler için hazır menüler</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: 16,
    backgroundColor: '#ffffff',
    flexGrow: 1,
  },
  listHeader: {
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#666666',
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
