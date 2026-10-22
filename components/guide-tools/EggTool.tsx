import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  EGG_DONENESS, EGG_SIZES, EGG_STARTS, eggTime, type EggDoneness, type EggSize, type EggStart,
} from '../../lib/guide-tools';
import { BigResult, FieldLabel, Note, Segmented, Steps, TimerPanel, toolStyles } from './ToolUI';

/** Yumurta pişme derecesi: size × start temperature × doneness → minutes from boiling water. */
export default function EggTool() {
  const [size, setSize] = useState<EggSize>('M');
  const [start, setStart] = useState<EggStart>('fridge');
  const [doneness, setDoneness] = useState<EggDoneness>('kayisi');
  const result = useMemo(() => eggTime({ size, start, doneness }), [size, start, doneness]);
  const donenessInfo = EGG_DONENESS.find(d => d.key === doneness);
  const label = `${size} boy · ${donenessInfo?.label.toLocaleLowerCase('tr-TR') || ''} · ${start === 'fridge' ? 'buzdolabından' : 'oda sıcaklığında'}`;

  return (
    <View style={toolStyles.stack}>
      <View style={toolStyles.field}>
        <FieldLabel>Boy</FieldLabel>
        <Segmented label="Yumurta boyu" value={size} onChange={setSize}
          options={EGG_SIZES.map(s => ({ key: s.key, label: s.label, sub: s.grams }))} />
      </View>
      <View style={toolStyles.field}>
        <FieldLabel>Başlangıç</FieldLabel>
        <Segmented label="Yumurtanın başlangıç sıcaklığı" value={start} onChange={setStart} options={EGG_STARTS} />
      </View>
      <View style={toolStyles.field}>
        <FieldLabel>Kıvam</FieldLabel>
        <Segmented label="Pişme derecesi" value={doneness} onChange={setDoneness} options={EGG_DONENESS} />
      </View>

      {result ? (
        <>
          <BigResult value={result.label} caption={`Su kaynadıktan sonra · ${donenessInfo?.description || ''}`} />
          <TimerPanel kind="egg" durationSec={result.seconds} label={label}
            notice={{ title: 'Yumurtan hazır', body: `${label}: süre doldu. Hemen soğuk suya al.` }}
            doneText="Yumurtaları hemen soğuk suya al." />
          {result.safetyNote ? <Note tone="safety" title="Akışkan sarı hakkında">{result.safetyNote}</Note> : null}
          <Steps steps={result.steps} />
        </>
      ) : null}
    </View>
  );
}
