import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Platform, Text, View } from 'react-native';

import { colors } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';

type AppSymbolProps = {
  name: SFSymbol;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
};

export function AppSymbol({ name, size = 24, color, accessibilityLabel }: AppSymbolProps) {
  const colorScheme = useColorScheme();
  const tintColor = color ?? colors[colorScheme].primary;

  if (Platform.OS === 'web') {
    return (
      <View accessibilityLabel={accessibilityLabel} accessibilityRole="image">
        <Text style={{ color: tintColor, fontSize: size }} aria-hidden>
          •
        </Text>
      </View>
    );
  }

  return (
    <SymbolView
      accessibilityLabel={accessibilityLabel}
      name={name}
      size={size}
      tintColor={tintColor}
      weight="medium"
    />
  );
}
