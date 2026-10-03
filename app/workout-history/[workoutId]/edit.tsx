import { useLocalSearchParams } from 'expo-router';

import { HistoryWorkoutFormScreen } from '@/features/history/screens/HistoryWorkoutFormScreen';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppText } from '@/shared/ui/AppText';

export default function EditHistoryWorkoutRoute() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  if (!workoutId || Array.isArray(workoutId)) {
    return <AppScreen><AppText colorRole="destructive">Identifiant de séance invalide.</AppText></AppScreen>;
  }
  return <HistoryWorkoutFormScreen workoutId={workoutId} />;
}
