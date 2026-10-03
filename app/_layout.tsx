import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="workout/prepare" options={{ headerShown: false }} />
        <Stack.Screen name="workout/[workoutId]" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="workout-history" options={{ headerShown: false }} />
      </Stack>
      <NotificationRuntime />
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
