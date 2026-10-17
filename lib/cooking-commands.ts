/**
 * Offline, deterministic, exact Turkish cooking commands.
 * Do not use fuzzy substring matching: recipe narration or background speech
 * must not be able to trigger a timer, skip a step, or mute the microphone.
 */
export type CookingCommand =
  | { type: 'next' | 'previous' | 'read' | 'pause_voice' | 'resume_voice'
    | 'stop_voice' | 'pause_timer' | 'resume_timer' | 'cancel_timer'
    | 'pause_context' | 'resume_context' | 'cancel_context'
    | 'step_status' | 'mute_mic' | 'help' }
  | { type: 'start_timer'; minutes: number };

type BasicCommandType = Exclude<CookingCommand['type'], 'start_timer'>;
type CommandGroup = { type: BasicCommandType; variants: readonly string[] };

export const COOKING_COMMAND_GROUPS: readonly CommandGroup[] = [
  { type: 'next', variants: [
    'sonraki', 'sonraki adım', 'sonraki adıma geç', 'bir sonraki',
    'bir sonraki adım', 'bir sonraki adıma geç', 'sıradaki', 'sıradaki adım',
    'sıradaki adıma geç', 'ileri', 'ileri git', 'ileri geç', 'ilerle',
    'bir adım ileri', 'bir adım ilerle', 'diğer adıma geç', 'diğer adım',
    'sonraki aşama', 'bir sonraki aşama', 'geç', 'devamındaki adım',
  ] },
  { type: 'previous', variants: [
    'önceki', 'önceki adım', 'önceki adıma dön', 'önceki adıma geç',
    'bir önceki', 'bir önceki adım', 'bir önceki adıma dön',
    'geri', 'geri dön', 'geri git', 'bir adım geri', 'geri al',
    'önceki aşama', 'geçen adım', 'bir önceki aşama',
  ] },
  { type: 'read', variants: [
    'oku', 'seslendir', 'konuş', 'anlat', 'okumaya başla', 'okumaya başlat',
    'okumaya başla lütfen', 'adımı oku', 'adımı seslendir', 'bu adımı oku',
    'bu adımı seslendir', 'adımı anlat', 'tarifi oku', 'tarifi anlat',
    'şimdi oku', 'sesli oku', 'yüksek sesle oku', 'tekrar', 'tekrar et',
    'tekrar oku', 'bir daha oku', 'yeniden oku', 'adımı tekrar oku',
    'bu adımı tekrar oku', 'baştan oku', 'yeniden seslendir',
    'ne yapacağımı oku', 'şimdi ne yapacağımı anlat',
  ] },
  { type: 'pause_voice', variants: [
    'okumayı duraklat', 'okumayı durdur', 'seslendirmeyi duraklat',
    'seslendirmeyi durdur', 'sesi duraklat', 'okumaya ara ver',
    'seslendirmeye ara ver', 'konuşmayı duraklat', 'okumayı beklet',
  ] },
  { type: 'stop_voice', variants: [
    'sesi durdur', 'sesi kapat', 'seslendirmeyi kapat', 'okumayı kapat',
    'konuşmayı durdur', 'sesli okumayı durdur', 'konuşmayı bitir',
  ] },
  { type: 'resume_voice', variants: [
    'okumaya devam et', 'okumayı sürdür', 'seslendirmeye devam et',
    'seslendirmeyi sürdür', 'konuşmaya devam et', 'sesli okumaya devam et',
    'okumaya kaldığın yerden devam et', 'sesi devam ettir',
  ] },
  { type: 'pause_timer', variants: [
    'sayacı durdur', 'sayaç durdur', 'sayacı duraklat', 'sayaç duraklat',
    'sayacı beklet', 'sayaç beklet', 'sayacı duraklatır mısın',
    'süreyi durdur', 'süreyi duraklat', 'süreyi beklet', 'süreyi tut',
    'zamanlayıcıyı durdur', 'zamanlayıcıyı duraklat',
    'zamanlayıcıyı beklet', 'geri sayımı durdur', 'geri sayımı duraklat',
    'sayımı durdur', 'saatı durdur', 'saati durdur',
  ] },
  { type: 'resume_timer', variants: [
    'sayacı sürdür', 'sayaç sürdür', 'sayacı devam ettir', 'sayaç devam',
    'sayaç devam et', 'sayaca devam et', 'sayacı yeniden çalıştır',
    'sayacı çalıştır', 'sayacı başlat', 'sayacı kaldığı yerden devam ettir',
    'süreyi sürdür', 'süreyi devam ettir', 'süreye devam et',
    'zamanlayıcıyı sürdür', 'zamanlayıcıyı devam ettir',
    'zamanlayıcıya devam et', 'geri sayımı sürdür',
    'geri sayımı devam ettir', 'sayımı sürdür',
  ] },
  { type: 'cancel_timer', variants: [
    'sayacı iptal et', 'sayaç iptal', 'sayacı iptal', 'sayaç iptal et',
    'sayacı sıfırla', 'sayaç sıfırla', 'sayacı kapat', 'sayaç kapat',
    'süreyi iptal et', 'süreyi sıfırla', 'zamanlayıcıyı iptal et',
    'zamanlayıcıyı sıfırla', 'geri sayımı iptal et',
  ] },
  { type: 'pause_context', variants: [
    'durdur', 'duraklat', 'bekle', 'beklet', 'biraz bekle', 'biraz dur',
    'şimdilik dur', 'şimdilik durdur', 'ara ver', 'mola ver',
    'bir süre duraklat', 'şimdilik duraklat', 'dur', 'şu an durdur',
  ] },
  { type: 'resume_context', variants: [
    'sürdür', 'devam', 'devam et', 'devam ettir', 'kaldığın yerden devam et',
    'kaldığı yerden devam et', 'kaldığımız yerden devam et',
    'kaldığın yerden sürdür', 'kaldığı yerden sürdür', 'yeniden devam et',
    'sürdür lütfen', 'devam edebiliriz', 'devam edelim', 'yeniden çalıştır',
    'sürdürmeye devam et', 'duraklatmayı bitir', 'beklemeyi bitir',
  ] },
  { type: 'cancel_context', variants: [
    'iptal', 'iptal et', 'iptal edelim', 'vazgeç', 'vazgeçtim',
    'sıfırla', 'kapat', 'tamamen durdur', 'tamamen iptal et',
  ] },
  { type: 'step_status', variants: [
    'kaçıncı adımdayım', 'kaçıncı adımdayız', 'kaçıncı adım',
    'hangi adımdayım', 'hangi adımdayız', 'hangi adımdasın',
    'şu an hangi adımdayız', 'hangi aşamadayız', 'kaçıncı aşamadayız',
    'neredeyiz', 'şimdi neredeyiz', 'kaç adım kaldı', 'kaç adım daha var',
    'daha kaç adım var', 'toplam kaç adım var', 'hangi adım',
    'kaçıncı adımdan devam ediyoruz', 'kaç adımımız kaldı',
  ] },
  { type: 'mute_mic', variants: [
    'pasife al', 'mikrofonu kapat', 'mikrofonu durdur', 'sesli komutları kapat',
    'dinlemeyi durdur', 'beni dinlemeyi bırak', 'dinlemeyi kapat',
    'artık dinleme', 'mikrofonu pasife al', 'sesli komutları pasife al',
  ] },
  { type: 'help', variants: [
    'yardım', 'yardım et', 'komutlar', 'komutları göster',
    'komutları söyle', 'ne diyebilirim', 'hangi komutlar var',
    'ne yapabilirsin', 'nasıl kullanılır', 'sesli komut yardımı',
  ] },
];

