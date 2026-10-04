import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { remainingSeconds } from '../src/features/workout/domain/restTimerMachine.ts';
import { reconcileRestLiveActivity, snapshotFromRestTimer } from '../src/features/workout/domain/restLiveActivityLifecycle.ts';

const restTimerControllerSource = readFileSync(new URL('../src/features/workout/components/RestTimerController.tsx', import.meta.url), 'utf8');

class FakeActivity {
  constructor(id, props = null) { this.id = id; this.props = props; this.updates = 0; this.ends = 0; }
  async update(props) { this.props = props; this.updates += 1; }
  async end() { this.ends += 1; }
}

class FakeDriver {
  constructor(instances = []) { this.instances = instances; this.starts = 0; }
  getInstances() { return [...this.instances]; }
  start(props, url) {
    const activity = new FakeActivity(`activity-${++this.starts}`, props);
    activity.url = url;
    this.instances.push(activity);
    return activity;
  }
}

const timer = (state = 'running', overrides = {}) => ({
  id: 'rest-1', workoutId: 'workout-1', workoutExerciseId: 'exercise-1', afterSetNumber: 2,
  durationSeconds: 180, state, startedAt: '2026-10-03T10:00:00.000Z',
  deadlineAt: '2026-10-03T10:03:00.000Z', pausedRemainingSeconds: null, endedAt: null,
  ...overrides,
});
const workout = { workoutId: 'workout-1', exerciseName: 'Push-ups', nextSetNumber: 3, targetSets: 4 };

test('a newly persisted running rest starts one activity using the absolute deadline and workout link', async () => {
  const snapshot = snapshotFromRestTimer(workout, timer());
  assert.equal(snapshot.restEndsAt, timer().deadlineAt);
  const driver = new FakeDriver();

  const tracked = await reconcileRestLiveActivity(snapshot, driver, null);

  assert.equal(driver.starts, 1);
  assert.equal(driver.instances.length, 1);
  assert.equal(driver.instances[0].url, 'sport://workout/workout-1');
  assert.equal(tracked.restTimerId, 'rest-1');
});

test('pause and resume update the same Live Activity without starting a second timer', async () => {
  const driver = new FakeDriver();
  let tracked = await reconcileRestLiveActivity(snapshotFromRestTimer(workout, timer()), driver, null);
  const paused = snapshotFromRestTimer(workout, timer('paused', { deadlineAt: null, pausedRemainingSeconds: 92 }));
  tracked = await reconcileRestLiveActivity(paused, driver, tracked);
  assert.equal(driver.instances[0].props.state, 'paused');
  assert.equal(driver.instances[0].props.pausedRemainingSeconds, 92);

  const resumed = snapshotFromRestTimer(workout, timer('running', { deadlineAt: '2026-10-03T10:05:00.000Z' }));
  await reconcileRestLiveActivity(resumed, driver, tracked);
  assert.equal(driver.instances[0].props.state, 'running');
  assert.equal(driver.instances[0].props.restEndsAt, '2026-10-03T10:05:00.000Z');
  assert.equal(driver.instances[0].updates, 2);
  assert.equal(driver.starts, 1);
});

test('skip, finish, and workout cancellation end the activity immediately', async (t) => {
  for (const [name, terminal] of [
    ['skip', timer('skipped')],
    ['finish', timer('finished')],
    ['cancel', timer('cancelled')],
  ]) {
    await t.test(name, async () => {
      const driver = new FakeDriver();
      await reconcileRestLiveActivity(snapshotFromRestTimer(workout, timer()), driver, null);
      await reconcileRestLiveActivity(snapshotFromRestTimer(workout, terminal), driver, { restTimerId: 'rest-1', activityId: 'activity-1' });
      assert.equal(driver.instances[0].ends, 1);
      assert.equal(driver.instances.length, 1);
    });
  }
});

test('relaunch recovery ends an unknown old activity before recreating one from current workout state', async () => {
  const orphan = new FakeActivity('old-activity', { workoutId: 'abandoned-workout' });
  const driver = new FakeDriver([orphan]);

  const tracked = await reconcileRestLiveActivity(snapshotFromRestTimer(workout, timer()), driver, null);

  assert.equal(orphan.ends, 1);
  assert.equal(driver.starts, 1);
  assert.equal(driver.instances.filter((instance) => instance.ends === 0).length, 1);
  assert.equal(driver.instances[1].props.workoutId, 'workout-1');
  assert.equal(tracked.activityId, 'activity-1');
});

