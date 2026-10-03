import { getDatabase } from '@/shared/database';
import type { SportDatabase } from '@/shared/database/contract';
import { getWorkout } from '../data/workoutRepository';
import { getRestTimerAfterSet } from '../data/restTimerRepository';
import { reconcileRestLiveActivity, snapshotFromRestTimer, type RestLiveActivityDriver, type TrackedRestLiveActivity } from '../domain/restLiveActivityLifecycle';
import type { WorkoutSession } from '../domain/models';

let tracked: TrackedRestLiveActivity | null = null;
let queue = Promise.resolve();

async function getCurrentRestSnapshot(db: SportDatabase, now: Date): Promise<ReturnType<typeof snapshotFromRestTimer>> {
  const active = await db.getFirstAsync<{ id: string }>("SELECT id FROM workouts WHERE status='active' ORDER BY started_at DESC LIMIT 1");
  if (!active) return null;
  const session: WorkoutSession | null = await getWorkout(db, active.id);
  const exercise = session?.exercises.find((item) => !item.completed);
  if (!session || !exercise || exercise.sets.length === 0 || exercise.sets.length >= exercise.exercise.targetSets) return null;

  let timer = await getRestTimerAfterSet(db, exercise.id, exercise.sets.length);
  if (!timer) return null;
  // Let RestTimerController own the durable expiry transition and its existing
  // haptic/audio feedback. The native activity is ended as soon as its deadline passes.
  if (timer.state === 'running' && timer.deadlineAt && Date.parse(timer.deadlineAt) <= now.getTime()) return null;

  return snapshotFromRestTimer({
    workoutId: session.id,
    exerciseName: exercise.exercise.name,
    nextSetNumber: exercise.sets.length + 1,
    targetSets: exercise.exercise.targetSets,
  }, timer);
}

/** Re-read SQLite before reconciling, so screen state can never create a stale or duplicate activity. */
export function refreshRestLiveActivity(): Promise<void> {
  const operation = queue.then(async () => {
    try {
      const db = await getDatabase();
      const snapshot = await getCurrentRestSnapshot(db, new Date());
      // expo-widgets is a native module and intentionally absent from Expo Go.
      const { RestLiveActivity } = await import('../components/RestLiveActivity');
      const driver: RestLiveActivityDriver = {
        getInstances: () => RestLiveActivity.getInstances().map((instance) => ({
          id: instance.getId(),
          update: (props, staleDate) => instance.update(props, staleDate),
          end: () => instance.end('immediate'),
        })),
        start: (props, url, staleDate) => {
          const instance = RestLiveActivity.start(props, url, staleDate);
          return {
            id: instance.getId(),
            update: (nextProps, nextStaleDate) => instance.update(nextProps, nextStaleDate),
            end: () => instance.end('immediate'),
          };
        },
      };
      tracked = await reconcileRestLiveActivity(snapshot, driver, tracked);
    } catch {
      // The workout timer remains authoritative if Live Activities are unavailable or disabled.
    }
  });
  queue = operation.then(() => undefined, () => undefined);
  return operation;
}
