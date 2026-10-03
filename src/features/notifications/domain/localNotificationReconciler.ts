import { managedSportNotificationIds, type LocalNotificationSpec } from './notificationPlanner.ts';

export type LocalNotificationAdapter = {
  getScheduled: () => Promise<{ identifier: string }[]>;
  cancel: (identifier: string) => Promise<void>;
  schedule: (notification: LocalNotificationSpec) => Promise<string>;
};

/** Replaces only this app's requests and leaves every other local request untouched. */
export async function reconcileSportNotifications(
  adapter: LocalNotificationAdapter,
  desired: LocalNotificationSpec[],
): Promise<void> {
  const scheduled = await adapter.getScheduled();
  const managedIds = managedSportNotificationIds(scheduled);
  for (const identifier of managedIds) await adapter.cancel(identifier);
  for (const notification of desired) await adapter.schedule(notification);
}
