import type { ImagePickerAsset } from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

const UPLOAD_URL = 'https://api.tariften.com/wp-json/tariften/v1/recipes/image/upload';
const MAX_UPLOAD = 8 * 1024 * 1024;

/** Compress to JPG, including iOS HEIC images. Do not upload unsupported formats. */
export async function prepareManualRecipePhoto(asset: ImagePickerAsset): Promise<{ uri: string; name: string; mimeType: string }> {
  if (!asset?.uri) throw new Error('Bir görsel seçmelisin.');
  const output = await ImageManipulator.manipulateAsync(asset.uri, [], {
    compress: 0.82,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  if (!output?.uri) throw new Error('Fotoğraf hazırlanamadı.');
  return { uri: output.uri, name: `tariften-recipe-${Date.now()}.jpg`, mimeType: 'image/jpeg' };
}

export async function uploadManualRecipePhoto(
  token: string,
  photo: { uri: string; name: string; mimeType: string },
): Promise<{ id: number; url: string }> {
  if (!token || !photo.uri || photo.mimeType !== 'image/jpeg' || !/^tariften-recipe-[0-9]+\.jpg$/.test(photo.name)) {
    throw new Error('Görsel hazırlığı doğrulanamadı.');
  }
  const body = new FormData();
  body.append('file', { uri: photo.uri, name: photo.name, type: photo.mimeType } as unknown as Blob);
  let response: Response;
  try {
    response = await fetch(UPLOAD_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body,
    });
  } catch {
    throw new Error('Fotoğraf gönderilemedi. Bağlantını kontrol et; tekrar yüklemeden önce görselini kontrol et.');
  }
  const data: unknown = await response.json().catch(() => null);
  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  if (!response.ok || result.success !== true || !Number.isSafeInteger(result.id) || Number(result.id) < 1) {
    throw new Error(typeof result.message === 'string' && result.message.length < 220
      ? result.message : response.status === 413 ? 'Görselin boyutu 8 MB\'ı geçemez.' : 'Görsel yüklenemedi.');
  }
  return { id: Number(result.id), url: typeof result.url === 'string' ? result.url : '' };
}