const tens: Record<string, number> = {
  on: 10, yirmi: 20, otuz: 30, kırk: 40, elli: 50, altmış: 60,
};
const ones: Record<string, number> = {
  bir: 1, iki: 2, üç: 3, dört: 4, beş: 5,
  altı: 6, yedi: 7, sekiz: 8, dokuz: 9,
};

/** Numerals from 1–60, including composites like "yirmi beş". */
export const COOKING_MINUTE_WORDS: Readonly<Record<string, number>> = (() => {
  const words: Record<string, number> = { ...ones, ...tens };
  for (const [ten, base] of Object.entries(tens)) {
    for (const [one, unit] of Object.entries(ones)) {
      if (base + unit <= 60) words[ten + ' ' + one] = base + unit;
    }
  }
  return words;
})();

const startNumber = '(\\d{1,2}|[a-zçğıöşü]+(?: [a-zçğıöşü]+)?)';
const numberStartPattern = new RegExp(
  '^' + startNumber + ' dakika(?:lık)?(?: (?:süre|sayaç|sayacı|zamanlayıcı))? ' +
  '(?:başlat|kur|ayarla|tut|sayaç başlat|sayaç kur|zamanlayıcı başlat)$'
);
const timerFirstPattern = new RegExp(
  '^(?:sayaç|sayacı|zamanlayıcı) ' + startNumber + ' dakika(?:ya|lık)? ' +
  '(?:başlat|kur|ayarla)$'
);

/** All patterns are short, exact and locale-aware; no fuzzy semantic matching. */
export function parseCookingCommand(transcript: string): CookingCommand | null {
  const cmd = transcript.toLocaleLowerCase('tr-TR').normalize('NFC').trim()
    .replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ');
  if (!cmd || cmd.length > 96 || cmd.split(' ').length > 9) return null;
  for (const group of COOKING_COMMAND_GROUPS) {
    if (group.variants.includes(cmd)) return { type: group.type };
  }
  if (/^(sayaç başlat|zamanlayıcı başlat|sayaç kur|zamanlayıcı kur)$/.test(cmd)) {
    return { type: 'start_timer', minutes: 10 };
  }

  const match = cmd.match(numberStartPattern) || cmd.match(timerFirstPattern);
  if (!match) return null;
  const numberText = match[1];
  const minutes = /^\d+$/.test(numberText)
    ? Number(numberText) : COOKING_MINUTE_WORDS[numberText];
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 60
    ? { type: 'start_timer', minutes }
    : null;
}

/** Recognizer stream uses the same phrases as parser, plus timer patterns.
 * Numeric templates are generated to preserve partial results such as
 * "on beş dakika sayaç kur" without firing an unrelated short command. */
export const COOKING_COMMAND_PHRASES = [
  ...COOKING_COMMAND_GROUPS.flatMap((group) => group.variants),
  'sayaç başlat', 'sayaç kur', 'zamanlayıcı başlat', 'zamanlayıcı kur',
];
