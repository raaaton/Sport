import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';

type FeaturePlaceholderProps = {
  message: string;
  symbol: Parameters<typeof AppSymbol>[0]['name'];
  title: string;
};

export function FeaturePlaceholder({ message, symbol, title }: FeaturePlaceholderProps) {
  const colorScheme = useColorScheme();

  return (
    <AppScreen>
      <AppText variant="largeTitle">{title}</AppText>
      <View style={styles.placeholder}>
        <AppSymbol
          accessibilityLabel={title}
          color={colors[colorScheme].secondary}
          name={symbol}
          size={32}
        />
        <AppText colorRole="secondary" style={styles.message} variant="callout">
          {message}
        </AppText>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
    gap: spacing.md,
  },
  message: {
    maxWidth: 320,
    textAlign: 'center',
  },
});
