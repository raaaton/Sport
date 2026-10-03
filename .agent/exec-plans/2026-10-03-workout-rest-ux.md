# ExecPlan: daily workout lock, rest timer, and workout UX

## Objective and scope

Prevent accidentally repeating a completed scheduled workout, offer an explicit confirmed same-day restart without deleting the original history, add a persistent rest timer between eligible sets, improve Today/preparation/session/completion UX, and retain accurate set data for later progression work. No progression suggestions, load-combination system, notifications, photo features, biometrics, Live Activities, or Shortcuts.

## Findings and decisions

- The current `startOrResumeToday` resumes any active workout but otherwise creates another instance unconditionally. Today does not query for a completed session from the current date.
- The exercise schema has a default rest duration (180 seconds) but no persisted rest instance or rest state. `WorkoutSessionScreen` records a set and immediately exposes the next set.
- Exercise/set rows already preserve target set count, actual reps or seconds, per-set added weight, exercise feeling, and workout date. No seed exercise has a defined target added weight. Add an optional target-weight column with `NULL` defaults and never infer one from prior performance.
- `expo-audio` and `expo-haptics` are already installed. Use a brief local sound cue and a success haptic at expiry, keeping audio in the foreground audio session and mixing with other audio.
- Timer correctness will come from persisted state and an absolute deadline, not from counting interval ticks. The UI may use a light interval only to redraw digits. Re-read/resolve on app foreground and route focus; if iOS suspends the app at expiry, completion feedback can occur when it resumes. Do not enable background audio modes, notifications, or a background service for this step.
- Store `schedule_id` on new workout rows and add a versioned migration for schedule association, optional target added weight, and normalized rest periods. A completed workout for today's schedule locks ordinary start. The confirmed reset action creates a new workout row while preserving the completed row and history.
- The preparation route reviews today's plan and previous performance before creating a workout. The Today tab remains an overview and does not start a workout as a side effect.
- `docs/ROADMAP.md` is absent.

## Workflow and timer architecture

1. Today loads today's schedule, any globally active workout, and a completed workout matching today's local date and schedule.
2. An active workout offers resume. A completed workout has an explicit completed state and no normal start button. A quiet overflow action opens a native action sheet and a second confirmation; confirming creates a separate same-day workout and keeps the original history intact.
3. The preparation screen displays ordered exercises, actual targets, and last completed performance/feeling. Starting remains an explicit user action.
4. After a non-final set commits, an active `workout_rest_periods` record is created with the set in the same transaction. It includes workout/exercise IDs, the preceding set number, duration, status, start/deadline, paused remaining time, and end time. This is a durable contract suitable for later Live Activity integration.
5. A pure timer state machine handles `ready`, `running`, `paused`, `finished`, `skipped`, and `cancelled`. Resume writes a new deadline using the stored remaining seconds. Expiry resolves by comparing the current clock to the deadline and atomically moves to `finished`; pause/skip/cancel/resume are also persisted.
6. Session reload derives the active exercise/set and fetches its rest row. Running/paused blocks set entry. Finished/skipped/cancelled allows the next set. AppState foreground changes reconcile expiry and issue haptic/audio feedback once.

## Planned files

- `src/shared/database/schema.ts` — migration v2 for `workouts.schedule_id`, optional `exercises.target_added_weight`, and persisted rest periods.
- `src/features/workout/domain/models.ts`, `workoutMachine.ts`, and new `restTimerMachine.ts` — target/last-performance fields, resting state, and pure timer transitions.
- `src/features/workout/data/workoutRepository.ts` — today's completed lookup, schedule association, ordinary start lock, explicit restart while retaining history, richer previews, and atomic set/rest creation.
- New `src/features/workout/data/restTimerRepository.ts` — durable timer reads, expiry reconciliation, and persisted actions.
- `src/features/workout/domain/workoutService.ts` — validated set entry with rest state result.
- `src/features/workout/components/NumericField.tsx`, `PrimaryAction.tsx`, `ExercisePlanRow.tsx`, `WorkoutExerciseResultRow.tsx`, `RestTimerPanel.tsx`, and `RestTimerController.tsx` — clearer entry errors and focused presentation.
- `src/features/today/screens/TodayScreen.tsx` — completed-day state, objectives/last performance, and explicit restart action.
- New `src/features/workout/screens/WorkoutPreparationScreen.tsx`; update `WorkoutSessionScreen.tsx` and `WorkoutCompletionScreen.tsx`.
- New `app/workout/prepare.tsx`; update `app/_layout.tsx` to register it. Preserve `app/(tabs)/_layout.tsx` exactly.
- `assets/audio/rest-complete.wav` — short local completion cue played only while the app is active.
- `tests/workout.test.mjs` — daily lock/restart/history and persistent timer transition tests.
- `docs/DESIGN.md` — document the workout visual hierarchy and timer behavior; this plan.

## Verification

- `npx tsc --noEmit`
- `npm run lint`
- `npx expo install --check`
- `npm test`
- Expo iOS bundle/start check where the Linux sandbox permits it. No physical iPhone rendering or timer behavior will be claimed.

## Progress

- [x] Read `AGENTS.md`, root `PROJECT.md`, `docs/DESIGN.md`, confirm `docs/ROADMAP.md` is absent, read `.agent/PLANS.md` and the step 2 ExecPlan.
- [x] Inspect current workout, Today, History, SQLite, existing tests, routing, and installed audio APIs.
- [x] Add the migration and daily lock/restart persistence behavior.
- [x] Add the deadline-based rest state machine and durable repository transitions.
- [x] Improve Today, preparation, workout, and completion UI without changing native tabs.
- [x] Add critical timer and same-day workflow tests, then run the requested checks.

## Implementation notes

- Schema v2 backfills existing workouts to the schedule for their stored date, keeps nullable added-weight targets unset, and adds durable rest rows. Seeding now leaves any existing weekday schedule and its exercise ordering untouched.
- A normal start is rejected after a completed workout for today's schedule. The confirmed secondary restart creates a separate workout; all prior completed records remain unchanged.
- Ten dependency-free Node tests cover fresh and v1-to-v2 migrations, idempotent seed, daily locking/restart, set/rest atomicity, timer state transitions and persistence, cancellation, completion, and previous performance.
- TypeScript, ESLint, tests, Expo dependency check, iOS bundle export, and whitespace checks pass. The Expo version endpoint is unreachable, so `expo install --check` used the local SDK mapping and marked validation as unreliable.
- Expo exported the iOS JavaScript bundle, but no physical iPhone or running Expo Go UI test was performed. When iOS suspends the app at timer expiry, deadline accuracy is preserved and expiry feedback is delivered when the app resumes; background notifications/audio service are outside this step.
