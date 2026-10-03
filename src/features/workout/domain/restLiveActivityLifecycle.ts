import type { RestTimer } from './models.ts';

export type RestLiveActivityState = 'running' | 'paused';

export type RestLiveActivitySnapshot = {
  workoutId: string;
  restTimerId: string;
  exerciseName: string;
  nextSetNumber: number;
  targetSets: number;
  state: RestLiveActivityState;
  restStartedAt: string;
  restEndsAt: string | null;
  pausedRemainingSeconds: number | null;
};

export type RestLiveActivityProps = RestLiveActivitySnapshot;

export type RestLiveActivityInstance = {
  id: string;
  update: (props: RestLiveActivityProps, staleDate?: Date) => Promise<void>;
  end: () => Promise<void>;
};

export type RestLiveActivityDriver = {
  getInstances: () => RestLiveActivityInstance[];
  start: (props: RestLiveActivityProps, url: string, staleDate?: Date) => RestLiveActivityInstance;
};

export type TrackedRestLiveActivity = { restTimerId: string; activityId: string };

export function snapshotFromRestTimer(
  input: { workoutId: string; exerciseName: string; nextSetNumber: number; targetSets: number },
  timer: RestTimer,
): RestLiveActivitySnapshot | null {
  if ((timer.state !== 'running' && timer.state !== 'paused') || !timer.startedAt) return null;
  return {
    ...input,
    restTimerId: timer.id,
    state: timer.state,
    restStartedAt: timer.startedAt,
    restEndsAt: timer.deadlineAt,
    pausedRemainingSeconds: timer.state === 'paused' ? timer.pausedRemainingSeconds : null,
  };
}

/** One serialized reconciliation owns all instances of Sport's rest activity. */
export async function reconcileRestLiveActivity(
  snapshot: RestLiveActivitySnapshot | null,
  driver: RestLiveActivityDriver,
  tracked: TrackedRestLiveActivity | null,
): Promise<TrackedRestLiveActivity | null> {
  const instances = driver.getInstances();
  if (!snapshot) {
    await Promise.all(instances.map((instance) => instance.end()));
    return null;
  }

  const matching = tracked?.restTimerId === snapshot.restTimerId
    ? instances.find((instance) => instance.id === tracked.activityId)
    : undefined;

  if (matching) {
    await Promise.all(instances.filter((instance) => instance.id !== matching.id).map((instance) => instance.end()));
    try {
      await matching.update(snapshot, snapshot.restEndsAt ? new Date(snapshot.restEndsAt) : undefined);
      return { restTimerId: snapshot.restTimerId, activityId: matching.id };
    } catch {
      // A recovered ActivityKit handle can become stale between enumeration and update.
      await matching.end();
    }
  }

  // Recovered instances have no readable props/URL in expo-widgets 57. End them
  // before creating a current SQLite-backed activity so no old deep link survives.
  await Promise.all(instances.filter((instance) => instance.id !== matching?.id).map((instance) => instance.end()));
  const url = `sport://workout/${encodeURIComponent(snapshot.workoutId)}`;
  const created = driver.start(snapshot, url, snapshot.restEndsAt ? new Date(snapshot.restEndsAt) : undefined);
  return { restTimerId: snapshot.restTimerId, activityId: created.id };
}
