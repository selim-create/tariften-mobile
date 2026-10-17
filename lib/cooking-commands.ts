export type CookingCommand =
  | { type: 'next' | 'previous' | 'read' | 'pause_voice' | 'resume_voice' | 'stop_voice'
    | 'pause_timer' | 'resume_timer' | 'cancel_timer' | 'pause_context'
    | 'cancel_context' | 'step_status' | 'mute_mic' | 'help' }
  | { type: 'start_timer'; minutes: number };

const numberWords: Record<string, number> = {
  'bir': 1, 'iki': 2, 'üç': 3, 'dört': 4, 'beş': 5, 'altı': 6,
  'yedi': 7, 'sekiz': 8, 'dokuz': 9, 'on': 10, 'on beş': 15,
  'yirmi': 20, 'otuz': 30, 'kırk': 40, 'elli': 50,
};

export const COOKING_COMMAND_PHRASES = [
  'sonraki', 'sonraki adım', 'sonraki adıma geç', 'sıradaki', 'sıradaki adım',
  'bir sonraki', 'bir sonraki adım', 'ileri', 'ileri git', 'ileri geç', 'geç', 'ilerle',
  'önceki', 'önceki adım', 'bir önceki', 'önceki adıma dön', 'geri', 'geri dön', 'geri git',
  'oku', 'tekrar', 'tekrar et', 'tekrar oku', 'adımı oku', 'adımı tekrar oku',
  'konuş', 'anlat', 'seslendir', 'tarifi oku', 'adımı seslendir',
  'devam', 'devam et', 'okumaya devam et',
  'durdur', 'duraklat', 'bekle', 'biraz bekle', 'pasife al',
  'okumayı duraklat', 'sesi duraklat', 'sesi durdur', 'okumayı durdur',
  'sayacı durdur', 'sayaç durdur', 'sayacı duraklat', 'sayaç duraklat',
  'süreyi durdur', 'süreyi duraklat', 'zamanlayıcıyı durdur',
  'sayacı sürdür', 'sayaç devam', 'süreyi sürdür', 'zamanlayıcıya devam et',
  'sayacı iptal et', 'sayaç iptal', 'süreyi iptal et',
  'sayacı sıfırla', 'sayaç sıfırla', 'zamanlayıcıyı iptal et',
  'iptal', 'iptal et', 'sıfırla',
  'kaçıncı adımdayım', 'hangi adımdayım', 'kaçıncı adımdan devam ediyoruz',
  'şu an hangi adımdayız', 'hangi adımdasın', 'kaçıncı adım', 'neredeyiz',
  'mikrofonu kapat', 'dinlemeyi durdur', 'sesli komutları kapat',
  'yardım', 'komutlar', 'komutları göster', 'ne diyebilirim',
  'sayaç başlat', 'on dakika başlat', 'beş dakika başlat',
];

export function parseCookingCommand(transcript: string): CookingCommand | null {
  const cmd = transcript.toLocaleLowerCase('tr-TR').trim()
    .replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ');
  if (!cmd || cmd.length > 90 || cmd.split(' ').length > 8) return null;

  if (/^(sonraki( adım| adıma geç)?|sıradaki( adım)?|bir sonraki( adım)?|ileri( git| geç)?|geç|ilerle)$/.test(cmd)) return { type: 'next' };
  if (/^(önceki( adım| adıma dön)?|bir önceki|geri( dön| git)?)$/.test(cmd)) return { type: 'previous' };
  if (/^(oku|konuş|anlat|seslendir|tarifi oku|adımı (oku|seslendir|tekrar oku)|tekrar( oku| et)?)$/.test(cmd)) return { type: 'read' };
  if (/^(okumayı duraklat|sesi duraklat)$/.test(cmd)) return { type: 'pause_voice' };
  if (/^(devam|devam et|okumaya devam et)$/.test(cmd)) return { type: 'resume_voice' };
  if (/^(sesi durdur|okumayı durdur)$/.test(cmd)) return { type: 'stop_voice' };
  if (/^(sayacı durdur|sayaç durdur|sayacı duraklat|sayaç duraklat|süreyi durdur|süreyi duraklat|zamanlayıcıyı durdur)$/.test(cmd)) return { type: 'pause_timer' };
  if (/^(sayacı sürdür|sayaç devam|süreyi sürdür|zamanlayıcıya devam et)$/.test(cmd)) return { type: 'resume_timer' };
  if (/^(sayacı iptal et|sayaç iptal|süreyi iptal et|sayacı sıfırla|sayaç sıfırla|zamanlayıcıyı iptal et)$/.test(cmd)) return { type: 'cancel_timer' };
  if (/^(durdur|duraklat|bekle|biraz bekle)$/.test(cmd)) return { type: 'pause_context' };
  if (/^(iptal|iptal et|sıfırla)$/.test(cmd)) return { type: 'cancel_context' };
  if (/^(pasife al|mikrofonu kapat|dinlemeyi durdur|sesli komutları kapat)$/.test(cmd)) return { type: 'mute_mic' };
  if (/^(kaçıncı adımdayım|hangi adımdayım|kaçıncı adımdan devam ediyoruz|şu an hangi adımdayız|hangi adımdasın|kaçıncı adım|neredeyiz)$/.test(cmd)) return { type: 'step_status' };
  if (/^(yardım|komutlar|komutları göster|ne diyebilirim)$/.test(cmd)) return { type: 'help' };

  if (cmd === 'sayaç başlat') return { type: 'start_timer', minutes: 10 };
  const timer = cmd.match(/^(.{1,16}) dakika(?:lık)?(?: süre| sayaç)? (?:başlat|kur|sayaç başlat|sayaç kur)$/);
  if (timer) {
    const minutes = Number(timer[1]) || numberWords[timer[1]];
    if (Number.isInteger(minutes) && minutes > 0 && minutes <= 60) return { type: 'start_timer', minutes };
  }
  return null;
}
