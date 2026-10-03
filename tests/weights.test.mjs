import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { deleteWeightItem, createWeightItem, getAvailableLoads, getWeightInventory, setWeightItemActive, updateWeightItem } from '../src/features/weights/data/weightRepository.ts';
import { assessAvailableLoadProgression, formatKilograms, formatLoad, formatLoadComposition, formatRecordedLoad, generateAvailableLoads, parseWeightKilograms, validateWeightItemName } from '../src/features/weights/domain/weightSystem.ts';
import { getWorkout, recordSet, startOrResumeToday } from '../src/features/workout/data/workoutRepository.ts';
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
  return { db, id: () => `weight-${++nextId}` };
}

const seedInventory = {
  baseWeightGrams: 3000,
  items: [
    { id: 'river', name: "La rivière à l'envers", weightGrams: 900, isActive: true, sortOrder: 0 },
    { id: 'cars', name: '1200 voitures', weightGrams: 2100, isActive: true, sortOrder: 1 },
    { id: 'books', name: '2 livres programmation', weightGrams: 1500, isActive: true, sortOrder: 2 },
  ],
};

const exercise = {
  id: 'push-ups', name: 'Push-ups', category: 'Push', trackingType: 'reps',
  targetSets: 4, targetRepMin: 8, targetRepMax: 12, targetDurationSeconds: null,
  targetAddedWeight: null, defaultRestSeconds: 180,
};

function performance(weightGrams, reps = 12, feeling = 6.5) {
  return {
    date: '2026-10-02', feeling,
    sets: Array.from({ length: 4 }, (_, index) => ({
      id: `set-${index}`, setNumber: index + 1, reps, durationSeconds: null,
      addedWeight: weightGrams / 1000, addedWeightGrams: weightGrams,
    })),
  };
}

test('generates every seeded combination in integer grams, unique and ascending', () => {
  const loads = generateAvailableLoads(seedInventory);
  assert.deepEqual(loads.map((load) => load.addedWeightGrams), [0, 3000, 3900, 4500, 5100, 5400, 6000, 6600, 7500]);
  assert.equal(new Set(loads.map((load) => load.addedWeightGrams)).size, loads.length);
  assert.deepEqual(loads[0], { addedWeightGrams: 0, composition: [] });
  assert.deepEqual(loads.find((load) => load.addedWeightGrams === 3000).composition.map((item) => item.name), ['Sac de base']);
  assert.deepEqual(loads.find((load) => load.addedWeightGrams === 3900).composition.map((item) => item.name), ['Sac de base', "La rivière à l'envers"]);
  assert.deepEqual(loads.find((load) => load.addedWeightGrams === 4500).composition.map((item) => item.name), ['Sac de base', '2 livres programmation']);
  assert.deepEqual(loads.find((load) => load.addedWeightGrams === 5100).composition.map((item) => item.name), ['Sac de base', '1200 voitures']);
  assert.deepEqual(loads.find((load) => load.addedWeightGrams === 5400).composition.map((item) => item.name), ['Sac de base', "La rivière à l'envers", '2 livres programmation']);
  assert.deepEqual(loads.find((load) => load.addedWeightGrams === 6000).composition.map((item) => item.name), ['Sac de base', "La rivière à l'envers", '1200 voitures']);
  assert.deepEqual(loads.find((load) => load.addedWeightGrams === 6600).composition.map((item) => item.name), ['Sac de base', '1200 voitures', '2 livres programmation']);
  assert.deepEqual(loads.find((load) => load.addedWeightGrams === 7500).composition.map((item) => item.name), ['Sac de base', "La rivière à l'envers", '1200 voitures', '2 livres programmation']);
});

test('deduplicates equal sums from different active-item subsets and keeps a stable composition', () => {
  const loads = generateAvailableLoads({
    baseWeightGrams: 3000,
    items: [
      { id: 'a', name: 'A', weightGrams: 1000, isActive: true, sortOrder: 0 },
      { id: 'b', name: 'B', weightGrams: 1000, isActive: true, sortOrder: 1 },
      { id: 'c', name: 'C', weightGrams: 2000, isActive: true, sortOrder: 2 },
    ],
  });
  assert.equal(loads.filter((load) => load.addedWeightGrams === 5000).length, 1);
  assert.deepEqual(loads.find((load) => load.addedWeightGrams === 5000).composition.map((item) => item.name), ['Sac de base', 'A', 'B']);
});

