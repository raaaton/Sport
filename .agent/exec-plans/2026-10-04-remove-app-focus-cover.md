# Remove the unfocused app cover

## Objective

Remove the full-screen React and native cover shown when Sport is inactive/backgrounded, as explicitly requested. Keep the Progress vault's existing state clearing, key invalidation/retention rules, and Face ID lifecycle behavior.

## Context and decisions

- The previous black/blocked appearance came from two layers: a React root curtain and a native `UIWindow` cover shown on `willResignActive` / background.
- Both layers prevented interaction and changed the app-switcher preview. Both are removed so the unfocused app is not covered.
- The local Expo module remains for iOS file protection. Only its privacy-cover behavior is removed.
- The Progress screen continues clearing decrypted gallery/viewer state on app-state changes. JavaScript may run after iOS captures the task-switcher snapshot, so preview privacy is no longer guaranteed. This tradeoff is documented in `docs/SECURITY.md` and `docs/DESIGN.md`.
- Face ID unlock and vault session transition logic are out of scope and remain unchanged.

## Implementation steps

1. Remove the root React Native focus curtain and its AppState subscription.
2. Remove native lifecycle listeners and cover view from the local Expo module; retain `protectPath`.
3. Delete the now-unused JS privacy-cover bridge.
4. Update security/design docs and this plan to state the new snapshot limitation.

## Verification

- Run TypeScript, lint, and project tests.
- Search to confirm there are no privacy-cover call sites or native cover implementation left.
- Inspect `ProgressScreen` app-state handling to confirm vault clearing/locking remains.
- Physical iPhone check remains necessary for app-switcher appearance and Face ID behavior.

## Progress

- [x] Confirmed React and native cover were both active on resigning focus.
- [x] Removed both cover layers while preserving the vault AppState lifecycle.
- [x] Documented the app-switcher privacy tradeoff.
- [x] Run TypeScript, lint, all project tests, iOS JS export, and `git diff --check`; search for any remaining cover implementation/calls.
- [x] Commit and push the change for iPhone retest.
