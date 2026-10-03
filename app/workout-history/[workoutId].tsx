import { useLocalSearchParams } from 'expo-router';

import { WorkoutHistoryDetailScreen } from '@/features/history/screens/WorkoutHistoryDetailScreen';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppText } from '@/shared/ui/AppText';

export default function WorkoutHistoryDetailRoute() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  if (!workoutId || Array.isArray(workoutId)) {
    return <AppScreen><AppText colorRole="destructive">Identifiant de séance invalide.</AppText></AppScreen>;
  }
  return <WorkoutHistoryDetailScreen workoutId={workoutId} />;
}
