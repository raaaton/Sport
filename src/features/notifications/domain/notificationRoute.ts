import type { Href } from 'expo-router';

export function routeForSportNotificationKind(kind: unknown): Href | null {
  if (kind === 'workout') return '/(tabs)';
  if (kind === 'photos') return '/(tabs)/progress';
  return null;
}
