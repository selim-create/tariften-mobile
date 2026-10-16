export type CookingCommand =
  | { type: 'next' | 'previous' | 'read' | 'pause_voice' | 'resume_voice' | 'stop_voice' | 'pause_timer' | 'resume_timer' | 'cancel_timer' | 'help' }
  | { type: 'start_timer'; minutes: number };

const numbers: Record<string, number> = {
  'bir': 1, 'iki': 2, 'üç': 3, 'dört': 4, 'beş': 5,
  'altı': 6, 'yedi': 7, 'sekiz': 8, 'dokuz': 9, 'on': 10,
  'on beş': 15, 'yirmi': 20, 'otuz': 30,
};

export function parseCookingCommand(transcript: string): CookingCommand | null {
  const cmd = transcript.toLocaleLowerCase('tr-TR').trim().replace(/[.,!?]/g, '').replace(/\s+/g, ' ');
  if (!cmd || cmd.split(' ').length > 6) return null;
  if (/^(sonraki|sonraki adım|bir sonraki|bir sonraki adım|ileri|ileri geç|ileri git|geç|sonraki adıma geç)$/.test(cmd)) return { type: 'next' };
  if (/^(önceki|önceki adım|bir önceki|geri|geri dön|geri git|önceki adıma dön)$/.test(cmd)) return { type: 'previous' };
  if (/^(oku|tekrar|tekrar oku|tekrar et|adımı oku|adımı tekrar oku|seslendir)$/.test(cmd)) return { type: 'read' };
  if (/^(duraklat|okumayı duraklat)$/.test(cmd)) return { type: 'pause_voice' };
  if (/^(devam|devam et|okumaya devam et)$/.test(cmd)) return { type: 'resume_voice' };
  if (/^(sesi durdur|okumayı durdur)$/.test(cmd)) return { type: 'stop_voice' };
  if (/^(süreyi durdur|sayacı durdur|süreyi duraklat)$/.test(cmd)) return { type: 'pause_timer' };
  if (/^(süreyi sürdür|sayacı sürdür)$/.test(cmd)) return { type: 'resume_timer' };
  if (/^(süreyi iptal et|sayacı iptal et)$/.test(cmd)) return { type: 'cancel_timer' };
  if (/^(yardım|komutlar)$/.test(cmd)) return { type: 'help' };
  const timer = cmd.match(/^(.{1,16}) dakika( süre)? (başlat|sayaç kur)$/);
  if (timer) {
    const minutes = Number(timer[1]) || numbers[timer[1]];
    if (minutes && Number.isInteger(minutes) && minutes > 0 && minutes <= 60) return { type: 'start_timer', minutes };
  }
  return null;
}
