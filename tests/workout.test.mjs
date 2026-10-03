import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { migrateAndSeed } from '../src/shared/database/schema.ts';
import { getLastPerformance, getTodayPlan, startOrResumeToday, getWorkout, recordSet, finishExercise, getCompletedWorkouts, cancelWorkout, restartTodayWorkout, getCompletedWorkoutForToday, WorkoutDayAlreadyCompletedError } from '../src/features/workout/data/workoutRepository.ts';
import { completeSet } from '../src/features/workout/domain/workoutService.ts';
import { afterSetRecorded, stateFromSession } from '../src/features/workout/domain/workoutMachine.ts';
import { remainingSeconds, transitionRestTimer } from '../src/features/workout/domain/restTimerMachine.ts';
import { getRestTimerAfterSet, transitionPersistedRestTimer } from '../src/features/workout/data/restTimerRepository.ts';

class NodeDatabase {
  constructor(database = new DatabaseSync(':memory:')) { this.database = database; }
  async execAsync(sql) { this.database.exec(sql); }
  async runAsync(sql, ...params) {
    const result = this.database.prepare(sql).run(...params);
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync(sql, ...params) { return this.database.prepare(sql).get(...params) ?? null; }
  async getAllAsync(sql, ...params) { return this.database.prepare(sql).all(...params); }
  async withExclusiveTransactionAsync(task) {
    this.database.exec('BEGIN IMMEDIATE');
    try { const result = await task(this); this.database.exec('COMMIT'); return result; }
    catch (error) { this.database.exec('ROLLBACK'); throw error; }
  }
}

async function setup() {
  const db = new NodeDatabase();
  await migrateAndSeed(db, () => '2026-10-03T10:00:00.000Z');
  await db.execAsync('PRAGMA foreign_keys = ON');
  let sequence = 0;
  const id = () => `id-${++sequence}`;
  return { db, id };
}
const tuesday = (day) => new Date(2026, 9, day, 9, 0, 0);

test('migration and seed are idempotent and create the documented schedule', async () => {
  const { db } = await setup();
  await migrateAndSeed(db);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM exercises')).count, 5);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workout_schedules')).count, 3);
  assert.equal((await db.getFirstAsync('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')).version, 4);
  assert.equal((await db.getFirstAsync("SELECT target_added_weight FROM exercises WHERE id='bulgarians'")).target_added_weight, null);
  await db.runAsync("UPDATE exercises SET target_added_weight=6 WHERE id='bulgarians'");
  await migrateAndSeed(db);
  assert.equal((await getTodayPlan(db, tuesday(6))).exercises[0].targetAddedWeight, 6);
  assert.equal((await getTodayPlan(db, tuesday(6))).exercises[0].name, 'Bulgarians');
  assert.deepEqual((await getTodayPlan(db, tuesday(10))).exercises.map((exercise) => exercise.name), ['Push-ups', 'Pike Push-ups']);
  assert.deepEqual((await getTodayPlan(db, tuesday(11))).exercises.map((exercise) => exercise.name), ['Chin-ups', 'L-sit']);
});

