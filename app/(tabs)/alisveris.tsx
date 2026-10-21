import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import ScreenTitle from '../../components/ui/ScreenTitle';
import LokmaIngredientIcon from '../../components/LokmaIngredientIcon';
import { useTabBarSpace } from '../../components/navigation/FloatingTabBar';
import { colors, fonts, radius, shadow } from '../../constants/theme';
import {
  addManualItem, clearChecked, removeManualItem, removeRecipeFromShopping, shoppingRows, toggleChecked, useKitchen,
} from '../../lib/kitchen-store';
import { itemAmountText } from '../../lib/shopping-list';

type Row = { key: string; name: string; amount: string; note?: string; manual?: boolean };

export default function ShoppingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const kitchen = useKitchen(user?.id);
  const bottom = useTabBarSpace();
  const [draft, setDraft] = useState('');

  const rows: Row[] = useMemo(() => [
    ...shoppingRows(kitchen).map(item => ({
      key: item.key, name: item.name, amount: itemAmountText(item),
      note: item.recipes.length > 1 ? `${item.recipes.length} tarifte` : undefined,
    })),
    ...kitchen.manual.map(item => ({ key: item.key, name: item.name, amount: '', manual: true })),
  ], [kitchen]);
  const open = rows.filter(row => !kitchen.checked.includes(row.key));
  const done = rows.filter(row => kitchen.checked.includes(row.key));

  const add = () => { addManualItem(draft); setDraft(''); };
  const share = async () => {
    const lines = open.map(row => `- ${row.amount ? `${row.amount} ` : ''}${row.name}`);
    if (!lines.length) return;
    await Share.share({ message: `Alışveriş listem\n\n${lines.join('\n')}\n\nTariften ile hazırlandı · tariften.com` });
  };
  const clear = () => Alert.alert('Alınanları temizle', `${done.length} ürün listeden kalkacak.`, [
    { text: 'Vazgeç', style: 'cancel' },
    { text: 'Temizle', style: 'destructive', onPress: clearChecked },
  ]);

  const summary = rows.length
    ? `${open.length} ürün kaldı${kitchen.shopping.length ? ` · ${kitchen.shopping.length} tariften` : ''}`
    : undefined;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: bottom }} keyboardShouldPersistTaps="handled">
        <ScreenTitle kicker="Alışveriş" title="Alışveriş *listen*" subtitle={summary}
          right={open.length > 0 ? (
            <TouchableOpacity onPress={share} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Listeyi paylaş">
              <Ionicons name="share-outline" size={19} color={colors.ink} />
            </TouchableOpacity>
          ) : undefined} />

        <View style={styles.addRow}>
          <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={add} returnKeyType="done"
            placeholder="Listeye ekle: süt, ekmek…" placeholderTextColor={colors.textFaint}
            style={styles.input} accessibilityLabel="Listeye ürün ekle" maxLength={80} />
          <TouchableOpacity onPress={add} disabled={!draft.trim()} style={[styles.addBtn, !draft.trim() && { opacity: 0.35 }]}
            accessibilityRole="button" accessibilityLabel="Ekle">
            <Ionicons name="add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {kitchen.shopping.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sources}>
            {kitchen.shopping.map(source => (
              <View key={source.recipeId} style={styles.sourceChip}>
                <Pressable onPress={() => router.push(`/recipe/${source.slug}`)} style={styles.sourceLink}>
                  <Text style={styles.sourceText} numberOfLines={1}>{source.title}</Text>
                </Pressable>
                <Pressable onPress={() => removeRecipeFromShopping(source.recipeId)} hitSlop={8}
                  accessibilityRole="button" accessibilityLabel={`${source.title} tarifini listeden çıkar`}>
                  <Ionicons name="close" size={15} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        )}

        {rows.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyArt}>
              {['domates', 'süt', 'ekmek'].map(name => <LokmaIngredientIcon key={name} name={name} size={30} />)}
            </View>
            <Text style={styles.emptyTitle}>Listen henüz boş.</Text>
            <Text style={styles.emptyText}>Bir tarifte “Alışverişe ekle”ye dokun; malzemeler burada birleşir, aynı birimdekiler toplanır.</Text>
            <TouchableOpacity onPress={() => router.push('/recipes')} style={styles.cta}>
              <Text style={styles.ctaText}>Tariflere göz at</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            {open.map((row, i) => (
              <ItemRow key={row.key} row={row} checked={false} last={i === open.length - 1} />
            ))}
            {open.length === 0 && <Text style={styles.allDone}>Hepsi sepette. Afiyet olsun!</Text>}
          </View>
        )}

        {done.length > 0 && (
          <View style={{ marginTop: 22 }}>
            <View style={styles.doneHead}>
              <Text style={styles.doneTitle}>Sepette · {done.length}</Text>
              <TouchableOpacity onPress={clear}><Text style={styles.clear}>Temizle</Text></TouchableOpacity>
            </View>
            <View style={styles.card}>
              {done.map((row, i) => <ItemRow key={row.key} row={row} checked last={i === done.length - 1} />)}
            </View>
          </View>
        )}

        <Text style={styles.footnote}>Liste bu cihazda saklanır. Miktarlar tariflerde yazdığı gibidir; kişi sayısına göre ölçeklenmez.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function ItemRow({ row, checked, last }: { row: Row; checked: boolean; last: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <Pressable onPress={() => toggleChecked(row.key)} style={styles.rowMain}
        accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${row.amount} ${row.name}`.trim()}>
        <View style={[styles.box, checked && styles.boxOn]}>
          {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
        <View style={checked ? { opacity: 0.45 } : undefined}><LokmaIngredientIcon name={row.name} size={22} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.rowText, checked && styles.rowTextDone]}>
            {row.amount ? <Text style={[styles.amount, checked && styles.rowTextDone]}>{row.amount} </Text> : null}{row.name}
          </Text>
          {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
        </View>
      </Pressable>
      {row.manual && (
        <Pressable onPress={() => removeManualItem(row.key)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`${row.name} sil`}>
          <Ionicons name="trash-outline" size={17} color={colors.textFaint} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginBottom: 14 },
  input: {
    flex: 1, minHeight: 50, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 18, fontFamily: fonts.body, fontSize: 15, color: colors.ink,
  },
  addBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  sources: { gap: 8, paddingHorizontal: 20, paddingBottom: 14 },
  sourceChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 240, paddingLeft: 14, paddingRight: 10, height: 36,
    borderRadius: radius.pill, backgroundColor: colors.cream,
  },
  sourceLink: { flexShrink: 1 },
  sourceText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
  card: { marginHorizontal: 20, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineStrong },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  rowText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.ink },
  rowTextDone: { color: colors.textFaint, textDecorationLine: 'line-through' },
  amount: { fontFamily: fonts.bodySemi, color: colors.brand },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  allDone: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.success, padding: 18, textAlign: 'center' },
  doneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 22, marginBottom: 10 },
  doneTitle: { fontFamily: fonts.bodySemi, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.textMuted },
  clear: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.brand },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 40 },
  emptyArt: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  emptyTitle: { fontFamily: fonts.headingBold, fontSize: 22, color: colors.ink },
  emptyText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: 'center', marginTop: 8 },
  cta: { marginTop: 22, height: 48, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: colors.ink, justifyContent: 'center' },
  ctaText: { fontFamily: fonts.bodySemi, fontSize: 15, color: '#fff' },
  footnote: { fontFamily: fonts.body, fontSize: 12, lineHeight: 18, color: colors.textFaint, marginHorizontal: 24, marginTop: 22, textAlign: 'center' },
});
