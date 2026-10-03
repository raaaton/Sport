import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, View } from 'react-native';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { refreshRestLiveActivity } from '@/features/workout/services/restLiveActivity';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { NotificationRuntime } from '@/features/notifications/components/NotificationRuntime';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void refreshRestLiveActivity();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshRestLiveActivity();
    });
    return () => appState.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <View style={styles.root}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="workout/prepare" options={{ headerShown: false }} />
          <Stack.Screen name="workout/[workoutId]" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="workout-history" options={{ headerShown: false }} />
        </Stack>
        <NotificationRuntime />
        <StatusBar style="auto" />
      </View>
    </ThemeProvider>
  );
}

const styles = { root: { flex: 1 } };
