# ExecPlan: dynamic scrolling and single rest-skip action

## Objective

Remove the rest-only cancel action so a rest offers pause/resume and one `Passer le repos` action, then make all app screens use a shared measured scroll container that enables scrolling only when content exceeds usable height. Preserve whole-workout abandonment as its existing separate confirmed action. Do not change tabs, database schema, or unrelated features.

## Findings and decisions

- `RestTimerPanel` currently exposes both `Passer le repos` and `Annuler le repos`; `RestTimerEvent` and the workflow action callback also model a rest-only `cancel` transition. The two actions both advance to the same next set, so this is redundant. Remove the rest-only event/action and retain timer `cancelled` as a persisted terminal status used when the entire workout is cancelled.
- `AppScreen` currently wraps all content in a `ScrollView` with scrolling always enabled by default; the earlier `scrollMode="auto"` opt-in only covered selected screens. Replace this choice with a shared `DynamicScrollView` inside `AppScreen`, so every existing AppScreen (Today, session/rest, completion, History, Progress, Settings and detail pages) measures itself automatically.
- Use measured viewport/content heights and a 1.5 point tolerance: `scrollEnabled = contentHeight > availableHeight + tolerance`. Re-measure on layout/content changes, subtract the visible keyboard height from available height, preserve iOS automatic safe-area/keyboard insets, and disable bounce/overscroll when scrolling is unnecessary.
- Extract the pure height decision so tests cover below/equal/near/above threshold and dynamic content growth/shrink without adding a UI or test dependency.

## Implementation steps

1. Remove the rest-cancel event/action from the UI callback contract and timer machine. Preserve whole-workout cancellation and its database status cleanup.
2. Add `DynamicScrollView`, use it unconditionally from `AppScreen`, and remove screen-by-screen scroll mode choices.
3. Update project/design/ExecPlan language to reflect one rest-skip action and dynamic measurement.
4. Add pure threshold tests, skip-to-next-set regression coverage, and a static regression asserting the rest-only cancel label/action is absent.
5. Run TypeScript, lint, dependency check, all tests, and whitespace checks. Physical iPhone validation remains manual.

## Files in scope

- `.agent/exec-plans/2026-10-03-dynamic-scroll-and-rest-skip.md`
- `src/features/workout/components/RestTimerPanel.tsx`
- `src/features/workout/components/RestTimerController.tsx`
- `src/features/workout/screens/WorkoutSessionScreen.tsx`
- `src/features/workout/domain/restTimerMachine.ts`
- `src/shared/ui/DynamicScrollView.tsx`
- `src/shared/ui/AppScreen.tsx`
- `src/features/today/screens/TodayScreen.tsx`
- `src/features/workout/screens/WorkoutPreparationScreen.tsx`
- `src/features/workout/screens/WorkoutCompletionScreen.tsx`
- `src/features/settings/screens/SettingsScreen.tsx`
- `src/features/history/screens/HistoryScreen.tsx`
- `src/features/progress/screens/ProgressScreen.tsx`
- `src/features/settings/screens/SettingsDetailScreen.tsx`
- `src/shared/ui/FeaturePlaceholder.tsx`
- `tests/workout.test.mjs`
- `tests/dynamic-scroll.test.mjs`
- `PROJECT.md`, `docs/DESIGN.md`

## Verification

- `npx tsc --noEmit`
- `npm run lint`
- `npx expo install --check`
- `npm test`
- `git diff --check`
- Do not claim physical iPhone behavior has been tested by the agent.

## Progress

- [x] Read project instructions, product/design docs, plan format, the prior workflow ExecPlan, and current timer/scroll references.
- [x] Confirm duplicate rest actions and identify AppScreen's always-enabled default as the source of remaining short-screen scroll.
- [x] Implement the single skip action and shared dynamic scroll measurement.
- [x] Add regression tests and run required checks.

## Follow-up: safe-area and screen-measurement regression

### Findings

- Expo Router supplies `SafeAreaProvider`; `NativeTabsView` also supplies a provider per native tab. Neither provider applies inset padding by itself. History and Progress render custom titles directly inside `AppScreen`, whose only top spacing was the design token `spacing.md`; without a safe-area view, those titles could begin underneath the status area/Dynamic Island.
- The Settings index defines a native `headerLargeTitle` of “Réglages” but its screen body contains only the intro text. That made the visible title depend entirely on native large-title/scroll integration. `DynamicScrollView` compared `onContentSizeChange` against the raw view `onLayout` height, which does not deduct safe-area/header insets; for this nested native header it could decide the content fit and disable the scrolling relationship the large title needs, leaving its reserved area blank and the long list immobile.

### Chosen layout

