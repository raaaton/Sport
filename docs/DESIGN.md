# Design foundations

Sport follows iOS system conventions: system typography, native navigation, SF Symbols, native sheets and haptics. Avoid decorative cards and simulated glass when a system component is available.

The initial reusable tokens live in `src/shared/theme/tokens.ts`:

- Semantic light and dark colors, following iOS grouped backgrounds and system labels.
- A 4-point spacing scale and a small set of corner radii.
- System-style text roles from large title through caption.

Shared native UI primitives live in `src/shared/ui/`. `AppSymbol` uses SF Symbols through Expo. `GlassSurface` uses Expo's Liquid Glass view only when iOS reports the native effect as available and otherwise renders a plain system-colored surface. Haptics are wrapped in `src/shared/haptics/` so feature code can use Expo haptics without coupling to its package API.

The four primary sections are Today, History, Progress, and Settings. Screen components live under their matching `src/features/*/screens/` folders, while Expo Router route files stay under `app/(tabs)/`. The tab bar and its validated Liquid Glass treatment are part of the app shell and should not be altered by workout feature work.

Settings uses an iOS grouped-list hierarchy with sections for training, reminders, and app preferences. Selecting a row pushes a native stack detail page with the standard back button. The Lest page edits the user's weighted items and previews the loads calculated from active equipment. Planning presents each existing weekly session with controls for its name, active state, free weekday, per-session reminder time, exercise membership and exercise order. Edits are explicitly saved per session; the schedule keeps the one-session-per-weekday rule.

Settings > Notifications uses grouped iOS-style rows for workout and monthly photo reminder switches, the photo reminder time, and the current iOS authorization state. Per-session workout times live in Planning. Time selection uses the Expo UI SwiftUI `DatePicker` wheel inside a native sheet; permission is requested only after an explicit opt-in. If iOS has denied it, the page explains the state and links to system settings. Existing photo reminder time is preserved, with 06:00 as its initial default. Foreground reminders appear in the banner and notification list without sound or badge. Photo reminder copy is generic and contains no private vault data.

## Progress photo vault

Progress is a private gallery rather than a dashboard. Its first visit explains the Face ID vault and requires an explicit setup action; a configured vault remains locked until the user unlocks it. Photos are grouped by their selected date, with a sparse three-column thumbnail gallery and a focused full-screen viewer. The date and source actions live in a native page sheet with a SwiftUI date wheel. Photo actions are secondary: explicit export to Photos includes a warning, and delete requires confirmation.

The vault stores encrypted originals and encrypted thumbnails only. Thumbnails are decrypted to memory on demand; full-size data is decrypted only for the viewer. Leaving the Progress tab clears the private view and key reference. When Sport loses focus, the vault clears its decrypted gallery/viewer state and drops its active key reference (subject to the configured auto-lock retention interval); there is no app-wide privacy cover. iOS may show the last rendered frame in the task switcher, so preview privacy is not guaranteed. The Face ID sheet may temporarily make iOS report the app as inactive; while an explicit unlock is in progress, this transient state does not invalidate the unlock. If SecureStore returns the key before iOS reports foreground activity, Sport holds the result until the app is active; a true background transition still invalidates and clears it. Do not add photo previews, filenames, or private details to notifications or other app surfaces.

## Workout flow

Today shows the scheduled session, set/repetition or duration targets, an optional configured load target, and a quieter last-performance summary. A completed session is clearly marked; its ellipsis action offers a confirmed restart while preserving the finished record. Starting a planned session first opens a preparation screen with the ordered exercises and recent performance before the explicit start action creates a workout.

The active workout prioritizes exercise name, target, current set, numeric entry, and one wide primary action. Reps and seconds use numeric entry; added load is selected from a native page sheet listing only available combinations, with a secondary component description. Invalid values use a destructive field outline and a short inline message. Avoid decorative cards and avoid presenting the previous performance above the current target.

After a non-final set, a focused rest view displays the next set and a large remaining time. Pause/resume and `Passer le repos` are the available rest actions. Passing immediately presents the next set without removing the set already saved. Abandoning the whole workout remains a separate confirmed action. Terminal timer rows never replace the next-set or feeling controls. Rest state is stored locally with an absolute deadline; the displayed countdown is derived from that deadline and the workout state is reconstructed from saved sets plus the current persisted timer after navigation/reload. Returning from another app refreshes the timer against the same deadline. The expiry haptic and short sound play when the app is active; no notification or background audio mode is enabled for the timer.

