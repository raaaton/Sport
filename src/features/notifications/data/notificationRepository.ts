import type { SportDatabase } from '@/shared/database/contract';
import { PHOTO_REMINDER_DEFAULT_MINUTES, type NotificationPreferences, type WorkoutReminderSchedule, type ExistingWorkoutOccurrence } from '../domain/notificationPlanner.ts';

type PreferenceRow = { workout_enabled: number; photo_enabled: number; photo_time_minutes: number };

function mapPreferences(row: PreferenceRow): NotificationPreferences {
  return { workoutEnabled: row.workout_enabled === 1, photoEnabled: row.photo_enabled === 1, photoTimeMinutes: row.photo_time_minutes };
}

export async function getNotificationPreferences(db: SportDatabase): Promise<NotificationPreferences> {
  const row = await db.getFirstAsync<PreferenceRow>('SELECT workout_enabled,photo_enabled,photo_time_minutes FROM notification_preferences WHERE id=1');
  if (!row) throw new Error('Les préférences de notification sont introuvables.');
  return mapPreferences(row);
}

export async function updateNotificationPreferences(
  db: SportDatabase,
  changes: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  if (changes.photoTimeMinutes !== undefined && (!Number.isInteger(changes.photoTimeMinutes) || changes.photoTimeMinutes < 0 || changes.photoTimeMinutes > 1439)) throw new Error('L’heure des photos doit être comprise entre 00:00 et 23:59.');
  const previous = await getNotificationPreferences(db);
  const next = { ...previous, ...changes };
  await db.runAsync(
    'UPDATE notification_preferences SET workout_enabled=?,photo_enabled=?,photo_time_minutes=? WHERE id=1',
    next.workoutEnabled ? 1 : 0, next.photoEnabled ? 1 : 0, next.photoTimeMinutes,
  );
  return next;
}

export async function getWorkoutReminderSchedules(db: SportDatabase): Promise<WorkoutReminderSchedule[]> {
  const rows = await db.getAllAsync<{ id: string; weekday: number; workout_type: string; is_active: number; reminder_time_minutes: number | null }>(
    `SELECT s.id,s.weekday,s.workout_type,s.is_active,s.reminder_time_minutes
     FROM workout_schedules s
     WHERE EXISTS (
       SELECT 1 FROM workout_schedule_exercises se JOIN exercises e ON e.id=se.exercise_id
       WHERE se.schedule_id=s.id AND e.is_active=1
     ) ORDER BY s.weekday`,
  );
  return rows.map((row) => ({ id: row.id, weekday: row.weekday, workoutType: row.workout_type, isActive: row.is_active === 1, reminderTimeMinutes: row.reminder_time_minutes }));
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
  photoTimeMinutes: PHOTO_REMINDER_DEFAULT_MINUTES,
};
