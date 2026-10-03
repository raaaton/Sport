import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { routeForSportNotificationKind } from '../domain/notificationRoute';
import { syncSportNotificationsSafely } from '../services/localNotifications';

function routeForResponse(response: Notifications.NotificationResponse): Href | null {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  return routeForSportNotificationKind(response.notification.request.content.data?.kind);
}

/** Keeps managed local reminders in sync and handles taps without exposing private photo data. */
export function NotificationRuntime() {
  const lastHandledIdentifier = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

    void syncSportNotificationsSafely();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncSportNotificationsSafely();
    });

    const handleResponse = (response: Notifications.NotificationResponse) => {
      const requestId = response.notification.request.identifier;
      if (requestId === lastHandledIdentifier.current) return;
      lastHandledIdentifier.current = requestId;
      const route = routeForResponse(response);
      if (route) router.replace(route);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    }).catch(() => undefined);

    return () => {
      appState.remove();
      subscription.remove();
    };
  }, []);

  return null;
}
