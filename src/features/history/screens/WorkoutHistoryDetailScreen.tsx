import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { getDatabase } from '@/shared/database';
import { impactHaptic } from '@/shared/haptics';
import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { deleteCompletedWorkout } from '../data/historyRepository';
import { formatHistoryDate, formatLoads } from '../domain/historyPresentation';
import type { WorkoutExercise, WorkoutSession } from '@/features/workout/domain/models';
import { getWorkout } from '@/features/workout/data/workoutRepository';
import { formatLoadComposition } from '@/features/weights/domain/weightSystem';

type Props = { workoutId: string };

function ExerciseHistoryDetail({ exercise, last }: { exercise: WorkoutExercise; last: boolean }) {
  const palette = colors[useColorScheme()];
  return (
    <View style={[styles.exercise, !last && { borderBottomColor: palette.separator }]}>
      <AppText variant="headline">{exercise.exercise.name}</AppText>
      <View style={styles.setList}>
        {exercise.sets.map((set) => (
          <View key={set.id} style={styles.setRow}>
            <AppText variant="subheadline" colorRole="secondary">Série {set.setNumber}</AppText>
            <AppText variant="subheadline">
              {exercise.exercise.trackingType === 'reps' ? `${set.reps ?? '—'} reps` : `${set.durationSeconds ?? '—'} s`}
            </AppText>
          </View>
        ))}
      </View>
      <View style={styles.measure}>
        <AppText variant="caption" colorRole="tertiary">Lest</AppText>
        <AppText variant="subheadline">{formatLoads(exercise)}</AppText>
      </View>
      {exercise.sets.some((set) => set.loadComposition?.length) ? (
        <View style={styles.measure}>
          <AppText variant="caption" colorRole="tertiary">Composition enregistrée</AppText>
          {exercise.sets.map((set) => {
            const composition = formatLoadComposition(set.loadComposition);
            return composition ? <AppText key={set.id} variant="footnote" colorRole="secondary">Série {set.setNumber} · {composition}</AppText> : null;
          })}
        </View>
      ) : null}
      <View style={styles.measure}>
        <AppText variant="caption" colorRole="tertiary">Ressenti de l’exercice</AppText>
        <AppText variant="subheadline">{exercise.feeling === null ? '—' : `${exercise.feeling}/10`}</AppText>
      </View>
    </View>
  );
}

export function WorkoutHistoryDetailScreen({ workoutId }: Props) {
  const palette = colors[useColorScheme()];
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await getWorkout(await getDatabase(), workoutId);
      if (!result || result.status !== 'completed') throw new Error('Cette séance terminée est introuvable.');
      setSession(result);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La séance n’a pas pu être chargée.');
    } finally {
      setLoading(false);
    }
  }, [workoutId]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const confirmDelete = () => Alert.alert(
    'Supprimer cette séance ?',
    'La séance et toutes ses séries seront supprimées définitivement de cet appareil.',
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer la séance', style: 'destructive', onPress: () => { void remove(); } },
    ],
  );

  const remove = async () => {
    try {
      await deleteCompletedWorkout(await getDatabase(), workoutId);
      void impactHaptic().catch(() => undefined);
      router.replace('/(tabs)/history');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La séance n’a pas pu être supprimée.');
    }
  };

  return (
    <AppScreen>
      <View style={styles.content}>
        {loading ? <ActivityIndicator style={styles.loading} /> : session ? (
          <>
            <View style={styles.heading}>
              <AppText variant="largeTitle">{formatHistoryDate(session.date, { day: 'numeric', month: 'long' })}</AppText>
              <AppText variant="title">{session.workoutType}</AppText>
              <AppText colorRole="secondary">{formatHistoryDate(session.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</AppText>
            </View>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/workout-history/[workoutId]/edit', params: { workoutId } })}
                style={styles.action}
              >
                <AppSymbol name="pencil" color={palette.accent} size={16} />
                <AppText variant="subheadline">Modifier</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={confirmDelete} style={styles.action}>
                <AppSymbol name="trash" color={palette.destructive} size={16} />
                <AppText variant="subheadline" colorRole="destructive">Supprimer la séance</AppText>
              </Pressable>
            </View>
            <View style={styles.exercises}>
              {session.exercises.map((exercise, index) => (
                <ExerciseHistoryDetail key={exercise.id} exercise={exercise} last={index === session.exercises.length - 1} />
              ))}
            </View>
          </>
        ) : null}
        {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  loading: { marginTop: spacing.xl },
  heading: { gap: spacing.xxs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingVertical: spacing.xs },
  action: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  exercises: { marginTop: spacing.xs },
  exercise: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.md },
  setList: { gap: spacing.sm },
  setRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  measure: { gap: 2 },
});