- Keep the title in the scrolling page content on History, Progress, and Settings. Add the existing safe-area-context `SafeAreaView` (top edge) around those pages, so the DynamicScrollView viewport itself starts below the system top inset. Keep Today, session, timer, and Liquid Glass tabs untouched.
- On Settings index only, hide the nested stack header and render “Réglages” in the page content. Keep native stack headers for Settings detail routes. This removes the hidden large-title dependency and ensures the title participates in the same measured content as the list.
- For all `AppScreen` content, measure a finite viewport after safe-area/nav layout and account for keyboard insets. The available height must be the actual `DynamicScrollView` frame within its parent, not the device window height. Keep `contentContainerStyle.flexGrow` only as a minimum fill behavior; never use it as the content measurement.

### Remaining implementation

1. Add safe-area edges to `AppScreen`, apply the top edge on History/Progress/Settings, add Settings page title, and hide only the Settings index native header. [x]
2. Measure the actual scroll viewport separately from content; remove the extra child wrapper that could constrain content measurement; account for safe-area/header/tab layout through the measured parent frame and subtract keyboard height. [x]
3. Add regression tests for available-height calculation and retain short/long/grow/shrink cases. [x]
4. Run required static checks and all tests. The physical iPhone layout still requires user validation. [x]

### Files for this follow-up

- `src/shared/ui/AppScreen.tsx`
- `src/shared/ui/DynamicScrollView.tsx`
- `src/shared/ui/dynamicScrollMetrics.ts`
- `src/features/history/screens/HistoryScreen.tsx`
- `src/features/progress/screens/ProgressScreen.tsx`
- `src/shared/ui/FeaturePlaceholder.tsx`
- `src/features/settings/screens/SettingsScreen.tsx`
- `app/(tabs)/settings/_layout.tsx`
- `tests/dynamic-scroll.test.mjs`
- `docs/DESIGN.md`

### Implementation notes

- The safe-area wrappers reduce the scroll view's actual `onLayout` frame; there is no manual top offset. Settings index no longer delegates its visible title to the native large-title transition: the stack header is hidden on that index only, and “Réglages” is the first scrollable content. Pushed Settings detail screens keep their native headers.
- `DynamicScrollView` receives the viewport frame after its parent SafeAreaView and navigator have laid it out. It separately reads content height from `onContentSizeChange`. `availableScrollHeight` subtracts keyboard height, and `shouldEnableScroll` compares `contentHeight - availableHeight > 1.5`, remaining disabled until a nonzero viewport measurement arrives.
- The scroll content is now passed directly into ScrollView rather than through an extra flex-shrink wrapper; `flexGrow: 1` remains only on the content container to fill short screens, while long children can extend it.
- `npx tsc --noEmit`, `npm run lint`, `npm test`, and `git diff --check` pass. `npx expo install --check` reports dependencies up to date from the local SDK map; the remote Expo versions endpoint is unreachable while network access is disabled.
- Automated checks validate the height threshold and screen wiring. Visual safe-area and scrolling behavior on History, Progress, and Settings remains unverified physically on iPhone.

## Implementation notes

- The rest UI exposes only pause/resume and `Passer le repos`. The timer transition event no longer includes a rest-only cancel; the `cancelled` persisted status remains only for cleanup when the separately confirmed whole-workout abandonment ends a running rest.
- `DynamicScrollView` measures native `onLayout` viewport height and `onContentSizeChange` content height. It subtracts the visible keyboard height from the viewport and enables scrolling only when content exceeds that available height by more than 1.5 points. It remeasures after layout, content, keyboard, orientation, and Dynamic Type changes, and disables bounce/overscroll when scrolling is unnecessary.
- Every `AppScreen` now uses this component, including Today, workout/rest, completion, History, Progress, Settings, details, and placeholders. No screen-specific scroll flag remains.
- TypeScript, ESLint, all tests, and whitespace checks pass. Expo dependency validation reports up-to-date using the local SDK map; its remote versions endpoint is unavailable while network access is disabled.
- Physical iPhone validation has not been performed in this implementation turn.

## Follow-up: Settings content still does not scroll

### Cause

- The Settings page applied only the top safe-area edge. Its `DynamicScrollView` therefore measured a viewport that still included the bottom system/tab safe area. The long settings content could compare as fitting in that oversized frame even though its last rows extend below the usable region on iPhone.
- The threshold calculation itself remains correct; the parent had not constrained the measured viewport to the full usable safe area.

### Correction

- Apply both top and bottom safe-area edges around Settings so `onLayout` measures the usable viewport that remains between the system insets. Keep the shared dynamic threshold and all navigation/tab visuals unchanged.
- Extend the layout regression to require both edges on Settings, while preserving the short/equal/overflow and content resize metric checks.

### Files

- `src/features/settings/screens/SettingsScreen.tsx`
- `tests/dynamic-scroll.test.mjs`
- `.agent/exec-plans/2026-10-03-dynamic-scroll-and-rest-skip.md`
