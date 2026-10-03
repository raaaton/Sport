import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { getNotificationPreferences, getWorkoutOccurrences, getWorkoutReminderSchedules, updateNotificationPreferences } from '../src/features/notifications/data/notificationRepository.ts';
import { createNotificationSpecs, managedSportNotificationIds, nextMonthlyPhotoOccurrence, planWorkoutNotifications } from '../src/features/notifications/domain/notificationPlanner.ts';
import { reconcileSportNotifications } from '../src/features/notifications/domain/localNotificationReconciler.ts';
import { routeForSportNotificationKind } from '../src/features/notifications/domain/notificationRoute.ts';
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

const schedules = [
  { id: 'legs', weekday: 2, workoutType: 'Jambes', isActive: true },
  { id: 'push', weekday: 6, workoutType: 'Push', isActive: true },
  { id: 'pull', weekday: 7, workoutType: 'Pull + Abdos', isActive: true },
];
const enabled = { workoutEnabled: true, photoEnabled: false, workoutHour: 18, photoHour: 6 };

async function setup() {
  const db = new NodeDatabase();
  await migrateAndSeed(db, () => '2026-10-03T10:00:00.000Z');
  await db.execAsync('PRAGMA foreign_keys=ON');
  return db;
}

test('migration v5 seeds opt-in notification defaults and preserves them across reopen', async () => {
  const db = await setup();
  assert.deepEqual(await getNotificationPreferences(db), { workoutEnabled: false, photoEnabled: false, workoutHour: null, photoHour: 6 });
  assert.equal((await db.getFirstAsync('SELECT MAX(version) AS version FROM schema_migrations')).version, 5);
  await updateNotificationPreferences(db, { workoutEnabled: true, workoutHour: 19, photoEnabled: true });
  await migrateAndSeed(db);
  assert.deepEqual(await getNotificationPreferences(db), { workoutEnabled: true, photoEnabled: true, workoutHour: 19, photoHour: 6 });
  await assert.rejects(updateNotificationPreferences(db, { workoutHour: 24 }), /comprise entre 0 et 23/);
});

test('plans upcoming active weekdays at the selected hour with stable ids and no invented slots', () => {
  const start = new Date(2026, 9, 5, 17, 30);
  const result = planWorkoutNotifications(schedules, [], enabled, start, 8);
  assert.deepEqual(result.map((item) => [item.occurrenceDate, item.body]), [
    ['2026-10-06', 'Jambes'], ['2026-10-10', 'Push'], ['2026-10-11', 'Pull + Abdos'],
  ]);
  assert.equal(result[0].identifier, 'sport.local.workout.legs.2026-10-06');
  assert.deepEqual(result[0].data, { kind: 'workout', scheduleId: 'legs', occurrenceDate: '2026-10-06', route: '/(tabs)' });
  assert.deepEqual(planWorkoutNotifications(schedules, [], { ...enabled, workoutEnabled: false }, start), []);
  assert.deepEqual(planWorkoutNotifications(schedules, [], { ...enabled, workoutHour: null }, start), []);
  assert.deepEqual(planWorkoutNotifications(schedules, [], enabled, start, 0), []);
});

test('current local date at/before the chosen hour is skipped, later weekdays remain planned', () => {
  const before = planWorkoutNotifications(schedules, [], enabled, new Date(2026, 9, 6, 17, 59), 1);
  assert.equal(before.length, 1);
  const after = planWorkoutNotifications(schedules, [], enabled, new Date(2026, 9, 6, 18, 0), 1);
  assert.deepEqual(after, []);
  const later = planWorkoutNotifications(schedules, [], enabled, new Date(2026, 9, 6, 18, 1), 8);
  assert.equal(later[0].occurrenceDate, '2026-10-10');
});

test('inactive sessions and dates with an existing started, completed or cancelled workout are omitted', () => {
  const disabledSchedules = schedules.map((item) => item.id === 'push' ? { ...item, isActive: false } : item);
  const result = planWorkoutNotifications(disabledSchedules, [
    { scheduleId: 'legs', date: '2026-10-06', status: 'active' },
    { scheduleId: 'push', date: '2026-10-10', status: 'completed' },
    { scheduleId: 'pull', date: '2026-10-11', status: 'cancelled' },
  ], enabled, new Date(2026, 9, 5, 17), 8);
  assert.deepEqual(result, []);
});

test('calendar occurrence planning keeps the chosen local hour through daylight-saving transition', () => {
  const result = planWorkoutNotifications(schedules, [], enabled, new Date(2027, 2, 27, 17), 4);
  const sunday = result.find((item) => item.occurrenceDate === '2027-03-28');
  assert.ok(sunday);
  assert.equal(sunday.hour, 18);
});

