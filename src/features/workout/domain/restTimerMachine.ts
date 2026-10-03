import type { RestTimer, RestTimerStatus } from './models.ts';

export type RestTimerEvent = 'start' | 'pause' | 'resume' | 'tick' | 'skip';

export function remainingSeconds(timer: RestTimer, nowMs = Date.now()): number {
  if (timer.state === 'running' && timer.deadlineAt) {
    return Math.max(0, Math.ceil((Date.parse(timer.deadlineAt) - nowMs) / 1000));
  }
  if (timer.state === 'paused') return Math.max(0, timer.pausedRemainingSeconds ?? 0);
  if (timer.state === 'ready') return timer.durationSeconds;
  return 0;
}

export function transitionRestTimer(timer: RestTimer, event: RestTimerEvent, nowMs = Date.now()): RestTimer {
  const isoNow = new Date(nowMs).toISOString();
  if (event !== 'tick' && timer.state === 'running') {
    const expired = transitionRestTimer(timer, 'tick', nowMs);
    if (expired.state === 'finished') return expired;
    timer = expired;
  }
  if (event === 'start' && timer.state === 'ready') {
    return { ...timer, state: 'running', startedAt: isoNow, deadlineAt: new Date(nowMs + timer.durationSeconds * 1000).toISOString(), pausedRemainingSeconds: null };
  }
  if (event === 'pause' && timer.state === 'running') {
    const remaining = remainingSeconds(timer, nowMs);
    if (remaining === 0) return { ...timer, state: 'finished', endedAt: timer.deadlineAt, deadlineAt: null, pausedRemainingSeconds: null };
    return { ...timer, state: 'paused', deadlineAt: null, pausedRemainingSeconds: remaining };
  }
  if (event === 'resume' && timer.state === 'paused') {
    const remaining = timer.pausedRemainingSeconds ?? 0;
    if (remaining === 0) return { ...timer, state: 'finished', endedAt: isoNow, deadlineAt: null };
    return { ...timer, state: 'running', deadlineAt: new Date(nowMs + remaining * 1000).toISOString(), pausedRemainingSeconds: null };
  }
  if (event === 'tick' && timer.state === 'running' && remainingSeconds(timer, nowMs) === 0) {
    return { ...timer, state: 'finished', endedAt: timer.deadlineAt, deadlineAt: null, pausedRemainingSeconds: null };
  }
  if (event === 'skip' && ['ready', 'running', 'paused'].includes(timer.state)) {
    return { ...timer, state: 'skipped', deadlineAt: null, pausedRemainingSeconds: null, endedAt: isoNow };
  }
  return timer;
}

export function isActiveRestTimer(state: RestTimerStatus): boolean {
  return state === 'ready' || state === 'running' || state === 'paused';
}
