# Security and privacy

## Scope

Sport is a personal, local-first iOS workout application. It has no account, backend, analytics, advertising, or app-managed cloud synchronization. The progress-photo vault is intended to protect photos at rest in Sport's sandbox and to require the current enrolled Face ID set before showing them. It does not protect a compromised or already-unlocked device, an attacker who can operate the unlocked app, or OS-level memory inspection.

## Vault data at rest

- Each imported original and generated JPEG thumbnail is separately encrypted with AES-256-GCM through Expo Crypto's native AES APIs.
- Each encryption gets a fresh 12-byte nonce and a 16-byte authentication tag. The binary envelope begins with the `SPV1` version marker, followed by the Expo combined nonce/ciphertext/tag representation.
- Authenticated additional data binds the photo identifier, selected calendar date, and `original` or `thumbnail` role. Corruption, metadata substitution, and wrong-key decryption fail closed.
- Ciphertext files use random identifiers in Sport's private Documents directory. The directory and every file receive iOS `NSFileProtectionComplete` before ciphertext is written. Plain image bytes are never stored in SQLite; SQLite contains only the selected date, random file IDs, image MIME type, and creation timestamp.
- Temporary files returned by the system picker/camera and ImageManipulator are in the app cache. Sport applies complete file protection, reads them into memory, and removes both temporary files before it starts AES encryption. If protection, reading, cleanup, encryption, file writing, or metadata insertion fails, no photo row is created; partially written ciphertext is removed where possible. A later authenticated reconciliation removes unreferenced ciphertext left by process termination.
- No persistent plaintext thumbnail or decrypted disk cache is created. A temporary plaintext cache file exists only during a user-confirmed export; it is protected before bytes are written and removed in `finally` after the Photos API completes or fails.

## Key and authentication

- The key is a random 256-bit AES key generated with Expo Crypto. Its base64 representation is stored only in iOS SecureStore/Keychain, with `requireAuthentication: true` (`biometryCurrentSet`) and `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility.
- The vault is initialized lazily only after the user chooses `Configurer Face ID`. The screen checks that Face ID is enrolled, then retrieval of the protected SecureStore item is the authentication gate. The app does not run a separate LocalAuthentication prompt before that read.
- A configured key that cannot be retrieved is an error. Sport does not replace it, disable authentication, or delete ciphertext automatically. Settings offers a separate destructive reset whose confirmation explains that unrecoverable encrypted photos will be erased before a new key can be created.
- The in-memory key string is held only while a vault session is open (or during the chosen one-/five-minute background retention interval). Crypto operations import that key into Expo's AES key type. Neither form is persisted or logged. JavaScript/native garbage collection cannot guarantee cryptographic memory erasure.

## Session and app-switcher privacy

- The gallery and full-screen viewer are rendered only while the explicit session state is `unlocked`.
- Leaving the Progress route clears decrypted image state and the session key reference. When the app resigns active, a local Expo module places an opaque native Sport privacy cover over the app window before the system task-switcher snapshot; React renders the same neutral cover and clears gallery/viewer state. The cover uses a secondary system background with a lock symbol and the app name, never a photo or private detail.
- iOS may temporarily report `inactive` while presenting the SecureStore Face ID sheet. During that explicit in-flight unlock only, the vault ignores `inactive` for session invalidation while the app-wide opaque cover remains visible. If SecureStore returns the key before iOS reports the app active, the unlock waits for the foreground event rather than discarding a successful result. A real `background` transition always invalidates the attempt and clears private state; other inactive transitions also lock immediately. A successful biometric read unlocks only after its attempt generation remains current.
- The native cover is removed only after React has committed the foreground state. A configured background timeout can restore an in-memory session after return if it has not expired, but it never leaves a photo preview visible while Sport is inactive.
- This cover is not a general screenshot or screen-recording prevention mechanism. Native/iOS behavior and snapshot timing must be checked on a physical iPhone; no screenshot-proof guarantee is made.

## Import, deletion, and export

- Selecting a library photo creates an independent copy; deleting that copy never requests deletion of its Photos source. Camera capture is available only after a contextual permission request.
- Photo dates are stored as validated `YYYY-MM-DD` values. Same-date photos are allowed. Source filenames, URIs, EXIF, and location are not stored in SQLite.
- Delete actions require confirmation. Metadata is removed first, then both encrypted files are deleted. If file cleanup fails, no dangling metadata remains; the unreferenced encrypted files are cleaned during the next authenticated reconciliation.
- Photos export is never automatic. It requires a warning confirmation and add-only Photos permission. Once saved, the Photos copy is outside Sport's vault and protection.
- Notifications do not contain photo content and never open a private photo directly.

## Device backup and recovery limits

Sport has no application-level iCloud sync. The SecureStore key is device-only and bound to the enrolled biometric set, so an OS/device migration or changed biometric set may make existing ciphertext unrecoverable. The application keeps those files until the user explicitly confirms vault reset. This is intentional fail-closed behavior, not a recovery mechanism.

## Required physical-device review

The automated suite covers envelope framing/authentication semantics, fail-closed key access, metadata operations, cleanup/rollback, and explicit export orchestration. It cannot validate the actual iOS Keychain access-control prompt, Face ID cancellation/enrollment-change behavior, file protection, `Asset.create` Photos writes, native app-switcher overlay timing, or decoded-image memory behavior. These require a development build and the iPhone checklist in the stage ExecPlan. Expo Go is not a valid security test for the local native module or Face ID.