test('version 2 migration associates existing version 1 workouts without deleting them', async () => {
  const db = new NodeDatabase();
  await db.execAsync(`
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (1, '2026-10-02T10:00:00.000Z');
    CREATE TABLE exercises(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL,category TEXT NOT NULL,tracking_type TEXT NOT NULL,target_sets INTEGER NOT NULL,target_rep_min INTEGER,target_rep_max INTEGER,target_duration_seconds INTEGER,default_rest_seconds INTEGER NOT NULL DEFAULT 180,sort_order INTEGER NOT NULL,is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE workout_schedules(id TEXT PRIMARY KEY NOT NULL,weekday INTEGER NOT NULL,workout_type TEXT NOT NULL,is_active INTEGER NOT NULL DEFAULT 1,UNIQUE(weekday));
    CREATE TABLE workout_schedule_exercises(schedule_id TEXT NOT NULL REFERENCES workout_schedules(id),exercise_id TEXT NOT NULL REFERENCES exercises(id),sort_order INTEGER NOT NULL,PRIMARY KEY(schedule_id,sort_order),UNIQUE(schedule_id,exercise_id));
    CREATE TABLE workouts(id TEXT PRIMARY KEY NOT NULL,date TEXT NOT NULL,workout_type TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,status TEXT NOT NULL);
    CREATE TABLE workout_exercises(id TEXT PRIMARY KEY NOT NULL,workout_id TEXT NOT NULL REFERENCES workouts(id),exercise_id TEXT NOT NULL REFERENCES exercises(id),sort_order INTEGER NOT NULL,completed INTEGER NOT NULL DEFAULT 0,feeling REAL,UNIQUE(workout_id,sort_order));
    CREATE TABLE workout_sets(id TEXT PRIMARY KEY NOT NULL,workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id),set_number INTEGER NOT NULL,reps INTEGER,duration_seconds INTEGER,added_weight REAL,completed INTEGER NOT NULL DEFAULT 0,UNIQUE(workout_exercise_id,set_number));
    INSERT INTO workout_schedules(id,weekday,workout_type) VALUES ('old-tuesday',2,'Legs');
    INSERT INTO workouts(id,date,workout_type,started_at,ended_at,status) VALUES ('old-workout','2026-10-06','Legs','2026-10-06T09:00:00.000Z','2026-10-06T10:00:00.000Z','completed');
  `);
  await migrateAndSeed(db, () => '2026-10-03T10:00:00.000Z');
  const migrated = await db.getFirstAsync('SELECT schedule_id,status FROM workouts WHERE id=?', 'old-workout');
  assert.equal(migrated.schedule_id, 'old-tuesday');
  assert.equal(migrated.status, 'completed');
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workouts')).count, 1);
  assert.equal((await db.getFirstAsync('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')).version, 4);
});

test('starts one ordered workout and resumes it without duplicating rows', async () => {
  const { db, id } = await setup();
  const first = await startOrResumeToday(db, id, () => tuesday(6));
  const resumed = await startOrResumeToday(db, id, () => tuesday(6));
  assert.equal(first.id, resumed.id);
  assert.deepEqual(first.exercises.map((exercise) => exercise.exercise.id), ['bulgarians']);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workouts')).count, 1);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workout_exercises')).count, 1);
});

test('records sets in order, rejects invalid input, finishes exercise and persists decimal feeling', async () => {
  const { db, id } = await setup();
  const workout = await startOrResumeToday(db, id, () => tuesday(6));
  const item = workout.exercises[0];
  await assert.rejects(completeSet(db, { workoutId: workout.id, workoutExerciseId: item.id, exercise: item.exercise, value: '', weight: '', idFactory: id }), /entier/);
  for (let i = 1; i <= item.exercise.targetSets; i++) {
    const { set, restTimer } = await completeSet(db, { workoutId: workout.id, workoutExerciseId: item.id, exercise: item.exercise, value: String(12 - i), weight: i < 3 ? '5' : '6', idFactory: id, clock: () => tuesday(6) });
    assert.equal(set.setNumber, i);
    assert.equal(set.addedWeight, i < 3 ? 5 : 6);
    if (restTimer) await transitionPersistedRestTimer(db, restTimer.id, 'skip', () => tuesday(6));
    if (i === 1) {
      assert.deepEqual(afterSetRecorded({ kind: 'active_exercise', workoutId: workout.id, workoutExerciseId: item.id }, 1, item.exercise.targetSets), { kind: 'completed_set', workoutId: workout.id, workoutExerciseId: item.id, setNumber: 1 });
      assert.deepEqual(stateFromSession(await getWorkout(db, workout.id)), { kind: 'active_set', workoutId: workout.id, workoutExerciseId: item.id, setNumber: 2 });
    }
  }
  let reloaded = await getWorkout(db, workout.id);
  assert.equal(stateFromSession(reloaded).kind, 'completed_exercise');
  reloaded = await finishExercise(db, { workoutId: workout.id, workoutExerciseId: item.id, feeling: 7.5, targetSets: item.exercise.targetSets, clock: () => tuesday(6) });
  assert.equal(reloaded.exercises[0].feeling, 7.5);
  assert.equal(reloaded.status, 'completed');
  assert.ok(reloaded.endedAt);
  assert.equal(stateFromSession(reloaded).kind, 'completed_workout');
  assert.equal((await getCompletedWorkouts(db)).length, 1);
});

