export type TrackingType = 'reps' | 'duration';
export type WorkoutStatus = 'active' | 'completed' | 'cancelled';

export type Exercise = {
  id: string;
  name: string;
  category: string;
  trackingType: TrackingType;
  targetSets: number;
  targetRepMin: number | null;
  targetRepMax: number | null;
  targetDurationSeconds: number | null;
  targetAddedWeight: number | null;
  defaultRestSeconds: number;
};

export type WorkoutSet = {
  id: string;
  setNumber: number;
  reps: number | null;
  durationSeconds: number | null;
  addedWeight: number | null;
};

export type PreviousPerformance = { sets: WorkoutSet[]; date: string; feeling: number | null };

export type RestTimerStatus = 'ready' | 'running' | 'paused' | 'finished' | 'skipped' | 'cancelled';
export type RestTimer = {
  id: string;
  workoutId: string;
  workoutExerciseId: string;
  afterSetNumber: number;
  durationSeconds: number;
  state: RestTimerStatus;
  startedAt: string | null;
  deadlineAt: string | null;
  pausedRemainingSeconds: number | null;
  endedAt: string | null;
};

export type WorkoutExercise = {
  id: string;
  exercise: Exercise;
  sortOrder: number;
  completed: boolean;
  feeling: number | null;
  sets: WorkoutSet[];
};

export type WorkoutSession = {
  id: string;
  scheduleId: string | null;
  date: string;
  workoutType: string;
  startedAt: string;
  endedAt: string | null;
  status: WorkoutStatus;
  exercises: WorkoutExercise[];
};

export type TodayPlan = { scheduleId: string; workoutType: string; exercises: Exercise[] } | null;

export type WorkoutState =
  | { kind: 'idle' }
  | { kind: 'active_workout'; workoutId: string }
  | { kind: 'active_exercise'; workoutId: string; workoutExerciseId: string }
  | { kind: 'active_set'; workoutId: string; workoutExerciseId: string; setNumber: number }
  | { kind: 'completed_set'; workoutId: string; workoutExerciseId: string; setNumber: number }
  | { kind: 'resting'; workoutId: string; workoutExerciseId: string; restTimerId: string }
  | { kind: 'completed_exercise'; workoutId: string; workoutExerciseId: string }
  | { kind: 'completed_workout'; workoutId: string }
  | { kind: 'cancelled_workout'; workoutId: string };
