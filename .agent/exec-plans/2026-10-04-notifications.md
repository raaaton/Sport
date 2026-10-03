# ExecPlan: Local Notifications

## Objective and scope

Add opt-in local workout and monthly photo reminders derived from SQLite. Manage permissions and times in Settings, resynchronize future requests after app/workout/preference changes, and route taps to Today or Progress. No remote notifications, backend, private photo content, or unrelated roadmap features.

## Context and decisions

- `expo-notifications` is already installed at the Expo SDK 57 recommended version, but no notification handler/config plugin or notification service is configured. The Settings route is currently a placeholder.
- `workout_schedules` stores weekday, workout type, and enabled state, with one optional/ordered exercise relation. It has no reminder time and no schedule editor is currently implemented. Use one global workout reminder hour, stored as `NULL` until the user chooses it; do not invent a default. The OS-native `ActionSheetIOS` hour list keeps this selection dependency-free and writes `HH:00` wall-clock intent as an hour integer.
- Store notification preferences in a schema v5 singleton: workout/photo enabled flags; nullable workout hour; photo hour defaulting to 06:00, the historical value explicitly supplied for photo reminders. Photo hour can be changed in Settings. No minute is stored because the existing requirement is an hour and no previous minute exists.
- Ask permission only from a user enabling a reminder. Inspect `ios.status` (`NOT_DETERMINED`, `DENIED`, `AUTHORIZED`, `PROVISIONAL`, `EPHEMERAL`) before requesting; never prompt again after denial. A denied user gets an explanatory state and a link to iOS Settings.
- On full resync, inspect pending notifications and cancel only request identifiers beginning `sport.local.`. Create concrete workout occurrences for the next 28 local calendar days from active schedule rows. Omit dates with any already-started workout row for that schedule/date (active, completed, or cancelled), so starting before reminder time removes that day's reminder. Read weekdays and labels from the current DB; no workout dates or names are hardcoded.
- Use non-repeating iOS calendar triggers with year/month/day/hour and no explicit timezone. These concrete requests provide stable IDs and retain local wall-clock behavior across daylight-saving/timezone changes; the 28-day horizon is rebuilt at launch, foreground, settings changes, workout start/completion/cancellation, and any future schedule write. One monthly repeating photo request on day 1 at the configured photo hour keeps the pending request set small.
- Stable IDs are `sport.local.workout.<schedule-id>.<yyyy-mm-dd>` and `sport.local.photos.monthly`. Payload data carries a small `kind` and route target only. Photo notification title/body contain no vault/private information.
- When foregrounded, show a banner and notification-center entry without sound or badge. A workout tap opens Today; a photo tap opens Progress, never a private image.

## Implementation steps

1. Add and commit this plan before implementation.
2. Add schema v5 notification preferences and repository APIs; add pure occurrence planning with weekday/date/timezone boundary and already-started suppression tests.
3. Add a dedicated notification service for iOS-specific permission state, managed request inspection/cancellation, scheduling, payload routing, and full sync; test sync filtering and request generation with a small injected adapter.
4. Replace Settings > Notifications placeholder with grouped switches, explicit authorization state, hour selection, and iOS Settings action. Wire preference writes to service sync.
5. Install foreground and notification-tap listeners at the root; sync at startup/foreground and at workout start/end/cancel, preserving existing workflow.
6. Update README, `PROJECT.md`, `docs/DESIGN.md`, and this plan. Run all requested checks and report physical-device checks separately.

## Files in scope

- `.agent/exec-plans/2026-10-04-notifications.md`
- `src/shared/database/schema.ts`
- `src/features/notifications/domain/*`, `data/*`, `services/*`
- `src/features/settings/screens/NotificationSettingsScreen.tsx`
- `app/(tabs)/settings/notifications.tsx`, `app/_layout.tsx`, `app.json`
- workout start/finish/cancel call sites required to resync
- `tests/notifications.test.mjs`
- `PROJECT.md`, `docs/DESIGN.md`, `README.md`

## Verification

- Pure tests cover preferences, weekday planning, activation changes, chosen reminder hour, dates across month/year/DST boundaries, already-started suppression, stable IDs, monthly date, and managed-vs-unmanaged request filtering.
- Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx expo install --check`, `npx expo export --platform ios`, and `git diff --check`.
- Physical iPhone checks remain necessary for permission prompts/status, notification delivery while closed/foreground, reboot/timezone behavior, notification tap routing, and the user's near-date manual test.

## Progress

- [x] Read the project/product/design/ExecPlan guidance, recent progression/history/weight plans, current schedule schema, workout lifecycle, Settings routes, Expo Notifications version and configuration.
- [x] Add preferences migration, pure planner, and tests.
- [x] Implement notification service and managed-request reconciliation.
- [ ] Build the Settings UI for switches, status, and hour selection.
- [ ] Add app/workout synchronization and tap routing.
- [ ] Update docs and README; run all requested verification.

## Implementation notes

- `docs/ROADMAP.md` does not exist. No separate schedule editor exists yet; this feature reads the current schedule table and exposes a reusable full resync for any future schedule editor to call after its transaction.
- Time selection will use native `ActionSheetIOS` rather than adding a picker dependency. The first workout reminder stays off until the user selects an hour; the first photo reminder hour is 06:00 as specified.
- Schema v5 stores opt-in flags, a nullable workout hour, and the historical 06:00 photo hour. The pure planner builds 28 days of local calendar occurrences, skips any date with an existing session row, and emits one recurring first-of-month photo spec. DST-boundary, schedule status, month/year change, and managed identifier tests are in place.
- The Expo adapter checks the iOS-specific authorization enum, never prompts from synchronization, cancels only the `sport.local.` namespace, and uses one-shot local calendar triggers for workouts plus a repeating monthly calendar trigger for photos. The handler presents foreground banner/list without sound or badge.
