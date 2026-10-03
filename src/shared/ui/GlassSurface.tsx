import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useMemo, type PropsWithChildren } from 'react';
import { Platform, View, type ViewProps } from 'react-native';

import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';

type GlassSurfaceProps = PropsWithChildren<Pick<ViewProps, 'style'>> & {
  interactive?: boolean;
};

export function GlassSurface({ children, interactive = false, style }: GlassSurfaceProps) {
  const colorScheme = useColorScheme();
  const canUseLiquidGlass = useMemo(
    () => Platform.OS === 'ios' && isLiquidGlassAvailable(),
    [],
  );
  const surfaceStyle = [
    { overflow: 'hidden' as const, padding: spacing.md, borderRadius: radii.large },
    style,
  ];

  if (canUseLiquidGlass) {
    return (
      <GlassView
        colorScheme={colorScheme}
        glassEffectStyle="regular"
        isInteractive={interactive}
        style={surfaceStyle}
      >
        {children}
      </GlassView>
    );
  }

  return (
    <View style={[surfaceStyle, { backgroundColor: colors[colorScheme].groupedBackground }]}>
      {children}
    </View>
  );
}
