import { useWindowDimensions } from 'react-native';

export type DeviceType = 'phone' | 'tablet-small' | 'tablet-large' | 'tablet-xl';

export interface ResponsiveValues {
  deviceType: DeviceType;
  isTablet: boolean;
  width: number;
  height: number;
  columns: number;
  horizontalPadding: number;
  cardWidth: number;
  fontScale: number;
  heroImageHeight: number;
  isLandscape: boolean;
}

function getDeviceType(width: number): DeviceType {
  if (width < 600) return 'phone';
  if (width < 900) return 'tablet-small';
  if (width < 1100) return 'tablet-large';
  return 'tablet-xl';
}

function getColumns(deviceType: DeviceType, isLandscape: boolean): number {
  switch (deviceType) {
    case 'phone':
      return isLandscape ? 2 : 1;
    case 'tablet-small':
      return isLandscape ? 3 : 2;
    case 'tablet-large':
      return isLandscape ? 3 : 2;
    case 'tablet-xl':
      return isLandscape ? 4 : 3;
  }
}

function getHorizontalPadding(deviceType: DeviceType): number {
  switch (deviceType) {
    case 'phone':
      return 16;
    case 'tablet-small':
      return 24;
    case 'tablet-large':
      return 32;
    case 'tablet-xl':
      return 40;
  }
}

function getFontScale(deviceType: DeviceType): number {
  switch (deviceType) {
    case 'phone':
      return 1;
    case 'tablet-small':
      return 1.1;
    case 'tablet-large':
      return 1.15;
    case 'tablet-xl':
      return 1.2;
  }
}

function getHeroImageHeight(deviceType: DeviceType): number {
  switch (deviceType) {
    case 'phone':
      return 280;
    case 'tablet-small':
      return 350;
    case 'tablet-large':
      return 400;
    case 'tablet-xl':
      return 450;
  }
}

const CARD_GAP = 10;

export function useResponsive(): ResponsiveValues {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const deviceType = getDeviceType(width);
  const isTablet = deviceType !== 'phone';
  const columns = getColumns(deviceType, isLandscape);
  const horizontalPadding = getHorizontalPadding(deviceType);
  const fontScale = getFontScale(deviceType);
  const heroImageHeight = getHeroImageHeight(deviceType);

  const totalGap = CARD_GAP * (columns - 1);
  const cardWidth = (width - horizontalPadding * 2 - totalGap) / columns;

  return {
    deviceType,
    isTablet,
    width,
    height,
    columns,
    horizontalPadding,
    cardWidth,
    fontScale,
    heroImageHeight,
    isLandscape,
  };
}
