import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  formatNumberTr, parseAmount, pastaPlan, PASTA_PACKAGE_RANGE, PASTA_PORTION_RANGE, PASTA_SHAPES, PASTA_TEXTURES,
  type PastaShape, type PastaTexture,
} from '../../lib/guide-tools';
import { colors, fonts, radius } from '../../constants/theme';
import { BigResult, ChipChoice, FieldLabel, Note, Segmented, Stepper, Steps, TimerPanel, toolStyles } from './ToolUI';

type Source = PastaShape | 'paket';

/** Makarna zamanlayıcı: shape or package minutes, texture, portions → water, salt, timer. */
export default function PastaTool() {
  const [source, setSource] = useState<Source>('spagetti');
  const [packageText, setPackageText] = useState('');
  const [texture, setTexture] = useState<PastaTexture>('al_dente');
  const [portions, setPortions] = useState(2);

  const packageMinutes = source === 'paket' ? parseAmount(packageText) : null;
  const packageError = source === 'paket' && packageText.trim() !== ''
    && (packageMinutes === null || packageMinutes < PASTA_PACKAGE_RANGE[0] || packageMinutes > PASTA_PACKAGE_RANGE[1]);

  const result = useMemo(() => (source === 'paket'
    ? (packageMinutes !== null ? pastaPlan({ packageMinutes, texture, portions }) : null)
    : pastaPlan({ shape: source, texture, portions })), [source, packageMinutes, texture, portions]);

  const sourceLabel = source === 'paket' ? 'Paket süresi' : PASTA_SHAPES.find(s => s.key === source)?.label || '';
  const textureLabel = PASTA_TEXTURES.find(t => t.key === texture)?.label || '';
  const label = `${sourceLabel} · ${textureLabel.toLocaleLowerCase('tr-TR')} · ${portions} kişilik`;
  const options = [...PASTA_SHAPES.map(s => ({ key: s.key as Source, label: s.label })), { key: 'paket' as Source, label: 'Paket süresini gir' }];

  return (
    <View style={toolStyles.stack}>
      <View style={toolStyles.field}>
        <FieldLabel>Makarna</FieldLabel>
        <ChipChoice label="Makarna türü" options={options} value={source} onChange={setSource} />
        {source === 'paket' ? (
          <View style={styles.inputRow}>
            <TextInput value={packageText} onChangeText={t => setPackageText(t.replace(/[^\d.,]/g, '').slice(0, 4))}
              placeholder="ör. 9" placeholderTextColor={colors.textFaint} keyboardType="decimal-pad" returnKeyType="done"
              style={[styles.input, packageError && styles.inputError]} maxLength={4}
              accessibilityLabel="Paketteki pişirme süresi, dakika" accessibilityHint={`${PASTA_PACKAGE_RANGE[0]} ile ${PASTA_PACKAGE_RANGE[1]} dakika arası`} />
            <Text style={styles.unit}>dakika (paketteki süre)</Text>
          </View>
        ) : null}
        {packageError ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {`${PASTA_PACKAGE_RANGE[0]} ile ${PASTA_PACKAGE_RANGE[1]} dakika arasında bir süre yaz.`}
          </Text>
        ) : null}
      </View>
      <View style={toolStyles.field}>
        <FieldLabel>Kıvam</FieldLabel>
        <Segmented label="Makarna kıvamı" value={texture} onChange={setTexture} options={PASTA_TEXTURES} />
      </View>
      <View style={toolStyles.field}>
        <FieldLabel hint="Kişi başı 100 g">Porsiyon</FieldLabel>
        <Stepper label="Porsiyon" value={portions} min={PASTA_PORTION_RANGE[0]} max={PASTA_PORTION_RANGE[1]}
          onChange={setPortions} format={n => `${n} kişilik`} />
      </View>

      {result ? (
        <>
          <View style={styles.facts}>
            <Fact value={`${result.grams} g`} caption="makarna" />
            <Fact value={`${formatNumberTr(result.waterLiters)} L`} caption="su" />
            <Fact value={`${formatNumberTr(result.saltGrams, 0)} g`} caption={`tuz · ${result.saltHint.replace('yaklaşık ', '≈ ')}`} />
          </View>
          <BigResult value={result.label} caption={`Su kaynayıp makarnayı attıktan sonra · ${PASTA_TEXTURES.find(t => t.key === texture)?.description || ''}`} />
          <TimerPanel kind="pasta" durationSec={result.seconds} label={label}
            notice={{ title: 'Makarna hazır', body: 'Süre doldu. Süzmeden önce bir kupa makarna suyu ayır.' }}
            doneText="Bir tane tadına bak; süzmeden önce bir kupa makarna suyu ayır." />
          {result.note ? <Note>{result.note}</Note> : null}
          <Steps steps={result.steps} />
        </>
      ) : source === 'paket' && !packageError ? (
        <Note>Paketin üzerindeki pişirme süresini yaz; al dente için 1 dakika eksiğini, yumuşak için 1 dakika fazlasını hesaplarız.</Note>
      ) : null}
    </View>
  );
}

function Fact({ value, caption }: { value: string; caption: string }) {
  return (
    <View style={styles.fact} accessible accessibilityLabel={`${caption}: ${value}`}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factCaption} numberOfLines={2}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  input: {
    width: 88, height: 48, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong,
    backgroundColor: colors.surface, fontFamily: fonts.bodySemi, fontSize: 17, color: colors.ink,
  },
  inputError: { borderColor: colors.brand },
  unit: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  error: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.brandDark },
  facts: { flexDirection: 'row', gap: 8 },
  fact: { flex: 1, paddingVertical: 12, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.cream, alignItems: 'center' },
  factValue: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.ink },
  factCaption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
});
