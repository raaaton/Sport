# ExecPlan: first end-to-end workout

## Objective and scope

Implement persistent local workout planning and an end-to-end workout flow: start/resume today's plan, record each repetition- or duration-based set and per-set added weight, request one exercise-level feeling, complete/cancel a workout, show the prior completed performance during an exercise, and make completed workouts reviewable. No rest timer, reminders, photo vault, biometrics, integrations, export, charts, or advanced progression.

## Data model decisions

- Version schema with a `schema_migrations` table and transactional migrations. Enable SQLite foreign keys on each opened connection.
- Normalize `exercises`, editable-ready `workout_schedules` and ordered `workout_schedule_exercises`, `workouts`, ordered `workout_exercises`, and ordered `workout_sets`.
- Keep `feeling` on `workout_exercises`: it describes the exercise as a whole, not a set. Store set repetitions, duration, added weight, and completion separately on each set.
- Store workout status as `active | completed | cancelled`; derive the requested completed state from that value. Use constraints for valid tracking type, set payload, feeling range, order uniqueness, and relationships.
- Seed stable IDs with `INSERT OR IGNORE` so later launches do not duplicate or overwrite user-edited schedule data.
- The only numeric rep target documented in root `PROJECT.md` is the example `4 × 8–12`; use four sets and 8–12 reps for repetition exercises. Use four sets for L-sit, but leave its target duration unset because the specification gives no number. Use the documented 180-second rest default as exercise metadata; do not implement a timer.
- Seed ISO weekdays Tuesday=2, Saturday=6, Sunday=7 and the specified ordered exercises.

## Workflow and last performance

- A discriminated workout state machine represents idle, active workout/exercise/set, completed set/exercise/workout, and cancelled workout. Rehydrate its state from SQLite when the route mounts; do not create workouts from render effects.
- `startOrResumeToday` runs as a button action in one exclusive SQLite transaction. It first resumes any active workout; otherwise it loads today's plan and atomically creates the workout and ordered exercise rows. A unique partial index prevents two active workouts.
- Record a set only after validating the tracking-specific value and optional nonnegative weight. Assign its number from persisted completed sets within the same transaction. After the last planned set, ask for a 0–10 decimal feeling and mark the exercise complete. Completing the final exercise also records workout end time and status atomically. Cancellation is persisted.
- Query the latest completed `workout_exercise` for the current exercise, then its ordered sets. Exclude active/cancelled records and summarize those stored set values in the session UI.
- Show a compact completed-session history so finished workouts remain reviewable after relaunch; no charts or filtering.

## Planned files

- `src/shared/database/index.ts`, `contract.ts`, and `schema.ts` — initialized Expo SQLite connection, typed database boundary, versioned migration, and idempotent seed.
- `src/features/workout/domain/models.ts`, `workoutMachine.ts`, and `workoutService.ts` — domain types, state transitions, validation, and session orchestration.
- `src/features/workout/data/workoutRepository.ts` — SQLite queries and transactional persistence.
- `src/features/workout/components/` — reusable numeric field and primary action for the workout UI.
- `src/features/workout/screens/WorkoutSessionScreen.tsx` and `WorkoutCompletionScreen.tsx` — live exercise entry and finish/cancel states.
- `src/features/today/screens/TodayScreen.tsx`, `src/features/history/screens/HistoryScreen.tsx`, and `src/features/history/screens/WorkoutHistoryList.tsx` — scheduled/resume entry point and minimal persistent history.
- `app/workout/[workoutId].tsx` and `app/_layout.tsx` — full-screen workout route above the existing tabs.
- `tests/workout.test.mjs`, `package.json`, and `tsconfig.json` — dependency-free Node tests using built-in `node:sqlite` against the real migration and repository/service code.
- This ExecPlan for progress and verification.

The existing `app/(tabs)/_layout.tsx`, Settings routes, and their Liquid Glass styling are explicitly out of scope.

## Verification

- Unit/integration coverage: migration and idempotent seed; schedule-based create/resume and ordered children; invalid and valid sets; set progression; exercise feeling/completion; workout completion/cancellation; durable reload; and latest completed performance.
- `npx tsc --noEmit`, `npm run lint`, `npx expo install --check`, project tests, Expo Go launch/bundle check. No physical iPhone visual test will be claimed from this Linux session.

## Progress

- [x] Read `AGENTS.md`, root `PROJECT.md`, `docs/DESIGN.md`, confirm `docs/ROADMAP.md` is absent, read `.agent/PLANS.md` and the foundations plan, and inspect current database/UI/package files.
- [x] Inspect current Expo SQLite transaction API and Node's built-in SQLite test capability.
- [x] Implement schema, seed, repository, and workout state machine.
- [x] Implement Today start/resume, workout entry/completion, and reviewable history.
- [x] Add and run critical workout tests and requested project checks.

## Implementation notes

- Added Node's built-in `node:test` and `node:sqlite` integration coverage without adding a dependency. Tests exercise the same schema and repository functions used by Expo.
- Workout routing is registered as a full-screen Expo Router stack route. The existing native tabs layout was not changed.
- iOS Metro export succeeds. Starting the long-running Expo Go dev server in this Linux sandbox does not progress beyond “Starting project”; a direct local status check found no Metro listener. Physical Expo Go/iPhone launch remains for the user's device check.
- `expo install --check` used Expo's local bundled dependency map because network access is disabled; it reported the installed Expo package versions are up to date.