test('does not finish an exercise with missing sets and enforces duration payload for L-sit', async () => {
  const { db, id } = await setup();
  const workout = await startOrResumeToday(db, id, () => tuesday(11));
  const lSit = workout.exercises[1];
  await assert.rejects(finishExercise(db, { workoutId: workout.id, workoutExerciseId: lSit.id, feeling: 8, targetSets: 4 }), /Complétez/);
  const first = await recordSet(db, { workoutId: workout.id, workoutExerciseId: lSit.id, exercise: lSit.exercise, durationSeconds: 10, addedWeight: null, idFactory: id, clock: () => tuesday(11) });
  assert.equal(first.set.durationSeconds, 10);
  assert.ok(first.restTimer);
  await transitionPersistedRestTimer(db, first.restTimer.id, 'skip', () => tuesday(11));
  await assert.rejects(recordSet(db, { workoutId: workout.id, workoutExerciseId: lSit.id, exercise: lSit.exercise, reps: 10, idFactory: id }), /CHECK constraint/);
});

test('last performance comes from latest completed workout and includes per-set load', async () => {
  const { db, id } = await setup();
  const first = await startOrResumeToday(db, id, () => tuesday(6));
  const item = first.exercises[0];
  for (let i = 0; i < item.exercise.targetSets; i++) {
    const result = await recordSet(db, { workoutId: first.id, workoutExerciseId: item.id, exercise: item.exercise, reps: 10 + i, addedWeight: i < 2 ? 5 : 6, idFactory: id, clock: () => tuesday(6) });
    if (result.restTimer) await transitionPersistedRestTimer(db, result.restTimer.id, 'skip', () => tuesday(6));
  }
  await finishExercise(db, { workoutId: first.id, workoutExerciseId: item.id, feeling: 8.5, targetSets: 4 });
  const last = await getLastPerformance(db, 'bulgarians');
  assert.deepEqual(last.sets.map((set) => set.addedWeight), [5, 5, 6, 6]);
  assert.deepEqual(last.sets.map((set) => set.reps), [10, 11, 12, 13]);
  assert.equal(last.feeling, 8.5);
});

test('the persisted workout projection returns from normal expiry and skip to the next set', async (t) => {
  for (const finishRest of [
    ['expiry', async (db, timer) => transitionPersistedRestTimer(db, timer.id, 'tick', () => new Date(Date.parse(timer.deadlineAt)))],
    ['skip', async (db, timer) => transitionPersistedRestTimer(db, timer.id, 'skip', () => tuesday(6))],
  ]) {
    await t.test(finishRest[0], async () => {
      const { db, id } = await setup();
      const workout = await startOrResumeToday(db, id, () => tuesday(6));
      const exercise = workout.exercises[0];
      const first = await completeSet(db, { workoutId: workout.id, workoutExerciseId: exercise.id, exercise: exercise.exercise, value: '10', weight: '', idFactory: id, clock: () => tuesday(6) });
      assert.equal(stateFromSession(await getWorkout(db, workout.id), first.restTimer).kind, 'resting');
      const transition = await finishRest[1](db, first.restTimer);
      assert.equal(transition.timer.state, finishRest[0] === 'expiry' ? 'finished' : 'skipped');

      // Simulate leaving and reopening the route: reconstruct from SQLite, not React state.
      const reloaded = await getWorkout(db, workout.id);
      const persistedTimer = await getRestTimerAfterSet(db, exercise.id, 1);
      assert.deepEqual(stateFromSession(reloaded, persistedTimer), { kind: 'active_set', workoutId: workout.id, workoutExerciseId: exercise.id, setNumber: 2 });
      const second = await completeSet(db, { workoutId: workout.id, workoutExerciseId: exercise.id, exercise: exercise.exercise, value: '9', weight: '', idFactory: id, clock: () => tuesday(6) });
      assert.equal(second.set.setNumber, 2);
    });
  }
});

