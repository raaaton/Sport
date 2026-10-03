import * as Crypto from 'expo-crypto';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, LayoutAnimation, Platform, Pressable, StyleSheet, View } from 'react-native';

import { getDatabase } from '@/shared/database';
import { impactHaptic, notificationHaptic, selectionHaptic } from '@/shared/haptics';
import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { cancelWorkout, getLastPerformance, getWorkout } from '../data/workoutRepository';
import type { PreviousPerformance, RestTimer, WorkoutSession, WorkoutState } from '../domain/models';
import { assessProgression } from '../domain/progressionEngine';
import { completeExercise, completeSet, validateSetEntry } from '../domain/workoutService';
import { syncSportNotificationsSafely } from '@/features/notifications/services/localNotifications';
import { stateFromSession } from '../domain/workoutMachine';
import { isActiveRestTimer } from '../domain/restTimerMachine';
import { NumericField } from '../components/NumericField';
import { PrimaryAction } from '../components/PrimaryAction';
import { RestTimerController } from '../components/RestTimerController';
import { getRestTimerAfterSet, transitionPersistedRestTimer } from '../data/restTimerRepository';
import { WorkoutCompletionScreen } from './WorkoutCompletionScreen';
import { getAvailableLoads } from '@/features/weights/data/weightRepository';
import { assessAvailableLoadProgression, formatLoad, formatRecordedLoad, type AvailableLoad } from '@/features/weights/domain/weightSystem';
import { LoadPicker } from '@/features/weights/components/LoadPicker';
import { refreshRestLiveActivity } from '../services/restLiveActivity';

type Props = { workoutId: string };

async function currentPersistedRest(db: Awaited<ReturnType<typeof getDatabase>>, session: WorkoutSession): Promise<RestTimer | null> {
  const current = session.exercises.find((exercise) => !exercise.completed);
  if (!current || current.sets.length === 0 || current.sets.length >= current.exercise.targetSets) return null;
  return getRestTimerAfterSet(db, current.id, current.sets.length);
}

function performanceSummary(performance: PreviousPerformance): string {
  if (performance.sets.length === 0) return '';
  const values = performance.sets.map((set) => set.reps ?? set.durationSeconds ?? 0);
  const first = values[0];
  const workload = values.every((value) => value === first) ? `${values.length} × ${first}${performance.sets[0].durationSeconds !== null ? ' s' : ''}` : values.map((value) => `${value}${performance.sets[0].durationSeconds !== null ? ' s' : ''}`).join(' · ');
  const weights = performance.sets.map((set) => set.addedWeightGrams ?? (set.addedWeight === null ? 0 : Math.round(set.addedWeight * 1000)));
  const sameWeight = weights.every((item) => item === weights[0]);
  const weight = sameWeight
    ? ` · ${formatRecordedLoad(performance.sets[0].addedWeight, performance.sets[0].addedWeightGrams).toLocaleLowerCase('fr-FR')}`
    : ` · ${performance.sets.map((set) => formatRecordedLoad(set.addedWeight, set.addedWeightGrams).replace('Poids du corps', 'poids du corps')).join(' / ')}`;
  return `${workload}${weight}${performance.feeling === null ? '' : ` · ${performance.feeling}/10`}`;
}

