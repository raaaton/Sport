# Design foundations

Sport follows iOS system conventions: system typography, native navigation, SF Symbols, native sheets and haptics. Avoid decorative cards and simulated glass when a system component is available.

The initial reusable tokens live in `src/shared/theme/tokens.ts`:

- Semantic light and dark colors, following iOS grouped backgrounds and system labels.
- A 4-point spacing scale and a small set of corner radii.
- System-style text roles from large title through caption.

Shared native UI primitives live in `src/shared/ui/`. `AppSymbol` uses SF Symbols through Expo. `GlassSurface` uses Expo's Liquid Glass view only when iOS reports the native effect as available and otherwise renders a plain system-colored surface. Haptics are wrapped in `src/shared/haptics/` so feature code can use Expo haptics without coupling to its package API.

The four primary sections are Today, History, Progress, and Settings. Screen components live under their matching `src/features/*/screens/` folders, while Expo Router route files stay under `app/(tabs)/`. The tab bar and its validated Liquid Glass treatment are part of the app shell and should not be altered by workout feature work.

Settings uses an iOS grouped-list hierarchy with sections for training, reminders, and app preferences. Selecting a row pushes a native stack detail page with the standard back button; these detail pages remain informational placeholders until their settings behavior is implemented.

## Workout flow

Today shows the scheduled session, set/repetition or duration targets, an optional configured load target, and a quieter last-performance summary. A completed session is clearly marked; its ellipsis action offers a confirmed restart while preserving the finished record. Starting a planned session first opens a preparation screen with the ordered exercises and recent performance before the explicit start action creates a workout.

The active workout prioritizes exercise name, target, current set, numeric entry, and one wide primary action. Inputs use the numeric keyboard matching reps, seconds, or decimal added weight. Invalid values use a destructive field outline and a short inline message. Avoid decorative cards and avoid presenting the previous performance above the current target.

After a non-final set, a focused rest view displays the next set and a large remaining time. Pause/resume and `Passer le repos` are the available rest actions. Passing immediately presents the next set without removing the set already saved. Abandoning the whole workout remains a separate confirmed action. Terminal timer rows never replace the next-set or feeling controls. Rest state is stored locally with an absolute deadline; the displayed countdown is derived from that deadline and the workout state is reconstructed from saved sets plus the current persisted timer after navigation/reload. Returning from another app refreshes the timer against the same deadline. The expiry haptic and short sound play when the app is active; no notification or background audio mode is enabled for the timer.

Scrollable `AppScreen` pages use the shared `DynamicScrollView`. It compares measured content height with the available viewport using a 1.5-point tolerance. Scrolling and bounce are disabled when content fits, and normal native scrolling is enabled when it overflows. Layout, content, keyboard, orientation, and Dynamic Type changes trigger fresh measurements.

The active workout entry screen is fixed and does not scroll. Focusing a numeric field switches it to a compact input layout, with a visible `Terminé` action to dismiss the keyboard. This keeps the current set fields available without moving the page to follow keyboard focus.

History, Progress, and the Settings index place their scrolling page inside the shared safe-area context's top edge, so their in-scroll titles begin below the status area and Dynamic Island. The Settings index renders its own large page title inside the measured content; its native stack header remains enabled for pushed detail pages. `DynamicScrollView` measures its actual laid-out frame inside its parent (after safe-area, navigation-header, and tab-bar layout), not the device window. The scroll content is measured independently, and keyboard height is subtracted from the available viewport before applying the tolerance.

The completion screen summarizes elapsed session time, exercises, recorded set values, and exercise feelings. It uses a simple completion mark and a clear return action without badges, scores, or confetti.

## Progression feedback

Progression feedback is calculated from the latest completed SQLite performance and the exercise's current targets. For repetition exercises, a load increase is eligible only when all prescribed sets are present, every set reaches the target maximum, and Feeling is 7/10 or lower. Missing or inconsistent data never produces a recommendation. Time-based exercises compare each recorded duration with their target and do not inherit the repetition-based load rule.

Today, preparation, and workout screens keep the objective and actual previous performance visible. An eligible load increase is shown as a quiet suggestion; the exact load is left to the future equipment-combination feature. Existing explicit load targets and per-set historical loads remain unchanged. Exercise completion can show the result when the user enters Feeling, and the workout summary can repeat eligible suggestions. The recommendation is derived, not stored, and has no points, score, or gamified presentation.