test('the final set enters exercise completion, then the next exercise and workout completion', async () => {
  const { db, id } = await setup();
  const workout = await startOrResumeToday(db, id, () => tuesday(10));
  const firstExercise = workout.exercises[0];
  for (let setNumber = 1; setNumber <= firstExercise.exercise.targetSets; setNumber++) {
    const recorded = await completeSet(db, { workoutId: workout.id, workoutExerciseId: firstExercise.id, exercise: firstExercise.exercise, value: '10', weight: '', idFactory: id, clock: () => tuesday(10) });
    if (recorded.restTimer) await transitionPersistedRestTimer(db, recorded.restTimer.id, 'skip', () => tuesday(10));
  }
  let session = await getWorkout(db, workout.id);
  assert.deepEqual(stateFromSession(session), { kind: 'completed_exercise', workoutId: workout.id, workoutExerciseId: firstExercise.id });
  session = await finishExercise(db, { workoutId: workout.id, workoutExerciseId: firstExercise.id, feeling: 8.5, targetSets: firstExercise.exercise.targetSets });
  assert.deepEqual(stateFromSession(session), { kind: 'active_exercise', workoutId: workout.id, workoutExerciseId: session.exercises[1].id });

  const finalExercise = session.exercises[1];
  for (let setNumber = 1; setNumber <= finalExercise.exercise.targetSets; setNumber++) {
    const recorded = await completeSet(db, { workoutId: workout.id, workoutExerciseId: finalExercise.id, exercise: finalExercise.exercise, value: '10', weight: '', idFactory: id, clock: () => tuesday(10) });
    if (recorded.restTimer) await transitionPersistedRestTimer(db, recorded.restTimer.id, 'skip', () => tuesday(10));
  }
  session = await getWorkout(db, workout.id);
  assert.equal(stateFromSession(session).kind, 'completed_exercise');
  session = await finishExercise(db, { workoutId: workout.id, workoutExerciseId: finalExercise.id, feeling: 7.5, targetSets: finalExercise.exercise.targetSets });
  assert.equal(session.status, 'completed');
  assert.equal(stateFromSession(session).kind, 'completed_workout');
});