test('validates and formats object weights without floating-point display artifacts', () => {
  assert.equal(parseWeightKilograms('0,9'), 900);
  assert.equal(parseWeightKilograms('1.234'), 1234);
  assert.throws(() => parseWeightKilograms('0'), /supérieur à 0/);
  assert.throws(() => parseWeightKilograms('-1'), /poids positif/);
  assert.throws(() => parseWeightKilograms('1.2345'), /trois décimales/);
  assert.throws(() => validateWeightItemName('  '), /nom/);
  assert.equal(formatKilograms(5400), '5.4');
  assert.equal(formatKilograms(3000), '3.0');
  assert.equal(formatLoad(0), 'Poids du corps');
  assert.equal(formatLoad(6600), '+6.6 kg');
  assert.equal(formatRecordedLoad(5.399999999999999), '+5.4 kg');
});

test('selects the smallest strictly higher available load and keeps progression rules unchanged', () => {
  const loads = generateAvailableLoads(seedInventory);
  assert.equal(assessAvailableLoadProgression(exercise, performance(5100), loads).targetLoadGrams, 5400);
  assert.equal(assessAvailableLoadProgression(exercise, performance(6000), loads).targetLoadGrams, 6600);
  const max = assessAvailableLoadProgression(exercise, performance(7500), loads);
  assert.equal(max.progression.status, 'increase_load_recommended');
  assert.equal(max.noHigherLoadAvailable, true);
  assert.equal(max.targetLoadGrams, 7500);

  const maintain = assessAvailableLoadProgression(exercise, performance(5100, 11), loads);
  assert.equal(maintain.progression.status, 'maintain');
  assert.equal(maintain.targetLoadGrams, 5100);
  assert.equal(maintain.noHigherLoadAvailable, false);
  const missing = assessAvailableLoadProgression(exercise, null, loads);
  assert.equal(missing.progression.status, 'insufficient_data');
  assert.equal(missing.targetLoadGrams, 0);
  const timedExercise = { ...exercise, trackingType: 'duration', targetRepMax: null, targetDurationSeconds: null };
  assert.equal(assessAvailableLoadProgression(timedExercise, performance(5100), loads).progression.recommendation, null);
});

test('migration seeds equipment idempotently and item CRUD recomputes future combinations', async () => {
  const { db, id } = await setup();
  let inventory = await getWeightInventory(db);
  assert.equal(inventory.baseWeightGrams, 3000);
  assert.deepEqual(inventory.items.map((item) => item.weightGrams), [900, 2100, 1500]);
  await migrateAndSeed(db);
  assert.equal((await db.getFirstAsync('SELECT COUNT(*) AS count FROM weight_items')).count, 3);
  assert.equal((await db.getFirstAsync('SELECT MAX(version) AS version FROM schema_migrations')).version, 7);

  const initialLoads = await getAvailableLoads(db);
  const added = await createWeightItem(db, { name: 'Livre X', weightGrams: 1200 }, id);
  assert.ok((await getAvailableLoads(db)).some((load) => load.addedWeightGrams === 4200));
  await updateWeightItem(db, added.id, { name: 'Livre Y', weightGrams: 1300 });
  assert.ok((await getAvailableLoads(db)).some((load) => load.addedWeightGrams === 4300));
  await setWeightItemActive(db, added.id, false);
  assert.deepEqual((await getAvailableLoads(db)).map((load) => load.addedWeightGrams), initialLoads.map((load) => load.addedWeightGrams));
  await setWeightItemActive(db, added.id, true);
  await deleteWeightItem(db, added.id);
  assert.deepEqual((await getAvailableLoads(db)).map((load) => load.addedWeightGrams), initialLoads.map((load) => load.addedWeightGrams));
});

test('saved set retains its exact load and composition after inventory objects are edited and deleted', async () => {
  const { db, id } = await setup();
  const bagLoad = (await getAvailableLoads(db)).find((load) => load.addedWeightGrams === 6000);
  const inventory = await getWeightInventory(db);
  const workout = await startOrResumeToday(db, id, () => new Date(2026, 9, 6, 9));
  const item = workout.exercises[0];
  await recordSet(db, {
    workoutId: workout.id,
    workoutExerciseId: item.id,
    exercise: item.exercise,
    reps: 12,
    addedWeight: bagLoad.addedWeightGrams / 1000,
    addedWeightGrams: bagLoad.addedWeightGrams,
    loadComposition: bagLoad.composition,
    idFactory: id,
    clock: () => new Date(2026, 9, 6, 9),
  });

  const river = inventory.items.find((weight) => weight.id === 'river-inverted');
  await updateWeightItem(db, river.id, { name: 'Objet renommé', weightGrams: 1000 });
  await deleteWeightItem(db, 'cars-1200');
  const saved = (await getWorkout(db, workout.id)).exercises[0].sets[0];
  assert.equal(saved.addedWeight, 6);
  assert.equal(saved.addedWeightGrams, 6000);
  assert.equal(formatLoadComposition(saved.loadComposition), 'Sac de base + La rivière à l\'envers + 1200 voitures');
  assert.deepEqual((await getAvailableLoads(db)).map((load) => load.addedWeightGrams), [0, 3000, 4000, 4500, 5500]);
});
