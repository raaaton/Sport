import type { WorkoutExercise } from '../../workout/domain/models.ts';
import { formatRecordedLoad } from '../../weights/domain/weightSystem.ts';

export function formatHistoryDate(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', options);
}

export function formatSetValues(exercise: WorkoutExercise): string {
  return exercise.sets.map((set) => exercise.exercise.trackingType === 'reps'
    ? `${set.reps ?? '—'}`
    : `${set.durationSeconds ?? '—'} s`).join(' · ');
}

export function formatLoads(exercise: WorkoutExercise): string {
  const loads = exercise.sets.map((set) => set.addedWeightGrams ?? (set.addedWeight === null ? 0 : Math.round(set.addedWeight * 1000)));
  if (loads.length === 0 || loads.every((load) => load === 0)) return 'Poids du corps';
  if (loads.every((load) => load === loads[0])) return formatRecordedLoad(exercise.sets[0].addedWeight, exercise.sets[0].addedWeightGrams);
  return exercise.sets.map((set, index) => `S${index + 1} ${formatRecordedLoad(set.addedWeight, set.addedWeightGrams).replace('Poids du corps', 'corps')}`).join(' · ');
}
