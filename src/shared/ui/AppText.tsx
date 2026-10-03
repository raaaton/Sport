import { Text, type TextProps } from 'react-native';

import { colors, typography } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';

type TextVariant = keyof typeof typography;

type AppTextProps = TextProps & {
  colorRole?: keyof (typeof colors)['light'];
  variant?: TextVariant;
};

export function AppText({ colorRole = 'primary', style, variant = 'body', ...props }: AppTextProps) {
  const colorScheme = useColorScheme();

  return (
    <Text {...props} style={[typography[variant], { color: colors[colorScheme][colorRole] }, style]} />
  );
}
