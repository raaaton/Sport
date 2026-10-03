import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppText } from '@/shared/ui/AppText';
import type { WorkoutExercise } from '../domain/models';
import { formatRecordedLoad } from '@/features/weights/domain/weightSystem';
import type { ProgressionAssessment } from '../domain/progressionEngine';

function summarize(exercise: WorkoutExercise): string {
  return exercise.sets.map((set) => {
    const load = formatRecordedLoad(set.addedWeight, set.addedWeightGrams).toLocaleLowerCase('fr-FR');
    if (set.reps !== null) return `${set.reps} reps · ${load}`;
    return `${set.durationSeconds ?? 0} s · ${load}`;
  }).join('   ·   ');
}

export function WorkoutExerciseResultRow({ exercise, last = false, progression }: { exercise: WorkoutExercise; last?: boolean; progression?: ProgressionAssessment }) {
  const palette = colors[useColorScheme()];
  return (
    <View style={[styles.row, !last && { borderBottomColor: palette.separator }]}>
      <View style={styles.heading}>
        <AppText variant="headline">{exercise.exercise.name}</AppText>
        {exercise.feeling !== null ? <AppText variant="footnote" colorRole="secondary">{exercise.feeling}/10</AppText> : null}
      </View>
      <AppText variant="footnote" colorRole="secondary">{summarize(exercise)}</AppText>
      {progression?.status === 'increase_load_recommended' ? <AppText variant="caption">↑ Augmentation du lest recommandée pour la prochaine séance</AppText> : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, });
