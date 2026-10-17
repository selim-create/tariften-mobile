/**
 * Native speech events may contain a direct transcript (ExpoSpeechRecognition)
 * or a nested alternative list (Web Speech-compatible implementations).
 * Keep this a pure parser so we can unit-test actual payload variations.
 */
export function extractCookingTranscript(event: unknown): string | null {
  if (!event || typeof event !== 'object') return null;
  const payload = event as { results?: unknown; resultIndex?: unknown };
  if (!Array.isArray(payload.results) || payload.results.length === 0) return null;
  const candidateIndex = typeof payload.resultIndex === 'number' && Number.isInteger(payload.resultIndex)
    && payload.resultIndex >= 0 && payload.resultIndex < payload.results.length
    ? payload.resultIndex : 0;
  const item = payload.results[candidateIndex];
  let transcript: unknown;
  if (Array.isArray(item)) transcript = item[0]?.transcript;
  else if (typeof item === 'object' && item !== null) transcript = (item as { transcript?: unknown }).transcript;
  if (typeof transcript !== 'string') return null;
  const normalized = transcript.replace(/\s+/g, ' ').trim();
  // Continuous iOS recognition may accumulate many short commands in one
  // native session. A 180-char prefix cap silently discards all later words.
  return normalized ? normalized.slice(0, 8192) : null;
}
