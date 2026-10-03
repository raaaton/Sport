import type { RestTimer, WorkoutSession, WorkoutState } from './models.ts';
import { isActiveRestTimer } from './restTimerMachine.ts';

/** Reconstructs the next UI state from saved sets and their persisted rest row. */
export function stateFromSession(session: WorkoutSession, restTimer: RestTimer | null = null): WorkoutState {
  if (session.status === 'completed') return { kind: 'completed_workout', workoutId: session.id };
  if (session.status === 'cancelled') return { kind: 'cancelled_workout', workoutId: session.id };
  const current = session.exercises.find((exercise) => !exercise.completed);
  if (!current) return { kind: 'active_workout', workoutId: session.id };
  const setNumber = current.sets.length + 1;
  if (current.sets.length === 0) return { kind: 'active_exercise', workoutId: session.id, workoutExerciseId: current.id };
  if (current.sets.length >= current.exercise.targetSets) return { kind: 'completed_exercise', workoutId: session.id, workoutExerciseId: current.id };
  if (restTimer && restTimer.workoutId === session.id && restTimer.workoutExerciseId === current.id && restTimer.afterSetNumber === current.sets.length && isActiveRestTimer(restTimer.state)) {
    return { kind: 'resting', workoutId: session.id, workoutExerciseId: current.id, restTimerId: restTimer.id };
  }
  return { kind: 'active_set', workoutId: session.id, workoutExerciseId: current.id, setNumber };
}

export function afterSetRecorded(state: Extract<WorkoutState, { kind: 'active_exercise' | 'active_set' }>, setNumber: number, targetSets: number): WorkoutState {
  const completed: WorkoutState = { kind: 'completed_set', workoutId: state.workoutId, workoutExerciseId: state.workoutExerciseId, setNumber };
  return setNumber >= targetSets ? { kind: 'completed_exercise', workoutId: state.workoutId, workoutExerciseId: state.workoutExerciseId } : completed;
}
