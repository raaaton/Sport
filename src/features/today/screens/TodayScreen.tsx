import * as Crypto from 'expo-crypto';
import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { getDatabase } from '@/shared/database';
import { impactHaptic } from '@/shared/haptics';
import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { getActiveWorkout, getCompletedWorkoutForToday, getLastPerformance, getTodayPlan, restartTodayWorkout } from '@/features/workout/data/workoutRepository';
import type { PreviousPerformance, TodayPlan, WorkoutSession } from '@/features/workout/domain/models';
import { assessProgression } from '@/features/workout/domain/progressionEngine';
import { ExercisePlanRow } from '@/features/workout/components/ExercisePlanRow';
import { WorkoutExerciseResultRow } from '@/features/workout/components/WorkoutExerciseResultRow';

export function TodayScreen() {
  const palette = colors[useColorScheme()];
  const [plan, setPlan] = useState<TodayPlan>();
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [completedToday, setCompletedToday] = useState<WorkoutSession | null>(null);
  const [previous, setPrevious] = useState<Record<string, PreviousPerformance | null>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const [todaysPlan, activeWorkout, completed] = await Promise.all([
        getTodayPlan(db), getActiveWorkout(db), getCompletedWorkoutForToday(db),
      ]);
      setPlan(todaysPlan);
      setActive(activeWorkout);
      setCompletedToday(completed);
      if (!activeWorkout && !completed && todaysPlan) {
        const performances = await Promise.all(todaysPlan.exercises.map((exercise) => getLastPerformance(db, exercise.id)));
        setPrevious(Object.fromEntries(todaysPlan.exercises.map((exercise, index) => [exercise.id, performances[index]])));
      } else setPrevious({});
      setError(null);
    } catch {
      setError('Impossible de lire les données locales. Fermez puis relancez l’application.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const prepare = () => router.push('/workout/prepare');

  const pushWorkout = (workout: WorkoutSession) => {
    router.push({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id } } as unknown as Href);
  };

  const restart = async () => {
    setBusy(true); setError(null);
    try {
      const db = await getDatabase();
      const workout = await restartTodayWorkout(db, () => Crypto.randomUUID());
      void impactHaptic().catch(() => undefined);
      pushWorkout(workout);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La séance n’a pas pu être recommencée.');
    } finally {
      setBusy(false);
    }
  };

  const confirmRestart = () => Alert.alert(
    'Recommencer la séance du jour ?',
    'Une nouvelle séance sera créée. La séance terminée restera dans votre historique.',
    [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Recommencer', style: 'destructive', onPress: () => { void restart(); } },
    ],
  );

  const showCompletedActions = () => {
    const options = ['Annuler', 'Recommencer la séance du jour'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 0, destructiveButtonIndex: 1, title: 'Séance du jour' }, (index) => {
        if (index === 1) confirmRestart();
      });
    } else confirmRestart();
  };

  const selectedPlan = active ? { workoutType: active.workoutType, exercises: active.exercises.map(({ exercise }) => exercise) } : plan;
  const displayedExercises = completedToday?.exercises ?? active?.exercises ?? null;
  return (
    <AppScreen>
      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View><AppText variant="largeTitle">Aujourd’hui</AppText><AppText colorRole="secondary">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</AppText></View>
          {completedToday && !active ? <Pressable accessibilityRole="button" accessibilityLabel="Actions de la séance terminée" onPress={showCompletedActions} hitSlop={12} style={styles.more}><AppSymbol name="ellipsis" color={palette.secondary} size={23} /></Pressable> : null}
        </View>
        {loading ? <ActivityIndicator style={styles.loader} /> : active ? (
          <View style={styles.section}>
            <AppText variant="title">Séance en cours</AppText>
            <AppText colorRole="secondary">{active.workoutType} · {active.exercises.filter((exercise) => exercise.completed).length}/{active.exercises.length} exercices terminés</AppText>
          </View>
        ) : completedToday ? (
          <View style={styles.section}>
            <View style={styles.completedHeading}><AppSymbol name="checkmark.circle.fill" color={palette.accent} size={24} /><AppText variant="title">Séance terminée</AppText></View>
            <AppText colorRole="secondary">{completedToday.workoutType} · terminée à {completedToday.endedAt ? new Date(completedToday.endedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—'}</AppText>
          </View>
        ) : selectedPlan ? (
          <View style={styles.section}>
            <AppText variant="title">{selectedPlan.workoutType}</AppText>
            <View style={styles.exerciseList}>
              {selectedPlan.exercises.map((exercise) => (
                <ExercisePlanRow
                  key={exercise.id}
                  exercise={exercise}
                  previous={previous[exercise.id]}
                  progression={assessProgression(exercise, previous[exercise.id] ?? null)}
                />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.restDay}>
            <AppSymbol name="figure.cooldown" color={palette.secondary} size={30} />
            <AppText variant="headline">Pas de séance prévue aujourd’hui</AppText>
            <AppText colorRole="secondary">Votre prochain entraînement apparaîtra ici.</AppText>
          </View>
        )}
        {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
        {!loading && (active || (!completedToday && selectedPlan)) ? (
          <Pressable accessibilityRole="button" disabled={busy} onPress={active ? () => pushWorkout(active) : prepare} style={({ pressed }) => [styles.action, { backgroundColor: palette.accent, opacity: busy ? 0.55 : pressed ? 0.82 : 1 }]}>
            <AppText variant="headline" style={styles.actionText}>{active ? 'Reprendre la séance' : 'Voir la séance'}</AppText>
            <AppSymbol name={active ? 'arrow.uturn.backward' : 'arrow.right'} color="#FFFFFF" size={18} />
          </Pressable>
        ) : null}
        {displayedExercises && active ? <View style={styles.completedList}>{displayedExercises.map((item, index) => <ExercisePlanRow key={item.id} exercise={item.exercise} last={index === displayedExercises.length - 1} />)}</View> : null}
        {completedToday ? <View style={styles.completedList}>{completedToday.exercises.map((item, index) => <WorkoutExerciseResultRow key={item.id} exercise={item} last={index === completedToday.exercises.length - 1} />)}</View> : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  more: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  loader: { marginTop: spacing.xl },
  section: { marginTop: spacing.xl, gap: spacing.sm },
  exerciseList: { marginTop: spacing.xs },
  completedHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  completedList: { marginTop: spacing.md },
  restDay: { alignItems: 'center', marginTop: spacing.xxl, gap: spacing.sm },
  action: { minHeight: 58, borderRadius: 14, paddingHorizontal: spacing.lg, marginTop: spacing.xl, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  actionText: { color: '#FFFFFF' },
});
