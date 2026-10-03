import type { SportDatabase } from './contract.ts';

export const CURRENT_SCHEMA_VERSION = 6;

const INITIAL_SCHEMA = `
CREATE TABLE exercises (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  tracking_type TEXT NOT NULL CHECK (tracking_type IN ('reps', 'duration')),
  target_sets INTEGER NOT NULL CHECK (target_sets > 0),
  target_rep_min INTEGER,
  target_rep_max INTEGER,
  target_duration_seconds INTEGER,
  default_rest_seconds INTEGER NOT NULL DEFAULT 180 CHECK (default_rest_seconds >= 0),
  sort_order INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  CHECK ((target_rep_min IS NULL AND target_rep_max IS NULL) OR (target_rep_min > 0 AND target_rep_max >= target_rep_min)),
  CHECK (target_duration_seconds IS NULL OR target_duration_seconds > 0)
);
CREATE TABLE workout_schedules (
  id TEXT PRIMARY KEY NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  workout_type TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (weekday)
);
CREATE TABLE workout_schedule_exercises (
  schedule_id TEXT NOT NULL REFERENCES workout_schedules(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  PRIMARY KEY (schedule_id, sort_order),
  UNIQUE (schedule_id, exercise_id)
);
CREATE TABLE workouts (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  workout_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled'))
);
CREATE UNIQUE INDEX one_active_workout ON workouts(status) WHERE status = 'active';
CREATE INDEX workouts_recent ON workouts(status, started_at DESC);
CREATE TABLE workout_exercises (
  id TEXT PRIMARY KEY NOT NULL,
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL REFERENCES exercises(id),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  feeling REAL CHECK (feeling IS NULL OR feeling BETWEEN 0 AND 10),
  UNIQUE (workout_id, sort_order)
);
CREATE INDEX workout_exercises_by_exercise ON workout_exercises(exercise_id, completed);
CREATE TABLE workout_sets (
  id TEXT PRIMARY KEY NOT NULL,
  workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number INTEGER NOT NULL CHECK (set_number > 0),
  reps INTEGER CHECK (reps IS NULL OR reps > 0),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  added_weight REAL CHECK (added_weight IS NULL OR added_weight >= 0),
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
  UNIQUE (workout_exercise_id, set_number),
  CHECK ((reps IS NOT NULL AND duration_seconds IS NULL) OR (reps IS NULL AND duration_seconds IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
`;

type ExerciseSeed = { id: string; name: string; category: string; tracking: 'reps' | 'duration'; sets: number; min: number | null; max: number | null; seconds: number | null; order: number };
const EXERCISES: ExerciseSeed[] = [
  { id: 'bulgarians', name: 'Bulgarians', category: 'Legs', tracking: 'reps', sets: 4, min: 8, max: 12, seconds: null, order: 0 },
  { id: 'push-ups', name: 'Push-ups', category: 'Push', tracking: 'reps', sets: 4, min: 8, max: 12, seconds: null, order: 1 },
  { id: 'pike-push-ups', name: 'Pike Push-ups', category: 'Push', tracking: 'reps', sets: 4, min: 8, max: 12, seconds: null, order: 2 },
  { id: 'chin-ups', name: 'Chin-ups', category: 'Pull + Abs', tracking: 'reps', sets: 4, min: 8, max: 12, seconds: null, order: 3 },
  { id: 'l-sit', name: 'L-sit', category: 'Pull + Abs', tracking: 'duration', sets: 4, min: null, max: null, seconds: null, order: 4 },
];

const SCHEDULES = [
  { id: 'tuesday-legs', day: 2, type: 'Legs', exerciseIds: ['bulgarians'] },
  { id: 'saturday-push', day: 6, type: 'Push', exerciseIds: ['push-ups', 'pike-push-ups'] },
  { id: 'sunday-pull-abs', day: 7, type: 'Pull + Abs', exerciseIds: ['chin-ups', 'l-sit'] },
];

export async function migrateWorkoutReminderTimesToSchedules(tx: SportDatabase, now: string): Promise<void> {
  await tx.execAsync(`
    ALTER TABLE workout_schedules ADD COLUMN reminder_time_minutes INTEGER CHECK (reminder_time_minutes IS NULL OR reminder_time_minutes BETWEEN 0 AND 1439);
    ALTER TABLE notification_preferences ADD COLUMN photo_time_minutes INTEGER NOT NULL DEFAULT 360 CHECK (photo_time_minutes BETWEEN 0 AND 1439);
    UPDATE notification_preferences SET photo_time_minutes = photo_hour * 60;
    UPDATE workout_schedules
    SET reminder_time_minutes = (
      SELECT workout_hour * 60 FROM notification_preferences WHERE id=1
    )
    WHERE (SELECT workout_hour FROM notification_preferences WHERE id=1) IS NOT NULL;
  `);
  await tx.runAsync('INSERT INTO schema_migrations(version, applied_at) VALUES (6, ?)', now);
}

