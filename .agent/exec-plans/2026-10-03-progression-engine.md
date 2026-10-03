# ExecPlan: performance-based progression recommendations

## Objective and scope

Use the latest completed SQLite performance to give a clear, deterministic next-session progression status. For repetition exercises, recommend increased load only when the full prescribed set count was completed, every set reached the configured maximum, and Feeling is at or below 7/10. Keep time-based comparisons separate and do not invent a load increment. Surface the current objective, last performance, and any recommendation in Today, preparation, and the workout; show eligible recommendations in exercise/session completion UI. Do not implement load-object combinations or unrelated roadmap features.

## Context and decisions

- SQLite schema v2 already stores exercise tracking type, set/repetition/time targets, optional explicit `target_added_weight`, ordered completed set values, per-set added weight, exercise feeling, and completed workout dates. No schema migration is needed: recommendation status is reproducibly derived from these records and current exercise targets.
- `getLastPerformance` is the collection boundary and only returns an exercise from a completed workout and completed exercise. A pure domain engine will consume this record plus the current `Exercise`; screens only request/display its result.
- Progression status values: `insufficient_data` for no previous result, missing/invalid targets or values, incomplete/misaligned sets, or missing/invalid Feeling when the rep rule requires it; `maintain` for a valid repetition performance that misses the maximum; `achieved` when every rep set reaches the maximum but Feeling is above 7, and for a valid time performance that reaches its duration target; `increase_load_recommended` when every rep set reaches the maximum and Feeling is `<= 7`.
- Time-based exercises compare every stored duration to a defined target duration and can be `achieved` or `maintain`, but never get a load recommendation from the repetition rule. Missing target duration or inconsistent legacy data yields `insufficient_data`.
- An incomplete or cancelled session cannot generate an increase recommendation. Completed performance retrieval already excludes cancelled sessions; the engine also rejects the wrong number of sets, missing set numbers, wrong metric payloads, missing maxima, and invalid data.
- A recommendation is eligibility only. No `+0.5 kg`/other increment is inferred. If an explicit current target load exists, retain and display it; otherwise say that a load increase is recommended without filling a numeric value. Every recorded per-set load remains unchanged and displayed as recorded, including sessions where values differ.
- During the Feeling step, compute the candidate from saved set values and the current Feeling field. This makes the recommendation visible at exercise completion and updates it if Feeling changes, without persisting a derived conclusion. Session completion may summarize exercises whose result is eligible.

## Implementation steps

1. Add a pure typed progression engine with validation for rep-based and time-based targets and a simple, explicit status result.
2. Extend Today/preparation exercise rows to accept an assessment; show actual target data, unchanged last-performance values, and a quiet recommendation only when eligible.
3. In active workout, show the previous performance/status alongside the existing objective without changing set persistence or rest workflow; show the conditional progression result during the completed-exercise Feeling step and in completion summary.
4. Add focused unit tests for threshold inclusion, scores above/below threshold, missed max, incomplete/missing data, time tracking, and mixed per-set loads.
5. Document progression behavior and run TypeScript, ESLint, Expo dependency check, all tests, Expo start/bundle check, and whitespace validation. Physical iPhone UI validation remains manual.

## Files in scope

- `.agent/exec-plans/2026-10-03-progression-engine.md`
- `src/features/workout/domain/progressionEngine.ts`
- `src/features/today/screens/TodayScreen.tsx`
- `src/features/workout/screens/WorkoutPreparationScreen.tsx`
- `src/features/workout/screens/WorkoutSessionScreen.tsx`
- `src/features/workout/screens/WorkoutCompletionScreen.tsx`
- `src/features/workout/components/ExercisePlanRow.tsx`
- `src/features/workout/components/WorkoutExerciseResultRow.tsx`
- `tests/progression.test.mjs`
- `docs/DESIGN.md`

## Verification

- `npx tsc --noEmit`
- `npm run lint`
- `npx expo install --check`
- `npm test`
- `npx expo export --platform ios` or an Expo start check if the export is unsupported in the environment
- `git diff --check`
- Do not claim physical iPhone validation.

## Progress

- [x] Read project/product/design/plan guidance and confirm `docs/ROADMAP.md` is absent.
- [x] Read the stage 3 workout UX ExecPlan, current schema/models/repository, Today/workout/history screens, and relevant components/tests.
- [x] Confirm existing SQLite fields are sufficient and no migration is needed.
- [x] Implement the pure assessment engine and wire Today, preparation, active exercise completion, and workout summary.
- [x] Add unit coverage for thresholds, missing/incomplete data, time-based targets, and per-set loads; document the behavior.
- [x] Run TypeScript, ESLint, Expo dependency validation, all tests, iOS bundle export, and whitespace checks; report iPhone validation limits.

## Implementation notes

- `assessProgression` is a pure function. It validates exact target set count/order and stored metric values, compares reps only to a defined maximum plus a valid Feeling, and compares timed sets only to a defined duration target. It returns a status and an eligibility value, never an exact load.
- Latest historical set loads continue to come directly from the SQLite rows and are rendered per set. No database migration or derived recommendation persistence was added.
- Today and preparation show the recommendation and state that exact load depends on available equipment. During a completed-exercise Feeling step, the candidate is recalculated from saved sets and the edited Feeling. Workout completion summarizes exercises with eligible recommendations.
- TypeScript, ESLint, all Node tests, and iOS JavaScript bundle export pass. `expo install --check` found dependencies up to date with the local SDK map; its remote version endpoint was unreachable offline.
- The UI was not physically tested on an iPhone. Expo export validates the JavaScript bundle, not native rendering or interaction in Expo Go.
