import { StyleSheet, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppText } from '@/shared/ui/AppText';
import { useCaptureDynamicScrollOffset } from '@/shared/ui/DynamicScrollView';

type NumericFieldProps = { label: string; value: string; onChangeText: (value: string) => void; onFocus?: () => void; placeholder?: string; suffix?: string; decimal?: boolean; error?: string | null };

export function NumericField({ label, value, onChangeText, onFocus, placeholder, suffix, decimal = false, error }: NumericFieldProps) {
  const captureScrollOffset = useCaptureDynamicScrollOffset();
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme];
  return (
    <View style={styles.field}>
      <AppText variant="subheadline" colorRole="secondary">{label}</AppText>
      <View style={[styles.inputRow, { backgroundColor: palette.groupedBackground, borderColor: error ? palette.destructive : palette.separator }]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          onFocus={() => { captureScrollOffset(); onFocus?.(); }}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={palette.tertiary}
          returnKeyType="done"
          selectTextOnFocus
          style={[styles.input, { color: palette.primary }]}
          value={value}
        />
        {suffix ? <AppText colorRole="secondary">{suffix}</AppText> : null}
      </View>
      {error ? <AppText variant="footnote" colorRole="destructive">{error}</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  inputRow: { minHeight: 54, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.medium, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: { flex: 1, fontSize: 22, fontWeight: '600', paddingVertical: spacing.sm, minWidth: 0 },
});
