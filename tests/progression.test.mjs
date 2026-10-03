import assert from 'node:assert/strict';
import test from 'node:test';

import { assessProgression } from '../src/features/workout/domain/progressionEngine.ts';

const exercise = {
  id: 'push-ups',
  name: 'Push-ups',
  category: 'Push',
  trackingType: 'reps',
  targetSets: 4,
  targetRepMin: 8,
  targetRepMax: 12,
  targetDurationSeconds: null,
  targetAddedWeight: null,
  defaultRestSeconds: 180,
};

function performance(reps, feeling = 6, weights = reps.map(() => 6)) {
  return {
    date: '2026-10-03',
    feeling,
    sets: reps.map((value, index) => ({
      id: `set-${index + 1}`,
      setNumber: index + 1,
      reps: value,
      durationSeconds: null,
      addedWeight: weights[index],
    })),
  };
}

test('full max reps and feeling 6 recommend load increase (inclusive threshold 7)', () => {
  assert.deepEqual(assessProgression(exercise, performance([12, 12, 12, 12], 6)), {
    status: 'increase_load_recommended',
    recommendation: 'increase_load',
  });
  assert.equal(assessProgression(exercise, performance([12, 12, 12, 12], 7)).recommendation, 'increase_load');
});

test('feeling above 7 never recommends an increase, including 7.1 and 10', () => {
  assert.equal(assessProgression(exercise, performance([12, 12, 12, 12], 7.1)).status, 'achieved');
  assert.equal(assessProgression(exercise, performance([12, 12, 12, 12], 10)).recommendation, null);
});

test('a set below the maximum maintains the target even with low feeling', () => {
  assert.deepEqual(assessProgression(exercise, performance([12, 12, 12, 11], 6)), {
    status: 'maintain',
    recommendation: null,
  });
  assert.equal(assessProgression(exercise, performance([10, 10, 9, 8], 8.5)).status, 'maintain');
});

test('zero feeling is valid and eligible when all rep targets are reached', () => {
  assert.equal(assessProgression(exercise, performance([12, 12, 12, 12], 0)).status, 'increase_load_recommended');
});

test('no previous result, missing sets, wrong set ordering, and missing feeling are insufficient data', () => {
  assert.equal(assessProgression(exercise, null).status, 'insufficient_data');
  assert.equal(assessProgression(exercise, performance([12, 12, 12], 6)).status, 'insufficient_data');
  const unordered = performance([12, 12, 12, 12], 6);
  unordered.sets[2].setNumber = 4;
  assert.equal(assessProgression(exercise, unordered).status, 'insufficient_data');
  assert.equal(assessProgression(exercise, performance([12, 12, 12, 12], null)).status, 'insufficient_data');
});

test('missing rep maximum or incomplete legacy metric values never recommend', () => {
  assert.equal(assessProgression({ ...exercise, targetRepMax: null }, performance([12, 12, 12, 12], 6)).status, 'insufficient_data');
  const missingValue = performance([12, 12, 12, 12], 6);
  missingValue.sets[3].reps = null;
  assert.equal(assessProgression(exercise, missingValue).status, 'insufficient_data');
});

test('time-based progression compares durations but never applies the rep load rule', () => {
  const lSit = { ...exercise, id: 'l-sit', trackingType: 'duration', targetRepMin: null, targetRepMax: null, targetDurationSeconds: 10 };
  const timed = (values) => ({
    date: '2026-10-03', feeling: null,
    sets: values.map((seconds, index) => ({ id: `time-${index}`, setNumber: index + 1, reps: null, durationSeconds: seconds, addedWeight: null })),
  });
  assert.deepEqual(assessProgression(lSit, timed([10, 12, 10, 11])), { status: 'achieved', recommendation: null });
  assert.deepEqual(assessProgression(lSit, timed([10, 9, 10, 11])), { status: 'maintain', recommendation: null });
  assert.equal(assessProgression({ ...lSit, targetDurationSeconds: null }, timed([10, 10, 10, 10])).status, 'insufficient_data');
});

test('mixed per-set loads are used as recorded and are never collapsed into a numeric recommendation', () => {
  const actual = performance([12, 12, 12, 12], 6, [5, 5, 6, 6]);
  const originalLoads = actual.sets.map((set) => set.addedWeight);
  const assessment = assessProgression(exercise, actual);
  assert.equal(assessment.status, 'increase_load_recommended');
  assert.equal(assessment.recommendation, 'increase_load');
  assert.deepEqual(actual.sets.map((set) => set.addedWeight), originalLoads);
  assert.equal('nextLoad' in assessment, false);
});
