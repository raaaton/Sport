# ExecPlan: Settings UX rework

## Objective

Replace the generic Settings placeholder with a native-feeling, grouped iOS settings screen and navigable placeholder detail pages. Keep the four native tabs and their Liquid Glass appearance untouched. Add no settings behavior or unrelated feature logic.

## Current issue

The checked-out `SettingsScreen` is only the shared `FeaturePlaceholder`: one centered symbol, title, and sentence. It has no settings categories, controls, or navigation, so it reads as a starter placeholder rather than an iOS settings screen.

There is no modal presentation in the current source: `app/modal.tsx` was removed during the foundations step, and the root stack contains only the tabs route. The only remaining `/modal` reference is a stale comment in `app/_layout.tsx`. Therefore the reported half-height sheet cannot be attributed to a current `presentation` or detent setting. To address the user-visible problem without inventing a modal, settings categories will push native stack detail pages; this is the standard iOS pattern for hierarchical settings and lets each page size naturally to its content.

## Chosen structure

- A native large-title Settings screen with three grouped sections: Training (schedule, exercises, added weight, rest timer), Notifications, and App (preferences, about).
- Compact system-style rows with SF Symbols, secondary descriptions, separators, and disclosure indicators. Use system grouped colors and modest section insets rather than decorative cards.
- A nested Expo Router native stack under the Settings tab. Each row pushes a full-height placeholder destination with a native back button. No new sheet or tab-bar changes.

## Files to change

- `app/(tabs)/settings.tsx` — replace the leaf route with the `settings/` route group (remove the file, add `settings/index.tsx`).
- `app/(tabs)/settings/_layout.tsx` and `schedule.tsx`, `exercises.tsx`, `weighted-items.tsx`, `timer.tsx`, `notifications.tsx`, `preferences.tsx`, `about.tsx` — add the nested native stack and its placeholder routes.
- `src/features/settings/screens/SettingsScreen.tsx` — build the grouped settings overview.
- `src/features/settings/screens/SettingsDetailScreen.tsx` — shared visual for settings detail placeholders.
- `docs/DESIGN.md` — document the Settings grouping and push-navigation pattern.
- `.agent/exec-plans/2026-10-03-settings-ux.md` — track implementation and verification.

No changes are planned for `app/(tabs)/_layout.tsx`, the other tab screens, shared navigation, or Liquid Glass.

## Verification

- `npx tsc --noEmit`
- `npm run lint`
- `npx expo install --check`
- If available, run Expo's web export/start check. The user will verify the final iPhone appearance and native interactions in Expo Go.

## Progress

- [x] Read `AGENTS.md`, root `PROJECT.md`, `docs/DESIGN.md`, the foundations ExecPlan, and related route/theme/UI files.
- [x] Inspect current Settings implementation and confirm no modal exists in the checked-out source.
- [x] Implement the grouped Settings list and seven native stack placeholder destinations.
- [x] `npx tsc --noEmit` passes.
- [x] `npm run lint` passes.
- [x] `npx expo install --check` passes with local dependency data; Expo's network version endpoint is unavailable in this environment.
- [x] `npx expo export --platform web` bundles successfully; Expo Web started and returned HTTP 200 for `/settings` with the expected settings labels in the rendered page.
- [ ] User to verify final iOS appearance and native push/back interactions on iPhone in Expo Go.
