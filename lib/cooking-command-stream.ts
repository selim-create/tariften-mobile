import { CookingCommand, COOKING_COMMAND_PHRASES, COOKING_MINUTE_WORDS, parseCookingCommand } from './cooking-commands';

// The recognizer emits partial words before final results. Generate valid
// prefixes from the very same phrase catalog used by the deterministic parser.
// Include all 1–60 minute values (digits and words), not just "beş/on".
const minuteValues = [
  ...Array.from({ length: 60 }, (_, i) => String(i + 1)),
  ...Object.keys(COOKING_MINUTE_WORDS),
];
const knownPhrases = [
  ...COOKING_COMMAND_PHRASES,
  ...minuteValues.flatMap((n) => [
    n + ' dakika başlat', n + ' dakika kur', n + ' dakika ayarla',
    n + ' dakika tut', n + ' dakika sayaç başlat', n + ' dakika sayaç kur',
    n + ' dakikalık sayaç başlat', n + ' dakikalık sayaç kur',
    n + ' dakika zamanlayıcı başlat', n + ' dakika süre başlat',
    'sayaç ' + n + ' dakika başlat', 'sayacı ' + n + ' dakikaya ayarla',
    'zamanlayıcı ' + n + ' dakika başlat',
  ]),
];
const validPrefixes = new Set<string>();
for (const phrase of knownPhrases) {
  for (let i = 1; i <= phrase.length; i++) validPrefixes.add(phrase.slice(0, i));
}

function normalize(raw: string): string {
  return raw.toLocaleLowerCase('tr-TR').normalize('NFC')
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function potentiallyValid(fragment: string): boolean {
  return fragment.length <= 96
    && fragment.split(' ').length <= 9
    && validPrefixes.has(fragment);
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

  clearPending(): void {
    this.pendingWords = [];
  }

  reset(): void {
    this.previousWords = [];
    this.pendingWords = [];
    this.lastResultAt = 0;
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
      // Exactly the same native snapshot is never a new command, even after
      // silence. Native onend resets the stream if an actual session restarts.
    } else if (matching === this.previousWords.length) {
      changed = incoming.slice(matching);
    } else if (matching === 0) {
      // A new utterance or a revised interim word.
      this.pendingWords = [];
      changed = incoming;
    } else if (matching === incoming.length) {
      // Interim correction removed an uncommitted suffix.
      const committedPrefixLength = this.previousWords.length - this.pendingWords.length;
      this.pendingWords = this.pendingWords.slice(0, Math.max(0, matching - committedPrefixLength));
    } else {
      // Replace only the revised uncommitted portion, e.g. '5 dakika ba'
      // becomes '5 dakika başlat', without losing the timer prefix.
      const committedPrefixLength = this.previousWords.length - this.pendingWords.length;
      this.pendingWords = this.pendingWords.slice(0, Math.max(0, matching - committedPrefixLength));
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
