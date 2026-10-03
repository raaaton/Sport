import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { SportDatabase } from '@/shared/database/contract';
import { getDatabase } from '@/shared/database';
import { getNotificationPreferences, getWorkoutOccurrences, getWorkoutReminderSchedules } from '../data/notificationRepository';
import { reconcileSportNotifications } from '../domain/localNotificationReconciler';
import { createNotificationSpecs, managedSportNotificationIds, WORKOUT_NOTIFICATION_HORIZON_DAYS } from '../domain/notificationPlanner';

export type NotificationPermissionState = 'not-determined' | 'denied' | 'authorized' | 'provisional' | 'ephemeral';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function permissionState(response: Notifications.NotificationPermissionsStatus): NotificationPermissionState {
  if (Platform.OS === 'ios' && response.ios) {
    switch (response.ios.status) {
      case Notifications.IosAuthorizationStatus.NOT_DETERMINED: return 'not-determined';
      case Notifications.IosAuthorizationStatus.DENIED: return 'denied';
      case Notifications.IosAuthorizationStatus.AUTHORIZED: return 'authorized';
      case Notifications.IosAuthorizationStatus.PROVISIONAL: return 'provisional';
      case Notifications.IosAuthorizationStatus.EPHEMERAL: return 'ephemeral';
    }
  }
  if (response.granted || response.status === 'granted') return 'authorized';
  return response.status === 'undetermined' ? 'not-determined' : 'denied';
}

function permissionAllowsSchedule(state: NotificationPermissionState): boolean {
  return state === 'authorized' || state === 'provisional' || state === 'ephemeral';
}

export async function getSportNotificationPermissionState(): Promise<NotificationPermissionState> {
  return permissionState(await Notifications.getPermissionsAsync());
}

/** Call only from a user action. A denied iOS choice is never requested a second time. */
export async function requestSportNotificationPermission(): Promise<NotificationPermissionState> {
  const existing = await Notifications.getPermissionsAsync();
  const state = permissionState(existing);
  if (state !== 'not-determined') return state;
  const requested = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return permissionState(requested);
}

export async function getManagedSportNotifications() {
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  const managedIds = new Set(managedSportNotificationIds(requests));
  return requests.filter((request) => managedIds.has(request.identifier));
}

export async function syncSportNotifications(
  db: SportDatabase,
  now = new Date(),
): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  const [preferences, currentPermission] = await Promise.all([
    getNotificationPreferences(db),
    getSportNotificationPermissionState(),
  ]);
  let desired = [] as ReturnType<typeof createNotificationSpecs>;
  if (permissionAllowsSchedule(currentPermission)) {
    const schedules = await getWorkoutReminderSchedules(db);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + WORKOUT_NOTIFICATION_HORIZON_DAYS - 1);
    const workouts = preferences.workoutEnabled
      ? await getWorkoutOccurrences(db, localDate(now), localDate(lastDay))
      : [];
    desired = createNotificationSpecs(schedules, workouts, preferences, now);
  }

  await reconcileSportNotifications({
    getScheduled: async () => (await Notifications.getAllScheduledNotificationsAsync()).map(({ identifier }) => ({ identifier })),
    cancel: async (identifier) => Notifications.cancelScheduledNotificationAsync(identifier),
    schedule: async (spec) => Notifications.scheduleNotificationAsync({
      identifier: spec.identifier,
      content: { title: spec.title, body: spec.body, data: spec.data },
      trigger: spec.trigger.kind === 'calendar-date'
        ? {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          year: spec.trigger.year,
          month: spec.trigger.month,
          day: spec.trigger.day,
          hour: spec.trigger.hour,
          minute: spec.trigger.minute,
          repeats: false,
        }
        : {
          type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
          day: spec.trigger.day,
          hour: spec.trigger.hour,
          minute: spec.trigger.minute,
        },
    }),
  }, desired);
}

export async function syncSportNotificationsSafely(): Promise<boolean> {
  try {
    await syncSportNotifications(await getDatabase());
    return true;
  } catch {
    return false;
  }
}
