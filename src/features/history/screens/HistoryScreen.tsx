import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getDatabase } from '@/shared/database';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { getHistoryExerciseCatalog, getHistoryWorkouts, filterWorkoutsByExercise } from '../data/historyRepository';
import { formatHistoryDate, formatLoads, formatSetValues } from '../domain/historyPresentation';
import type { Exercise, WorkoutSession } from '@/features/workout/domain/models';

type HistoryMode = 'sessions' | 'exercises';

export function HistoryScreen() {
  const palette = colors[useColorScheme()];
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [mode, setMode] = useState<HistoryMode>('sessions');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const db = await getDatabase();
      const [workouts, catalog] = await Promise.all([getHistoryWorkouts(db), getHistoryExerciseCatalog(db)]);
      setSessions(workouts);
      setExercises(catalog);
      setSelectedExerciseId((selected) => selected && catalog.some((exercise) => exercise.id === selected) ? selected : catalog[0]?.id ?? null);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) ?? null;
  const exerciseSessions = useMemo(
    () => selectedExerciseId ? filterWorkoutsByExercise(sessions, selectedExerciseId) : [],
    [sessions, selectedExerciseId],
  );

  return (
    <AppScreen safeAreaEdges={['top']}>
      <View style={styles.content}>
        <View style={styles.title}>
          <AppText variant="largeTitle">Historique</AppText>
          <AppText colorRole="secondary">Séances et performances</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/workout-history/new')}
          hitSlop={8}
          style={styles.addButton}
        >
          <AppSymbol name="plus" color={palette.accent} size={17} />
          <AppText variant="subheadline" style={{ color: palette.accent }}>Ajouter une séance</AppText>
        </Pressable>

        <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: palette.separator }]}>
          {(['sessions', 'exercises'] as const).map((item) => {
            const selected = mode === item;
            return (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => setMode(item)}
                style={[styles.segment, selected && { backgroundColor: palette.groupedBackground }]}
              >
                <AppText variant="subheadline" colorRole={selected ? 'primary' : 'secondary'}>
                  {item === 'sessions' ? 'Séances' : 'Exercices'}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        {mode === 'sessions' ? (
          <View style={styles.list}>
            {loading ? <ActivityIndicator style={styles.loading} /> : error ? (
              <AppText colorRole="destructive">L’historique local n’a pas pu être chargé.</AppText>
            ) : sessions.length === 0 ? (
              <AppText colorRole="secondary" style={styles.empty}>Les séances terminées apparaîtront ici.</AppText>
            ) : sessions.map((session, index) => (
              <Pressable
                key={session.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/workout-history/[workoutId]', params: { workoutId: session.id } })}
                style={[styles.session, index < sessions.length - 1 && { borderBottomColor: palette.separator }]}
              >
                <View style={styles.sessionHeading}>
                  <View style={styles.sessionText}>
                    <AppText variant="headline">{session.workoutType}</AppText>
                    <AppText variant="subheadline" colorRole="secondary">{formatHistoryDate(session.date, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</AppText>
                  </View>
                  <AppSymbol name="chevron.right" color={palette.tertiary} size={15} />
                </View>
                <View style={styles.exerciseNames}>
                  {session.exercises.map((item) => (
                    <AppText key={item.id} variant="footnote" colorRole="secondary">
                      {item.exercise.name} · {item.sets.length} séries
                    </AppText>
                  ))}
                </View>
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.exerciseHistory}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exercisePicker}>
              {exercises.map((exercise) => {
                const selected = exercise.id === selectedExerciseId;
                return (
                  <Pressable
                    key={exercise.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedExerciseId(exercise.id)}
                    style={[styles.exerciseOption, { borderColor: selected ? palette.accent : palette.separator, backgroundColor: selected ? palette.accent : 'transparent' }]}
                  >
                    <AppText variant="subheadline" style={selected ? styles.selectedExerciseText : undefined} colorRole={selected ? 'primary' : 'secondary'}>
                      {exercise.name}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
            {loading ? <ActivityIndicator style={styles.loading} /> : error ? (
              <AppText colorRole="destructive">Les performances n’ont pas pu être chargées.</AppText>
            ) : !selectedExercise ? (
              <AppText colorRole="secondary" style={styles.empty}>Aucun exercice disponible.</AppText>
            ) : exerciseSessions.length === 0 ? (
              <AppText colorRole="secondary" style={styles.empty}>Aucune performance enregistrée pour {selectedExercise.name}.</AppText>
            ) : (
              <View style={styles.list}>
                <AppText variant="title" style={styles.exerciseTitle}>{selectedExercise.name}</AppText>
                {exerciseSessions.map((session) => {
                  const performance = session.exercises.find((item) => item.exercise.id === selectedExercise.id);
                  if (!performance) return null;
                  return (
                    <Pressable
                      key={session.id}
                      accessibilityRole="button"
                      onPress={() => router.push({ pathname: '/workout-history/[workoutId]', params: { workoutId: session.id } })}
                      style={[styles.performance, { borderBottomColor: palette.separator }]}
                    >
                      <AppText variant="subheadline" colorRole="secondary">
                        {formatHistoryDate(session.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {session.workoutType}
                      </AppText>
                      <View style={styles.measure}>
                        <AppText variant="caption" colorRole="tertiary">{selectedExercise.trackingType === 'reps' ? 'Répétitions' : 'Durées'}</AppText>
                        <AppText variant="body">{formatSetValues(performance)}</AppText>
                      </View>
                      <View style={styles.measure}>
                        <AppText variant="caption" colorRole="tertiary">Lest</AppText>
                        <AppText variant="subheadline">{formatLoads(performance)}</AppText>
                      </View>
                      <View style={styles.measure}>
                        <AppText variant="caption" colorRole="tertiary">Ressenti</AppText>
                        <AppText variant="subheadline">{performance.feeling === null ? '—' : `${performance.feeling}/10`}</AppText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: spacing.md },
  title: { gap: spacing.xxs },
  addButton: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radii.medium, gap: 3 },
  segment: { flex: 1, minHeight: 34, borderRadius: radii.small, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 0 },
  loading: { marginTop: spacing.xl },
  empty: { marginTop: spacing.lg },
  session: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  sessionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  sessionText: { gap: spacing.xxs },
  exerciseNames: { gap: spacing.xxs },
  exerciseHistory: { flex: 1, gap: spacing.md },
  exercisePicker: { gap: spacing.xs, paddingVertical: spacing.xxs },
  exerciseOption: { minHeight: 36, justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.pill, paddingHorizontal: spacing.md },
  selectedExerciseText: { color: '#FFFFFF' },
  exerciseTitle: { marginTop: spacing.xs },
  performance: { paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  measure: { gap: 2 },
});
