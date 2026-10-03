# ExecPlan: Progress Photos and Face ID Vault

## Objective and scope

Replace the Progress placeholder with a local photo vault. Users can configure biometric protection, unlock the gallery, import or capture a dated photo, view and delete it, and explicitly export a copy to Photos. Clear the active vault view on app deactivation and support immediate/1-minute/5-minute automatic lock choices. Do not add cloud sync, analytics, photo notifications containing private data, or unrelated workout changes.

## Context and security decisions

- `docs/ROADMAP.md` and `docs/SECURITY.md` do not currently exist. The security baseline is in `AGENTS.md` and `PROJECT.md`; this stage will create `docs/SECURITY.md` and update the product/design documentation and README.
- The installed Expo SDK 57 `expo-crypto` includes native AES-GCM APIs. Use AES-256-GCM with a fresh 96-bit nonce per encryption and authenticated metadata (photo ID, date, and file role). A versioned encrypted-file envelope stores nonce, ciphertext, and tag. Never implement cryptographic primitives manually or log key/path/image data.
- Generate a random 256-bit data-encryption key with Expo Crypto. Store only its base64 form in SecureStore using `requireAuthentication: true`, which maps to iOS `biometryCurrentSet`; use `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Keep the imported key object only for the current in-memory session. Biometrics must be available and enrolled before setup. Access failure for a configured key is a locked error; never create a replacement key automatically or delete encrypted files.
- Setup is lazy and begins only from Progress. The first screen explains the vault and offers `Configurer Face ID`. SecureStore retrieval supplies the biometric prompt; the app does not add a separate LocalAuthentication prompt that would cause two consecutive prompts. Add the LocalAuthentication config plugin with a French Face ID usage description and the SecureStore plugin so a development build has the necessary native configuration. Expo Go cannot validate Face ID; use a development build on iPhone.
- Store ciphertext under the app's private document directory, with no plaintext thumbnails. Add a minimal local Expo native module that applies `NSFileProtectionComplete` to the vault directory and each encrypted file, because the Expo FileSystem API in this SDK does not expose per-file protection attributes. Fail closed if protection cannot be applied. Use Expo FileSystem for bytes and paths; the only native code is this file-protection bridge.
- ImagePicker supplies the user's selected/captured asset as a temporary local cache URI. Read it into memory, encrypt it before writing any vault file, and delete the picker cache copy and any ImageManipulator thumbnail output in `finally`. These provider/manipulator cache files are transient inputs, not vault storage; no unencrypted image is written into the vault/document directory. Persist both full image and thumbnail only as authenticated ciphertext. Never put decrypted images in disk cache.
- Gallery thumbnails are decrypted on demand to in-memory data URIs; full-size photos are decrypted only when opened. On lock, clear gallery/full-size image state, invalidate asynchronous decryptions with a session generation, and drop the key reference. This limits lifetime/copies but cannot guarantee cryptographic erasure of JS/native image memory.
- Cover the whole app with an opaque privacy curtain as soon as AppState leaves `active`, including while a full-screen image is open. The default auto-lock is immediate. With 1- or 5-minute delay, plaintext UI is still hidden immediately; the in-memory key session expires at the selected deadline and must be re-authenticated after that. Physical iPhone testing must check whether the curtain arrives before the iOS task-switcher snapshot; no claim of screenshot-proofing is made from JS alone.
- SQLite migration v7 adds singleton vault configuration (configured/key identifier/auto-lock) and `progress_photos` metadata (UUID, selected `YYYY-MM-DD`, encrypted file identifiers, MIME type needed for display/export, creation timestamp). No image bytes, source URIs, EXIF/location, or private preview are stored in SQLite. Multiple photos may share a date. Files use generated identifiers rather than user filenames.
- Import writes encrypted full image and encrypted thumbnail first, then inserts SQLite metadata. If metadata insertion fails, remove both ciphertext files. If file writing/encryption fails, do not insert metadata and clean up generated files. Deletion requires confirmation, removes file(s), and then metadata; reconciliation detects missing files without silently exposing or inventing a photo. Reset/delete-all is explicit and confirmed; on biometric-key invalidation it may remove ciphertext only after the user confirms permanent loss, never as an automatic recovery.
- Export is an explicit user action with a warning that the Photos copy is outside Sport's protection. `expo-media-library` is not installed and is the one justified dependency for saving to Photos. Decrypt to a short-lived, file-protected cache file only for this action, call the system library API, and delete the temporary plaintext in `finally`. Ask for add-only Photos permission at that action, not during app startup.
- The Progress screen owns onboarding, lock/error states, grouped-by-month gallery, date selection, import/camera actions, and full-screen viewing. Settings gains vault status, lock delay, lock-now, and confirmed delete-all. Notification taps already route generically to Progress and must land on its locked/onboarding state.

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
- `modules/vault-file-protection/*` (minimal Swift Expo module)
- `app.json`, root layout, Progress/Settings routes
- `package.json`, `package-lock.json` (Expo MediaLibrary)
- `tests/progress-vault.test.mjs`
- `docs/SECURITY.md`, `PROJECT.md`, `docs/DESIGN.md`, `README.md`

## Verification

- Pure/injected tests: AES-GCM round trip and tamper rejection; 32-byte key creation; locked/unlocking/unlocked/locking/error transitions; biometric cancellation and invalidated key fail closed; migration/repository create/list/delete; equal dates; failed import cleanup/no row; missing-file reconciliation; explicit export and temporary-file cleanup; auto-lock deadlines/session invalidation.
- Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx expo install --check`, `npx expo export --platform ios`, and `git diff --check`.
- Inspect the native module source and generated Android/iOS bundles for platform resolution. Linux cannot compile the iOS module or validate Face ID. The physical iPhone checklist includes first setup, cancel/failure, gallery and full-screen lock, background/task-switcher snapshot, auto-lock delays, import/camera/date, deletion preserving Photos source, explicit export, corrupted ciphertext, and changed biometrics/recovery.

## Progress

- [x] Read `AGENTS.md`, `PROJECT.md`, `docs/DESIGN.md`, `.agent/PLANS.md`, the recent Weight/Progression/History/Notifications/Schedule plans, SQLite/storage/navigation code and installed Expo package versions. Confirm `docs/ROADMAP.md` and `docs/SECURITY.md` are absent.
- [x] Verify that the installed SDK 57 Expo Crypto provides AES-GCM and SecureStore `requireAuthentication` maps to the current biometric set; verify the native file-protection and media-library APIs needed.
- [x] Commit this plan before implementation (`3edf0d2`).
- [x] Add schema v7 metadata, pure session/date/lock rules, and repository tests (`f45d981`).
- [ ] Add schema, native file protection and tested vault/key foundations.
- [ ] Add encrypted import/storage/gallery services and tests.
- [ ] Add Progress and Settings UX, privacy curtain, lock policy and explicit Photos export.
- [ ] Update documentation and README; run automated checks and iOS export.

## Review notes

- The app has no existing photo storage and Progress is a placeholder. SQLite v6 has no photo tables. Expo Crypto, FileSystem, ImagePicker, ImageManipulator, LocalAuthentication and SecureStore are already installed; `expo-media-library` is not.
- The secure-key path is deliberately separate from the explicit LocalAuthentication prompt: reading the biometric-protected SecureStore item is the authentication gate. A direct LocalAuthentication prompt before it would risk prompting twice.
- The main residual risks to validate on device are transient plaintext in picker/manipulator cache, iOS task-switcher snapshot timing, native image memory/caching after React unmount, SecureStore behavior after biometric enrollment changes, and file-protection bridging in an EAS/development build. None may cause fallback to plaintext or silent key regeneration.
