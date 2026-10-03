import type { SportDatabase } from '../../../shared/database/contract.ts';
import type { Exercise, RestTimer, WorkoutSession, WorkoutSet } from './models.ts';
import type { AvailableLoad } from '../../weights/domain/weightSystem.ts';
import { finishExercise, recordSet, startOrResumeToday } from '../data/workoutRepository.ts';

export type IdFactory = () => string;

export async function beginTodayWorkout(db: SportDatabase, idFactory: IdFactory, now?: Date): Promise<WorkoutSession> {
  return startOrResumeToday(db, idFactory, now ? () => now : undefined);
}

export type SetInputErrors = { value: string | null; weight: string | null };

export function validateSetEntry(valueText: string, weightText: string, exercise: Exercise): SetInputErrors {
  const normalizedValue = valueText.trim().replace(',', '.');
  const value = Number(normalizedValue);
  const valueError = !normalizedValue || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)
    ? exercise.trackingType === 'reps' ? 'Entrez un nombre entier de répétitions supérieur à zéro.' : 'Entrez une durée entière en secondes supérieure à zéro.'
    : null;
  const normalizedWeight = weightText.trim().replace(',', '.');
  const addedWeight = normalizedWeight === '' ? null : Number(normalizedWeight);
  const weightError = addedWeight !== null && (!Number.isFinite(addedWeight) || addedWeight < 0)
    ? 'Le lest doit être un nombre positif ou nul.' : null;
  return { value: valueError, weight: weightError };
}

export async function completeSet(db: SportDatabase, input: { workoutId: string; workoutExerciseId: string; exercise: Exercise; value: string; weight?: string; load?: AvailableLoad; idFactory: IdFactory; clock?: () => Date }): Promise<{ set: WorkoutSet; restTimer: RestTimer | null }> {
  const normalizedValue = input.value.trim().replace(',', '.');
  const value = Number(normalizedValue);
  const normalizedWeight = (input.load ? (input.load.addedWeightGrams / 1000).toFixed(3) : input.weight ?? '').trim().replace(',', '.');
  const addedWeight = normalizedWeight === '' ? null : Number(normalizedWeight);
  const errors = validateSetEntry(input.value, normalizedWeight, input.exercise);
  if (errors.value) throw new Error(errors.value);
  if (errors.weight) throw new Error(errors.weight);
  return recordSet(db, {
    workoutId: input.workoutId, workoutExerciseId: input.workoutExerciseId, exercise: input.exercise,
    ...(input.exercise.trackingType === 'reps' ? { reps: value } : { durationSeconds: value }),
    addedWeight,
    ...(input.load ? { addedWeightGrams: input.load.addedWeightGrams, loadComposition: input.load.composition } : {}),
    idFactory: input.idFactory, clock: input.clock,
  });
}

export async function completeExercise(db: SportDatabase, input: { workoutId: string; workoutExerciseId: string; feeling: string; targetSets: number }): Promise<WorkoutSession> {
  const normalized = input.feeling.trim().replace(',', '.');
  const feeling = Number(normalized);
  if (!normalized || !Number.isFinite(feeling) || feeling < 0 || feeling > 10) throw new Error('Le ressenti doit être compris entre 0 et 10.');
  return finishExercise(db, { ...input, feeling });
}