test('a recovered activity for an abandoned rest is ended when SQLite has no active rest', async () => {
  const orphan = new FakeActivity('orphan');
  const driver = new FakeDriver([orphan]);

  const tracked = await reconcileRestLiveActivity(null, driver, null);

  assert.equal(tracked, null);
  assert.equal(orphan.ends, 1);
  assert.equal(driver.starts, 0);
});

test('a stale native handle is ended before a replacement reflects a paused timer', async () => {
  const stale = new FakeActivity('stale');
  stale.update = async () => { throw new Error('activity disappeared'); };
  const driver = new FakeDriver([stale]);
  const paused = snapshotFromRestTimer(workout, timer('paused', { deadlineAt: null, pausedRemainingSeconds: 50 }));

  const tracked = await reconcileRestLiveActivity(paused, driver, { restTimerId: 'rest-1', activityId: 'stale' });

  assert.equal(stale.ends, 1);
  assert.equal(driver.starts, 1);
  assert.equal(driver.instances.filter((instance) => instance.ends === 0).length, 1);
  assert.equal(driver.instances[1].props.state, 'paused');
  assert.equal(tracked.activityId, 'activity-1');
});

test('duplicate existing activities are reduced to the tracked rest activity', async () => {
  const keeper = new FakeActivity('current');
  const duplicate = new FakeActivity('duplicate');
  const driver = new FakeDriver([keeper, duplicate]);

  await reconcileRestLiveActivity(snapshotFromRestTimer(workout, timer()), driver, { restTimerId: 'rest-1', activityId: 'current' });

  assert.equal(keeper.ends, 0);
  assert.equal(keeper.updates, 1);
  assert.equal(duplicate.ends, 1);
  assert.equal(driver.starts, 0);
});

test('remaining time is derived from the persisted deadline, not a ticking counter', () => {
  const running = timer();
  assert.equal(remainingSeconds(running, Date.parse('2026-10-03T10:01:32.000Z')), 88);
  assert.equal(remainingSeconds(running, Date.parse('2026-10-03T10:03:00.000Z')), 0);
  assert.equal(remainingSeconds(timer('paused', { pausedRemainingSeconds: 42 }), Date.parse('2026-10-03T10:03:00.000Z')), 42);
});

test('returning active reloads the matching persisted rest even when the local timer was paused', () => {
  const listenerStart = restTimerControllerSource.indexOf("AppState.addEventListener('change'");
  assert.notEqual(listenerStart, -1, 'the rest timer controller owns one AppState listener');
  const listenerEnd = restTimerControllerSource.indexOf('return () =>', listenerStart);
  const activeListener = restTimerControllerSource.slice(listenerStart, listenerEnd);
  const activeStateHandlerStart = restTimerControllerSource.indexOf('const enterActiveState = () => {');
  const activeStateHandlerEnd = restTimerControllerSource.indexOf('const appState =', activeStateHandlerStart);
  const activeStateHandler = restTimerControllerSource.slice(activeStateHandlerStart, activeStateHandlerEnd);

  assert.equal((restTimerControllerSource.match(/AppState\.addEventListener\('change'/g) ?? []).length, 1);
  assert.match(restTimerControllerSource, /if \(!\['ready', 'running', 'paused'\]\.includes\(timer\.state\)\) return/);
  assert.match(activeListener, /state === 'active'[\s\S]*enterActiveState\(\)/);
  assert.match(activeStateHandler, /reloadPersistedTimer\(\)/);
  assert.match(restTimerControllerSource, /getRestTimerAfterSet\(\s*await getDatabase\(\),\s*timer\.workoutExerciseId,\s*timer\.afterSetNumber,\s*\)/);
  assert.match(restTimerControllerSource, /persisted\?\.id !== timer\.id/);
  assert.match(activeStateHandler, /timer\.state === 'running'[\s\S]*setInterval/);
});
