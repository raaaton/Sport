# Scheduled rest completion in the Dynamic Island

## Objective

Repair the rest Live Activity layout and controls, and have iOS display an expanded “Repos terminé” Live Activity at the exact rest deadline even when Sport is suspended. Raise Sport’s iOS minimum to 26.0, as approved by the user, so the implementation can use ActivityKit’s local scheduled-start API without an older-OS fallback.

Keep workout state in the existing SQLite database. Do not add a server, remote push, database schema, or dependency.

## Context and decisions

- The current native patch renders an icon and “Rest” together in compact mode, duplicates status/next-set information, adds only 2 pt vertical Lock Screen padding, and places two small controls side by side.
- The existing Pause/Resume LiveActivityIntent commits the canonical SQLite transition before updating ActivityKit. Retain that ordering and replace Stop in the Live Activity with one large Pause/Resume toggle.
- Schedule a second, high-relevance `SportRestCompletionActivity` locally for the running timer’s deadline. Its ActivityKit `alertConfiguration` announces the scheduled start. Keep it separate from the current activity so existing Expo reconciliation continues to own only the countdown instance.
- Pause cancels the pending completion activity; Resume schedules a new one from the committed deadline; skip/early end cancels it. Natural expiry preserves the scheduled completion activity while the countdown is reconciled away.
- ActivityKit can refuse a scheduled activity, for example when the device has reached its activity limit. Surface no false success in code or documentation. Physical testing must establish the behavior on the user’s iPhone.
- The user chose to raise the minimum OS to iOS 26 and remove fallback behavior.

## Implementation steps

1. Add failing tests for iOS 26 target generation, local scheduled completion/cancel wiring, and the requested Island/Lock Screen/control layout.
2. Implement an idempotent native scheduler in the existing expo-widgets patch path. Schedule only for running timers, key every event by the persisted rest timer ID, avoid duplicate deadlines, and clean up stale completion activities.
3. Wire scheduler changes after successful SQLite transitions in both Expo lifecycle updates and the LiveActivityIntent. Do not cancel the expiry event when naturally reconciling an overdue timer.
4. Simplify the native presentation: compact icon without REST text; REST/PAUSE text without timer glyph in expanded and Lock Screen; remove duplicate detail and Stop; use one accessible 44 pt Pause/Resume button; add clear inner spacing to expanded Island and Lock Screen.
5. Set the Expo iOS deployment target and ExpoWidgets pod minimum to 26.0, and update the generated-project CI assertion plus `PROJECT.md`, `docs/DESIGN.md`, and `README.md` minimum-OS/shipped-feature notes.
6. Run focused source tests, full TypeScript/lint/Node tests, Expo iOS export, prebuild checks, and `git diff --check`. Commit and push one coherent change to `main`, then monitor the requested iOS build workflow to completion.

## Verification and limits

- CI must compile the generated app and widget Swift sources and package the unsigned IPA; it cannot prove runtime scheduling or button taps.
- The user will install the IPA on their iPhone and validate pause, resume, skip from the app, expiry while foreground/background, and the visible Island/Lock Screen treatment. Report that device validation as pending until they provide the result.
- Scheduling can fail if ActivityKit is disabled or the system refuses another activity. Report actual error handling and observed CI/device evidence without calling the OS API absolutely infallible.

## Progress

- [x] Read product docs and prior Live Activity plans before implementation.
- [x] Obtain approval for iOS 26 minimum and no fallback.
- [x] Add failing regression checks.
- [x] Implement scheduled expiry and UI/control changes.
- [x] Set the iOS 26 deployment targets and update product/design/build documentation.
- [x] Run local verification.
- [ ] Commit, push to `main`, and wait for CI.
- [ ] Record the iPhone result after user testing.
