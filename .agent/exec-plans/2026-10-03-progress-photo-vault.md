# ExecPlan: Progress Photos and Face ID Vault

## Objective and scope

Replace the Progress placeholder with a local photo vault. Users can configure biometric protection, unlock the gallery, import or capture a dated photo, view and delete it, and explicitly export a copy to Photos. Clear the active vault view on app deactivation and support immediate/1-minute/5-minute automatic lock choices. Do not add cloud sync, analytics, photo notifications containing private data, or unrelated workout changes.

## Context and security decisions

- At planning time, `docs/ROADMAP.md` and `docs/SECURITY.md` were absent. This stage created `docs/SECURITY.md`; the roadmap remains absent. The security baseline is also recorded in `AGENTS.md` and `PROJECT.md`.
- The installed Expo SDK 57 `expo-crypto` includes native AES-GCM APIs. Use AES-256-GCM with a fresh 96-bit nonce per encryption and authenticated metadata (photo ID, date, and file role). A versioned encrypted-file envelope stores nonce, ciphertext, and tag. Never implement cryptographic primitives manually or log key/path/image data.
- Generate a random 256-bit data-encryption key with Expo Crypto. Store only its base64 form in SecureStore using `requireAuthentication: true`, which maps to iOS `biometryCurrentSet`; use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Keep the imported key object only for the current in-memory session. Biometrics must be available and enrolled before setup. Access failure for a configured key is a locked error; never create a replacement key automatically or delete encrypted files.
- Setup is lazy and begins only from Progress. The first screen explains the vault and offers `Configurer Face ID`. SecureStore retrieval supplies the biometric prompt; the app does not add a separate LocalAuthentication prompt that would cause two consecutive prompts. Add the LocalAuthentication config plugin with a French Face ID usage description and the SecureStore plugin so a development build has the necessary native configuration. Expo Go cannot validate Face ID; use a development build on iPhone.
- Store ciphertext under the app's private document directory, with no plaintext thumbnails. Add a minimal local Expo native module that applies `NSFileProtectionComplete` to the vault directory and each encrypted file, because the Expo FileSystem API in this SDK does not expose per-file protection attributes. Fail closed if protection cannot be applied. Use Expo FileSystem for bytes and paths; the only native code is this file-protection bridge.
- ImagePicker supplies the user's selected/captured asset as a temporary local cache URI. Sport applies `NSFileProtectionComplete`, reads it and the ImageManipulator thumbnail into memory, and deletes both cache copies before starting AES encryption. No unencrypted image is written into the vault/document directory. Persist both full image and thumbnail only as authenticated ciphertext. Never put decrypted images in disk cache.
- Gallery thumbnails are decrypted on demand to in-memory data URIs; full-size photos are decrypted only when opened. On lock, clear gallery/full-size image state, invalidate asynchronous decryptions with a session generation, and drop the key reference. This limits lifetime/copies but cannot guarantee cryptographic erasure of JS/native image memory.
- An opaque React privacy curtain is paired with a native app-window cover installed by the local Expo module on `UIApplication.willResignActiveNotification`. The cover is removed only after React commits the foreground/locked UI. With 1- or 5-minute delay, plaintext UI is still hidden immediately; the in-memory key session expires at the selected deadline and must be re-authenticated after that. Physical iPhone testing must verify the native cover is above the photo viewer and precedes the iOS task-switcher snapshot; no general screenshot-proofing is claimed.
- SQLite migration v7 adds singleton vault configuration (configured/key identifier/auto-lock) and `progress_photos` metadata (UUID, selected `YYYY-MM-DD`, encrypted file identifiers, MIME type needed for display/export, creation timestamp). No image bytes, source URIs, EXIF/location, or private preview are stored in SQLite. Multiple photos may share a date. Files use generated identifiers rather than user filenames.
- Import writes encrypted full image and encrypted thumbnail first, then inserts SQLite metadata. If metadata insertion fails, remove both ciphertext files. If file writing/encryption fails, do not insert metadata and clean up generated files. Deletion requires confirmation, removes metadata first, then encrypted file(s); reconciliation removes unreferenced ciphertext after an interrupted cleanup. Reset/delete-all is explicit and confirmed; on biometric-key invalidation it may remove ciphertext only after the user confirms permanent loss, never as an automatic recovery.
- Export is an explicit user action with a warning that the Photos copy is outside Sport's protection. `expo-media-library` is not installed and is the one justified dependency for saving to Photos. Decrypt to a short-lived, file-protected cache file only for this action, call the system library API, and delete the temporary plaintext in `finally`. Ask for add-only Photos permission at that action, not during app startup.
- The Progress screen owns onboarding, lock/error states, grouped-by-month gallery, date selection, import/camera actions, and full-screen viewing. Settings gains Face ID status, background lock delay, confirmed delete-all, and a distinct destructive vault reset. The Progress screen itself has a lock action. Notification taps already route generically to Progress and must land on its locked/onboarding state.

## Implementation steps

