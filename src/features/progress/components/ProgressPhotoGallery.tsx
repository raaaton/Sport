import { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import type { ProgressPhoto } from '../domain/vaultModels';
import { formatProgressPhotoMonth } from './progressPhotoDates';

type Props = {
  photos: ProgressPhoto[];
  thumbnails: Record<string, string>;
  busy: boolean;
  onSelect: (photo: ProgressPhoto) => void;
};

export function ProgressPhotoGallery({ photos, thumbnails, busy, onSelect }: Props) {
  const colorScheme = useColorScheme();
  const groups = useMemo(() => {
    const items: { title: string; photos: ProgressPhoto[] }[] = [];
    for (const photo of photos) {
      const title = formatProgressPhotoMonth(photo.date);
      let group = items.find((item) => item.title === title);
      if (!group) { group = { title, photos: [] }; items.push(group); }
      group.photos.push(photo);
    }
    return items;
  }, [photos]);

  if (photos.length === 0) {
    return (
      <View style={styles.empty}>
        <AppSymbol name="photo" size={28} color={colors[colorScheme].tertiary} />
        <AppText colorRole="secondary" style={styles.emptyText} variant="subheadline">Tes photos de progression apparaîtront ici.</AppText>
      </View>
    );
  }

  return groups.map((group) => (
    <View key={group.title} style={styles.monthGroup}>
      <AppText style={styles.monthTitle} variant="headline">{group.title}</AppText>
      <View style={styles.grid}>
        {group.photos.map((photo) => (
          <Pressable key={photo.id} accessibilityLabel={`Photo du ${new Date(`${photo.date}T12:00:00`).toLocaleDateString('fr-FR', { dateStyle: 'long' })}`} accessibilityRole="button" onPress={() => onSelect(photo)} style={styles.photoCell}>
            {thumbnails[photo.id] ? <Image source={{ uri: thumbnails[photo.id] }} style={styles.thumbnail} /> : <View style={[styles.thumbnail, styles.thumbnailPlaceholder]}>{busy ? <ActivityIndicator /> : <AppSymbol name="exclamationmark.triangle" size={18} color="#fff" />}</View>}
            <AppText colorRole="secondary" style={styles.photoDate} variant="caption">{new Date(`${photo.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric' })}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  ));
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xxl },
  emptyText: { textAlign: 'center' },
  monthGroup: { marginTop: spacing.xl },
  monthTitle: { textTransform: 'capitalize', marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  photoCell: { width: '31.5%', marginBottom: spacing.xs },
  thumbnail: { width: '100%', aspectRatio: 0.78, borderRadius: radii.small, backgroundColor: '#111' },
  thumbnailPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  photoDate: { marginTop: spacing.xxs },
});
