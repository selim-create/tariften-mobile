import { CookingCommand, parseCookingCommand } from './cooking-commands';

const KNOWN_PHRASES = [
  'sonraki', 'sonraki adım', 'bir sonraki', 'bir sonraki adım', 'sonraki adıma geç',
  'ileri', 'ileri git', 'ileri geç', 'geç', 'önceki', 'önceki adım',
  'bir önceki', 'geri', 'geri dön', 'geri git', 'önceki adıma dön',
  'oku', 'adımı oku', 'tekrar', 'tekrar et', 'tekrar oku', 'adımı tekrar oku',
  'seslendir', 'devam', 'devam et', 'okumaya devam et', 'duraklat',
  'okumayı duraklat', 'sesi durdur', 'okumayı durdur',
  'süreyi durdur', 'sayacı durdur', 'süreyi duraklat',
  'süreyi sürdür', 'sayacı sürdür', 'süreyi iptal et', 'sayacı iptal et',
  'yardım', 'komutlar',
  'bir dakika başlat', 'beş dakika başlat', 'on dakika başlat',
  'beş dakika sayaç kur', 'on dakika sayaç kur',
];

function normalize(raw: string): string {
  return raw.toLocaleLowerCase('tr-TR')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function potentiallyValid(fragment: string): boolean {
  if (!fragment || fragment.length > 56 || fragment.split(' ').length > 6) return false;
  if (KNOWN_PHRASES.some((phrase) => phrase.startsWith(fragment))) return true;
  return /^(?:\d{1,2}|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|on beş|yirmi|otuz)(?: dakika(?:lık)?(?: süre| sayaç)?(?: (?:başlat|kur))?)?$/.test(fragment);
}

export type CookingStreamResult = {
  commands: CookingCommand[];
  pending: string;
  discardedNoise: boolean;
};

/**
 * iOS continuous interim results commonly accumulate into a transcript:
 * "sonraki" -> "sonraki sonraki" -> "sonraki sonraki önceki".
 * Parse only words NEW to this native snapshot, not its entire history.
 * - New recognized commands clear the pending segment immediately.
 * - Non-command words are discarded as soon as no command can start with them.
 * - An inactivity timeout clears pending partial words without forgetting the
 *   native transcript baseline. This avoids re-triggering earlier commands.
 * No audio or transcripts are saved to device or server.
 */
export class CookingCommandStream {
  private previousWords: string[] = [];
  private pendingWords: string[] = [];
  private lastResultAt = 0;
  private lastAcceptedAt = 0;

  clearPending(): void {
    this.pendingWords = [];
  }

  reset(): void {
    this.previousWords = [];
    this.pendingWords = [];
    this.lastResultAt = 0;
    this.lastAcceptedAt = 0;
  }

  accept(raw: string, now: number = Date.now()): CookingStreamResult {
    const incoming = normalize(raw).split(' ').filter(Boolean);
    if (!incoming.length) return { commands: [], pending: '', discardedNoise: false };

    const idleGap = this.lastResultAt > 0 && now - this.lastResultAt > 1100;
    if (idleGap) this.pendingWords = [];

    let matching = 0;
    while (matching < incoming.length
      && matching < this.previousWords.length
      && incoming[matching] === this.previousWords[matching]) matching++;

    let changed: string[] = [];
    if (matching === this.previousWords.length && matching === incoming.length) {
      // Some recognizers reset their stream to the same short phrase after a
      // genuine pause. Treat it as a fresh utterance only after a safe gap.
      if (idleGap && now - this.lastAcceptedAt > 1500) changed = incoming;
    } else if (matching === this.previousWords.length) {
      changed = incoming.slice(matching);
    } else if (matching === 0) {
      // A new utterance or a revised interim word.
      this.pendingWords = [];
      changed = incoming;
    } else if (matching === incoming.length) {
      // Interim correction removed words. Do not re-emit accepted actions.
      this.pendingWords = [];
    } else {
      // The last interim word may be revised (e.g. "son" -> "sonraki").
      // Rebuild the uncommitted fragment, never re-issue the common prefix.
      this.pendingWords = [];
      changed = incoming.slice(matching);
    }

    this.previousWords = incoming;
    this.lastResultAt = now;

    const commands: CookingCommand[] = [];
    let discardedNoise = false;
    for (const word of changed) {
      this.pendingWords.push(word);
      const phrase = this.pendingWords.join(' ');
      const command = parseCookingCommand(phrase);
      if (command) {
        commands.push(command);
        this.pendingWords = [];
        this.lastAcceptedAt = now;
      } else if (!potentiallyValid(phrase)) {
        this.pendingWords = [];
        discardedNoise = true;
      }
      // A callback may batch multiple phrases. Cap per callback to avoid
      // untrusted recognizer text triggering an arbitrary number of actions.
      if (commands.length >= 3) break;
    }
    return { commands, pending: this.pendingWords.join(' '), discardedNoise };
  }
}
