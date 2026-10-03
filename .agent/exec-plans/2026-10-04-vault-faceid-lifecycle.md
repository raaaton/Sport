# ExecPlan: Face ID lifecycle and private app-switcher cover

## Objective

Fix the Progress vault's Face ID unlock flow when iOS reports a temporary inactive state for the system authentication sheet. Replace the completely black app-switcher snapshot with a neutral, branded opaque privacy cover. Keep photos hidden whenever the app actually leaves the foreground and preserve fail-closed vault behavior.

## Diagnosis and decisions

- `ProgressScreen` currently treats every `AppState` value other than `active` as a departure. SecureStore's biometric authorization sheet can temporarily transition the host app to `inactive`. That handler clears decrypted views, increments the session generation, discards the key/session and makes the successful Face ID result stale. The user then returns to the original locked screen.
- An actual `background` transition must always lock and invalidate the in-flight unlock. An `inactive` transition during the explicitly active SecureStore setup/unlock call is only a presentation interruption; do not invalidate that call. Other `inactive` transitions still lock immediately.
- The app-switcher cover currently uses `.systemBackground` in its native view and hardcodes black for React Native dark mode. The whole preview therefore becomes black. Keep an opaque cover, but show a quiet native-looking Sport/privacy message with a non-black secondary system background. This does not reveal the current screen or private photos.
- `inactive` will still show the opaque root privacy cover, including while Face ID is presented. The cover is dismissed after foreground React state is rendered. The biometric prompt itself remains the only key authentication gate.

## Implementation

1. Add a pure lifecycle decision helper and tests covering a biometric-prompt `inactive` transition versus a true background transition.
2. Guard only the unlock call's transient inactive event. Keep real backgrounding, navigation away, deadline expiry, and failed authentication fail-closed.
3. Give the native app-window cover and React cover the same neutral Sport-branded presentation; never include photo data.
4. Update `docs/SECURITY.md`, `docs/DESIGN.md`, and this plan with the final lifecycle and cover behavior.

## Files in scope

- `src/features/progress/domain/vaultModels.ts`
- `src/features/progress/screens/ProgressScreen.tsx`
- `app/_layout.tsx`
- `modules/sport-vault-file-protection/ios/SportVaultFileProtectionModule.swift`
- `tests/progress-vault.test.mjs`
- `docs/SECURITY.md`
- `docs/DESIGN.md`
- this ExecPlan

## Verification

- Run targeted vault tests, all project tests, TypeScript, lint, Expo dependency check, iOS JS export, and `git diff --check`.
- Review that backgrounding during Face ID still invalidates the session and clears all private React state, that cancelled authentication cannot unlock, and the privacy cover is opaque and contains no private content.
- A physical iPhone must verify successful Face ID unlock, cancellation, app switcher cover appearance, actual background/foreground locking, and switching away from an unlocked photo viewer. Linux cannot validate iOS Face ID or native window z-order.

## Progress

- [x] Read the project security/design instructions, vault implementation, session state, native privacy bridge, recent vault plan, and iOS 27 scene lifecycle changes.
- [x] Identify the inactive-state Face ID race and dark-mode black privacy cover.
- [ ] Implement the guarded state transition, neutral opaque cover, tests, and documentation.
- [ ] Run automated checks and commit the focused fix.
- [ ] User validates Face ID and app-switcher rendering on iPhone.
