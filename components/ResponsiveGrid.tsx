import React, { useMemo } from 'react';
import { FlatList, FlatListProps, View } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

interface ResponsiveGridProps<T> extends Omit<FlatListProps<T>, 'numColumns'> {
  gap?: number;
  /** Minimum columns (e.g. 2 for a phone recipe grid); tablets may use more. */
  minColumns?: number;
}

export default function ResponsiveGrid<T>({ gap = 10, minColumns = 1, contentContainerStyle, ...props }: ResponsiveGridProps<T>) {
  const responsive = useResponsive();
  const columns = Math.max(minColumns, responsive.columns);
  const { horizontalPadding } = responsive;

  const ItemSeparator = useMemo(
    () => () => <View style={{ height: gap }} />,
    [gap]
  );

  return (
    <FlatList
      {...props}
      key={`grid-${columns}`}
      numColumns={columns}
      contentContainerStyle={[
        { paddingHorizontal: horizontalPadding, paddingVertical: 16 },
        contentContainerStyle,
      ]}
      columnWrapperStyle={columns > 1 ? { gap } : undefined}
      ItemSeparatorComponent={ItemSeparator}
    />
  );
}
