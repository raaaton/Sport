import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { getDatabase } from '@/shared/database';
import { impactHaptic } from '@/shared/haptics';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { NumericField } from '@/features/workout/components/NumericField';
import { PrimaryAction } from '@/features/workout/components/PrimaryAction';
import type { CompletedWorkoutInput, Exercise, WorkoutSession } from '@/features/workout/domain/models';
import { getWorkout } from '@/features/workout/data/workoutRepository';
import { createManualWorkout, getHistoryExerciseCatalog, updateCompletedWorkout } from '../data/historyRepository';
import { currentCalendarDate, validateHistoryWorkoutDraft, type HistoryWorkoutDraft } from '../domain/historyService';

type Props = { workoutId?: string };

export function HistoryWorkoutFormScreen({ workoutId }: Props) {
  const colorScheme = useColorScheme();
  const palette = colors[colorScheme];
  const editing = Boolean(workoutId);
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [draft, setDraft] = useState<HistoryWorkoutDraft>({ date: currentCalendarDate(), workoutType: '', exercises: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const db = await getDatabase();
        const [available, session] = await Promise.all([
          getHistoryExerciseCatalog(db),
          workoutId ? getWorkout(db, workoutId) : Promise.resolve(null),
        ]);
        if (workoutId && (!session || session.status !== 'completed')) throw new Error('Cette séance terminée est introuvable.');
        if (mounted) {
          setCatalog(available);
          if (session) setDraft(toDraft(session));
          else setDraft((current) => ({ ...current, workoutType: 'Séance libre' }));
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'Le formulaire n’a pas pu être chargé.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [workoutId]);

  const selectedIds = useMemo(() => new Set(draft.exercises.map((exercise) => exercise.exerciseId)), [draft.exercises]);
  const availableExercises = catalog.filter((exercise) => !selectedIds.has(exercise.id));

  const updateExercise = (exerciseId: string, update: (entry: HistoryWorkoutDraft['exercises'][number]) => HistoryWorkoutDraft['exercises'][number]) => {
    setDraft((current) => ({ ...current, exercises: current.exercises.map((entry) => entry.exerciseId === exerciseId ? update(entry) : entry) }));
  };

  const addExercise = (exercise: Exercise) => {
    setDraft((current) => ({
      ...current,
      exercises: [...current.exercises, {
        exerciseId: exercise.id,
        feeling: '8',
        sets: Array.from({ length: exercise.targetSets }, () => ({ value: '', weight: '' })),
      }],
    }));
  };

  const save = async () => {
    setError(null);
    let input: CompletedWorkoutInput;
    try {
      input = validateHistoryWorkoutDraft(draft, catalog, currentCalendarDate());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Vérifiez les champs de la séance.');
      return;
    }
    setBusy(true);
    Keyboard.dismiss();
    try {
      const db = await getDatabase();
      if (workoutId) {
        await updateCompletedWorkout(db, workoutId, input, () => Crypto.randomUUID());
        void impactHaptic().catch(() => undefined);
        router.back();
      } else {
        const created = await createManualWorkout(db, input, () => Crypto.randomUUID());
        void impactHaptic().catch(() => undefined);
        router.replace({ pathname: '/workout-history/[workoutId]', params: { workoutId: created.id } });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La séance n’a pas pu être enregistrée.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppScreen>
      <View style={styles.content}>
        <AppText variant="title">{editing ? 'Modifier la séance' : 'Ajouter une séance'}</AppText>
        <AppText colorRole="secondary">Enregistrez une séance déjà réalisée.</AppText>
        {loading ? <ActivityIndicator style={styles.loading} /> : (
          <>
            <View style={styles.field}>
              <AppText variant="subheadline" colorRole="secondary">Date · AAAA-MM-JJ</AppText>
              <TextInput
                accessibilityLabel="Date de la séance, année-mois-jour"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="numbers-and-punctuation"
                onChangeText={(date) => setDraft((current) => ({ ...current, date }))}
                placeholder="2026-10-03"
                placeholderTextColor={palette.tertiary}
                returnKeyType="done"
                style={[styles.textInput, { color: palette.primary, backgroundColor: palette.groupedBackground, borderColor: palette.separator }]}
                value={draft.date}
              />
            </View>
            <View style={styles.field}>
              <AppText variant="subheadline" colorRole="secondary">Type de séance</AppText>
              <TextInput
                accessibilityLabel="Type de séance"
                onChangeText={(workoutType) => setDraft((current) => ({ ...current, workoutType }))}
                placeholder="Push, Pull + Abs…"
                placeholderTextColor={palette.tertiary}
                returnKeyType="done"
                style={[styles.textInput, { color: palette.primary, backgroundColor: palette.groupedBackground, borderColor: palette.separator }]}
                value={draft.workoutType}
              />
            </View>

            <View style={styles.exerciseSection}>
              <AppText variant="headline">Exercices</AppText>
              {draft.exercises.map((entry, exerciseIndex) => {
                const exercise = catalog.find((candidate) => candidate.id === entry.exerciseId);
                if (!exercise) return null;
                return (
                  <View key={exercise.id} style={styles.exerciseBlock}>
                    <View style={styles.exerciseHeading}>
                      <View style={styles.exerciseTitle}>
                        <AppText variant="headline">{exercise.name}</AppText>
                        <AppText variant="footnote" colorRole="secondary">{targetDescription(exercise)}</AppText>
                      </View>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Retirer ${exercise.name}`}
                        onPress={() => setDraft((current) => ({ ...current, exercises: current.exercises.filter((item) => item.exerciseId !== exercise.id) }))}
                        hitSlop={8}
                      >
                        <AppSymbol name="minus.circle" color={palette.secondary} size={23} />
                      </Pressable>
                    </View>
                    {entry.sets.map((set, setIndex) => (
                      <View key={`${exercise.id}-${setIndex}`} style={styles.setFields}>
                        <AppText variant="subheadline" colorRole="secondary">Série {setIndex + 1}</AppText>
                        <NumericField
                          label={exercise.trackingType === 'reps' ? 'Répétitions' : 'Durée en secondes'}
                          placeholder={exercise.trackingType === 'reps' ? String(exercise.targetRepMin ?? '') : String(exercise.targetDurationSeconds ?? '')}
                          suffix={exercise.trackingType === 'reps' ? 'reps' : 's'}
                          value={set.value}
                          onChangeText={(value) => updateExercise(exercise.id, (current) => ({
                            ...current,
                            sets: current.sets.map((item, index) => index === setIndex ? { ...item, value } : item),
                          }))}
                        />
                        <NumericField
                          label="Lest (facultatif)"
                          placeholder="0"
                          suffix="kg"
                          decimal
                          value={set.weight}
                          onChangeText={(weight) => updateExercise(exercise.id, (current) => ({
                            ...current,
                            sets: current.sets.map((item, index) => index === setIndex ? { ...item, weight } : item),
                          }))}
                        />
                      </View>
                    ))}
                    <NumericField
                      label="Ressenti de l’exercice"
                      placeholder="8"
                      suffix="/ 10"
                      decimal
                      value={entry.feeling}
                      onChangeText={(feeling) => updateExercise(exercise.id, (current) => ({ ...current, feeling }))}
                    />
                    {exerciseIndex < draft.exercises.length - 1 ? <View style={[styles.separator, { backgroundColor: palette.separator }]} /> : null}
                  </View>
                );
              })}
              {availableExercises.length > 0 ? (
                <View style={styles.exercisePicker}>
                  <AppText variant="subheadline" colorRole="secondary">Ajouter un exercice</AppText>
                  {availableExercises.map((exercise) => (
                    <Pressable key={exercise.id} accessibilityRole="button" onPress={() => addExercise(exercise)} style={styles.addExercise}>
                      <AppText>{exercise.name}</AppText>
                      <AppSymbol name="plus" color={palette.accent} size={17} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
            <PrimaryAction title={editing ? 'Enregistrer les modifications' : 'Enregistrer la séance'} busy={busy} onPress={() => { void save(); }} />
          </>
        )}
      </View>
    </AppScreen>
  );
}

function toDraft(session: WorkoutSession): HistoryWorkoutDraft {
  return {
    date: session.date,
    workoutType: session.workoutType,
    exercises: session.exercises.map((item) => ({
      exerciseId: item.exercise.id,
      feeling: item.feeling === null ? '' : String(item.feeling),
      sets: item.sets.map((set) => ({
        value: String(set.reps ?? set.durationSeconds ?? ''),
        weight: set.addedWeight === null ? '' : String(set.addedWeight),
      })),
    })),
  };
}

function targetDescription(exercise: Exercise): string {
  return exercise.trackingType === 'reps'
    ? `${exercise.targetSets} × ${exercise.targetRepMin ?? '—'}–${exercise.targetRepMax ?? '—'} reps`
    : `${exercise.targetSets} × ${exercise.targetDurationSeconds === null ? 'durée libre' : `${exercise.targetDurationSeconds} s`}`;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  loading: { marginTop: spacing.xl },
  field: { gap: spacing.xs },
  textInput: { minHeight: 52, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.medium, paddingHorizontal: spacing.md, fontSize: 17 },
  exerciseSection: { gap: spacing.md, marginTop: spacing.xs },
  exerciseBlock: { gap: spacing.md, paddingTop: spacing.xs },
  exerciseHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseTitle: { gap: spacing.xxs },
  setFields: { gap: spacing.sm },
  separator: { height: StyleSheet.hairlineWidth, marginTop: spacing.sm },
  exercisePicker: { gap: spacing.xs, marginTop: spacing.xs },
  addExercise: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128, 128, 128, 0.25)' },
});
