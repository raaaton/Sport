# ExecPlan: Editable Weekly Schedule and Native Reminder Times

## Objective and scope

Replace the Settings > Planning placeholder with an editor for the three existing weekly sessions. Let the user change each session's name, weekday, active state, reminder time, selected exercises, and exercise order. Give each workout its own reminder time. Replace the current hour lists with an iOS-native time picker. Keep SQLite as the source of truth and resynchronize managed notifications after a schedule save.

Do not add arbitrary new workout templates, edit exercise definitions, change workout/history/progression behavior, or alter the validated tabs.

## Context and decisions

- The database has three seeded schedules in `workout_schedules`, each with a unique weekday, active flag and ordered `workout_schedule_exercises`. `Settings > Planning` is only explanatory placeholder text.
- The current notification preference stores one nullable global workout hour. The user now wants an hour per session. Schema v6 adds nullable `reminder_time_minutes` to each schedule. The migration copies a previously chosen global hour to every existing schedule in minutes; when no old hour was chosen, it leaves the new values unset. No new reminder time is invented.
- Keep the current one-session-per-weekday constraint. The editor moves or deactivates the existing three sessions, preventing accidental collisions. Adding arbitrary new session templates is outside this request.
- A schedule can be saved with no selected exercises only when disabled. The Today plan and reminder planner already ignore schedules without active assigned exercises.
- A schedule save atomically updates the schedule row and replaces its ordered exercise links. After commit, the notification service rebuilds only Sport-managed reminder requests from the current DB; historical workouts and their schedule labels are not rewritten.
- Use the official Expo SDK 57 `@expo/ui/swift-ui` DatePicker with the wheel style on iOS. It maps to SwiftUI, is included in Expo Go, and avoids a hand-built imitation or custom Swift. This is a concrete first-party native primitive dependency. Keep a simple platform fallback for web/Android.
- Store time as minutes after midnight (0–1439), preserving minute precision. The old preference table column stays in place for migration compatibility but ceases to be the active source of workout reminder time. Photo reminder time also moves from the hour list to the same native DatePicker, preserving its configured value.

## Implementation steps

1. Commit this plan before code changes.
2. Add and test schema v6, schedule repository read/save transactions, minute-of-day validation, ordering and weekday-collision behavior.
3. Extend the pure notification planner and SQLite adapter to use each active schedule's own time, while retaining photo notifications and already-started suppression.
4. Install the Expo UI dependency and use a native SwiftUI wheel time picker for photo and per-session times.
5. Replace the Planning placeholder with an editor for name, weekday, active state, selected exercises, their order and reminder time. Move workout reminder timing out of Notifications Settings and link to Planning.
6. Resynchronize notifications after successful schedule edits; update tests, README, product/design docs and this plan.
7. Run TypeScript, lint, all tests, Expo dependency check, iOS export and diff check. Report iPhone validation separately.

## Files in scope

- `.agent/exec-plans/2026-10-04-editable-schedule.md`
- `src/shared/database/schema.ts`
- `src/features/settings/data/scheduleRepository.ts`
- `src/features/settings/screens/ScheduleSettingsScreen.tsx`
- `app/(tabs)/settings/schedule.tsx`
- `src/features/settings/screens/NotificationSettingsScreen.tsx`
- `src/features/notifications/domain/notificationPlanner.ts`
- `src/features/notifications/data/notificationRepository.ts`
- `src/features/notifications/services/localNotifications.ts`
- `src/shared/ui/NativeTimePicker*.tsx`
- `tests/notifications.test.mjs`, `tests/workout.test.mjs`
- `package.json`, `package-lock.json`, `README.md`, `PROJECT.md`, `docs/DESIGN.md`

## Verification

- Test v6 migration including preservation of a previously selected global workout hour and no invented time when unset.
- Test schedule editing, empty/invalid exercise selection, active state, order, and weekday collision without creating orphaned links.
- Test per-schedule reminder time, disabled schedules, no time selected, resync after schedule changes, and already-started workout suppression.
- Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx expo install --check`, `npx expo export --platform ios`, and `git diff --check`.
- The SwiftUI wheel, sheet presentation, Dynamic Type, and notification delivery remain physical iPhone checks; bundling is not a visual/device test.

## Progress

- [x] Read project and design guidance, latest notification plan, SQLite schedule schema, settings routes, notification settings and planner, and workout schedule consumption.
- [x] Confirm the SDK 57 official SwiftUI DatePicker API and Expo Go support.
- [x] Add schema v6 and schedule persistence.
- [x] Use individual schedule time in notification planning.
- [x] Implement native time selection and the Settings > Planning editor.
- [x] Update docs and README; run full verification.

## Implementation notes

- Schema v6 stores nullable reminder minutes on each schedule and photo reminder minutes on notification preferences. It carries the previously configured global workout hour to every existing schedule, preserves the existing photo hour, and leaves times unset if the user had never selected one.
- The seed now checks a schedule's stable ID before inserting it. Previously, seeding by weekday would have recreated a moved default session when the app reopened.
- The schedule editor operates on the existing three sessions, with one session per weekday. It supports moving, renaming, activation, exercise selection/order and per-session reminder time; save is transactional and notification resync follows a successful write.
- `@expo/ui` is the SDK 57 recommended first-party native primitive package, used only for SwiftUI DatePicker on iOS. Its wheel selector is included in Expo Go; a simple text-time fallback is used off iOS.
- TypeScript, lint, all six test suites, the Expo SDK dependency check, iOS export, and `git diff --check` pass. Dependency validation used Expo's local package map because network access is disabled. An additional web export attempt fails in the existing SQLite web import chain because `expo-sqlite/web/wa-sqlite/wa-sqlite.wasm` is absent; this task does not alter or patch that web-specific setup. Physical iPhone layout and picker behavior remain to be checked.