1. Commit this plan before implementation.
2. Add schema v7, pure photo/date/session-state logic and tests; add the small iOS file-protection module and Face ID/SecureStore configuration. Commit this persistence/security foundation separately.
3. Implement the encrypted file/key service, import/thumbnail cleanup, metadata repository, confirmed deletion and explicit Photos export adapters. Add injected tests for encryption/authentication failure, corruption, failed transactions, duplicate dates, orphan prevention and cleanup. Commit this service layer separately.
4. Implement the vault session provider/privacy curtain, Progress onboarding/Face ID states/gallery/full-screen photo/date picker/import/export/delete, then Settings vault controls. Keep other tabs and workout flows untouched. Commit the UI integration separately.
5. Create `docs/SECURITY.md`; update `PROJECT.md`, `docs/DESIGN.md`, `README.md`, and this plan. Run requested checks and iOS export, review the diff for plaintext/path/key logging, then commit documentation and final fixes in a separate reviewable commit.

## Files in scope

- `.agent/exec-plans/2026-10-03-progress-photo-vault.md`
- `src/shared/database/schema.ts`
- `src/features/progress/domain/*`, `data/*`, `services/*`, `screens/*`, `components/*`
- `src/features/settings/screens/SettingsScreen.tsx` and a focused vault preferences screen/route
- `src/shared/ui/NativeDatePicker*.tsx` and shared vault session/privacy UI as needed
- `modules/sport-vault-file-protection/*` (minimal Swift Expo module for file and app-window protection)
- `app.json`, root layout, Progress/Settings routes
- `package.json`, `package-lock.json` (Expo MediaLibrary)
- `tests/progress-vault.test.mjs`
- `docs/SECURITY.md`, `PROJECT.md`, `docs/DESIGN.md`, `README.md`

## Verification

- Pure/injected tests: AES-GCM envelope round trip and tamper rejection using Node's test AES-GCM implementation; 32-byte key creation; locked/unlocking/unlocked/locking/error transitions; biometric cancellation and invalidated key fail closed; migration/repository create/list/delete; equal dates; failed import cleanup/no row; missing-file reconciliation; cache inputs removed before encryption; explicit export and temporary-file cleanup; auto-lock deadlines/session invalidation. Native Expo Crypto itself requires a device build and is not exercised by the Node tests.
- Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx expo install --check`, `npx expo export --platform ios`, and `git diff --check`.
- Inspect the native module source and generated iOS bundle for platform resolution. Linux cannot compile the iOS module or validate Face ID. The physical iPhone checklist includes first setup, cancel/failure, gallery and full-screen lock, background/task-switcher snapshot, auto-lock delays, import/camera/date, deletion preserving Photos source, explicit export, corrupted ciphertext, and changed biometrics/recovery.

## Progress

- [x] Read `AGENTS.md`, `PROJECT.md`, `docs/DESIGN.md`, `.agent/PLANS.md`, the recent Weight/Progression/History/Notifications/Schedule plans, SQLite/storage/navigation code and installed Expo package versions. Confirm `docs/ROADMAP.md` and `docs/SECURITY.md` are absent.
- [x] Verify that the installed SDK 57 Expo Crypto provides AES-GCM and SecureStore `requireAuthentication` maps to the current biometric set; verify the native file-protection and media-library APIs needed.
- [x] Commit this plan before implementation (`3edf0d2`).
- [x] Add schema v7, metadata repository, native file protection and tested vault/session foundations (`f45d981`, `55645da`).
- [x] Add AES-256-GCM service, biometric SecureStore access, encrypted import/storage/deletion/export, reconciliation, and injected tests (`3b230f4`, `032913c`).
- [x] Add Progress and Settings UX, Face ID onboarding, native app-window privacy cover, auto-lock, and explicit Photos export (`41c3ea4`, `c834997`).
- [x] Reduce temporary plaintext lifetimes and run `npx tsc --noEmit`, `npm run lint`, `npm test` (7 suites passed), `npx expo install --check`, `npx expo export --platform ios`, `git diff --check`.
- [x] Update `docs/SECURITY.md`, `PROJECT.md`, `docs/DESIGN.md`, README, and this plan.
- [ ] Build the iOS development client and complete physical iPhone security/UX review. Linux in this environment cannot compile the local Swift module or simulate Face ID.

## Review notes

- The app had no existing photo storage and Progress was a placeholder. The schema is migrated to v7. Expo Crypto, FileSystem, ImagePicker, ImageManipulator, LocalAuthentication, SecureStore and MediaLibrary are used; MediaLibrary was installed because the explicitly requested Photos export requires it.
- The secure-key path is deliberately separate from the explicit LocalAuthentication prompt: reading the biometric-protected SecureStore item is the authentication gate. A direct LocalAuthentication prompt before it would risk prompting twice.
- The main residual risks to validate on device are that the protected picker/manipulator cache copies are removed promptly, iOS task-switcher snapshot timing/cover z-order, native image memory/caching after React unmount, SecureStore behavior after biometric enrollment changes, Photos add permission and export behavior, and file-protection bridging in a development build. None may cause fallback to plaintext or silent key regeneration.
- All final automated checks passed; `expo install --check` used Expo's local bundled dependency map because networking is disabled, so its compatibility check is less reliable than an online check. `npx expo export --platform ios` bundled 1823 modules successfully. An Expo Go server start was attempted, but the sandbox did not expose a Metro listener on localhost; Expo Go launch is not confirmed here. The iOS export is a JavaScript bundle check, not a native module compile.
