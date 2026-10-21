import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius, shadow } from '../constants/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
}

/** Rounded search field in the Keşfet style: icon, input, clear. */
export default function SearchBar({
  value,
  onChangeText,
  onSubmit,
  placeholder = 'Tarif veya malzeme ara...',
}: SearchBarProps) {
  return (
    <View style={styles.container}>
      <Ionicons name="search" size={19} color={colors.textMuted} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChangeText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Aramayı temizle">
          <Ionicons name="close-circle" size={19} color={colors.textFaint} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 18,
    borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, ...shadow.card,
  },
  input: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink, padding: 0 },
});
