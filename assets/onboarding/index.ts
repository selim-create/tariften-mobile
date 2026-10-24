import type { ImageSourcePropType } from 'react-native';

/**
 * The real food photo behind the onboarding demo (the "video" in the phone
 * mock and the finished sample recipe card).
 *
 * Not supplied yet, so this is null and the demo shows its warm brand
 * gradient + illustrated plate instead (never a broken image).
 *
 * To enable the photo:
 *   1. Add a vertical photo (about 1080×1920, JPEG) at
 *      assets/onboarding/demo-recipe.jpg
 *   2. Replace the `null` below with the one require line:
 *        export const demoRecipeImage: ImageSourcePropType | null = require('./demo-recipe.jpg');
 *
 * A require of a file that does not exist breaks the bundle, which is why the
 * line stays out until the file is in the repo.
 */
export const demoRecipeImage: ImageSourcePropType | null = null;
