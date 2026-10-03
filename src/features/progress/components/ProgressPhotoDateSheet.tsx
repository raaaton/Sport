import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { NativeDatePicker } from '@/shared/ui/NativeDatePicker';
import { colors, radii, spacing } from '@/shared/theme/tokens';

type ColorSchemeName = 'light' | 'dark';

type Props = {
  visible: boolean;
  date: Date;
  busy: boolean;
  colorScheme: ColorSchemeName;
  topInset: number;
  onDateChange: (date: Date) => void;
  onCancel: () => void;
  onLibrary: () => void;
  onCamera: () => void;
};

export function ProgressPhotoDateSheet({ visible, date, busy, colorScheme, topInset, onDateChange, onCancel, onLibrary, onCamera }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={[styles.sheet, { backgroundColor: colors[colorScheme].background, paddingTop: Math.max(spacing.md, topInset) }]}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onCancel}><AppText colorRole="accent" variant="body">Annuler</AppText></Pressable>
          <AppText variant="headline">Ajouter une photo</AppText>
          <View style={{ width: 55 }} />
        </View>
        <AppText colorRole="secondary" style={styles.sheetLabel} variant="subheadline">Date de progression</AppText>
        <NativeDatePicker selection={date} title="Date de progression" onChange={onDateChange} />
        <View style={styles.sheetActions}>
          <Pressable disabled={busy} onPress={onLibrary} style={[styles.actionRow, { backgroundColor: colors[colorScheme].groupedBackground }, busy && styles.disabled]}>
            {busy ? <ActivityIndicator /> : <AppSymbol name="photo" color={colors[colorScheme].accent} size={20} />}
            <AppText variant="body">Choisir dans Photos</AppText>
          </Pressable>
          <Pressable disabled={busy} onPress={onCamera} style={[styles.actionRow, { backgroundColor: colors[colorScheme].groupedBackground }, busy && styles.disabled]}>
            <AppSymbol name="camera" color={colors[colorScheme].accent} size={20} /><AppText variant="body">Prendre une photo</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  sheetLabel: { marginTop: spacing.lg, marginBottom: spacing.xs },
  sheetActions: { marginTop: spacing.lg, gap: spacing.sm },
  actionRow: { minHeight: 54, borderRadius: radii.medium, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  disabled: { opacity: 0.55 },
});
