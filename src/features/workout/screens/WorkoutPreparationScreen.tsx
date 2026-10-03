import * as Crypto from 'expo-crypto';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { getDatabase } from '@/shared/database';
import { impactHaptic } from '@/shared/haptics';
import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { ExercisePlanRow } from '../components/ExercisePlanRow';
import { PrimaryAction } from '../components/PrimaryAction';
import { getLastPerformance, getTodayPlan, startOrResumeToday } from '../data/workoutRepository';
import type { PreviousPerformance, TodayPlan } from '../domain/models';
import { getAvailableLoads } from '@/features/weights/data/weightRepository';
import { assessAvailableLoadProgression, type LoadProgressionAssessment } from '@/features/weights/domain/weightSystem';

export function WorkoutPreparationScreen() {
  const palette = colors[useColorScheme()];
  const [plan, setPlan] = useState<TodayPlan>();
  const [previous, setPrevious] = useState<Record<string, PreviousPerformance | null>>({});
  const [assessments, setAssessments] = useState<Record<string, LoadProgressionAssessment>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const db = await getDatabase();
        const todayPlan = await getTodayPlan(db);
        if (!todayPlan) throw new Error('Aucune séance n’est planifiée aujourd’hui.');
        const loads = await getAvailableLoads(db);
        const performances = await Promise.all(todayPlan.exercises.map((exercise) => getLastPerformance(db, exercise.id)));
        if (mounted) {
          setPlan(todayPlan);
          setPrevious(Object.fromEntries(todayPlan.exercises.map((exercise, index) => [exercise.id, performances[index]])));
          setAssessments(Object.fromEntries(todayPlan.exercises.map((exercise, index) => [exercise.id, assessAvailableLoadProgression(exercise, performances[index], loads)])));
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'La séance n’a pas pu être chargée.');
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, []);

  const begin = async () => {
    setBusy(true); setError(null);
    try {
      const workout = await startOrResumeToday(await getDatabase(), () => Crypto.randomUUID());
      void impactHaptic().catch(() => undefined);
      router.replace({ pathname: '/workout/[workoutId]', params: { workoutId: workout.id } } as unknown as Href);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La séance n’a pas pu démarrer.');
    } finally { setBusy(false); }
  };

  return (
    <AppScreen>
      <View style={styles.content}>
        <Pressable accessibilityRole="button" accessibilityLabel="Retour à Aujourd’hui" hitSlop={12} onPress={() => router.back()} style={styles.back}>
          <AppSymbol name="chevron.left" size={19} color={palette.accent} /><AppText style={{ color: palette.accent }}>Aujourd’hui</AppText>
        </Pressable>
        <AppText variant="largeTitle">{plan?.workoutType ?? 'Votre séance'}</AppText>
        <AppText colorRole="secondary">Préparez votre séance · les objectifs et la dernière performance sont ici.</AppText>
        {loading ? <ActivityIndicator style={styles.loading} /> : plan?.exercises.map((exercise, index) => (
          <ExercisePlanRow
            key={exercise.id}
            exercise={exercise}
            previous={previous[exercise.id]}
            loadAssessment={assessments[exercise.id]}
            last={index === plan.exercises.length - 1}
          />
        ))}
        {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
        {plan ? <PrimaryAction title="Commencer la séance" onPress={() => { void begin(); }} busy={busy} /> : null}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({ content: { gap: spacing.md }, back: { alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs }, loading: { marginTop: spacing.lg } });
