import type { SportDatabase } from '@/shared/database/contract';

export type ScheduleExerciseOption = {
  id: string;
  name: string;
  trackingType: 'reps' | 'duration';
};

export type EditableWorkoutSchedule = {
  id: string;
  weekday: number;
  workoutType: string;
  isActive: boolean;
  reminderTimeMinutes: number | null;
  exerciseIds: string[];
};

export type WorkoutScheduleChanges = Omit<EditableWorkoutSchedule, 'id'>;

type ScheduleRow = {
  id: string;
  weekday: number;
  workout_type: string;
  is_active: number;
  reminder_time_minutes: number | null;
};

export async function getEditableWorkoutSchedules(db: SportDatabase): Promise<EditableWorkoutSchedule[]> {
  const rows = await db.getAllAsync<ScheduleRow>(
    'SELECT id,weekday,workout_type,is_active,reminder_time_minutes FROM workout_schedules ORDER BY weekday,id',
  );
  const assignments = await db.getAllAsync<{ schedule_id: string; exercise_id: string }>(
    'SELECT schedule_id,exercise_id FROM workout_schedule_exercises ORDER BY schedule_id,sort_order',
  );
  const exerciseIds = new Map<string, string[]>();
  for (const assignment of assignments) {
    const items = exerciseIds.get(assignment.schedule_id) ?? [];
    items.push(assignment.exercise_id);
    exerciseIds.set(assignment.schedule_id, items);
  }
  return rows.map((row) => ({
    id: row.id,
    weekday: row.weekday,
    workoutType: row.workout_type,
    isActive: row.is_active === 1,
    reminderTimeMinutes: row.reminder_time_minutes,
    exerciseIds: exerciseIds.get(row.id) ?? [],
  }));
}

export async function getScheduleExerciseOptions(db: SportDatabase): Promise<ScheduleExerciseOption[]> {
  const rows = await db.getAllAsync<{ id: string; name: string; tracking_type: 'reps' | 'duration' }>(
    'SELECT id,name,tracking_type FROM exercises WHERE is_active=1 ORDER BY sort_order,name',
  );
  return rows.map((row) => ({ id: row.id, name: row.name, trackingType: row.tracking_type }));
}

export function validateWorkoutScheduleChanges(changes: WorkoutScheduleChanges): void {
  if (!Number.isInteger(changes.weekday) || changes.weekday < 1 || changes.weekday > 7) {
    throw new Error('Choisissez un jour valide de la semaine.');
  }
  if (!changes.workoutType.trim()) throw new Error('Donnez un nom à cette séance.');
  if (changes.reminderTimeMinutes !== null && (!Number.isInteger(changes.reminderTimeMinutes) || changes.reminderTimeMinutes < 0 || changes.reminderTimeMinutes > 1439)) {
    throw new Error('L’heure de rappel doit être comprise entre 00:00 et 23:59.');
  }
  if (new Set(changes.exerciseIds).size !== changes.exerciseIds.length) {
    throw new Error('Un exercice ne peut apparaître qu’une fois dans une séance.');
  }
  if (changes.isActive && changes.exerciseIds.length === 0) {
    throw new Error('Ajoutez au moins un exercice à une séance active.');
  }
}

export async function saveWorkoutSchedule(
  db: SportDatabase,
  scheduleId: string,
  changes: WorkoutScheduleChanges,
): Promise<void> {
  validateWorkoutScheduleChanges(changes);
  await db.withExclusiveTransactionAsync(async (tx) => {
    const current = await tx.getFirstAsync<{ id: string }>('SELECT id FROM workout_schedules WHERE id=?', scheduleId);
    if (!current) throw new Error('Cette séance n’existe plus dans le planning.');
    const conflict = await tx.getFirstAsync<{ id: string; workout_type: string }>(
      'SELECT id,workout_type FROM workout_schedules WHERE weekday=? AND id<>? LIMIT 1',
      changes.weekday, scheduleId,
    );
    if (conflict) throw new Error(`${conflict.workout_type} occupe déjà ce jour. Déplace-la d’abord vers un autre jour.`);
    const validExercises = changes.exerciseIds.length === 0 ? [] : await tx.getAllAsync<{ id: string }>(
      `SELECT id FROM exercises WHERE is_active=1 AND id IN (${changes.exerciseIds.map(() => '?').join(',')})`,
      ...changes.exerciseIds,
    );
    if (validExercises.length !== changes.exerciseIds.length) {
      throw new Error('Un ou plusieurs exercices sélectionnés ne sont plus disponibles. Rechargez le planning.');
    }
    await tx.runAsync(
      'UPDATE workout_schedules SET weekday=?,workout_type=?,is_active=?,reminder_time_minutes=? WHERE id=?',
      changes.weekday, changes.workoutType.trim(), changes.isActive ? 1 : 0, changes.reminderTimeMinutes, scheduleId,
    );
    await tx.runAsync('DELETE FROM workout_schedule_exercises WHERE schedule_id=?', scheduleId);
    for (const [sortOrder, exerciseId] of changes.exerciseIds.entries()) {
      await tx.runAsync(
        'INSERT INTO workout_schedule_exercises(schedule_id,exercise_id,sort_order) VALUES (?,?,?)',
        scheduleId, exerciseId, sortOrder,
      );
    }
  });
}