export function WorkoutSessionScreen({ workoutId }: Props) {
  const palette = colors[useColorScheme()];
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [workflowState, setWorkflowState] = useState<WorkoutState>({ kind: 'idle' });
  const [restEntry, setRestEntry] = useState<{ exerciseId: string; timer: RestTimer | null } | null>(null);
  const [previous, setPrevious] = useState<{ exerciseId: string; performance: PreviousPerformance } | null>(null);
  const [value, setValue] = useState('');
  const [availableLoads, setAvailableLoads] = useState<AvailableLoad[]>([]);
  const [selectedLoadGrams, setSelectedLoadGrams] = useState(0);
  const [feeling, setFeeling] = useState('8');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [valueError, setValueError] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const keyboardLayoutMode = useRef(false);

  useEffect(() => {
    const setEditingLayout = (visible: boolean, duration: number) => {
      if (keyboardLayoutMode.current === visible) return;
      keyboardLayoutMode.current = visible;
      LayoutAnimation.configureNext({
        duration: duration > 0 ? duration : 220,
        update: { type: Platform.OS === 'ios' ? LayoutAnimation.Types.keyboard : LayoutAnimation.Types.easeInEaseOut },
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
      setKeyboardVisible(visible);
    };
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (event) => setEditingLayout(true, event.duration));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', (event) => setEditingLayout(false, event.duration));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const db = await getDatabase();
        const [result, loads] = await Promise.all([getWorkout(db, workoutId), getAvailableLoads(db)]);
        if (!result) throw new Error('Cette séance est introuvable dans la base locale.');
        const timer = await currentPersistedRest(db, result);
        if (mounted) {
          setSession(result);
          setAvailableLoads(loads);
          setRestEntry(timer ? { exerciseId: timer.workoutExerciseId, timer } : null);
          setWorkflowState(stateFromSession(result, timer));
          const currentExercise = result.exercises.find((exercise) => !exercise.completed);
          const lastSet = currentExercise?.sets.at(-1);
          setSelectedLoadGrams(lastSet?.addedWeightGrams ?? Math.round((lastSet?.addedWeight ?? currentExercise?.exercise.targetAddedWeight ?? 0) * 1000));
        }
      } catch (cause) {
        if (mounted) setError(cause instanceof Error ? cause.message : 'La séance n’a pas pu être chargée.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [workoutId]);

  const current = session?.exercises.find((exercise) => !exercise.completed) ?? null;
  const currentExerciseId = current?.exercise.id;
  const currentSetCount = current?.sets.length;
  useEffect(() => {
    let mounted = true;
    if (!currentExerciseId || !current || availableLoads.length === 0) return () => { mounted = false; };
    void getDatabase().then((db) => getLastPerformance(db, currentExerciseId)).then((result) => {
      if (mounted) {
        setPrevious(result ? { exerciseId: currentExerciseId, performance: result } : null);
        if (currentSetCount === 0) {
          setSelectedLoadGrams(assessAvailableLoadProgression(current.exercise, result, availableLoads).targetLoadGrams);
        }
      }
    }).catch(() => {
      // Previous performance is optional; the session itself remains usable.
    });
    return () => { mounted = false; };
  }, [availableLoads, current, currentExerciseId, currentSetCount]);

  const restTimer = restEntry && current && restEntry.exerciseId === current.id ? restEntry.timer : null;
  const activeRestTimer = restTimer && isActiveRestTimer(restTimer.state) ? restTimer : null;

  const handleRestAction = async (action: 'pause' | 'resume' | 'skip') => {
    if (!activeRestTimer || !session || actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const db = await getDatabase();
      const result = await transitionPersistedRestTimer(db, activeRestTimer.id, action);
      const updated = await getWorkout(db, session.id);
      if (!updated) throw new Error('La séance ne peut pas être relue après le repos.');
      setSession(updated);
      setRestEntry(result.timer ? { exerciseId: result.timer.workoutExerciseId, timer: result.timer } : null);
      setWorkflowState(stateFromSession(updated, result.timer));
      await refreshRestLiveActivity();
      void selectionHaptic().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Le repos n’a pas pu être modifié.');
    } finally { actionInFlight.current = false; setBusy(false); }
  };

  const handleTimerChange = useCallback((timer: RestTimer | null) => {
    if (!timer) return;
    setRestEntry({ exerciseId: timer.workoutExerciseId, timer });
    if (session) setWorkflowState(stateFromSession(session, timer));
    void refreshRestLiveActivity();
  }, [session]);

  const saveSet = async () => {
    if (!session || !current || actionInFlight.current) return;
    const selectedLoad = availableLoads.find((load) => load.addedWeightGrams === selectedLoadGrams);
    if (!selectedLoad) {
      setError('Cette charge n’est plus disponible. Choisissez-en une autre.');
      return;
    }
    const inputErrors = validateSetEntry(value, String(selectedLoadGrams / 1000), current.exercise);
    setValueError(inputErrors.value);
    if (inputErrors.value || inputErrors.weight) return;
    actionInFlight.current = true;
    setBusy(true); setError(null);
    try {
      const db = await getDatabase();
      const recorded = await completeSet(db, { workoutId: session.id, workoutExerciseId: current.id, exercise: current.exercise, value, load: selectedLoad, idFactory: () => Crypto.randomUUID() });
      const { set: savedSet } = recorded;
      setValue('');
      setSelectedLoadGrams(savedSet.addedWeightGrams ?? Math.round((savedSet.addedWeight ?? 0) * 1000));
      setValueError(null);
      const updated = await getWorkout(db, session.id);
      if (!updated) throw new Error('La séance ne peut pas être relue après l’enregistrement.');
      const timer = recorded.restTimer ?? await currentPersistedRest(db, updated);
      setSession(updated);
      setRestEntry(timer ? { exerciseId: timer.workoutExerciseId, timer } : null);
      setWorkflowState(stateFromSession(updated, timer));
      await refreshRestLiveActivity();
      void impactHaptic().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La série n’a pas pu être enregistrée.');
    } finally { actionInFlight.current = false; setBusy(false); }
  };

  const saveExercise = async () => {
    if (!session || !current || actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true); setError(null);
    try {
      const db = await getDatabase();
      const updated = await completeExercise(db, { workoutId: session.id, workoutExerciseId: current.id, feeling, targetSets: current.exercise.targetSets });
      if (updated.status === 'completed') await syncSportNotificationsSafely();
      setSession(updated); setWorkflowState(stateFromSession(updated));
      setRestEntry(null);
      await refreshRestLiveActivity();
      const nextExercise = updated.exercises.find((exercise) => !exercise.completed);
      setSelectedLoadGrams(Math.round((nextExercise?.exercise.targetAddedWeight ?? 0) * 1000));
      void notificationHaptic().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'L’exercice n’a pas pu être terminé.');
    } finally { actionInFlight.current = false; setBusy(false); }
  };

  const endWorkout = () => Alert.alert('Abandonner la séance ?', 'La séance sera conservée comme annulée.', [
    { text: 'Continuer', style: 'cancel' },
    { text: 'Abandonner', style: 'destructive', onPress: () => {
      void getDatabase().then((db) => cancelWorkout(db, workoutId)).then(async () => {
        await refreshRestLiveActivity();
        await syncSportNotificationsSafely();
        router.replace('/(tabs)');
      }).catch(() => setError('La séance n’a pas pu être annulée.'));
    } },
  ]);

  if (loading) return <AppScreen><ActivityIndicator style={styles.loader} /></AppScreen>;
  if (session?.status === 'completed') return <WorkoutCompletionScreen session={session} />;
  if (session?.status === 'cancelled') return <AppScreen><View style={styles.center}><AppText variant="title">Séance annulée</AppText><PrimaryAction title="Retour à Aujourd’hui" onPress={() => router.replace('/(tabs)')} /></View></AppScreen>;
  if (!session || !current) return <AppScreen><View style={styles.center}><AppText variant="title">Séance indisponible</AppText>{error ? <AppText colorRole="destructive">{error}</AppText> : null}<PrimaryAction title="Recharger la séance" onPress={() => router.replace({ pathname: '/workout/[workoutId]', params: { workoutId } })} /></View></AppScreen>;

  const setsComplete = current.sets.length >= current.exercise.targetSets;
  const previousAssessment = previous?.exerciseId === current.exercise.id
    ? assessAvailableLoadProgression(current.exercise, previous.performance, availableLoads)
    : null;
  const targetLoadGrams = previousAssessment?.targetLoadGrams ?? (current.exercise.targetAddedWeight === null
    ? selectedLoadGrams
    : Math.round(current.exercise.targetAddedWeight * 1000));
  const normalizedFeeling = feeling.trim().replace(',', '.');
  const feelingNumber = normalizedFeeling ? Number(normalizedFeeling) : Number.NaN;
  const completionAssessment = setsComplete
    ? assessProgression(current.exercise, {
      date: session.date,
      sets: current.sets,
      feeling: Number.isFinite(feelingNumber) && feelingNumber >= 0 && feelingNumber <= 10 ? feelingNumber : null,
    })
    : null;
  const target = current.exercise.trackingType === 'reps'
    ? `${current.exercise.targetSets} × ${current.exercise.targetRepMin}–${current.exercise.targetRepMax}`
    : `${current.exercise.targetSets} × ${current.exercise.targetDurationSeconds ? `${current.exercise.targetDurationSeconds} s` : 'durée libre'}`;
  return (
    <AppScreen scrollable={false} safeAreaEdges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.keyboardAvoiding} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.content, keyboardVisible && styles.contentEditing]}>
          {keyboardVisible ? (
            <View style={styles.compactHeading}>
              <View style={styles.compactHeadingRow}>
                <AppText variant="headline">{setsComplete ? `${current.exercise.name} · ressenti` : `${current.exercise.name} · série ${current.sets.length + 1}/${current.exercise.targetSets}`}</AppText>
                <Pressable accessibilityRole="button" onPress={() => Keyboard.dismiss()} hitSlop={10}>
                  <AppText style={{ color: palette.accent }}>Terminé</AppText>
                </Pressable>
              </View>
              <AppText variant="footnote" colorRole="secondary">Objectif · {target}{current.exercise.trackingType === 'reps' ? ' reps' : ''}</AppText>
            </View>
          ) : (
            <>
              <View style={styles.topBar}>
                <View><AppText variant="footnote" colorRole="secondary">{session.workoutType} · exercice {session.exercises.findIndex((item) => item.id === current.id) + 1}/{session.exercises.length}</AppText><AppText variant="title">{current.exercise.name}</AppText></View>
                <Pressable accessibilityRole="button" accessibilityLabel="Abandonner la séance" onPress={endWorkout} hitSlop={12} style={styles.close}><AppSymbol name="xmark" size={19} color={palette.secondary} /></Pressable>
              </View>
              <AppText variant="headline" colorRole="secondary">{target}{current.exercise.trackingType === 'reps' ? ' reps' : ''}</AppText>
              <AppText variant="subheadline" colorRole="secondary">Objectif : {formatLoad(targetLoadGrams)}</AppText>
              {previousAssessment?.progression.status === 'increase_load_recommended' ? (
                <View style={styles.recommendation}>
                  <View style={styles.recommendationHeading}><AppSymbol name="arrow.up" size={13} color={palette.accent} /><AppText variant="footnote">{previousAssessment.noHigherLoadAvailable ? 'Objectif atteint' : 'Augmentation du lest recommandée'}</AppText></View>
                  {previousAssessment.noHigherLoadAvailable ? <AppText variant="caption" colorRole="tertiary">Aucune charge supérieure disponible avec votre matériel.</AppText> : null}
                </View>
              ) : null}
              <View style={[styles.progressRow, { borderColor: palette.separator }]}>
                {current.sets.map((set) => <View key={set.id} style={[styles.progressDot, { backgroundColor: palette.accent }]} />)}
                {Array.from({ length: current.exercise.targetSets - current.sets.length }, (_, index) => <View key={`empty-${index}`} style={[styles.progressDot, { backgroundColor: palette.separator }]} />)}
                <AppText variant="subheadline" colorRole="secondary">{workflowState.kind === 'completed_set' ? `Série ${workflowState.setNumber} enregistrée · ` : ''}{current.sets.length}/{current.exercise.targetSets} séries</AppText>
              </View>
              {previous?.exerciseId === current.exercise.id ? <View style={[styles.previous, { borderLeftColor: palette.accent }]}><AppText variant="footnote" colorRole="secondary">Dernière séance · {new Date(`${previous.performance.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</AppText><AppText variant="headline">{performanceSummary(previous.performance)}</AppText></View> : null}
            </>
          )}

        {activeRestTimer ? (
          <View style={styles.restArea}>
            <RestTimerController timer={activeRestTimer} nextSetNumber={current.sets.length + 1} actionBusy={busy} onTimerChange={handleTimerChange} onAction={(action) => { void handleRestAction(action); }} />
            {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
          </View>
        ) : current.sets.length < current.exercise.targetSets && (workflowState.kind === 'active_exercise' || workflowState.kind === 'active_set' || workflowState.kind === 'completed_set' || workflowState.kind === 'resting') ? (
          <View style={[styles.entry, keyboardVisible && styles.entryEditing]}>
            <AppText variant="headline">Série {current.sets.length + 1}</AppText>
            {restEntry?.timer?.state === 'finished' ? <AppText variant="subheadline" colorRole="secondary">Repos terminé · à vous pour la série {current.sets.length + 1}</AppText> : null}
            <NumericField label={current.exercise.trackingType === 'reps' ? 'Répétitions' : 'Durée'} placeholder="0" suffix={current.exercise.trackingType === 'reps' ? 'reps' : 'secondes'} value={value} error={valueError} onChangeText={(text) => { setValue(text); setValueError(null); }} />
            <LoadPicker loads={availableLoads} selectedGrams={selectedLoadGrams} onSelect={(load) => { setSelectedLoadGrams(load.addedWeightGrams); }} disabled={busy} />
            {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
            <PrimaryAction title="Valider la série" onPress={() => { void saveSet(); }} busy={busy} />
          </View>
        ) : workflowState.kind === 'completed_exercise' || setsComplete ? (
          <View style={[styles.entry, keyboardVisible && styles.entryEditing]}>
            <AppText variant="title">Exercice terminé</AppText>
            <AppText colorRole="secondary">Comment s’est passé cet exercice ?</AppText>
            <NumericField label="Ressenti" placeholder="8" suffix="/ 10" value={feeling} decimal onChangeText={setFeeling} />
            {completionAssessment?.status === 'increase_load_recommended' ? (
              <View style={styles.recommendation}>
                <AppText variant="subheadline">Objectif atteint</AppText>
                <AppText variant="footnote" colorRole="secondary">Augmentation du lest recommandée pour la prochaine séance.</AppText>
              </View>
            ) : null}
            {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
            <PrimaryAction title={current.sortOrder === session.exercises.length - 1 ? 'Terminer la séance' : 'Exercice suivant'} onPress={() => { void saveExercise(); }} busy={busy} />
          </View>
        ) : (
          <View style={styles.entry}>
            <AppText variant="headline">État de séance à recharger</AppText>
            <AppText colorRole="secondary">Les données enregistrées sont conservées.</AppText>
            {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
            <PrimaryAction title="Recharger la séance" onPress={() => router.replace({ pathname: '/workout/[workoutId]', params: { workoutId } })} />
          </View>
        )}
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md },
  contentEditing: { gap: spacing.sm },
  keyboardAvoiding: { flex: 1 },
  compactHeading: { gap: spacing.xxs },
  compactHeadingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  loader: { marginTop: spacing.xxl },
  center: { flex: 1, gap: spacing.md, justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  progressRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  progressDot: { width: 9, height: 9, borderRadius: 5 },
  previous: { borderLeftWidth: 2, paddingLeft: spacing.md, gap: spacing.xxs, marginTop: spacing.xs },
  recommendation: { gap: spacing.xxs },
  recommendationHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  entry: { marginTop: spacing.lg, gap: spacing.md },
  entryEditing: { marginTop: 0, gap: spacing.sm },
  restArea: { marginTop: spacing.md },
});
