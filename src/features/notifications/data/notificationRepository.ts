import type { SportDatabase } from '@/shared/database/contract';
import { PHOTO_REMINDER_DEFAULT_HOUR, type NotificationPreferences, type WorkoutReminderSchedule, type ExistingWorkoutOccurrence } from '../domain/notificationPlanner.ts';

type PreferenceRow = { workout_enabled: number; photo_enabled: number; workout_hour: number | null; photo_hour: number };

function mapPreferences(row: PreferenceRow): NotificationPreferences {
  return { workoutEnabled: row.workout_enabled === 1, photoEnabled: row.photo_enabled === 1, workoutHour: row.workout_hour, photoHour: row.photo_hour };
}

export async function getNotificationPreferences(db: SportDatabase): Promise<NotificationPreferences> {
  const row = await db.getFirstAsync<PreferenceRow>('SELECT workout_enabled,photo_enabled,workout_hour,photo_hour FROM notification_preferences WHERE id=1');
  if (!row) throw new Error('Les préférences de notification sont introuvables.');
  return mapPreferences(row);
}

export async function updateNotificationPreferences(
  db: SportDatabase,
  changes: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  if (changes.workoutHour !== undefined && changes.workoutHour !== null && (!Number.isInteger(changes.workoutHour) || changes.workoutHour < 0 || changes.workoutHour > 23)) throw new Error('L’heure des séances doit être comprise entre 0 et 23.');
  if (changes.photoHour !== undefined && (!Number.isInteger(changes.photoHour) || changes.photoHour < 0 || changes.photoHour > 23)) throw new Error('L’heure des photos doit être comprise entre 0 et 23.');
  const previous = await getNotificationPreferences(db);
  const next = { ...previous, ...changes };
  await db.runAsync(
    'UPDATE notification_preferences SET workout_enabled=?,photo_enabled=?,workout_hour=?,photo_hour=? WHERE id=1',
    next.workoutEnabled ? 1 : 0, next.photoEnabled ? 1 : 0, next.workoutHour, next.photoHour,
  );
  return next;
}

export async function getWorkoutReminderSchedules(db: SportDatabase): Promise<WorkoutReminderSchedule[]> {
  const rows = await db.getAllAsync<{ id: string; weekday: number; workout_type: string; is_active: number }>(
    `SELECT s.id,s.weekday,s.workout_type,s.is_active
     FROM workout_schedules s
     WHERE EXISTS (
       SELECT 1 FROM workout_schedule_exercises se JOIN exercises e ON e.id=se.exercise_id
       WHERE se.schedule_id=s.id AND e.is_active=1
     ) ORDER BY s.weekday`,
  );
  return rows.map((row) => ({ id: row.id, weekday: row.weekday, workoutType: row.workout_type, isActive: row.is_active === 1 }));
}

export async function getWorkoutOccurrences(
  db: SportDatabase,
  startDate: string,
  endDate: string,
): Promise<ExistingWorkoutOccurrence[]> {
  const rows = await db.getAllAsync<{ schedule_id: string | null; date: string; status: 'active' | 'completed' | 'cancelled' }>(
    "SELECT schedule_id,date,status FROM workouts WHERE date BETWEEN ? AND ? AND schedule_id IS NOT NULL AND status IN ('active','completed','cancelled')",
    startDate, endDate,
  );
  return rows.map((row) => ({ scheduleId: row.schedule_id, date: row.date, status: row.status }));
}

export const defaultNotificationPreferences: NotificationPreferences = {
  workoutEnabled: false,
  photoEnabled: false,
  workoutHour: null,
  photoHour: PHOTO_REMINDER_DEFAULT_HOUR,
};
