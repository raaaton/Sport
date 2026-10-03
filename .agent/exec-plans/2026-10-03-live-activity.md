# Stage 9 — Rest timer Live Activity

## Objective

Expose the current workout rest on the iPhone Lock Screen and Dynamic Island through Expo's official `expo-widgets` integration. Keep SQLite's workout/rest rows as the source of truth, retain local/offline behavior, and preserve the unsigned GitHub IPA pipeline. Do not change unrelated workout, progression, weight, history, vault, notification, or tab behavior.

## Context and decisions

- The app currently creates and starts its persisted rest timer atomically with a saved set. `deadlineAt` is the running timer's absolute end; pause stores remaining seconds and resume creates a new deadline.
- Use the SDK 57 compatible `expo-widgets` package and its runtime `createLiveActivity` API; no custom ActivityKit extension, EAS, server, or Live Activity push notifications.
- Use SwiftUI `Text` timer/date features in the widget runtime so iOS renders the countdown from the absolute deadline without per-second JavaScript updates. A paused activity shows a static paused state.
- Activity props identify workout, rest timer, exercise, next set, target set count, state, and deadline. The route URL identifies the workout; route state is reloaded from SQLite on open.
- Reconcile recovered `getInstances()` against the current active workout/rest row, update the matching instance, end stale/duplicate instances, and start only when no instance represents that rest.
- End activities immediately for pause transitions that invalidate a countdown only if the API cannot represent pause in-place; preferred behavior is update props to `paused`, then resume with a recomputed deadline. End on skip, expiry, exercise/workout completion, or cancellation.
- Expo's documented JS API has no scheduled background `end()` at a given deadline. Native countdown remains accurate while Sport is suspended, while activity termination after expiry is handled when the app's expiry transition runs (foreground refresh/re-entry). Verify this boundary on device and report it honestly.
- Lock Screen deep linking should use Expo Router's `sport://workout/<id>` route. Add a `widgetURL` modifier to the banner if needed to cover Lock Screen presentation.
- Repository checkout has `PROJECT.md` at root and no `docs/ROADMAP.md`; the existing roadmap is reflected in README. Do not invent a parallel roadmap file solely to satisfy a stale path.

## Implementation steps

1. Add this ExecPlan before implementation; commit it independently.
2. Install the SDK-compatible dependency and inspect its installed API/config plugin. Commit dependency and lockfile.
3. Implement a focused Live Activity presentation module with separate banner, compact, minimal, and expanded layouts; no copied workout-screen UI or artificial glass.
4. Implement an idempotent lifecycle coordinator and connect it to rest creation, pause/resume, skip, automatic expiry, exercise/workout completion, cancellation, and route/app relaunch recovery.
5. Ensure taps route to the matching workout and normal route loading restores current SQLite state.
6. Configure only Expo's required native plugin settings, with push notifications disabled; extend build workflow assertions only where needed to verify generated extension, entitlements, Info.plist, bundle identifiers, and unsigned packaging.
7. Add unit coverage for lifecycle, duplicate prevention, orphan recovery, and deadline calculations. Update `PROJECT.md`, `docs/DESIGN.md`, `docs/BUILD.md`, `README.md`, and this plan to reflect the shipped stage and the required device checks. No `docs/ROADMAP.md` exists in this checkout.
8. Commit each coherent implementation/configuration/documentation change. Run the requested TypeScript, lint, test, Expo compatibility/export, and diff checks. Inspect existing GitHub Actions runs if GitHub API access is available; do not wait for a new Actions run.

## Verification

Automated commands:

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npx expo install --check`
- `npx expo export --platform ios`
- `git diff --check`
- Review `.github/workflows/build-ios.yml` and generated extension configuration; retain `CODE_SIGNING_ALLOWED=NO` and no Apple secrets.

Physical iPhone via unsigned IPA + SideStore (mandatory, not executable in this workspace): validate activity appearance on Lock Screen/Dynamic Island, deep link, pause/resume, skip, expiry, relaunch recovery, and no activity after workout finish/cancel. Expo Go is not a valid Live Activity test.

## Progress

- [x] Read project instructions/specification, design, build, security, ExecPlan format, workout state machine, persisted rest timer, UI controller, routes, and current GitHub workflow.
- [x] Confirm SDK 57 documentation exposes `createLiveActivity`, `getInstances`, `end('immediate')`, native SwiftUI countdown `Text`, and a disabled-by-default push configuration.
- [x] Install SDK 57 `expo-widgets` and inspect the runtime API, widget extension target, Info.plist values, entitlements, and Podfile integration.
- [x] Implement separate Lock Screen and Dynamic Island layouts, native deadline display, pause/resume, serialized duplicate prevention, relaunch reconciliation, and workout deep linking.
- [x] Add lifecycle tests for creation, pause, resume, skip, finish, cancel, duplicate activities, recovered/orphan activities, stale handles, and deadline-based remaining time.
- [x] Update product/design/build/README documentation and assert the unsigned extension is generated and packaged by GitHub Actions.
- [x] Run requested TypeScript, lint, unit-test, Expo compatibility/export, and diff checks; verify generated iOS files and parse every workflow shell block.

The local GitHub CLI check found five previous workflow runs; all completed successfully. The current environment is Linux and has no connected iPhone, so the required SideStore/iPhone checklist remains for the user. `expo-widgets` exposes no scheduled ActivityKit end while Sport is suspended: at the deadline the native view becomes stale and shows `PRÊT · 0:00`; Sport ends it when foreground expiry/reconciliation runs. This is an Expo API limitation, not a JavaScript countdown drift.

Automated verification passed: TypeScript, ESLint, all eight Node test files (including the new Live Activity suite), Expo SDK dependency compatibility, iOS JS export, workflow shell syntax, and `git diff --check`. Expo compatibility ran offline and used the local SDK 57 module map. A GitHub Actions build for this change and all physical iPhone checks remain outstanding.
