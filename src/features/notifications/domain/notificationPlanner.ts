export type WorkoutReminderSchedule = { id: string; weekday: number; workoutType: string; isActive: boolean };
export type ExistingWorkoutOccurrence = { scheduleId: string | null; date: string; status: 'active' | 'completed' | 'cancelled' };
export type NotificationPreferences = {
  workoutEnabled: boolean;
  photoEnabled: boolean;
  workoutHour: number | null;
  photoHour: number;
};
export type PlannedWorkoutNotification = {
  identifier: string;
  scheduleId: string;
  occurrenceDate: string;
  hour: number;
  title: string;
  body: string;
  data: { kind: 'workout'; scheduleId: string; occurrenceDate: string; route: '/(tabs)' };
};
export type PlannedPhotoNotification = {
  identifier: 'sport.local.photos.monthly';
  hour: number;
  title: 'Photos 📸';
  body: 'Pense à prendre tes photos de progression.';
  data: { kind: 'photos'; route: '/(tabs)/progress' };
};
export type LocalNotificationSpec = {
  identifier: string;
  title: string;
  body: string;
  data: Record<string, string>;
  trigger: { kind: 'calendar-date'; year: number; month: number; day: number; hour: number; minute: 0 }
    | { kind: 'calendar-monthly'; day: 1; hour: number; minute: 0 };
};

export const WORKOUT_NOTIFICATION_HORIZON_DAYS = 28;
export const PHOTO_REMINDER_DEFAULT_HOUR = 6;

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isValidHour(hour: number | null): hour is number {
  return hour !== null && Number.isInteger(hour) && hour >= 0 && hour <= 23;
}

/** Builds concrete local-calendar workout occurrences from the current schedule and workout history. */
export function planWorkoutNotifications(
  schedules: WorkoutReminderSchedule[],
  workouts: ExistingWorkoutOccurrence[],
  preferences: NotificationPreferences,
  now: Date,
  horizonDays = WORKOUT_NOTIFICATION_HORIZON_DAYS,
): PlannedWorkoutNotification[] {
  if (!preferences.workoutEnabled || !isValidHour(preferences.workoutHour) || horizonDays <= 0) return [];
  const byWeekday = new Map(schedules.filter((schedule) => schedule.isActive).map((schedule) => [schedule.weekday, schedule]));
  const completedOrStarted = new Set(workouts.map((workout) => `${workout.scheduleId ?? ''}|${workout.date}`));
  const planned: PlannedWorkoutNotification[] = [];
  const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate() + offset);
    const weekday = date.getDay() === 0 ? 7 : date.getDay();
    const schedule = byWeekday.get(weekday);
    if (!schedule) continue;
    const occurrenceDate = dateKey(date);
    if (completedOrStarted.has(`${schedule.id}|${occurrenceDate}`)) continue;
    const fireAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), preferences.workoutHour, 0, 0, 0);
    if (fireAt.getTime() <= now.getTime()) continue;
    planned.push({
      identifier: `sport.local.workout.${schedule.id}.${occurrenceDate}`,
      scheduleId: schedule.id,
      occurrenceDate,
      hour: preferences.workoutHour,
      title: 'Sport 🏋️',
      body: schedule.workoutType,
      data: { kind: 'workout', scheduleId: schedule.id, occurrenceDate, route: '/(tabs)' },
    });
  }
  return planned;
}

/** Returns the next monthly local-date occurrence, useful for preview and boundary tests. */
export function nextMonthlyPhotoOccurrence(now: Date, hour: number): Date {
  if (!isValidHour(hour)) throw new Error('L’heure du rappel photo doit être comprise entre 0 et 23.');
  let occurrence = new Date(now.getFullYear(), now.getMonth(), 1, hour, 0, 0, 0);
  if (occurrence.getTime() <= now.getTime()) occurrence = new Date(now.getFullYear(), now.getMonth() + 1, 1, hour, 0, 0, 0);
  return occurrence;
}

export function managedSportNotificationIds(requests: { identifier: string }[]): string[] {
  return requests.map((request) => request.identifier).filter((identifier) => identifier.startsWith('sport.local.'));
}

export function createNotificationSpecs(
  schedules: WorkoutReminderSchedule[],
  workouts: ExistingWorkoutOccurrence[],
  preferences: NotificationPreferences,
  now: Date,
): LocalNotificationSpec[] {
  const workoutsPlanned = planWorkoutNotifications(schedules, workouts, preferences, now);
  const specs: LocalNotificationSpec[] = workoutsPlanned.map((item) => {
    const [year, month, day] = item.occurrenceDate.split('-').map(Number);
    return {
      identifier: item.identifier,
      title: item.title,
      body: item.body,
      data: { ...item.data },
      trigger: { kind: 'calendar-date', year, month, day, hour: item.hour, minute: 0 },
    };
  });
  if (preferences.photoEnabled && isValidHour(preferences.photoHour)) {
    specs.push({
      identifier: 'sport.local.photos.monthly',
      title: 'Photos 📸',
      body: 'Pense à prendre tes photos de progression.',
      data: { kind: 'photos', route: '/(tabs)/progress' },
      trigger: { kind: 'calendar-monthly', day: 1, hour: preferences.photoHour, minute: 0 },
    });
  }
  return specs;
}
