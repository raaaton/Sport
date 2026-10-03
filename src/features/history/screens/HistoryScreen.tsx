import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getDatabase } from '@/shared/database';
import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppText } from '@/shared/ui/AppText';
import { getCompletedWorkouts } from '@/features/workout/data/workoutRepository';
import type { WorkoutSession } from '@/features/workout/domain/models';

export function HistoryScreen() {
  const palette = colors[useColorScheme()];
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useCallback(async () => {
    try { setSessions(await getCompletedWorkouts(await getDatabase())); setError(false); }
    catch { setError(true); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  return (
    <AppScreen safeAreaEdges={['top']}>
      <View style={styles.content}>
        <AppText variant="largeTitle">Historique</AppText>
        <AppText colorRole="secondary">Vos séances terminées</AppText>
        {loading ? <ActivityIndicator style={styles.loading} /> : error ? <AppText colorRole="destructive">L’historique local n’a pas pu être chargé.</AppText> : sessions.length === 0 ? <AppText colorRole="secondary" style={styles.empty}>Les séances terminées apparaîtront ici.</AppText> : sessions.map((session) => (
          <View key={session.id} style={styles.session}>
            <View style={styles.header}>
              <AppText variant="headline">{session.workoutType}</AppText>
              <AppText variant="footnote" colorRole="secondary">{new Date(`${session.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}</AppText>
            </View>
            {session.exercises.map((exercise) => (
              <View key={exercise.id} style={[styles.exercise, { borderBottomColor: palette.separator }]}>
                <View style={styles.header}>
                  <AppText>{exercise.exercise.name}</AppText>
                  <AppText variant="footnote" colorRole="secondary">{exercise.feeling ?? '—'}/10</AppText>
                </View>
                <AppText variant="footnote" colorRole="secondary">{exercise.sets.map((set) => exercise.exercise.trackingType === 'reps' ? `${set.reps} reps${set.addedWeight ? ` · +${set.addedWeight} kg` : ''}` : `${set.durationSeconds} s`).join('   ·   ')}</AppText>
              </View>
            ))}
          </View>
        ))}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.sm }, loading: { marginTop: spacing.xl }, empty: { marginTop: spacing.xl }, session: { marginTop: spacing.lg }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, exercise: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.md, gap: spacing.xs }, });
