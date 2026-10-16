// WordPress Core owns identity, per-user quotas, and every paid Google call.
// The client carries only a WordPress bearer token; cloud credentials stay on the server.
export const CHIRP3_VOICES = [
  { id: 'tr-TR-Chirp3-HD-Enceladus', label: 'Enceladus · Varsayılan' },
  { id: 'tr-TR-Chirp3-HD-Zephyr', label: 'Zephyr' },
  { id: 'tr-TR-Chirp3-HD-Aoede', label: 'Aoede' },
  { id: 'tr-TR-Chirp3-HD-Kore', label: 'Kore' },
  { id: 'tr-TR-Chirp3-HD-Puck', label: 'Puck' },
  { id: 'tr-TR-Chirp3-HD-Charon', label: 'Charon' },
] as const;

const BASE = 'https://api.tariften.com/wp-json/tariften/v1/voice';

export type VoiceStatus = {
  enabled: boolean;
  plan?: string;
  plan_limit?: number;
  plan_remaining?: number;
  phase?: string;
};

async function readResponse<T>(response: Response): Promise<T> {
  const result: unknown = await response.json();
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'message' in result
      ? (result as { message?: unknown }).message
      : undefined;
    throw new Error(typeof message === 'string' ? message : 'Ses servisine ulaşılamıyor.');
  }
  return result as T;
}

export async function getVoiceStatus(token: string): Promise<VoiceStatus> {
  const response = await fetch(BASE + '/status', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  return readResponse<VoiceStatus>(response);
}

export async function synthesizeRecipeStep(
  token: string,
  recipeId: number,
  stepIndex: number,
  voice: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!Number.isSafeInteger(recipeId) || recipeId < 1
    || !Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex > 100
    || !CHIRP3_VOICES.some((item) => item.id === voice)) {
    throw new Error('Geçersiz seslendirme parametreleri.');
  }
  const response = await fetch(BASE + '/synthesize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipe_id: recipeId, step_index: stepIndex, voice }),
    signal,
    cache: 'no-store',
  });
  const data = await readResponse<{ audio_base64?: string; mime_type?: string }>(response);
  if (data.mime_type !== 'audio/mpeg' || !data.audio_base64
    || data.audio_base64.length > 1_900_000 || !/^[A-Za-z0-9+/=]+$/.test(data.audio_base64)) {
    throw new Error('Ses dosyası doğrulanamadı.');
  }
  return data.audio_base64;
}
