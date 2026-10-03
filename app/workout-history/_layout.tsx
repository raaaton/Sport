import { Stack } from 'expo-router';

export default function WorkoutHistoryLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="new" options={{ title: 'Ajouter une séance' }} />
      <Stack.Screen name="[workoutId]" options={{ title: 'Séance' }} />
      <Stack.Screen name="[workoutId]/edit" options={{ title: 'Modifier la séance' }} />
    </Stack>
  );
}
