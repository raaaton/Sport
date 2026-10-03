import type { SportDatabase } from '../../../shared/database/contract.ts';
import type { Exercise, PreviousPerformance, RestTimer, TodayPlan, WeightComponentSnapshot, WorkoutExercise, WorkoutSession, WorkoutSet } from '../domain/models.ts';
import { createStartedRestTimer, cancelActiveRestTimers } from './restTimerRepository.ts';

type IdFactory = () => string;
type Clock = () => Date;
type ExerciseRow = { id: string; name: string; category: string; tracking_type: 'reps' | 'duration'; target_sets: number; target_rep_min: number | null; target_rep_max: number | null; target_duration_seconds: number | null; target_added_weight: number | null; default_rest_seconds: number };
type SessionRow = { id: string; date: string; schedule_id: string | null; workout_type: string; started_at: string; ended_at: string | null; status: 'active' | 'completed' | 'cancelled' };
type WorkoutExerciseRow = { id: string; exercise_id: string; sort_order: number; completed: number; feeling: number | null };
type SetRow = { id: string; set_number: number; reps: number | null; duration_seconds: number | null; added_weight: number | null; added_weight_grams: number | null; load_composition_json: string | null };

const toExercise = (row: ExerciseRow): Exercise => ({
  id: row.id, name: row.name, category: row.category, trackingType: row.tracking_type,
  targetSets: row.target_sets, targetRepMin: row.target_rep_min, targetRepMax: row.target_rep_max,
  targetDurationSeconds: row.target_duration_seconds, targetAddedWeight: row.target_added_weight,
  defaultRestSeconds: row.default_rest_seconds,
});
const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const isoWeekday = (date: Date) => date.getDay() === 0 ? 7 : date.getDay();

async function readSets(db: SportDatabase, workoutExerciseId: string): Promise<WorkoutSet[]> {
  const rows = await db.getAllAsync<SetRow>('SELECT id,set_number,reps,duration_seconds,added_weight,added_weight_grams,load_composition_json FROM workout_sets WHERE workout_exercise_id=? AND completed=1 ORDER BY set_number', workoutExerciseId);
  return rows.map((set) => ({
    id: set.id,
    setNumber: set.set_number,
    reps: set.reps,
    durationSeconds: set.duration_seconds,
    addedWeight: set.added_weight,
    addedWeightGrams: set.added_weight_grams,
    loadComposition: parseLoadComposition(set.load_composition_json),
  }));
}

function parseLoadComposition(value: string | null): WeightComponentSnapshot[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    return parsed.every((item) => item && typeof item.itemId === 'string' && typeof item.name === 'string' && Number.isSafeInteger(item.weightGrams) && item.weightGrams > 0)
      ? parsed as WeightComponentSnapshot[]
      : null;
  } catch {
    return null;
  }
}

async function readSession(db: SportDatabase, workoutId: string): Promise<WorkoutSession | null> {
  const row = await db.getFirstAsync<SessionRow>('SELECT id,date,schedule_id,workout_type,started_at,ended_at,status FROM workouts WHERE id=?', workoutId);
  if (!row) return null;
  const workoutExercises = await db.getAllAsync<WorkoutExerciseRow>(
    `SELECT we.id,we.exercise_id,we.sort_order,we.completed,we.feeling FROM workout_exercises we WHERE we.workout_id=? ORDER BY we.sort_order`, workoutId,
  );
  const exercises: WorkoutExercise[] = [];
  for (const workoutExercise of workoutExercises) {
    const exerciseRow = await db.getFirstAsync<ExerciseRow>(
      'SELECT id,name,category,tracking_type,target_sets,target_rep_min,target_rep_max,target_duration_seconds,target_added_weight,default_rest_seconds FROM exercises WHERE id=?', workoutExercise.exercise_id,
    );
    if (!exerciseRow) throw new Error(`Exercise ${workoutExercise.exercise_id} is missing from the local database.`);
    exercises.push({
      id: workoutExercise.id, exercise: toExercise(exerciseRow), sortOrder: workoutExercise.sort_order,
      completed: workoutExercise.completed === 1, feeling: workoutExercise.feeling,
      sets: await readSets(db, workoutExercise.id),
    });
  }
  return { id: row.id, scheduleId: row.schedule_id, date: row.date, workoutType: row.workout_type, startedAt: row.started_at, endedAt: row.ended_at, status: row.status, exercises };
}

