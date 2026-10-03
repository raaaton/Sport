import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/shared/ui/AppScreen';
import { AppText } from '@/shared/ui/AppText';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { colors, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import type { WorkoutSession } from '../domain/models';
import { assessProgression } from '../domain/progressionEngine';
import { PrimaryAction } from '../components/PrimaryAction';
import { WorkoutExerciseResultRow } from '../components/WorkoutExerciseResultRow';

function workoutDuration(session: WorkoutSession): string | null {
  if (!session.endedAt) return null;
  const seconds = Math.max(0, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} min` : `${seconds} s`;
}

export function WorkoutCompletionScreen({ session }: { session: WorkoutSession }) {
  const palette = colors[useColorScheme()];
  return (
    <AppScreen>
      <View style={styles.content}>
        <AppSymbol name="checkmark.circle.fill" size={54} color={palette.accent} accessibilityLabel="Séance terminée" />
        <AppText variant="largeTitle">Séance terminée</AppText>
        <AppText colorRole="secondary" style={styles.subtitle}>{session.workoutType} · {session.exercises.length} exercices{workoutDuration(session) ? ` · ${workoutDuration(session)}` : ''}</AppText>
        <View style={styles.results}>{session.exercises.map((exercise, index) => <WorkoutExerciseResultRow
          key={exercise.id}
          exercise={exercise}
          progression={assessProgression(exercise.exercise, { date: session.date, sets: exercise.sets, feeling: exercise.feeling })}
          last={index === session.exercises.length - 1}
        />)}</View>
        <PrimaryAction title="Terminé" onPress={() => router.replace('/(tabs)')} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({ content: { flex: 1, alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.md }, subtitle: { marginBottom: spacing.md }, results: { alignSelf: 'stretch' } });
