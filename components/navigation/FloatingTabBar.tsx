import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadow } from '../../constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Visible destinations, left to right; the create button sits in the middle. */
export const TAB_ITEMS: { name: string; label: string; icon: IoniconName; iconActive: IoniconName }[] = [
  { name: 'index', label: 'Keşfet', icon: 'compass-outline', iconActive: 'compass' },
  { name: 'defterim', label: 'Defterim', icon: 'book-outline', iconActive: 'book' },
  { name: 'bu-hafta', label: 'Bu Hafta', icon: 'calendar-clear-outline', iconActive: 'calendar-clear' },
  { name: 'alisveris', label: 'Alışveriş', icon: 'basket-outline', iconActive: 'basket' },
];

/** Hidden routes still belong to a visible tab, so the pill never goes blank. */
const PARENT: Record<string, string> = {
  recipes: 'index',
  pantry: 'defterim',
  menus: 'defterim',
  profile: 'defterim',
};

export const BAR_HEIGHT = 66;
export const BAR_GAP = 12;

/** Space a screen must leave at the bottom so content clears the floating bar. */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + Math.max(insets.bottom, BAR_GAP) + BAR_GAP + 8;
}

function TabButton({ focused, label, icon, iconActive, onPress, onLongPress }: {
  focused: boolean; label: string; icon: IoniconName; iconActive: IoniconName;
  onPress: () => void; onLongPress: () => void;
}) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(progress, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
  }, [focused, progress]);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      hitSlop={6}
      style={styles.slot}>
      <Animated.View
        style={[styles.activeDisc, { opacity: progress, transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]} />
      <Ionicons name={focused ? iconActive : icon} size={23} color={focused ? '#ffffff' : '#8b8580'} />
    </Pressable>
  );
}

/**
 * Floating pill navigation (Keşfet · Defterim · ＋ · Bu Hafta · Alışveriş).
 * Icons only, the active tab sits in a brand-red disc; the ink-coloured
 * centre button opens the create sheet.
 */
export default function FloatingTabBar({ state, navigation, onCreate, createOpen }: BottomTabBarProps & {
  onCreate: () => void; createOpen: boolean;
}) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const activeName = PARENT[current] || current;

  const go = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented) navigation.navigate(route.name, route.params);
  };
  const longPress = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (route) navigation.emit({ type: 'tabLongPress', target: route.key });
  };

  const left = TAB_ITEMS.slice(0, 2);
  const right = TAB_ITEMS.slice(2);

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: Math.max(insets.bottom, BAR_GAP) }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {left.map(item => (
          <TabButton key={item.name} {...item} focused={activeName === item.name}
            onPress={() => go(item.name)} onLongPress={() => longPress(item.name)} />
        ))}
        <View style={styles.slot}>
          <Pressable
            onPress={onCreate}
            accessibilityRole="button"
            accessibilityLabel="Tarif veya menü ekle"
            accessibilityHint="Oluşturma seçeneklerini açar"
            accessibilityState={{ expanded: createOpen }}
            style={({ pressed }) => [styles.create, pressed && { transform: [{ scale: 0.94 }] }]}>
            <Ionicons name="add" size={28} color="#ffffff" />
          </Pressable>
        </View>
        {right.map(item => (
          <TabButton key={item.name} {...item} focused={activeName === item.name}
            onPress={() => go(item.name)} onLongPress={() => longPress(item.name)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 18 },
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', maxWidth: 460, height: BAR_HEIGHT, paddingHorizontal: 9,
    borderRadius: BAR_HEIGHT / 2, backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong,
    ...shadow.floating,
  },
  slot: { flex: 1, height: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  activeDisc: { position: 'absolute', width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand },
  create: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.ink,
    alignItems: 'center', justifyContent: 'center',
  },
});