While a rest is active, an Expo Widgets Live Activity presents only the rest status, native countdown, exercise, and next set. Sport keeps Expo's activity lifecycle and uses a small native SwiftUI layout for this activity because the SDK 57 JavaScript layout rendered blank on the tested iPhone. The Dynamic Island compact layout prioritizes `REST` and the remaining time; its minimal form uses a single marker. In the expanded Island and Lock Screen layouts, exercise and next-set context sit opposite the rest label and countdown, with each value shown once. The Lock Screen uses the adaptive secondary system background, while the system controls the Dynamic Island background. The system-rendered timer uses the persisted deadline without JavaScript second-by-second updates. Pause replaces the countdown with a fixed remaining duration. The activity opens the workout route encoded for that session. On app launch/foregrounding, Sport reconciles existing activities against SQLite and removes stale or duplicate activities. The platform API cannot run Sport's end call at the exact deadline while the app is suspended; it ends when the app handles expiry on foregrounding.

Scrollable `AppScreen` pages use the shared `DynamicScrollView`. It compares measured content height with the available viewport using a 1.5-point tolerance. Scrolling and bounce are disabled when content fits, and normal native scrolling is enabled when it overflows. Layout, content, keyboard, orientation, and Dynamic Type changes trigger fresh measurements.

The active workout entry screen is fixed and does not scroll. Focusing a numeric field switches it to a compact input layout, with a visible `Terminé` action to dismiss the keyboard. This keeps the current set fields available without moving the page to follow keyboard focus.

Today, History, Progress, and the Settings index place their scrolling page inside the shared safe-area context's top edge, so their in-scroll titles begin below the status area and Dynamic Island. This keeps Today from relying on the native scroll view's automatic top inset, which could be reapplied differently when iOS returned from the background. The Settings index renders its own large page title inside the measured content; its native stack header remains enabled for pushed detail pages. `DynamicScrollView` measures its actual laid-out frame inside its parent (after safe-area, navigation-header, and tab-bar layout), not the device window. The scroll content is measured independently, and keyboard height is subtracted from the available viewport before applying the tolerance.

The completion screen summarizes elapsed session time, exercises, recorded set values, and exercise feelings. It uses a simple completion mark and a clear return action without badges, scores, or confetti.

## Progression feedback

Progression feedback is calculated from the latest completed SQLite performance and the exercise's current targets. For repetition exercises, a load increase is eligible only when all prescribed sets are present, every set reaches the target maximum, and Feeling is 7/10 or lower. Missing or inconsistent data never produces a recommendation. Time-based exercises compare each recorded duration with their target and do not inherit the repetition-based load rule.

Today, preparation, and workout screens keep the objective and actual previous performance visible. An eligible load increase is shown as a quiet suggestion and resolves to the smallest currently available load above the previous performance's greatest set load. When no greater load exists, the existing load remains the goal and the UI explains the equipment limit. Existing per-set historical loads remain unchanged. Exercise completion can show the result when the user enters Feeling, and the workout summary can repeat eligible suggestions. The recommendation is derived, not stored, and has no points, score, or gamified presentation.

## Weight system

The 3.0 kg base bag is fixed and included once in every weighted load. Bodyweight is a separate 0 kg option. Available loads are generated from every subset of active one-unit items, deduplicated by integer grams, and sorted ascending. Each newly selected load stores its actual weight and a snapshot of the bag/item names and weights on that set. Editing or deleting inventory items changes future combinations only; History displays the load and snapshot recorded at workout time.

## History

History opens in a completed-session list ordered by the stored calendar date. A two-way segmented control switches to exercise history; exercise selection shows each completed performance newest first with repetitions or durations, added load, and exercise Feeling presented as separate measures. Selecting either a session or performance opens its detail page. Session details keep date, workout type, exercises, ordered set values, load, and Feeling individually readable.

Adding a historical workout is a secondary action in the History heading. The native stack pushes a form where a date is entered as `AAAA-MM-JJ`; only real dates up to today are accepted. The form records a completed local workout with the same exercise set counts, positive integer reps/durations, optional nonnegative decimal load, and 0–10 decimal Feeling used elsewhere in Sport. Editing keeps the workout row and replaces its children atomically. Deleting asks for explicit confirmation and removes dependent exercise/set rows through SQLite foreign-key cascades.

Manual workouts use the selected calendar date as their stable local date. The date is not reconstructed from a timestamp or converted when the timezone changes. History and last-performance queries sort by this date first, so backfilled entries appear in the correct chronology and immediately affect derived progression.
