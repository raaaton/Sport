import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppText } from './AppText';
import { NativeTimePicker } from './NativeTimePicker';

type TimePickerSheetProps = {
  visible: boolean;
  title: string;
  initialTimeMinutes: number | null;
  onCancel: () => void;
  onSave: (timeMinutes: number) => void;
};

function dateForTime(timeMinutes: number | null): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  if (timeMinutes !== null) date.setHours(Math.floor(timeMinutes / 60), timeMinutes % 60, 0, 0);
  return date;
}

function TimePickerSheetBody({ title, initialTimeMinutes, onCancel, onSave }: Omit<TimePickerSheetProps, 'visible'>) {
  const palette = colors[useColorScheme()];
  const [selection, setSelection] = useState(() => dateForTime(initialTimeMinutes));
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.sheet, { backgroundColor: palette.background }]}>
      <View style={[styles.header, { borderBottomColor: palette.separator }]}>
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={10}>
          <AppText style={{ color: palette.accent }}>Annuler</AppText>
        </Pressable>
        <AppText variant="headline">{title}</AppText>
        <Pressable accessibilityRole="button" onPress={() => onSave(selection.getHours() * 60 + selection.getMinutes())} hitSlop={10}>
          <AppText style={{ color: palette.accent }}>Enregistrer</AppText>
        </Pressable>
      </View>
      <View style={[styles.picker, { backgroundColor: palette.groupedBackground }]}>
        <NativeTimePicker key={title} selection={selection} title={title} onChange={setSelection} />
      </View>
    </SafeAreaView>
  );
}

export function TimePickerSheet({ visible, title, initialTimeMinutes, onCancel, onSave }: TimePickerSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet" visible={visible}>
      {visible ? <TimePickerSheetBody
        key={`${initialTimeMinutes ?? 'unset'}:${title}`}
        title={title}
        initialTimeMinutes={initialTimeMinutes}
        onCancel={onCancel}
        onSave={onSave}
      /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  header: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  picker: { margin: spacing.lg, borderRadius: radii.medium, overflow: 'hidden' },
});
