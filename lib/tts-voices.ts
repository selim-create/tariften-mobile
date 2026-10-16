// Pure helpers shared by the on-device TTS selector and regression tests.
// No network, storage, or paid API calls.
export type LocalVoice = {
  identifier: string;
  name: string;
  language: string;
  quality?: string;
};

export const VOICE_RATE_PRESETS = [
  { id: 'slow', label: 'Sakin', rate: 0.82 },
  { id: 'normal', label: 'Normal', rate: 0.95 },
  { id: 'fast', label: 'Hızlı', rate: 1.08 },
] as const;

export function getTurkishVoices<T extends LocalVoice>(
  voices: readonly T[],
  enhancedQuality: string,
): T[] {
  return voices
    .filter((voice) => {
      const language = voice.language.trim().toLowerCase().replace(/_/g, '-');
      return language === 'tr' || language.startsWith('tr-');
    })
    .sort((a, b) => {
      const qualityDelta =
        Number(b.quality === enhancedQuality) - Number(a.quality === enhancedQuality);
      return qualityDelta || a.name.localeCompare(b.name, 'tr');
    });
}

export function chooseTurkishVoiceId<T extends LocalVoice>(
  voices: readonly T[],
  selectedVoiceId: string | null,
  enhancedQuality: string,
): string | undefined {
  const turkish = getTurkishVoices(voices, enhancedQuality);
  if (selectedVoiceId && turkish.some((voice) => voice.identifier === selectedVoiceId)) {
    return selectedVoiceId;
  }
  return turkish[0]?.identifier;
}
