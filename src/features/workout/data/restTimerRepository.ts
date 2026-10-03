import type { SportDatabase } from '../../../shared/database/contract.ts';
import type { RestTimer } from '../domain/models.ts';
import { transitionRestTimer, type RestTimerEvent } from '../domain/restTimerMachine.ts';

type Clock = () => Date;
type IdFactory = () => string;
type RestTimerRow = {
  id: string; workout_id: string; workout_exercise_id: string; after_set_number: number;
  duration_seconds: number; state: RestTimer['state']; started_at: string | null; deadline_at: string | null;
  paused_remaining_seconds: number | null; ended_at: string | null;
};

function toRestTimer(row: RestTimerRow): RestTimer {
  return {
    id: row.id, workoutId: row.workout_id, workoutExerciseId: row.workout_exercise_id,
    afterSetNumber: row.after_set_number, durationSeconds: row.duration_seconds, state: row.state,
    startedAt: row.started_at, deadlineAt: row.deadline_at,
    pausedRemainingSeconds: row.paused_remaining_seconds, endedAt: row.ended_at,
  };
}

const selectTimer = `SELECT id,workout_id,workout_exercise_id,after_set_number,duration_seconds,state,started_at,deadline_at,paused_remaining_seconds,ended_at FROM workout_rest_periods`;

export async function getRestTimerAfterSet(db: SportDatabase, workoutExerciseId: string, afterSetNumber: number): Promise<RestTimer | null> {
  const row = await db.getFirstAsync<RestTimerRow>(`${selectTimer} WHERE workout_exercise_id=? AND after_set_number=?`, workoutExerciseId, afterSetNumber);
  return row ? toRestTimer(row) : null;
}

/** Creates the ready state and starts it in the same write transaction as the completed set. */
export async function createStartedRestTimer(
  db: SportDatabase,
  input: { workoutId: string; workoutExerciseId: string; afterSetNumber: number; durationSeconds: number; idFactory: IdFactory; now: Date },
): Promise<RestTimer> {
  const existing = await getRestTimerAfterSet(db, input.workoutExerciseId, input.afterSetNumber);
  if (existing) return existing;
  const ready: RestTimer = {
    id: input.idFactory(), workoutId: input.workoutId, workoutExerciseId: input.workoutExerciseId,
    afterSetNumber: input.afterSetNumber, durationSeconds: input.durationSeconds, state: 'ready',
    startedAt: null, deadlineAt: null, pausedRemainingSeconds: null, endedAt: null,
  };
  await db.runAsync(
    `INSERT INTO workout_rest_periods(id,workout_id,workout_exercise_id,after_set_number,duration_seconds,state,created_at)
     VALUES (?,?,?,?,?,'ready',?)`,
    ready.id, ready.workoutId, ready.workoutExerciseId, ready.afterSetNumber, ready.durationSeconds, input.now.toISOString(),
  );
  const running = transitionRestTimer(ready, 'start', input.now.getTime());
  await saveTimer(db, running);
  return running;
}

async function saveTimer(db: SportDatabase, timer: RestTimer): Promise<void> {
  await db.runAsync(
    `UPDATE workout_rest_periods SET state=?,started_at=?,deadline_at=?,paused_remaining_seconds=?,ended_at=? WHERE id=?`,
    timer.state, timer.startedAt, timer.deadlineAt, timer.pausedRemainingSeconds, timer.endedAt, timer.id,
  );
}

export async function transitionPersistedRestTimer(
  db: SportDatabase,
  timerId: string,
  event: RestTimerEvent,
  clock: Clock = () => new Date(),
): Promise<{ timer: RestTimer | null; finishedNow: boolean }> {
  return db.withExclusiveTransactionAsync(async (tx) => {
    const row = await tx.getFirstAsync<RestTimerRow>(`${selectTimer} WHERE id=?`, timerId);
    if (!row) return { timer: null, finishedNow: false };
    const current = toRestTimer(row);
    const next = transitionRestTimer(current, event, clock().getTime());
    const finishedNow = current.state === 'running' && next.state === 'finished';
    if (next !== current) await saveTimer(tx, next);
    return { timer: next, finishedNow };
  });
}

export async function cancelActiveRestTimers(db: SportDatabase, workoutId: string, at: Date): Promise<void> {
  await db.runAsync(
    `UPDATE workout_rest_periods SET state='cancelled',deadline_at=NULL,paused_remaining_seconds=NULL,ended_at=?
     WHERE workout_id=? AND state IN ('ready','running','paused')`, at.toISOString(), workoutId,
  );
}
