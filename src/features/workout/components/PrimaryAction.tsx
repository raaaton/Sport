import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppText } from '@/shared/ui/AppText';
import { AppSymbol } from '@/shared/ui/AppSymbol';

type PrimaryActionProps = { title: string; onPress: () => void; disabled?: boolean; busy?: boolean };

export function PrimaryAction({ title, onPress, disabled = false, busy = false }: PrimaryActionProps) {
  const palette = colors[useColorScheme()];
  return (
    <Pressable accessibilityRole="button" disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: palette.accent, opacity: disabled ? 0.48 : pressed ? 0.82 : 1 }]}>
      <View style={styles.content}>
        <AppText variant="headline" style={styles.label}>{busy ? 'Enregistrement…' : title}</AppText>
        {!busy ? <AppSymbol name="checkmark" color="#FFFFFF" size={19} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 58, borderRadius: radii.medium, justifyContent: 'center', paddingHorizontal: spacing.lg },
  content: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  label: { color: '#FFFFFF' },
});
