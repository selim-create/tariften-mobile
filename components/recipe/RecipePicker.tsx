import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
};

/** Native-feeling selection sheet; shared by create, edit and AI recipe review. */
export default function RecipePicker({ label, value, options, onChange, placeholder = 'Seç', allowClear = true }: Props) {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const unique = useMemo(() => Array.from(new Set([...options, ...(value && !options.includes(value) ? [value] : [])])), [options, value]);
  const shown = unique.filter(item => item.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));
  const close = () => { setVisible(false); setQuery(''); };
  const choose = (next: string) => { onChange(next); close(); };
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label + ': ' + (value || placeholder)}
      accessibilityHint="Seçim listesini açar" onPress={() => setVisible(true)} style={styles.trigger}>
      <Text numberOfLines={1} style={[styles.value, !value && styles.placeholder]}>{value || placeholder}</Text>
      <Ionicons name="chevron-down" size={18} color="#b25e50" />
    </TouchableOpacity>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <SafeAreaView style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{label}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Seçim listesini kapat"
              style={styles.close} onPress={close}><Ionicons name="close" size={22} color="#7c6b60" /></TouchableOpacity>
          </View>
          {unique.length > 6 && <TextInput accessibilityLabel={label + ' seçeneklerinde ara'} value={query}
            onChangeText={setQuery} placeholder="Seçenek ara…" placeholderTextColor="#b4a49a" style={styles.search} />}
          <ScrollView style={styles.list} contentContainerStyle={styles.options} keyboardShouldPersistTaps="handled">
            {allowClear && <TouchableOpacity accessibilityRole="button" style={styles.option} onPress={() => choose('')}>
              <Text style={styles.empty}>Belirtilmemiş</Text></TouchableOpacity>}
            {shown.map(option => <TouchableOpacity accessibilityRole="button" key={option}
              style={[styles.option, value===option && styles.active]} onPress={() => choose(option)}>
              <Text style={[styles.optionText, value===option && styles.activeText]}>{option}</Text>
              {value===option && <Ionicons name="checkmark" size={20} color="#db4c3f" />}
            </TouchableOpacity>)}
            {!shown.length && <Text style={styles.empty}>Sonuç bulunamadı.</Text>}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  </View>;
}
const styles=StyleSheet.create({
  field:{gap:7,flex:1,minWidth:0},label:{fontSize:11,fontWeight:'800',color:'#78675d'},
  trigger:{minHeight:46,borderWidth:1,borderColor:'#e6d9cc',backgroundColor:'#fffdfa',
    paddingHorizontal:12,paddingVertical:10,borderRadius:13,flexDirection:'row',alignItems:'center',gap:8},
  value:{flex:1,fontSize:14,fontWeight:'700',color:'#24343c'},
  placeholder:{color:'#9c8e85'},
  overlay:{flex:1,backgroundColor:'rgba(28,35,38,.56)',justifyContent:'flex-end'},
  sheet:{maxHeight:'80%',minHeight:320,backgroundColor:'#fffaf6',borderTopLeftRadius:28,borderTopRightRadius:28,padding:18},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},
  title:{fontSize:21,fontWeight:'900',color:'#23333b'},
  close:{borderRadius:20,backgroundColor:'#f3e8df',padding:7},
  search:{backgroundColor:'#fff',borderColor:'#e9dcd0',borderWidth:1,borderRadius:13,padding:12,fontSize:14,marginBottom:10},
  list:{flexGrow:0},
  options:{paddingBottom:25,gap:5},
  option:{minHeight:45,padding:13,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderRadius:14,backgroundColor:'#fff',borderWidth:1,borderColor:'#f0e6dd'},
  active:{backgroundColor:'#fff0e9',borderColor:'#f2c2b7'},
  optionText:{fontSize:14,fontWeight:'700',color:'#35454a'},
  activeText:{color:'#b74135'},
  empty:{fontSize:13,color:'#99867b'},
});
