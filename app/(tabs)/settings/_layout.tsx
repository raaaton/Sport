import { Stack } from 'expo-router';

import { colors } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';

export default function SettingsStackLayout() {
  const colorScheme = useColorScheme();

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: colors[colorScheme].background },
        contentStyle: { backgroundColor: colors[colorScheme].background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen name="schedule" options={{ title: 'Planning' }} />
      <Stack.Screen name="exercises" options={{ title: 'Exercices' }} />
      <Stack.Screen name="weighted-items" options={{ title: 'Lest' }} />
      <Stack.Screen name="timer" options={{ title: 'Minuteur de repos' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="preferences" options={{ title: 'Préférences' }} />
      <Stack.Screen name="about" options={{ title: 'À propos' }} />
    </Stack>
  );
}
