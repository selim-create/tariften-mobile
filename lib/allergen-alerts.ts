/**
 * Native alerts for the allergen answers of POST /ai/generate. The copy is
 * built in lib/allergen-ui.ts (pure, tested); this file only shows it.
 */
import { Alert } from 'react-native';
import {
  AIAllergenConflictError, ALLERGEN_BAND_LINK, ALLERGEN_WARNING_TITLE, allergenConflictCopy,
} from './allergen-ui';

/**
 * iOS presents an Alert from the top-most view controller. If that is a
 * loading <Modal> that closes a moment later, the alert disappears with it,
 * so screens close the modal first and wait this long.
 */
export const MODAL_DISMISS_DELAY_MS = 320;
export const afterModalDismiss = () => new Promise<void>(resolve => setTimeout(resolve, MODAL_DISMISS_DELAY_MS));

/** The recipe was refused: Core's message, the conflicting ingredients and a way to the kitchen profile. */
export function showAllergenConflict(error: AIAllergenConflictError, openKitchenProfile: () => void) {
  const { title, message } = allergenConflictCopy(error);
  Alert.alert(title, message, [
    { text: 'Tamam', style: 'cancel' },
    { text: ALLERGEN_BAND_LINK, onPress: openKitchenProfile },
  ]);
}

/** Shown before saving a recipe that carries allergen_warning. Resolves true only on an explicit yes. */
export function confirmAllergenWarning(warning: string, confirmLabel: string): Promise<boolean> {
  return new Promise(resolve => {
    Alert.alert(ALLERGEN_WARNING_TITLE, warning, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
