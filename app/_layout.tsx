import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';
import { useEffect, useState } from 'react';

import { useColorScheme } from '@/shared/theme/useColorScheme';
import { NotificationRuntime } from '@/features/notifications/components/NotificationRuntime';
import { setNativePrivacyShield } from '@/features/progress/services/privacyShield';

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
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setIsActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Hide the native app-switcher cover only after React has rendered its locked foreground state.
    setNativePrivacyShield(!isActive);
  }, [isActive]);

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
        {!isActive ? <View pointerEvents="auto" accessibilityLabel="Contenu masqué" style={[StyleSheet.absoluteFill, { backgroundColor: colorScheme === 'dark' ? '#000' : '#F2F2F7', zIndex: 1000 }]} /> : null}
        <StatusBar style="auto" />
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
