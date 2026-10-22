import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { colors, fonts, radius } from '../../constants/theme';
import { refreshMemberBlocks, unblockAndForget, useMemberBlocks } from '../../lib/member-blocks';
import { blockDateTr, type MemberBlock } from '../../lib/report-block-api';

/** Engellenen üyeler: the member's block list, newest first (GET /me/blocks). */
export default function BlockedMembersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const memberToken = user && token ? token : null;
  const blocks = useMemberBlocks(memberToken, user?.id ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Blocks made elsewhere (or on the web) show up when the member comes back here.
  useFocusEffect(useCallback(() => {
    if (memberToken) void refreshMemberBlocks();
  }, [memberToken]));

  const refresh = async () => {
    setRefreshing(true);
    try { await refreshMemberBlocks(); } finally { setRefreshing(false); }
  };

  const unblock = (item: MemberBlock) => {
    if (!memberToken || busyId) return;
    Alert.alert('Engel kaldırılsın mı?', `${item.name} adlı üyenin tariflerini ve yorumlarını yeniden görebileceksin.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Engeli kaldır',
        onPress: async () => {
          setBusyId(item.user_id);
          try {
            await unblockAndForget(memberToken, item.user_id);
          } catch (cause) {
            Alert.alert('Engel kaldırılamadı', cause instanceof Error ? cause.message : 'Birazdan tekrar dene.');
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  if (!memberToken) {
    return (
      <View style={[styles.root, styles.center]}>
        <View style={styles.emptyArt}><Ionicons name="hand-left-outline" size={26} color={colors.brand} /></View>
        <Text style={styles.emptyTitle}>Engellenen üyeler</Text>
        <Text style={styles.emptyText}>Engellediğin üyeleri görmek ve yönetmek için giriş yap.</Text>
        <TouchableOpacity style={styles.primary} onPress={() => router.push('/login')} accessibilityRole="button">
          <Text style={styles.primaryText}>Giriş Yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const loading = blocks.status === 'idle' || blocks.status === 'loading';
  const items = blocks.blocks;

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={item => String(item.user_id)}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }, !items.length && { flexGrow: 1 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh(); }} tintColor={colors.brand} />}
        ListHeaderComponent={items.length ? (
          <View style={styles.header}>
            <Text style={styles.headerCount}>{`${items.length.toLocaleString('tr-TR')} üye`}</Text>
            <View style={styles.privateRow}>
              <Ionicons name="eye-off-outline" size={12} color={colors.textMuted} />
              <Text style={styles.privateText}>Engellediğin üyeler bunu bilmez</Text>
            </View>
          </View>
        ) : null}
        ListEmptyComponent={loading && !items.length ? (
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        ) : blocks.status === 'error' ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Liste yüklenemedi</Text>
            <Text style={styles.emptyText}>Bağlantını kontrol edip tekrar dene.</Text>
            <TouchableOpacity style={styles.secondary} onPress={() => { void refresh(); }} accessibilityRole="button">
              <Text style={styles.secondaryText}>Tekrar dene</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.center}>
            <View style={styles.emptyArt}><Ionicons name="hand-left-outline" size={26} color={colors.brand} /></View>
            <Text style={styles.emptyTitle}>Engellediğin kimse yok</Text>
            <Text style={styles.emptyText}>
              Bir tarifin ya da yorumun “⋯” menüsünden bir üyeyi engelleyebilirsin. Tariflerini ve yorumlarını artık görmezsin; üye bunu bilmez.
            </Text>
          </View>
        )}
        renderItem={({ item }) => <BlockRow item={item} busy={busyId === item.user_id} onUnblock={() => unblock(item)} />}
      />
    </View>
  );
}

function BlockRow({ item, busy, onUnblock }: { item: MemberBlock; busy: boolean; onUnblock: () => void }) {
  const when = blockDateTr(item.blocked_at);
  const initial = (item.name.trim()[0] ?? 'T').toLocaleUpperCase('tr-TR');
  return (
    <View style={styles.row} accessible={false}>
      {item.avatar ? (
        <Image source={{ uri: item.avatar }} style={styles.avatar} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.avatar, styles.monogram]}><Text style={styles.monogramText}>{initial}</Text></View>
      )}
      <View style={styles.texts}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {when ? <Text style={styles.time}>{`${when} tarihinde engellendi`}</Text> : null}
      </View>
      <TouchableOpacity onPress={onUnblock} disabled={busy} style={styles.unblock} hitSlop={6}
        accessibilityRole="button" accessibilityLabel={`${item.name} için engeli kaldır`} accessibilityState={{ busy }}>
        {busy ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={styles.unblockText}>Engeli kaldır</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  list: { paddingHorizontal: 16, paddingTop: 4, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, paddingBottom: 6 },
  headerCount: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.textMuted },
  privateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  privateText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.lg,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.cream },
  monogram: { backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  monogramText: { fontFamily: fonts.headingBold, fontSize: 19, color: '#fff' },
  texts: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: colors.ink },
  time: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  unblock: {
    minWidth: 104, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong,
    backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  unblockText: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.ink },
  emptyArt: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: colors.cream,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.ink, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  primary: { marginTop: 8, minHeight: 48, paddingHorizontal: 28, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  secondary: { marginTop: 8, minHeight: 44, paddingHorizontal: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  secondaryText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.ink },
});