export async function migrateAndSeed(db: SportDatabase, now: () => string = () => new Date().toISOString()): Promise<void> {
  await db.execAsync(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);`);
  const applied = await db.getFirstAsync<{ version: number }>('SELECT MAX(version) AS version FROM schema_migrations');
  if ((applied?.version ?? 0) < 1) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(INITIAL_SCHEMA);
      await tx.runAsync('INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)', 1, now());
    });
  }
  if ((applied?.version ?? 0) < 2) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(`
        ALTER TABLE exercises ADD COLUMN target_added_weight REAL CHECK (target_added_weight IS NULL OR target_added_weight >= 0);
        ALTER TABLE workouts ADD COLUMN schedule_id TEXT REFERENCES workout_schedules(id);
        UPDATE workouts SET schedule_id = (
          SELECT id FROM workout_schedules
          WHERE weekday = CASE CAST(strftime('%w', workouts.date) AS INTEGER) WHEN 0 THEN 7 ELSE CAST(strftime('%w', workouts.date) AS INTEGER) END
          LIMIT 1
        ) WHERE schedule_id IS NULL;
        CREATE INDEX workouts_by_day_schedule ON workouts(date, schedule_id, status);
        CREATE TABLE workout_rest_periods (
          id TEXT PRIMARY KEY NOT NULL,
          workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
          workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
          after_set_number INTEGER NOT NULL CHECK (after_set_number > 0),
          duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
          state TEXT NOT NULL CHECK (state IN ('ready','running','paused','finished','skipped','cancelled')),
          started_at TEXT,
          deadline_at TEXT,
          paused_remaining_seconds INTEGER CHECK (paused_remaining_seconds IS NULL OR paused_remaining_seconds >= 0),
          ended_at TEXT,
          created_at TEXT NOT NULL,
          UNIQUE (workout_exercise_id, after_set_number)
        );
        CREATE INDEX workout_rest_active ON workout_rest_periods(workout_id, state, created_at DESC);
      `);
      await tx.runAsync('INSERT INTO schema_migrations(version, applied_at) VALUES (2, ?)', now());
    });
  }
  if ((applied?.version ?? 0) < 3) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync('CREATE INDEX workouts_history ON workouts(status, date DESC, ended_at DESC);');
      await tx.runAsync('INSERT INTO schema_migrations(version, applied_at) VALUES (3, ?)', now());
    });
  }
  if ((applied?.version ?? 0) < 4) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(`
        CREATE TABLE weight_inventory_settings (
          id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
          base_weight_grams INTEGER NOT NULL CHECK (base_weight_grams > 0)
        );
        CREATE TABLE weight_items (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL CHECK (length(trim(name)) > 0),
          weight_grams INTEGER NOT NULL CHECK (weight_grams > 0),
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          sort_order INTEGER NOT NULL
        );
        ALTER TABLE workout_sets ADD COLUMN added_weight_grams INTEGER CHECK (added_weight_grams IS NULL OR added_weight_grams >= 0);
        ALTER TABLE workout_sets ADD COLUMN load_composition_json TEXT;
        CREATE INDEX weight_items_order ON weight_items(is_active, sort_order, name);
      `);
      await tx.runAsync('INSERT INTO schema_migrations(version, applied_at) VALUES (4, ?)', now());
    });
  }
  if ((applied?.version ?? 0) < 5) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(`
        CREATE TABLE notification_preferences (
          id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
          workout_enabled INTEGER NOT NULL DEFAULT 0 CHECK (workout_enabled IN (0, 1)),
          photo_enabled INTEGER NOT NULL DEFAULT 0 CHECK (photo_enabled IN (0, 1)),
          workout_hour INTEGER CHECK (workout_hour IS NULL OR workout_hour BETWEEN 0 AND 23),
          photo_hour INTEGER NOT NULL DEFAULT 6 CHECK (photo_hour BETWEEN 0 AND 23)
        );
      `);
      await tx.runAsync('INSERT INTO schema_migrations(version, applied_at) VALUES (5, ?)', now());
    });
  }
  if ((applied?.version ?? 0) < 6) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      await migrateWorkoutReminderTimesToSchedules(tx, now());
    });
  }
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('INSERT OR IGNORE INTO weight_inventory_settings(id,base_weight_grams) VALUES (1,3000)');
    await tx.runAsync('INSERT OR IGNORE INTO notification_preferences(id,workout_enabled,photo_enabled,workout_hour,photo_hour) VALUES (1,0,0,NULL,6)');
    const weightedItems = [
      { id: 'river-inverted', name: "La rivière à l'envers", grams: 900, order: 0 },
      { id: 'cars-1200', name: '1200 voitures', grams: 2100, order: 1 },
      { id: 'programming-books-2', name: '2 livres programmation', grams: 1500, order: 2 },
    ];
    for (const item of weightedItems) {
      await tx.runAsync(
        'INSERT OR IGNORE INTO weight_items(id,name,weight_grams,is_active,sort_order) VALUES (?,?,?,1,?)',
        item.id, item.name, item.grams, item.order,
      );
    }
    for (const exercise of EXERCISES) {
      await tx.runAsync(
        `INSERT OR IGNORE INTO exercises(id,name,category,tracking_type,target_sets,target_rep_min,target_rep_max,target_duration_seconds,default_rest_seconds,sort_order,is_active)
         VALUES (?,?,?,?,?,?,?,?,180,?,1)`,
        exercise.id, exercise.name, exercise.category, exercise.tracking, exercise.sets,
        exercise.min, exercise.max, exercise.seconds, exercise.order,
      );
    }
    for (const schedule of SCHEDULES) {
      const existingSchedule = await tx.getFirstAsync<{ id: string }>('SELECT id FROM workout_schedules WHERE id=?', schedule.id);
      if (existingSchedule) continue;
      const occupiedDay = await tx.getFirstAsync<{ id: string }>('SELECT id FROM workout_schedules WHERE weekday=?', schedule.day);
      if (occupiedDay) continue;
      await tx.runAsync('INSERT INTO workout_schedules(id,weekday,workout_type,is_active) VALUES (?,?,?,1)', schedule.id, schedule.day, schedule.type);
      for (const [sortOrder, exerciseId] of schedule.exerciseIds.entries()) {
        await tx.runAsync('INSERT INTO workout_schedule_exercises(schedule_id,exercise_id,sort_order) VALUES (?,?,?)', schedule.id, exerciseId, sortOrder);
      }
    }
  });
}
