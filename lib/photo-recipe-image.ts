/**
 * Device side of Fotoğraftan / Defterden tarif: take or pick photos and
 * downscale them before upload (long edge ≤2000 px, JPEG 0.8). HEIC becomes
 * JPEG here. Core re-encodes again and strips EXIF/GPS; nothing is kept.
 */
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { PHOTO_JPEG_QUALITY, downscaleAction } from './photo-recipe';
import type { PreparedPhoto } from './photo-recipe-api';

export type LocalPhoto = { key: string; uri: string; width: number; height: number };

let counter = 0;
const toLocal = (asset: ImagePicker.ImagePickerAsset): LocalPhoto => ({
  key: `p${Date.now()}-${counter++}`, uri: asset.uri, width: asset.width || 0, height: asset.height || 0,
});

/** Returns null when the member cancels. Throws a Turkish message when the camera is not allowed. */
export async function takePhoto(): Promise<LocalPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Fotoğraf çekmek için kamera izni gerekiyor. Ayarlar\'dan Tariften\'e kamera izni verebilir ya da galeriden seçebilirsin.');
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false, allowsEditing: false });
  if (result.canceled || !result.assets?.length) return null;
  return toLocal(result.assets[0]);
}

/** System photo picker (no library permission needed). Keeps the member's selection order. */
export async function pickPhotos(limit: number): Promise<LocalPhoto[]> {
  if (limit < 1) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.slice(0, limit).map(toLocal);
}

/** Downscale + JPEG for upload. */
export async function preparePhoto(photo: LocalPhoto, index: number): Promise<PreparedPhoto> {
  const action = downscaleAction(photo.width, photo.height);
  const output = await ImageManipulator.manipulateAsync(photo.uri, action ? [action] : [], {
    compress: PHOTO_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  // A ≤2000 px JPEG at 0.8 stays far below Core's 8 MB per-file limit.
  if (!output?.uri) throw new Error('Fotoğraf hazırlanamadı. Başka bir fotoğraf dene.');
  return { uri: output.uri, name: `tariften-photo-${index + 1}.jpg`, type: 'image/jpeg' };
}
