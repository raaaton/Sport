import type { WorkoutExercise } from '../../workout/domain/models.ts';

export function formatHistoryDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', options);
}

export function formatSetValues(exercise: WorkoutExercise): string {
  return exercise.sets.map((set) => exercise.exercise.trackingType === 'reps'
    ? `${set.reps ?? '—'}`
    : `${set.durationSeconds ?? '—'} s`).join(' · ');
}

export function formatLoads(exercise: WorkoutExercise): string {
  const loads = exercise.sets.map((set) => set.addedWeight);
  if (loads.length === 0 || loads.every((load) => load === null || load === 0)) return 'Poids du corps';
  if (loads.every((load) => load === loads[0])) return `+${loads[0]} kg`;
  return loads.map((load, index) => `S${index + 1} ${load === null || load === 0 ? 'corps' : `+${load} kg`}`).join(' · ');
}
