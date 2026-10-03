import { Alert, Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { spacing } from '@/shared/theme/tokens';
import { StatusBar } from 'expo-status-bar';
import type { ProgressPhoto } from '../domain/vaultModels';
import type { PhotoPreview } from '../services/progressVaultService';
import { formatProgressPhotoDate } from './progressPhotoDates';

type Props = {
  preview: PhotoPreview | null;
  visible: boolean;
  topInset: number;
  bottomInset: number;
  onClose: () => void;
  onExport: (photo: ProgressPhoto) => void;
  onDelete: (photo: ProgressPhoto) => void;
};

export function ProgressPhotoViewer({ preview, visible, topInset, bottomInset, onClose, onExport, onDelete }: Props) {
  const showActions = (photo: ProgressPhoto) => Alert.alert('Photo du coffre', undefined, [
    { text: 'Enregistrer dans Photos', onPress: () => onExport(photo) },
    { text: 'Supprimer', style: 'destructive', onPress: () => onDelete(photo) },
    { text: 'Annuler', style: 'cancel' },
  ]);

  return (
    <Modal visible={visible && preview !== null} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      {preview ? (
        <View style={[styles.viewer, { paddingTop: topInset, paddingBottom: bottomInset }]}>
          <StatusBar style="light" />
          <View style={styles.viewerHeader}>
            <Pressable accessibilityLabel="Fermer la photo" onPress={onClose} hitSlop={10}><AppSymbol name="xmark" color="#fff" size={22} /></Pressable>
            <AppText style={styles.viewerDate} variant="subheadline">{formatProgressPhotoDate(preview.photo.date)}</AppText>
            <Pressable accessibilityLabel="Actions de la photo" onPress={() => showActions(preview.photo)} hitSlop={10}><AppSymbol name="ellipsis" color="#fff" size={22} /></Pressable>
          </View>
          <Image source={{ uri: preview.uri }} resizeMode="contain" style={styles.fullImage} />
        </View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  viewer: { flex: 1, paddingHorizontal: spacing.md, backgroundColor: '#000' },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 },
  viewerDate: { color: '#fff' },
  fullImage: { flex: 1, width: '100%' },
});
