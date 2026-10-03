import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { createManualWorkout, deleteCompletedWorkout, filterWorkoutsByExercise, getHistoryExerciseCatalog, getHistoryWorkouts, updateCompletedWorkout } from '../src/features/history/data/historyRepository.ts';
import { validateHistoryWorkoutDraft } from '../src/features/history/domain/historyService.ts';
import { getLastPerformance } from '../src/features/workout/data/workoutRepository.ts';
import { assessProgression } from '../src/features/workout/domain/progressionEngine.ts';
import { migrateAndSeed } from '../src/shared/database/schema.ts';

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
  let nextId = 0;
  const id = () => `history-${++nextId}`;
  const catalog = await getHistoryExerciseCatalog(db);
  return { db, id, catalog };
}

function draft(exercise, overrides = {}) {
  return {
    date: '2026-10-02',
    workoutType: 'Push',
    exercises: [{
      exerciseId: exercise.id,
      feeling: '6.5',
      sets: Array.from({ length: exercise.targetSets }, () => ({ value: '12', weight: '6' })),
    }],
    ...overrides,
  };
}

test('manual history draft validates calendar dates, complete sets, feeling, and decimal loads', async () => {
  const { catalog } = await setup();
  const pushUps = catalog.find((exercise) => exercise.id === 'push-ups');
  const normalized = validateHistoryWorkoutDraft(draft(pushUps), catalog, '2026-10-03');
  assert.equal(normalized.date, '2026-10-02');
  assert.equal(normalized.exercises[0].feeling, 6.5);
  assert.equal(normalized.exercises[0].sets[0].addedWeight, 6);
  assert.throws(() => validateHistoryWorkoutDraft(draft(pushUps, { date: '2026-02-30' }), catalog, '2026-10-03'), /date réelle/);
  assert.throws(() => validateHistoryWorkoutDraft(draft(pushUps, { date: '2026-10-04' }), catalog, '2026-10-03'), /aujourd’hui ou dans le passé/);
  assert.throws(() => validateHistoryWorkoutDraft(draft(pushUps, { exercises: [{ ...draft(pushUps).exercises[0], sets: [] }] }), catalog, '2026-10-03'), /doit contenir/);
  assert.throws(() => validateHistoryWorkoutDraft(draft(pushUps, { exercises: [{ ...draft(pushUps).exercises[0], feeling: '10.1' }] }), catalog, '2026-10-03'), /ressenti/);
  assert.throws(() => validateHistoryWorkoutDraft(draft(pushUps, { exercises: [{ ...draft(pushUps).exercises[0], sets: [{ value: '12.5', weight: '6' }, ...draft(pushUps).exercises[0].sets.slice(1)] }] }), catalog, '2026-10-03'), /entier/);
});

test('completed history lists sessions and filters them by exercise', async () => {
  const { db, id, catalog } = await setup();
  const pushUps = catalog.find((exercise) => exercise.id === 'push-ups');
  const older = validateHistoryWorkoutDraft(draft(pushUps), catalog, '2026-10-03');
  const newer = validateHistoryWorkoutDraft(draft(pushUps, { date: '2026-10-03', workoutType: 'Push + Pull' }), catalog, '2026-10-03');
  const first = await createManualWorkout(db, older, id);
  const second = await createManualWorkout(db, newer, id);
  await db.runAsync('UPDATE workouts SET ended_at=? WHERE id=?', '2026-10-01T08:00:00.000Z', second.id);
  await db.runAsync('UPDATE workouts SET ended_at=? WHERE id=?', '2026-10-03T08:00:00.000Z', first.id);
  const sessions = await getHistoryWorkouts(db);
  assert.deepEqual(sessions.map((session) => session.id), [second.id, first.id]);
  assert.deepEqual(filterWorkoutsByExercise(sessions, 'push-ups').map((session) => session.id), [second.id, first.id]);
  assert.equal((await getLastPerformance(db, pushUps.id)).date, '2026-10-03');
  assert.equal(filterWorkoutsByExercise(sessions, 'l-sit').length, 0);
});

test('manual workout is the real latest performance; editing the same row updates progression inputs', async () => {
  const { db, id, catalog } = await setup();
  const pushUps = catalog.find((exercise) => exercise.id === 'push-ups');
  const initial = validateHistoryWorkoutDraft(draft(pushUps), catalog, '2026-10-03');
  const workout = await createManualWorkout(db, initial, id);
  const createdPerformance = await getLastPerformance(db, pushUps.id);
  assert.equal(createdPerformance.date, '2026-10-02');
  assert.equal(assessProgression(pushUps, createdPerformance).status, 'increase_load_recommended');

  const revisedDraft = draft(pushUps, {
    date: '2026-10-01',
    exercises: [{ exerciseId: pushUps.id, feeling: '8', sets: Array.from({ length: 4 }, () => ({ value: '10', weight: '5.5' })) }],
  });
  const updated = await updateCompletedWorkout(db, workout.id, validateHistoryWorkoutDraft(revisedDraft, catalog, '2026-10-03'), id);
  assert.equal(updated.id, workout.id);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workouts')).count, 1);
  const changedPerformance = await getLastPerformance(db, pushUps.id);
  assert.equal(changedPerformance.date, '2026-10-01');
  assert.deepEqual(changedPerformance.sets.map((set) => set.addedWeight), [5.5, 5.5, 5.5, 5.5]);
  assert.equal(assessProgression(pushUps, changedPerformance).status, 'maintain');
});

test('deleting a completed session cascades exercises and sets and removes it from progression', async () => {
  const { db, id, catalog } = await setup();
  const pushUps = catalog.find((exercise) => exercise.id === 'push-ups');
  const workout = await createManualWorkout(db, validateHistoryWorkoutDraft(draft(pushUps), catalog, '2026-10-03'), id);
  const workoutExerciseId = workout.exercises[0].id;
  await deleteCompletedWorkout(db, workout.id);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workouts')).count, 0);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workout_exercises')).count, 0);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM workout_sets')).count, 0);
  assert.equal(await getLastPerformance(db, pushUps.id), null);
  assert.equal(await db.getFirstAsync('SELECT id FROM workout_exercises WHERE id=?', workoutExerciseId), null);
});

test('time-based manual sessions store seconds and never use the repetition load recommendation', async () => {
  const { db, id, catalog } = await setup();
  const lSit = catalog.find((exercise) => exercise.id === 'l-sit');
  const input = {
    date: '2026-10-02',
    workoutType: 'Pull + Abs',
    exercises: [{ exerciseId: lSit.id, feeling: 6, sets: Array.from({ length: 4 }, () => ({ value: 10, addedWeight: null })) }],
  };
  const workout = await createManualWorkout(db, input, id);
  const performance = await getLastPerformance(db, lSit.id);
  assert.deepEqual(performance.sets.map((set) => set.durationSeconds), [10, 10, 10, 10]);
  assert.ok(performance.sets.every((set) => set.reps === null));
  assert.equal(assessProgression(lSit, performance).recommendation, null);
  assert.equal((await getHistoryWorkouts(db))[0].id, workout.id);
});