export async function getTodayPlan(db: SportDatabase, date = new Date()): Promise<TodayPlan> {
  const schedule = await db.getFirstAsync<{ id: string; workout_type: string }>(
    'SELECT id,workout_type FROM workout_schedules WHERE weekday=? AND is_active=1', isoWeekday(date),
  );
  if (!schedule) return null;
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT e.id,e.name,e.category,e.tracking_type,e.target_sets,e.target_rep_min,e.target_rep_max,e.target_duration_seconds,e.target_added_weight,e.default_rest_seconds
     FROM workout_schedule_exercises se JOIN exercises e ON e.id=se.exercise_id
     WHERE se.schedule_id=? AND e.is_active=1 ORDER BY se.sort_order`, schedule.id,
  );
  return { scheduleId: schedule.id, workoutType: schedule.workout_type, exercises: rows.map(toExercise) };
}

export class WorkoutDayAlreadyCompletedError extends Error {
  constructor() { super('La séance du jour est déjà terminée. Utilisez l’action secondaire pour la recommencer.'); this.name = 'WorkoutDayAlreadyCompletedError'; }
}

export async function getCompletedWorkoutForToday(db: SportDatabase, date = new Date()): Promise<WorkoutSession | null> {
  const plan = await getTodayPlan(db, date);
  if (!plan) return null;
  const row = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workouts WHERE date=? AND schedule_id=? AND status='completed' ORDER BY ended_at DESC LIMIT 1",
    localDate(date), plan.scheduleId,
  );
  return row ? readSession(db, row.id) : null;
}

export async function createTodayWorkout(db: SportDatabase, idFactory: IdFactory, now: Date, plan: NonNullable<TodayPlan>): Promise<WorkoutSession> {
  const workoutId = idFactory();
  await db.runAsync('INSERT INTO workouts(id,date,schedule_id,workout_type,started_at,status) VALUES (?,?,?,?,?,?)', workoutId, localDate(now), plan.scheduleId, plan.workoutType, now.toISOString(), 'active');
  for (const [sortOrder, exercise] of plan.exercises.entries()) {
    await db.runAsync('INSERT INTO workout_exercises(id,workout_id,exercise_id,sort_order) VALUES (?,?,?,?)', idFactory(), workoutId, exercise.id, sortOrder);
  }
  const session = await readSession(db, workoutId);
  if (!session) throw new Error('Workout creation did not produce a readable session.');
  return session;
}

export async function getActiveWorkout(db: SportDatabase): Promise<WorkoutSession | null> {
  const row = await db.getFirstAsync<{ id: string }>("SELECT id FROM workouts WHERE status='active' ORDER BY started_at LIMIT 1");
  return row ? readSession(db, row.id) : null;
}

export async function startOrResumeToday(db: SportDatabase, idFactory: IdFactory, clock: Clock = () => new Date()): Promise<WorkoutSession> {
  return db.withExclusiveTransactionAsync(async (tx) => {
    const active = await tx.getFirstAsync<{ id: string }>("SELECT id FROM workouts WHERE status='active' LIMIT 1");
    if (active) {
      const session = await readSession(tx, active.id);
      if (!session) throw new Error('Active workout could not be loaded.');
      return session;
    }
    const now = clock();
    const plan = await getTodayPlan(tx, now);
    if (!plan?.exercises.length) throw new Error('Aucune séance n’est prévue aujourd’hui.');
    const completed = await tx.getFirstAsync<{ id: string }>(
      "SELECT id FROM workouts WHERE date=? AND schedule_id=? AND status='completed' LIMIT 1", localDate(now), plan.scheduleId,
    );
    if (completed) throw new WorkoutDayAlreadyCompletedError();
    return createTodayWorkout(tx, idFactory, now, plan);
  });
}

/** Explicit restart path. The previous completed workout is deliberately retained in history. */
export async function restartTodayWorkout(db: SportDatabase, idFactory: IdFactory, clock: Clock = () => new Date()): Promise<WorkoutSession> {
  return db.withExclusiveTransactionAsync(async (tx) => {
    const now = clock();
    const active = await tx.getFirstAsync<{ id: string }>("SELECT id FROM workouts WHERE status='active' LIMIT 1");
    if (active) throw new Error('Terminez ou annulez la séance en cours avant d’en recommencer une.');
    const plan = await getTodayPlan(tx, now);
    if (!plan?.exercises.length) throw new Error('Aucune séance n’est prévue aujourd’hui.');
    const completed = await tx.getFirstAsync<{ id: string }>(
      "SELECT id FROM workouts WHERE date=? AND schedule_id=? AND status='completed' LIMIT 1", localDate(now), plan.scheduleId,
    );
    if (!completed) throw new Error('La séance du jour n’est pas terminée.');
    return createTodayWorkout(tx, idFactory, now, plan);
  });
}

export async function getWorkout(db: SportDatabase, workoutId: string): Promise<WorkoutSession | null> {
  return readSession(db, workoutId);
}

export async function getLastPerformance(db: SportDatabase, exerciseId: string): Promise<PreviousPerformance | null> {
  const row = await db.getFirstAsync<{ workout_exercise_id: string; date: string; feeling: number | null }>(
    `SELECT we.id AS workout_exercise_id,w.date,we.feeling FROM workout_exercises we
     JOIN workouts w ON w.id=we.workout_id
     WHERE we.exercise_id=? AND we.completed=1 AND w.status='completed'
     ORDER BY w.date DESC, w.ended_at DESC, we.sort_order DESC LIMIT 1`, exerciseId,
  );
  return row ? { date: row.date, feeling: row.feeling, sets: await readSets(db, row.workout_exercise_id) } : null;
}

export async function recordSet(db: SportDatabase, input: { workoutId: string; workoutExerciseId: string; exercise: Exercise; reps?: number; durationSeconds?: number; addedWeight?: number | null; addedWeightGrams?: number | null; loadComposition?: WeightComponentSnapshot[] | null; idFactory: IdFactory; clock?: Clock }): Promise<{ set: WorkoutSet; restTimer: RestTimer | null }> {
  return db.withExclusiveTransactionAsync(async (tx) => {
    const existing = await tx.getFirstAsync<{ completed_sets: number; completed: number; workout_id: string; status: string }>(
      `SELECT COUNT(s.id) AS completed_sets, we.completed, we.workout_id, w.status FROM workout_exercises we
       JOIN workouts w ON w.id=we.workout_id
       LEFT JOIN workout_sets s ON s.workout_exercise_id=we.id AND s.completed=1 WHERE we.id=?`, input.workoutExerciseId,
    );
    if (!existing || existing.completed === 1) throw new Error('Cet exercice n’accepte plus de série.');
    if (existing.workout_id !== input.workoutId || existing.status !== 'active') throw new Error('La séance n’est plus active. Rechargez son état avant de continuer.');
    if (existing.completed_sets >= input.exercise.targetSets) throw new Error('Toutes les séries prévues sont déjà enregistrées.');
    const activeRest = await tx.getFirstAsync<{ id: string }>(
      `SELECT id FROM workout_rest_periods WHERE workout_exercise_id=? AND after_set_number=? AND state IN ('ready','running','paused') LIMIT 1`,
      input.workoutExerciseId, existing.completed_sets,
    );
    if (activeRest) throw new Error('Terminez ou passez le temps de repos avant la prochaine série.');
    const setNumber = existing.completed_sets + 1;
    const addedWeight = input.addedWeight ?? null;
    const addedWeightGrams = input.addedWeightGrams !== undefined
      ? input.addedWeightGrams
      : addedWeight === null ? null : Math.round(addedWeight * 1000);
    const loadComposition = input.loadComposition ?? null;
    const set: WorkoutSet = {
      id: input.idFactory(), setNumber,
      reps: input.exercise.trackingType === 'reps' ? input.reps ?? null : null,
      durationSeconds: input.exercise.trackingType === 'duration' ? input.durationSeconds ?? null : null,
      addedWeight,
      addedWeightGrams,
      loadComposition,
    };
    await tx.runAsync(
      'INSERT INTO workout_sets(id,workout_exercise_id,set_number,reps,duration_seconds,added_weight,completed,added_weight_grams,load_composition_json) VALUES (?,?,?,?,?,?,1,?,?)',
      set.id, input.workoutExerciseId, set.setNumber, set.reps, set.durationSeconds, set.addedWeight,
      set.addedWeightGrams ?? null, set.loadComposition ? JSON.stringify(set.loadComposition) : null,
    );
    const restTimer = setNumber < input.exercise.targetSets && input.exercise.defaultRestSeconds > 0
      ? await createStartedRestTimer(tx, {
        workoutId: input.workoutId, workoutExerciseId: input.workoutExerciseId,
        afterSetNumber: setNumber, durationSeconds: input.exercise.defaultRestSeconds,
        idFactory: input.idFactory, now: (input.clock ?? (() => new Date()))(),
      })
      : null;
    return { set, restTimer };
  });
}

export async function finishExercise(db: SportDatabase, input: { workoutExerciseId: string; feeling: number; targetSets: number; workoutId: string; clock?: Clock }): Promise<WorkoutSession> {
  return db.withExclusiveTransactionAsync(async (tx) => {
    const count = await tx.getFirstAsync<{ count: number; workout_id: string; completed: number; status: string }>(
      'SELECT COUNT(s.id) AS count,we.workout_id,we.completed,w.status FROM workout_exercises we JOIN workouts w ON w.id=we.workout_id LEFT JOIN workout_sets s ON s.workout_exercise_id=we.id AND s.completed=1 WHERE we.id=?', input.workoutExerciseId,
    );
    if (!count || count.completed === 1) throw new Error('Cet exercice est déjà terminé ou introuvable.');
    if (count.workout_id !== input.workoutId || count.status !== 'active') throw new Error('La séance n’est plus active. Rechargez son état avant de continuer.');
    if (count.count !== input.targetSets) throw new Error('Complétez toutes les séries avant de terminer cet exercice.');
    await tx.runAsync('UPDATE workout_exercises SET completed=1,feeling=? WHERE id=?', input.feeling, input.workoutExerciseId);
    const remaining = await tx.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM workout_exercises WHERE workout_id=? AND completed=0', input.workoutId);
    if (remaining?.count === 0) {
      const endedAt = (input.clock ?? (() => new Date()))().toISOString();
      await tx.runAsync("UPDATE workouts SET status='completed',ended_at=? WHERE id=? AND status='active'", endedAt, input.workoutId);
    }
    const session = await readSession(tx, input.workoutId);
    if (!session) throw new Error('Workout could not be reloaded after saving the exercise.');
    return session;
  });
}

export async function cancelWorkout(db: SportDatabase, workoutId: string, clock: Clock = () => new Date()): Promise<void> {
  const now = clock();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("UPDATE workouts SET status='cancelled',ended_at=? WHERE id=? AND status='active'", now.toISOString(), workoutId);
    await cancelActiveRestTimers(tx, workoutId, now);
  });
}

export async function getCompletedWorkouts(db: SportDatabase): Promise<WorkoutSession[]> {
  const rows = await db.getAllAsync<{ id: string }>("SELECT id FROM workouts WHERE status='completed' ORDER BY date DESC, ended_at DESC");
  const sessions: WorkoutSession[] = [];
  for (const row of rows) {
    const session = await readSession(db, row.id);
    if (session) sessions.push(session);
  }
  return sessions;
}
