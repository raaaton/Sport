import { useLocalSearchParams } from 'expo-router';

import { WorkoutSessionScreen } from '@/features/workout/screens/WorkoutSessionScreen';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppText } from '@/shared/ui/AppText';

export default function WorkoutRoute() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  if (!workoutId || Array.isArray(workoutId)) return <AppScreen><AppText colorRole="destructive">Identifiant de séance invalide.</AppText></AppScreen>;
  return <WorkoutSessionScreen workoutId={workoutId} />;
}
