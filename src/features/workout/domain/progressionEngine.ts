import type { Exercise, PreviousPerformance } from './models.ts';

export type ProgressionStatus =
  | 'insufficient_data'
  | 'maintain'
  | 'achieved'
  | 'increase_load_recommended';

export type ProgressionAssessment = {
  status: ProgressionStatus;
  /** Eligibility only; the exact load belongs to the future weight-inventory feature. */
  recommendation: 'increase_load' | null;
};

const insufficient: ProgressionAssessment = { status: 'insufficient_data', recommendation: null };

/** Compares one completed performance with today's exercise targets without mutating either. */
export function assessProgression(
  exercise: Exercise,
  performance: PreviousPerformance | null,
): ProgressionAssessment {
  if (!performance || exercise.targetSets <= 0 || performance.sets.length !== exercise.targetSets) {
    return insufficient;
  }

  const orderedCompleteSets = performance.sets.every((set, index) =>
    set.setNumber === index + 1 &&
    (set.addedWeight === null || (Number.isFinite(set.addedWeight) && set.addedWeight >= 0)),
  );
  if (!orderedCompleteSets) return insufficient;

  if (exercise.trackingType === 'duration') {
    if (!Number.isInteger(exercise.targetDurationSeconds) || !exercise.targetDurationSeconds ||
        performance.sets.some((set) => set.durationSeconds === null || !Number.isInteger(set.durationSeconds) || set.durationSeconds <= 0 || set.reps !== null)) {
      return insufficient;
    }
    const reachedDuration = performance.sets.every((set) => set.durationSeconds! >= exercise.targetDurationSeconds!);
    return { status: reachedDuration ? 'achieved' : 'maintain', recommendation: null };
  }

  const maximum = exercise.targetRepMax;
  if (!Number.isInteger(maximum) || !maximum || maximum <= 0 ||
      performance.sets.some((set) => set.reps === null || !Number.isInteger(set.reps) || set.reps <= 0 || set.durationSeconds !== null) ||
      performance.feeling === null || !Number.isFinite(performance.feeling) || performance.feeling < 0 || performance.feeling > 10) {
    return insufficient;
  }

  const reachedMaximum = performance.sets.every((set) => set.reps! >= maximum);
  if (!reachedMaximum) return { status: 'maintain', recommendation: null };
  if (performance.feeling <= 7) return { status: 'increase_load_recommended', recommendation: 'increase_load' };
  return { status: 'achieved', recommendation: null };
}
