# Sport Rest Live Activity: Timer-like presentation and controls

## Intent

Make Sport's rest Live Activity feel like the built-in iOS Timer across the
compact Dynamic Island, expanded Dynamic Island, and Lock Screen. Keep the
display stable while the rest changes between running and paused, and let the
expanded activity control the same persisted timer that the workout screen
uses.

## Agreed presentation

- The compact leading region always says `Rest`; it does not switch to `Pause`.
- The compact trailing region displays the remaining time with SwiftUI's native
  timer text. Pausing freezes that same timer view instead of replacing it with
  a separately formatted string.
- The minimal Dynamic Island displays the remaining time, following the native
  Timer's use of live time in its minimal presentation.
- The expanded Dynamic Island and Lock Screen show `Rest`, the active exercise,
  the next-set count, and the countdown. The expanded presentation includes
  Pause/Resume and Stop actions.
- The Lock Screen keeps the system's adaptive Live Activity surface. Sport uses
  white text and restrained blue accents; it does not paint the whole activity
  blue. The Dynamic Island keeps its black system surface with a blue keyline.
- Use the system's default Dynamic Island content margins. Do not override
  compact margins with the current two-point inset.
- Interactive controls are available on iOS 17 and later; iOS 16.4 retains the
  same read-only presentation.

## Action semantics and data flow

- Pause toggles between the existing `running` and `paused` rest-timer states.
- Stop means the existing `skip` transition (`Passer le repos`): it ends this
  rest period and advances the workout flow without cancelling the workout.
- A Sport-specific `LiveActivityIntent` runs in Sport's process without opening
  the app UI and applies its action to the existing SQLite source of truth at
  `Documents/SQLite/sport.db`. Do not relocate the database or add a schema
  migration.
- Native updates are scoped to the activity's `restTimerId`. Use a transaction
  and re-check the row's current state before writing so stale, duplicate, or
  racing taps cannot affect another rest period.
- Update the matching ActivityKit content state only after the SQLite
  transaction succeeds. End the Live Activity immediately after a successful
  Stop action. Existing app foreground reconciliation continues to treat
  SQLite as authoritative.
- Preserve the workout link, timer identity, exercise and next-set metadata
  when changing activity props. A terminal or missing timer must not be
  presented as an active rest.
- Keep the feature local and offline. Do not add remote push, backend, analytics,
  database sharing, or new dependencies.

## Error and lifecycle behavior

- If the timer row no longer exists or is no longer active, do not apply the
  requested transition to another row; end or reconcile the stale activity.
- If SQLite cannot be opened or the transaction fails, leave ActivityKit state
  unchanged so the view does not claim an action succeeded when it did not.
- When Sport next becomes active, reload the persisted rest row so the workout
  screen reflects an action performed while the UI was suspended.
- The system-rendered countdown remains deadline-based and does not require
  JavaScript updates every second. Existing expiry/reconciliation behavior is
  unchanged.

## Verification expectations

- Add regression coverage for constant `Rest` labeling, system-default compact
  margins, a single timer text path for running and paused states, and the
  remaining-time minimal presentation.
- Cover pause, resume, stop/skip, expiry, stale IDs, and repeated action
  handling against the existing rest-timer state semantics.
- Check that the generated Expo Widgets source contains the native intent and
  that the signed-off build compiles and packages it in the unsigned IPA.
- Run TypeScript checks, lint, tests, Expo export/compatibility checks, and the
  iOS GitHub Actions build.
- Validate on a physical iPhone installed from the produced IPA: compact,
  minimal, expanded, Lock Screen, pause, resume, stop, rapid repeated taps,
  app foreground refresh, and no regressions to existing workout controls.

## Platform reference

Apple documents that Live Activity compact content uses separate leading and
trailing regions, recommends system-default margins unless a layout needs a
specific exception, and provides a `Text(timerInterval:pauseTime:countsDown:showsHours:)`
initializer that stops the rendered countdown at `pauseTime`:

- [Live Activities Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/live-activities)
- [SwiftUI timer text initializer](https://developer.apple.com/documentation/swiftui/text/init%28timerinterval%3Apausetime%3Acountsdown%3Ashowshours%3A%29)
- [LiveActivityIntent](https://developer.apple.com/documentation/appintents/liveactivityintent)