test('rapid duplicate validation records at most one copy of the same set', async () => {
  const { db, id } = await setup();
  const workout = await startOrResumeToday(db, id, () => tuesday(6));
  const exercise = workout.exercises[0];
  const attempts = await Promise.allSettled([
    completeSet(db, { workoutId: workout.id, workoutExerciseId: exercise.id, exercise: exercise.exercise, value: '10', weight: '', idFactory: id, clock: () => tuesday(6) }),
    completeSet(db, { workoutId: workout.id, workoutExerciseId: exercise.id, exercise: exercise.exercise, value: '10', weight: '', idFactory: id, clock: () => tuesday(6) }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workout_sets WHERE workout_exercise_id=?', exercise.id)).count, 1);
});

test('a completed workout locks ordinary start; confirmed restart creates a new row and preserves history', async () => {
  const { db, id } = await setup();
  const original = await startOrResumeToday(db, id, () => tuesday(6));
  const item = original.exercises[0];
  await assert.rejects(restartTodayWorkout(db, id, () => tuesday(6)), /séance en cours/);
  for (let i = 0; i < item.exercise.targetSets; i++) {
    const result = await recordSet(db, { workoutId: original.id, workoutExerciseId: item.id, exercise: item.exercise, reps: 10, idFactory: id, clock: () => tuesday(6) });
    if (result.restTimer) await transitionPersistedRestTimer(db, result.restTimer.id, 'skip', () => tuesday(6));
  }
  await finishExercise(db, { workoutId: original.id, workoutExerciseId: item.id, feeling: 8, targetSets: 4, clock: () => tuesday(6) });
  assert.equal((await getCompletedWorkoutForToday(db, tuesday(6))).id, original.id);
  await assert.rejects(startOrResumeToday(db, id, () => tuesday(6)), WorkoutDayAlreadyCompletedError);
  const restarted = await restartTodayWorkout(db, id, () => tuesday(6));
  assert.notEqual(restarted.id, original.id);
  assert.equal(restarted.status, 'active');
  assert.equal((await getCompletedWorkouts(db)).length, 1);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workouts WHERE date=?', '2026-10-06')).count, 2);
  assert.equal((await startOrResumeToday(db, id, () => tuesday(6))).id, restarted.id);
});

test('rest timer transitions use a deadline and preserve remaining time across pause and resume', () => {
  const ready = { id: 'timer', workoutId: 'workout', workoutExerciseId: 'exercise', afterSetNumber: 1, durationSeconds: 180, state: 'ready', startedAt: null, deadlineAt: null, pausedRemainingSeconds: null, endedAt: null };
  const startMs = Date.parse('2026-10-03T10:00:00.000Z');
  const running = transitionRestTimer(ready, 'start', startMs);
  assert.equal(running.state, 'running');
  assert.equal(remainingSeconds(running, startMs + 23_000), 157);
  const paused = transitionRestTimer(running, 'pause', startMs + 23_000);
  assert.equal(paused.state, 'paused');
  assert.equal(paused.pausedRemainingSeconds, 157);
  const resumed = transitionRestTimer(paused, 'resume', startMs + 60_000);
  assert.equal(resumed.deadlineAt, new Date(startMs + 60_000 + 157_000).toISOString());
  const finished = transitionRestTimer(resumed, 'tick', startMs + 217_000);
  assert.equal(finished.state, 'finished');
  assert.equal(transitionRestTimer(finished, 'tick', startMs + 218_000), finished);
  assert.equal(transitionRestTimer(running, 'skip', startMs + 180_000).state, 'finished');
});

test('skip is the single rest-ending action and immediately permits the next set', async () => {
  const { db, id } = await setup();
  const workout = await startOrResumeToday(db, id, () => tuesday(6));
  const item = workout.exercises[0];
  const first = await completeSet(db, { workoutId: workout.id, workoutExerciseId: item.id, exercise: item.exercise, value: '10', weight: '', idFactory: id, clock: () => tuesday(6) });
  assert.equal(first.restTimer.state, 'running');
  assert.equal((await getRestTimerAfterSet(db, item.id, 1)).state, 'running');
  await assert.rejects(completeSet(db, { workoutId: workout.id, workoutExerciseId: item.id, exercise: item.exercise, value: '10', weight: '', idFactory: id, clock: () => tuesday(6) }), /repos/);
  const paused = await transitionPersistedRestTimer(db, first.restTimer.id, 'pause', () => new Date(tuesday(6).getTime() + 20_000));
  assert.equal(paused.timer.state, 'paused');
  assert.equal(paused.timer.pausedRemainingSeconds, 160);
  const resumed = await transitionPersistedRestTimer(db, first.restTimer.id, 'resume', () => new Date(tuesday(6).getTime() + 40_000));
  assert.equal(resumed.timer.state, 'running');
  assert.equal(remainingSeconds(resumed.timer, tuesday(6).getTime() + 40_000), 160);
  const skipped = await transitionPersistedRestTimer(db, first.restTimer.id, 'skip', () => tuesday(6));
  assert.equal(skipped.timer.state, 'skipped');
  const second = await completeSet(db, { workoutId: workout.id, workoutExerciseId: item.id, exercise: item.exercise, value: '9', weight: '', idFactory: id, clock: () => tuesday(6) });
  assert.equal(second.set.setNumber, 2);
  const expired = await transitionPersistedRestTimer(db, second.restTimer.id, 'tick', () => new Date(tuesday(6).getTime() + 180_000));
  assert.equal(expired.timer.state, 'finished');
  assert.equal(expired.finishedNow, true);
  const reread = await transitionPersistedRestTimer(db, second.restTimer.id, 'tick', () => new Date(tuesday(6).getTime() + 181_000));
  assert.equal(reread.finishedNow, false);
  assert.equal((await getRestTimerAfterSet(db, item.id, 2)).state, 'finished');
});

test('the rest panel has no rest-only cancel action; workout abandonment remains separate', () => {
  const panel = readFileSync(new URL('../src/features/workout/components/RestTimerPanel.tsx', import.meta.url), 'utf8');
  const session = readFileSync(new URL('../src/features/workout/screens/WorkoutSessionScreen.tsx', import.meta.url), 'utf8');
  const timerMachine = readFileSync(new URL('../src/features/workout/domain/restTimerMachine.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(panel, /Annuler le repos|onAction\('cancel'\)/);
  assert.doesNotMatch(timerMachine, /event === 'cancel'/);
  assert.match(panel, /Passer le repos/);
  assert.match(session, /Abandonner la séance/);
});

test('cancelling persists a recoverable cancelled state and excludes it from history', async () => {
  const { db, id } = await setup();
  const workout = await startOrResumeToday(db, id, () => tuesday(6));
  const firstSet = await recordSet(db, { workoutId: workout.id, workoutExerciseId: workout.exercises[0].id, exercise: workout.exercises[0].exercise, reps: 10, idFactory: id, clock: () => tuesday(6) });
  assert.ok(firstSet.restTimer);
  await cancelWorkout(db, workout.id, () => tuesday(6));
  assert.equal((await getWorkout(db, workout.id)).status, 'cancelled');
  assert.equal((await getRestTimerAfterSet(db, workout.exercises[0].id, 1)).state, 'cancelled');
  assert.equal((await getCompletedWorkouts(db)).length, 0);
  assert.equal(await getLastPerformance(db, 'bulgarians'), null);
});
