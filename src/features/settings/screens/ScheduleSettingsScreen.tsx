import { useCallback, useMemo, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getDatabase } from '@/shared/database';
import { syncSportNotifications } from '@/features/notifications/services/localNotifications';
import { impactHaptic, selectionHaptic } from '@/shared/haptics';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';
import { TimePickerSheet } from '@/shared/ui/TimePickerSheet';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { getEditableWorkoutSchedules, getScheduleExerciseOptions, saveWorkoutSchedule, type EditableWorkoutSchedule, type ScheduleExerciseOption } from '../data/scheduleRepository';

const weekdays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const formatTime = (minutes: number | null) => minutes === null ? 'Choisir une heure' : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export function ScheduleSettingsScreen() {
  const palette = colors[useColorScheme()];
  const [schedules, setSchedules] = useState<EditableWorkoutSchedule[]>([]);
  const [exerciseOptions, setExerciseOptions] = useState<ScheduleExerciseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timePickerScheduleId, setTimePickerScheduleId] = useState<string | null>(null);
  const [dayPickerScheduleId, setDayPickerScheduleId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const [savedSchedules, exercises] = await Promise.all([
        getEditableWorkoutSchedules(db), getScheduleExerciseOptions(db),
      ]);
      setSchedules(savedSchedules);
      setExerciseOptions(exercises);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Le planning n’a pas pu être chargé.');
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  const updateDraft = (id: string, update: (current: EditableWorkoutSchedule) => EditableWorkoutSchedule) => {
    setSchedules((current) => current.map((schedule) => schedule.id === id ? update(schedule) : schedule));
  };

  const save = async (schedule: EditableWorkoutSchedule) => {
    if (busyScheduleId) return;
    setBusyScheduleId(schedule.id);
    setError(null);
    try {
      const db = await getDatabase();
      await saveWorkoutSchedule(db, schedule.id, {
        weekday: schedule.weekday,
        workoutType: schedule.workoutType,
        isActive: schedule.isActive,
        reminderTimeMinutes: schedule.reminderTimeMinutes,
        exerciseIds: schedule.exerciseIds,
      });
      setSchedules((current) => current.map((item) => item.id === schedule.id ? schedule : item));
      try {
        await syncSportNotifications(db);
      } catch {
        setError('Séance enregistrée, mais les rappels n’ont pas pu être actualisés.');
        return;
      }
      void impactHaptic().catch(() => undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La séance n’a pas pu être enregistrée.');
    } finally { setBusyScheduleId(null); }
  };

  const moveToDay = (scheduleId: string, weekday: number) => {
    updateDraft(scheduleId, (current) => ({ ...current, weekday }));
    setDayPickerScheduleId(null);
    void selectionHaptic().catch(() => undefined);
  };

  const openDayPicker = (schedule: EditableWorkoutSchedule) => {
    const occupied = new Set(schedules.filter((item) => item.id !== schedule.id).map((item) => item.weekday));
    const available = weekdays.map((label, index) => ({ label, weekday: index + 1 })).filter((day) => !occupied.has(day.weekday));
    if (Platform.OS === 'ios') {
      const options = [...available.map((day) => day.weekday === schedule.weekday ? `${day.label} ✓` : day.label), 'Annuler'];
      ActionSheetIOS.showActionSheetWithOptions({ title: 'Jour de la séance', options, cancelButtonIndex: options.length - 1 }, (index) => {
        if (index >= 0 && index < available.length) moveToDay(schedule.id, available[index].weekday);
      });
    } else {
      setDayPickerScheduleId(schedule.id);
    }
  };

  const toggleExercise = (scheduleId: string, exerciseId: string) => {
    updateDraft(scheduleId, (current) => ({
      ...current,
      exerciseIds: current.exerciseIds.includes(exerciseId)
        ? current.exerciseIds.filter((id) => id !== exerciseId)
        : [...current.exerciseIds, exerciseId],
    }));
  };

  const reorderExercise = (scheduleId: string, index: number, direction: -1 | 1) => {
    updateDraft(scheduleId, (current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.exerciseIds.length) return current;
      const exerciseIds = [...current.exerciseIds];
      [exerciseIds[index], exerciseIds[destination]] = [exerciseIds[destination], exerciseIds[index]];
      return { ...current, exerciseIds };
    });
  };

  const timePickerSchedule = schedules.find((schedule) => schedule.id === timePickerScheduleId) ?? null;
  const dayPickerSchedule = schedules.find((schedule) => schedule.id === dayPickerScheduleId) ?? null;
  const availableDays = useMemo(() => {
    if (!dayPickerSchedule) return [];
    const occupied = new Set(schedules.filter((item) => item.id !== dayPickerSchedule.id).map((item) => item.weekday));
    return weekdays.map((label, index) => ({ label, weekday: index + 1 })).filter((day) => !occupied.has(day.weekday));
  }, [dayPickerSchedule, schedules]);

  return (
    <AppScreen>
      <View style={styles.content}>
        <View style={styles.intro}>
          <AppText variant="title">Votre semaine</AppText>
          <AppText variant="subheadline" colorRole="secondary">Déplacez vos séances, choisissez leur heure de rappel et composez leurs exercices.</AppText>
        </View>
        {loading ? <ActivityIndicator style={styles.loader} /> : null}
        {schedules.map((schedule) => {
          const selected = schedule.exerciseIds.map((id) => exerciseOptions.find((exercise) => exercise.id === id)).filter((exercise): exercise is ScheduleExerciseOption => exercise !== undefined);
          const isBusy = busyScheduleId === schedule.id;
          return (
            <View key={schedule.id} style={styles.section}>
              <View style={styles.sectionHeading}>
                <AppText variant="footnote" colorRole="secondary" style={styles.sectionTitle}>{weekdays[schedule.weekday - 1].toLocaleUpperCase('fr-FR')}</AppText>
                <AppText variant="caption" colorRole="tertiary">{selected.length} exercice{selected.length === 1 ? '' : 's'}</AppText>
              </View>
              <View style={[styles.group, { backgroundColor: palette.groupedBackground }]}>
                <View style={styles.nameRow}>
                  <TextInput
                    accessibilityLabel="Nom de la séance"
                    maxLength={40}
                    onChangeText={(workoutType) => updateDraft(schedule.id, (current) => ({ ...current, workoutType }))}
                    placeholder="Nom de la séance"
                    returnKeyType="done"
                    style={[styles.nameInput, { color: palette.primary, borderBottomColor: palette.separator }]}
                    value={schedule.workoutType}
                  />
                  <Switch accessibilityLabel={`Activer ${schedule.workoutType}`} value={schedule.isActive} onValueChange={(isActive) => updateDraft(schedule.id, (current) => ({ ...current, isActive }))} />
                </View>
                <View style={[styles.separator, { backgroundColor: palette.separator }]} />
                <Pressable accessibilityRole="button" onPress={() => openDayPicker(schedule)} style={({ pressed }) => [styles.settingRow, { opacity: pressed ? 0.55 : 1 }]}>
                  <AppSymbol name="calendar" size={18} color={palette.accent} />
                  <AppText variant="body" style={styles.rowLabel}>Jour</AppText>
                  <AppText variant="body" colorRole="secondary">{weekdays[schedule.weekday - 1]}</AppText>
                  <AppSymbol name="chevron.right" size={13} color={palette.tertiary} />
                </Pressable>
                <View style={[styles.separator, { backgroundColor: palette.separator }]} />
                <Pressable accessibilityRole="button" onPress={() => setTimePickerScheduleId(schedule.id)} style={({ pressed }) => [styles.settingRow, { opacity: pressed ? 0.55 : 1 }]}>
                  <AppSymbol name="clock" size={18} color={palette.accent} />
                  <AppText variant="body" style={styles.rowLabel}>Rappel</AppText>
                  <AppText variant="body" colorRole="secondary">{formatTime(schedule.reminderTimeMinutes)}</AppText>
                  <AppSymbol name="chevron.right" size={13} color={palette.tertiary} />
                </Pressable>
                <View style={[styles.separator, { backgroundColor: palette.separator }]} />
                <View style={styles.exerciseHeading}><AppText variant="subheadline">Exercices</AppText><AppText variant="caption" colorRole="secondary">Touchez pour inclure ou retirer</AppText></View>
                {exerciseOptions.map((exercise) => {
                  const selectedIndex = schedule.exerciseIds.indexOf(exercise.id);
                  const isSelected = selectedIndex !== -1;
                  return (
                    <View key={exercise.id}>
                      <View style={styles.exerciseRow}>
                        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }} onPress={() => toggleExercise(schedule.id, exercise.id)} style={styles.exerciseSelect}>
                          <AppSymbol name={isSelected ? 'checkmark.circle.fill' : 'circle'} size={21} color={isSelected ? palette.accent : palette.tertiary} />
                          <AppText variant="body">{exercise.name}</AppText>
                        </Pressable>
                        {isSelected ? <View style={styles.orderControls}>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Monter ${exercise.name}`} disabled={selectedIndex === 0} onPress={() => reorderExercise(schedule.id, selectedIndex, -1)} hitSlop={8} style={styles.orderButton}>
                            <AppSymbol name="chevron.up" size={14} color={selectedIndex === 0 ? palette.tertiary : palette.secondary} />
                          </Pressable>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Descendre ${exercise.name}`} disabled={selectedIndex === selected.length - 1} onPress={() => reorderExercise(schedule.id, selectedIndex, 1)} hitSlop={8} style={styles.orderButton}>
                            <AppSymbol name="chevron.down" size={14} color={selectedIndex === selected.length - 1 ? palette.tertiary : palette.secondary} />
                          </Pressable>
                        </View> : null}
                      </View>
                      {exercise.id !== exerciseOptions.at(-1)?.id ? <View style={[styles.separator, { backgroundColor: palette.separator }]} /> : null}
                    </View>
                  );
                })}
                <View style={[styles.separator, { backgroundColor: palette.separator }]} />
                <Pressable accessibilityRole="button" disabled={Boolean(busyScheduleId) || loading} onPress={() => { void save(schedule); }} style={({ pressed }) => [styles.saveButton, { opacity: isBusy ? 0.55 : pressed ? 0.55 : 1 }]}>
                  {isBusy ? <ActivityIndicator color={palette.accent} /> : <AppSymbol name="checkmark" size={17} color={palette.accent} />}
                  <AppText variant="body" style={{ color: palette.accent }}>{isBusy ? 'Enregistrement…' : 'Enregistrer cette séance'}</AppText>
                </Pressable>
              </View>
            </View>
          );
        })}
        {error ? <AppText colorRole="destructive" accessibilityRole="alert">{error}</AppText> : null}
      </View>

      <TimePickerSheet
        visible={timePickerSchedule !== null}
        title={timePickerSchedule ? `Rappel · ${timePickerSchedule.workoutType}` : 'Heure du rappel'}
        initialTimeMinutes={timePickerSchedule?.reminderTimeMinutes ?? null}
        onCancel={() => setTimePickerScheduleId(null)}
        onSave={(reminderTimeMinutes) => {
          if (timePickerSchedule) updateDraft(timePickerSchedule.id, (current) => ({ ...current, reminderTimeMinutes }));
          setTimePickerScheduleId(null);
        }}
      />

      <Modal animationType="slide" onRequestClose={() => setDayPickerScheduleId(null)} presentationStyle="pageSheet" visible={dayPickerSchedule !== null}>
        <SafeAreaView edges={['top', 'bottom']} style={[styles.daySheet, { backgroundColor: palette.background }]}>
          <View style={[styles.dayHeader, { borderBottomColor: palette.separator }]}>
            <Pressable accessibilityRole="button" onPress={() => setDayPickerScheduleId(null)}><AppText style={{ color: palette.accent }}>Fermer</AppText></Pressable>
            <AppText variant="headline">Jour de la séance</AppText>
            <View style={styles.headerSpace} />
          </View>
          {availableDays.map((day) => <Pressable key={day.weekday} accessibilityRole="button" onPress={() => dayPickerSchedule && moveToDay(dayPickerSchedule.id, day.weekday)} style={[styles.dayOption, { borderBottomColor: palette.separator }]}>
            <AppText variant="body">{day.label}</AppText>
            {dayPickerSchedule?.weekday === day.weekday ? <AppSymbol name="checkmark" size={18} color={palette.accent} /> : null}
          </Pressable>)}
        </SafeAreaView>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xs, paddingBottom: spacing.xxl },
  intro: { gap: spacing.xs, marginBottom: spacing.sm },
  loader: { marginTop: spacing.md },
  section: { marginTop: spacing.md },
  sectionHeading: { marginHorizontal: spacing.md, marginBottom: spacing.xs, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { letterSpacing: 0.45 },
  group: { borderRadius: radii.medium, overflow: 'hidden' },
  nameRow: { minHeight: 62, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  nameInput: { flex: 1, minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, fontSize: 17, paddingVertical: spacing.xs },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: spacing.md },
  settingRow: { minHeight: 55, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { flex: 1 },
  exerciseHeading: { minHeight: 58, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseRow: { minHeight: 50, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseSelect: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  orderControls: { flexDirection: 'row', gap: spacing.md },
  orderButton: { width: 30, height: 40, alignItems: 'center', justifyContent: 'center' },
  saveButton: { minHeight: 54, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  daySheet: { flex: 1 },
  dayHeader: { minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpace: { width: 48 },
  dayOption: { minHeight: 57, marginLeft: spacing.lg, paddingRight: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
