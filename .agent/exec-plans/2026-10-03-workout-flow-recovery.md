# ExecPlan: workout flow recovery after rest

## Objective and scope

Repair the stage 3 workout flow so completing, skipping, or cancelling a rest always returns to the next set, and the final set always reaches exercise feeling. Restore the workflow deterministically from SQLite after navigation/reload, prevent rapid duplicate actions, and let the Today/workout/preparation/completion pages scroll only when their content exceeds the available viewport. Do not change tabs, timer product behavior, or add unrelated features.

## Findings and decisions

- `RestTimerController` returns `null` for terminal timer states, but `WorkoutSessionScreen` selects the rest branch for every non-null timer row. A finished, skipped, or cancelled row therefore leaves an empty rest container and hides both the next-set inputs and the feeling controls. The persisted terminal row is also left in React state after the last set, so it can mask exercise completion.
- The timer row belongs to the set already saved (`after_set_number`); it controls only whether the next set is temporarily blocked. The current set number is reconstructed from completed SQLite set rows. The flow projection will combine the persisted session and its timer: active timer => `resting`, terminal/no timer => `active_set` or `completed_exercise` according to the saved set count.
- Timer expiry, skip, and “Annuler le repos” will all persist their distinct terminal status and then project the same durable workout into the next-set state. The set already saved remains intact. Whole-workout abandonment remains a separate confirmed action.
- The UI currently uses a `ScrollView` on every `AppScreen`, even for content that fits. Add an opt-in adaptive mode that disables scrolling when content fits and enables it only when measured content exceeds the viewport. Keep the existing default for unrelated/long pages; opt in Today, preparation, active workout/rest, and completion.

## State machine

`idle -> active_exercise/active_set -> resting -> active_set -> ... -> completed_exercise -> active_exercise/active_set -> completed_workout`.

`stateFromSession(session, restTimer?)` is the canonical projection. It recognizes a rest only when the persisted timer is `ready`, `running`, or `paused` and matches the latest saved set. On terminal timer states it derives the next set from persisted set count. A final saved set projects directly to `completed_exercise`. Screen rendering uses the projected state, with an explicit recovery screen for inconsistent/unavailable state rather than an empty branch.

The timer remains a persisted layer: it signals its state to the workout screen, while workout state decides the next exercise/set. Expiry reconciliation already persists `finished`; the screen then reprojects from its updated timer and loaded session. Skip and cancel persist `skipped`/`cancelled` and reproject immediately. Cancel here is explicitly “Annuler le repos”, never workout cancellation.

## Implementation steps

1. Extend the pure state projection to account for active/terminal timer rows and add state-transition tests for all requested paths and reload reconstruction.
2. Update session loading and set/exercise/timer transitions to use persisted records as the source of truth; clear stale timer presentation on each newly saved set and lock rapid duplicate actions synchronously.
3. Render rest, next-set entry, exercise feeling, workout completion, and error/recovery states explicitly. Preserve existing timer controls and distinguish rest cancellation from workout abandonment.
4. Add adaptive scrolling to `AppScreen` and opt in the Today/workout flow and Settings list, preserving current behavior elsewhere.
5. Run TypeScript, lint, Expo dependency check, complete tests, and whitespace checks. Physical iPhone testing remains the user's manual step.

## Files in scope

- `.agent/exec-plans/2026-10-03-workout-flow-recovery.md`
- `src/features/workout/domain/workoutMachine.ts`
- `src/features/workout/screens/WorkoutSessionScreen.tsx`
- `src/features/workout/components/RestTimerController.tsx` / `RestTimerPanel.tsx` only if a busy-state prop is needed
- `src/shared/ui/AppScreen.tsx`
- `src/features/today/screens/TodayScreen.tsx`
- `src/features/workout/screens/WorkoutPreparationScreen.tsx`
- `src/features/workout/screens/WorkoutCompletionScreen.tsx`
- `src/features/settings/screens/SettingsScreen.tsx`
- `tests/workout.test.mjs`
- `docs/DESIGN.md` only if the clarified state/scroll behavior needs documenting

## Verification

- `npx tsc --noEmit`
- `npm run lint`
- `npx expo install --check`
- `npm test`
- `git diff --check`
- Do not claim physical iPhone validation; user will repeat the manual Push session.

## Progress

- [x] Read project guidance/spec/design, plan format, stage 3 ExecPlan, and current workout/timer/input/screens/tests.
- [x] Identify the terminal-timer render branch that hides all controls.
- [x] Repair persisted workflow projection and UI action locks.
- [x] Add adaptive per-screen scrolling.
- [x] Add regression tests for timer exit paths, final-set/exercise progression, duplicate validation, and reload reconstruction.
- [x] Run final Expo dependency and whitespace checks; report physical iPhone test to user.

## Implementation notes

- The screen now chooses the rest UI only for active persisted timer states. Finished/skipped/cancelled rows project to the next active set, and the last saved set projects to Feeling. Initial route load restores both the session and its current rest row before exposing controls.
- Set/exercise/rest actions use a synchronous in-flight ref in addition to disabled UI. Rest buttons visibly disable while their SQLite transition is pending. The repository transaction still rejects a second set while a rest is active or after its target count is reached.
- Adaptive scrolling is opt-in on Today, preparation, session/rest, completion, and the Settings list; the default scrolling behavior for other screens is unchanged.
- TypeScript, ESLint, all Node tests, and whitespace checks pass. Expo reports dependencies up to date using its local SDK map; the remote well-known versions endpoint is unreachable because networking is disabled, so that particular check is not authoritative.
- The regression paths were exercised in automated tests. UI behavior on a physical iPhone remains for the user to validate.