test('monthly photo reminder moves to the next first day at 06:00 without exposing private data', () => {
  const before = nextMonthlyPhotoOccurrence(new Date(2026, 9, 1, 5, 59), 6);
  assert.deepEqual([before.getFullYear(), before.getMonth(), before.getDate(), before.getHours()], [2026, 9, 1, 6]);
  const after = nextMonthlyPhotoOccurrence(new Date(2026, 9, 1, 6, 0), 6);
  assert.deepEqual([after.getFullYear(), after.getMonth(), after.getDate(), after.getHours()], [2026, 10, 1, 6]);
  const yearEnd = nextMonthlyPhotoOccurrence(new Date(2026, 11, 2, 8), 6);
  assert.deepEqual([yearEnd.getFullYear(), yearEnd.getMonth(), yearEnd.getDate()], [2027, 0, 1]);
});

test('only Sport identifiers are selected for cancellation; database schedule changes are read dynamically', async () => {
  assert.deepEqual(managedSportNotificationIds([
    { identifier: 'sport.local.workout.push.2026-10-10' },
    { identifier: 'sport.local.photos.monthly' },
    { identifier: 'another.app.reminder' },
  ]), ['sport.local.workout.push.2026-10-10', 'sport.local.photos.monthly']);
  const db = await setup();
  const initial = await getWorkoutReminderSchedules(db);
  assert.deepEqual(initial.map((item) => [item.weekday, item.workoutType]), [[2, 'Legs'], [6, 'Push'], [7, 'Pull + Abs']]);
  await db.runAsync("UPDATE workout_schedules SET weekday=3,workout_type='Upper',is_active=0 WHERE id='tuesday-legs'");
  const changed = await getWorkoutReminderSchedules(db);
  assert.deepEqual(changed.find((item) => item.id === 'tuesday-legs'), { id: 'tuesday-legs', weekday: 3, workoutType: 'Upper', isActive: false });
  await db.runAsync("INSERT INTO workouts(id,date,schedule_id,workout_type,started_at,status) VALUES ('started','2026-10-06','tuesday-legs','Upper','2026-10-06T08:00:00.000Z','active')");
  assert.deepEqual(await getWorkoutOccurrences(db, '2026-10-01', '2026-10-31'), [{ scheduleId: 'tuesday-legs', date: '2026-10-06', status: 'active' }]);
});

test('photo request uses only generic copy and a first-of-month repeating trigger', () => {
  const specs = createNotificationSpecs([], [], { ...enabled, workoutEnabled: false, photoEnabled: true }, new Date(2026, 9, 3));
  assert.equal(specs.length, 1);
  assert.deepEqual(specs[0], {
    identifier: 'sport.local.photos.monthly',
    title: 'Photos 📸',
    body: 'Pense à prendre tes photos de progression.',
    data: { kind: 'photos', route: '/(tabs)/progress' },
    trigger: { kind: 'calendar-monthly', day: 1, hour: 6, minute: 0 },
  });
  assert.doesNotMatch(JSON.stringify(specs[0]), /photoPath|vault|private|image/i);
});

test('notification kinds route to Today or Progress without accepting arbitrary routes', () => {
  assert.equal(routeForSportNotificationKind('workout'), '/(tabs)');
  assert.equal(routeForSportNotificationKind('photos'), '/(tabs)/progress');
  assert.equal(routeForSportNotificationKind('unknown'), null);
});

test('full resync cancels prior Sport requests and leaves other apps requests untouched', async () => {
  const cancelled = [];
  const scheduled = [];
  const adapter = {
    getScheduled: async () => [
      { identifier: 'sport.local.workout.old.2026-10-01' },
      { identifier: 'sport.local.photos.monthly' },
      { identifier: 'another.app.reminder' },
    ],
    cancel: async (identifier) => { cancelled.push(identifier); },
    schedule: async (notification) => { scheduled.push(notification); return notification.identifier; },
  };
  const desired = createNotificationSpecs(schedules, [], { ...enabled, photoEnabled: true }, new Date(2026, 9, 5, 17));
  await reconcileSportNotifications(adapter, desired);
  assert.deepEqual(cancelled, ['sport.local.workout.old.2026-10-01', 'sport.local.photos.monthly']);
  assert.equal(scheduled.length, desired.length);
  assert.ok(scheduled.some((item) => item.identifier === 'sport.local.photos.monthly'));
  assert.equal(scheduled.some((item) => item.identifier === 'another.app.reminder'), false);
});
