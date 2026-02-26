import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface TabConfig {
  name: string;
  title: string;
  icon: IoniconName;
  iconOutline: IoniconName;
}

const tabs: TabConfig[] = [
  { name: 'index', title: 'Keşfet', icon: 'home', iconOutline: 'home-outline' },
  { name: 'recipes', title: 'Tarifler', icon: 'restaurant', iconOutline: 'restaurant-outline' },
  { name: 'pantry', title: 'Kiler', icon: 'basket', iconOutline: 'basket-outline' },
  { name: 'menus', title: 'Menüler', icon: 'book', iconOutline: 'book-outline' },
  { name: 'profile', title: 'Profil', icon: 'person', iconOutline: 'person-outline' },
];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#e74c3c',
        tabBarInactiveTintColor: '#999999',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#e5e5e5',
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#ffffff',
        },
        headerTintColor: '#1a1a1a',
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
        },
      }}
    >
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ focused, color, size }) => (
              <Ionicons name={focused ? tab.icon : tab.iconOutline} size={size} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
