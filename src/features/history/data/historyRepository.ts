import type { SportDatabase } from '../../../shared/database/contract.ts';
import type { CompletedWorkoutInput, Exercise, WorkoutSession } from '../../workout/domain/models.ts';
import { getCompletedWorkouts, getWorkout } from '../../workout/data/workoutRepository.ts';

type IdFactory = () => string;
type ExerciseRow = {
  id: string;
  name: string;
  category: string;
  tracking_type: 'reps' | 'duration';
  target_sets: number;
  target_rep_min: number | null;
  target_rep_max: number | null;
  target_duration_seconds: number | null;
  target_added_weight: number | null;
  default_rest_seconds: number;
};

function toExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    trackingType: row.tracking_type,
    targetSets: row.target_sets,
    targetRepMin: row.target_rep_min,
    targetRepMax: row.target_rep_max,
    targetDurationSeconds: row.target_duration_seconds,
    targetAddedWeight: row.target_added_weight,
    defaultRestSeconds: row.default_rest_seconds,
  };
}

async function readExercise(db: SportDatabase, exerciseId: string): Promise<Exercise> {
  const row = await db.getFirstAsync<ExerciseRow>(
    `SELECT id,name,category,tracking_type,target_sets,target_rep_min,target_rep_max,target_duration_seconds,target_added_weight,default_rest_seconds
     FROM exercises WHERE id=?`,
    exerciseId,
  );
  if (!row) throw new Error('Un exercice sélectionné n’existe plus. Rechargez le formulaire.');
  return toExercise(row);
}

async function insertWorkoutContents(
  db: SportDatabase,
  workoutId: string,
  input: CompletedWorkoutInput,
  idFactory: IdFactory,
): Promise<void> {
  for (const [sortOrder, item] of input.exercises.entries()) {
    const exercise = await readExercise(db, item.exerciseId);
    if (item.sets.length !== exercise.targetSets) throw new Error(`${exercise.name} doit contenir ${exercise.targetSets} séries.`);
    const workoutExerciseId = idFactory();
    await db.runAsync(
      'INSERT INTO workout_exercises(id,workout_id,exercise_id,sort_order,completed,feeling) VALUES (?,?,?,?,1,?)',
      workoutExerciseId, workoutId, exercise.id, sortOrder, item.feeling,
    );
    for (const [setIndex, set] of item.sets.entries()) {
      await db.runAsync(
        'INSERT INTO workout_sets(id,workout_exercise_id,set_number,reps,duration_seconds,added_weight,completed) VALUES (?,?,?,?,?,?,1)',
        idFactory(), workoutExerciseId, setIndex + 1,
        exercise.trackingType === 'reps' ? set.value : null,
        exercise.trackingType === 'duration' ? set.value : null,
        set.addedWeight,
      );
    }
  }
}

export async function getHistoryExerciseCatalog(db: SportDatabase): Promise<Exercise[]> {
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT id,name,category,tracking_type,target_sets,target_rep_min,target_rep_max,target_duration_seconds,target_added_weight,default_rest_seconds
     FROM exercises WHERE is_active=1 ORDER BY sort_order,name`,
  );
  return rows.map(toExercise);
}

export async function createManualWorkout(
  db: SportDatabase,
  input: CompletedWorkoutInput,
  idFactory: IdFactory,
): Promise<WorkoutSession> {
  return db.withExclusiveTransactionAsync(async (tx) => {
    const id = idFactory();
    const stableDateTime = `${input.date}T12:00:00.000Z`;
    await tx.runAsync(
      'INSERT INTO workouts(id,date,schedule_id,workout_type,started_at,ended_at,status) VALUES (?,?,NULL,?,?,?,?)',
      id, input.date, input.workoutType, stableDateTime, stableDateTime, 'completed',
    );
    await insertWorkoutContents(tx, id, input, idFactory);
    const workout = await getWorkout(tx, id);
    if (!workout) throw new Error('La séance ajoutée n’a pas pu être relue.');
    return workout;
  });
}

export async function updateCompletedWorkout(
  db: SportDatabase,
  workoutId: string,
  input: CompletedWorkoutInput,
  idFactory: IdFactory,
): Promise<WorkoutSession> {
  return db.withExclusiveTransactionAsync(async (tx) => {
    const existing = await tx.getFirstAsync<{ status: string }>('SELECT status FROM workouts WHERE id=?', workoutId);
    if (!existing || existing.status !== 'completed') throw new Error('Seule une séance terminée peut être modifiée.');
    const stableDateTime = `${input.date}T12:00:00.000Z`;
    await tx.runAsync(
      'UPDATE workouts SET date=?,workout_type=?,started_at=?,ended_at=? WHERE id=? AND status=\'completed\'',
      input.date, input.workoutType, stableDateTime, stableDateTime, workoutId,
    );
    await tx.runAsync('DELETE FROM workout_exercises WHERE workout_id=?', workoutId);
    await insertWorkoutContents(tx, workoutId, input, idFactory);
    const workout = await getWorkout(tx, workoutId);
    if (!workout) throw new Error('La séance modifiée n’a pas pu être relue.');
    return workout;
  });
}

export async function deleteCompletedWorkout(db: SportDatabase, workoutId: string): Promise<void> {
  await db.withExclusiveTransactionAsync(async (tx) => {
    const result = await tx.runAsync('DELETE FROM workouts WHERE id=? AND status=\'completed\'', workoutId);
    if (result.changes !== 1) throw new Error('Cette séance est introuvable ou ne peut pas être supprimée.');
  });
}

export async function getHistoryWorkouts(db: SportDatabase): Promise<WorkoutSession[]> {
  return getCompletedWorkouts(db);
}

export function filterWorkoutsByExercise(sessions: WorkoutSession[], exerciseId: string): WorkoutSession[] {
  return sessions.filter((session) => session.exercises.some((item) => item.exercise.id === exerciseId));
}
