import { CookingCommand, COOKING_COMMAND_PHRASES, parseCookingCommand } from './cooking-commands';

// Keep native streaming prefixes in sync with the actual accepted commands.
// Otherwise "sayacı durdur" can be discarded word-by-word before completion.
const KNOWN_PHRASES = [
  ...COOKING_COMMAND_PHRASES,
  ...['bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz', 'on',
      'on beş', 'yirmi', 'otuz', 'kırk', 'elli'].flatMap((n) => [
        n + ' dakika başlat', n + ' dakika sayaç kur', n + ' dakika sayaç başlat',
        n + ' dakikalık sayaç başlat',
      ]),
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
  const number = Number(fragment.split(' ')[0]);
  if (Number.isInteger(number) && number >= 1 && number <= 60) {
    return [number + ' dakika başlat', number + ' dakika sayaç kur', number + ' dakika süre başlat']
      .some((phrase) => phrase.startsWith(fragment));
  }
  return false;
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
