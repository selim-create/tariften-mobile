import React, { useMemo } from 'react';
import { FlatList, FlatListProps, View } from 'react-native';
import { useResponsive } from '../hooks/useResponsive';

interface ResponsiveGridProps<T> extends Omit<FlatListProps<T>, 'numColumns'> {
  gap?: number;
}

export default function ResponsiveGrid<T>({ gap = 10, contentContainerStyle, ...props }: ResponsiveGridProps<T>) {
  const { columns, horizontalPadding } = useResponsive();

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
