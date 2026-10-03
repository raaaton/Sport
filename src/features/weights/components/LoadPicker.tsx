import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { selectionHaptic } from '@/shared/haptics';
import { formatLoad, formatLoadComposition, type AvailableLoad } from '../domain/weightSystem';

type Props = {
  loads: AvailableLoad[];
  selectedGrams: number;
  onSelect: (load: AvailableLoad) => void;
  disabled?: boolean;
};

export function LoadPicker({ loads, selectedGrams, onSelect, disabled = false }: Props) {
  const palette = colors[useColorScheme()];
  const [presented, setPresented] = useState(false);
  const selected = loads.find((load) => load.addedWeightGrams === selectedGrams) ?? loads[0];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Lest, ${formatLoad(selected?.addedWeightGrams ?? 0)}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setPresented(true)}
        style={({ pressed }) => [styles.field, { borderBottomColor: palette.separator, opacity: disabled ? 0.5 : pressed ? 0.65 : 1 }]}
      >
        <View>
          <AppText variant="footnote" colorRole="secondary">Lest</AppText>
          <AppText variant="body">{formatLoad(selected?.addedWeightGrams ?? 0)}</AppText>
        </View>
        <AppSymbol name="chevron.up.chevron.down" size={16} color={palette.secondary} />
      </Pressable>
      <Modal visible={presented} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPresented(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={[styles.sheet, { backgroundColor: palette.background }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: palette.separator }]}>
            <Pressable accessibilityRole="button" onPress={() => setPresented(false)} hitSlop={12}>
              <AppText style={{ color: palette.accent }}>Fermer</AppText>
            </Pressable>
            <AppText variant="headline">Choisir le lest</AppText>
            <View style={styles.headerBalance} />
          </View>
          <FlatList
            data={loads}
            keyExtractor={(item) => String(item.addedWeightGrams)}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => {
              const chosen = item.addedWeightGrams === selectedGrams;
              const composition = formatLoadComposition(item.composition);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen }}
                  onPress={() => { onSelect(item); void selectionHaptic().catch(() => undefined); setPresented(false); }}
                  style={({ pressed }) => [styles.option, { borderBottomColor: palette.separator, opacity: pressed ? 0.55 : 1 }]}
                >
                  <View style={styles.optionCopy}>
                    <AppText variant="body">{formatLoad(item.addedWeightGrams)}</AppText>
                    {composition ? <AppText variant="footnote" colorRole="secondary">{composition}</AppText> : null}
                  </View>
                  {chosen ? <AppSymbol name="checkmark" size={18} color={palette.accent} /> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 56, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheet: { flex: 1, paddingBottom: spacing.lg },
  sheetHeader: { minHeight: 56, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBalance: { width: 48 },
  list: { paddingHorizontal: spacing.lg },
  option: { minHeight: 62, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  optionCopy: { flex: 1, gap: 2 },
});
