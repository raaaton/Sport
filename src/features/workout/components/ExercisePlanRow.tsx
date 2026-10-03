import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import type { Exercise, PreviousPerformance } from '../domain/models';
import type { ProgressionAssessment } from '../domain/progressionEngine';

function objective(exercise: Exercise): string {
  if (exercise.trackingType === 'duration') {
    return `${exercise.targetSets} × ${exercise.targetDurationSeconds ? `${exercise.targetDurationSeconds} s` : 'durée libre'}`;
  }
  return `${exercise.targetSets} × ${exercise.targetRepMin}–${exercise.targetRepMax}`;
}

function previousSummary(performance: PreviousPerformance): string {
  if (performance.sets.length === 0) return '';
  const values = performance.sets.map((set) => set.reps ?? set.durationSeconds ?? 0);
  const timeBased = performance.sets[0].durationSeconds !== null;
  const first = values[0];
  const sets = values.every((value) => value === first)
    ? `${values.length} × ${first}${timeBased ? ' s' : ''}`
    : values.map((value) => `${value}${timeBased ? ' s' : ''}`).join(' · ');
  const weights = performance.sets.map((set) => set.addedWeight);
  const load = weights.every((weight) => weight === weights[0])
    ? weights[0] === null || weights[0] === 0 ? 'poids du corps' : `+${weights[0]} kg`
    : weights.map((weight) => weight && weight > 0 ? `+${weight} kg` : 'poids du corps').join(' / ');
  return `${sets} · ${load}${performance.feeling === null ? '' : ` · ${performance.feeling}/10`}`;
}

type Props = { exercise: Exercise; previous?: PreviousPerformance | null; progression?: ProgressionAssessment; last?: boolean };

export function ExercisePlanRow({ exercise, previous, progression, last = false }: Props) {
  const palette = colors[useColorScheme()];
  return (
    <View style={[styles.row, !last && { borderBottomColor: palette.separator }]}>
      <AppText variant="headline">{exercise.name}</AppText>
      <AppText variant="subheadline" colorRole="secondary">{objective(exercise)}</AppText>
      {exercise.targetAddedWeight !== null ? <AppText variant="subheadline">{exercise.targetAddedWeight === 0 ? 'Poids du corps' : `Objectif : +${exercise.targetAddedWeight} kg`}</AppText> : null}
      {progression?.status === 'increase_load_recommended' && exercise.targetAddedWeight === null ? <AppText variant="subheadline">Objectif : augmenter le lest</AppText> : null}
      {progression?.status === 'increase_load_recommended' ? (
        <View style={styles.recommendation}>
          <View style={styles.recommendationHeading}><AppSymbol name="arrow.up" size={13} color={palette.accent} /><AppText variant="footnote">Augmentation du lest recommandée</AppText></View>
          <AppText variant="caption" colorRole="tertiary">La charge exacte dépendra du matériel disponible.</AppText>
        </View>
      ) : null}
      {previous ? <View style={styles.previous}><AppText variant="caption" colorRole="tertiary">Dernière fois</AppText><AppText variant="footnote" colorRole="secondary">{previousSummary(previous)}</AppText></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({ row: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xxs }, previous: { paddingTop: spacing.xs, gap: 2 }, recommendation: { paddingTop: spacing.xxs, gap: 1 }, recommendationHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }, });
