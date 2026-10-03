# Sport — Product Specification

## 1. Product

Sport is a private personal iOS workout tracker designed around a simple home bodyweight/weighted training routine.

The application replaces a collection of Apple Reminders, Notes, Numbers and Shortcuts workflows with one coherent application.

The application is personal, local-first and offline-first.

## 2. Goals

The application must allow the user to:

* see the planned workout for today
* start and complete a workout
* record sets, repetitions and timed exercises
* use a rest timer
* record added weight
* record perceived effort from 0 to 10
* review historical performances
* manage the user's available weighted objects
* follow a weekly workout schedule
* securely store private monthly progress photos
* receive workout and photo reminders
* optionally expose useful actions to Apple Shortcuts

## 3. Initial workout schedule

Tuesday:

* Legs

Saturday:

* Push

Sunday:

* Pull + Abs

Monthly:

* Progress photos on the first day of the month

The schedule must be editable.

## 4. Initial exercises

* Bulgarians
* Push-ups
* Pike Push-ups
* Chin-ups
* L-sit

Exercises must be editable in Settings.

## 5. Exercise tracking

An exercise may use one of two primary tracking modes:

### Repetition based

Example:
4 × 8–12

### Time based

Example:
L-sit — duration per set

The UI should adapt to the tracking type.

## 6. Performance record

A completed set may contain:

* repetitions
* duration
* added weight
* perceived effort

A completed exercise contains its ordered sets.

A completed workout contains its ordered exercises.

The application must preserve workout history after restart.

## 7. Rest timer

Default rest duration:

3 minutes.

The timer must support:

* start
* pause
* resume
* skip

`Passer le repos` ends the current rest and immediately presents the next set. Cancelling the whole workout is a separate confirmed action and does not remove already recorded sets.

When the timer ends:

* play completion feedback
* provide haptic feedback where available
* move the workout flow forward when appropriate

The user must be able to modify the default rest duration.

## 8. Added weight

The fixed base backpack weighs 3.0 kg. It is added exactly once to each weighted load. Bodyweight is a separate 0 kg option. Initial one-unit items:

* La rivière à l'envers — 0.9 kg
* 1200 voitures — 2.1 kg
* 2 livres programmation — 1.5 kg

The application must allow the user to create, rename, change the weight of, enable, disable and delete weight items.

The application must calculate unique combinations of active items using integer grams, and sort available loads in ascending order. When progression recommends an increase, the next goal is the smallest available load strictly above the greatest load recorded in the previous performance. If none exists, do not invent a value and explain that no heavier combination is available.

Store each selected load and a snapshot of its component names and weights with the workout set. Inventory changes affect future combinations only; historical loads and snapshots must not be recalculated.

## 9. History

History must be filterable by exercise.

Each performance should display:

* date
* sets
* repetitions or time
* added weight
* perceived effort

The exercise history should make progression easy to understand without requiring a spreadsheet.

## 10. Progress photos

Progress photos are private.

The app must provide a dedicated Progress section protected by Face ID.

The photo vault must:

* require biometric authentication to unlock
* encrypt stored photo data
* keep encryption keys outside normal application storage
* clear decrypted photo state when the vault locks
* avoid exposing images through notifications or logs

Photos imported into the vault are separate from the normal Photos library.

Exporting a vault photo back to the Photos library is an explicit user action.

## 11. Security model

The application uses:

* AES-GCM encryption for vault image data
* a random per-installation or vault encryption key
* Keychain/SecureStore protected by biometric authentication
* local app sandbox storage
* iOS file protection where appropriate

The app must fail closed when the vault key cannot be authenticated.

Changing enrolled biometrics may invalidate the protected key. The application must handle this case without silently weakening security.

## 12. Notifications

The app schedules opt-in local notifications on this device for:

* workout sessions
* monthly progress photos

Notification content must never contain private progress-photo information.

Workout reminders are derived from active weekly schedule entries. Since no workout reminder time was defined in the schedule model, reminders stay disabled until the user selects one shared hour in Settings. The app schedules concrete occurrences 28 days ahead and omits any schedule date with an existing workout row, including an active workout, so starting a session suppresses that day's reminder. Changes to notification preferences, schedule, app foreground state, or workout lifecycle trigger a full resynchronization of requests managed by Sport.

Photo reminders occur on the first day of each month at 06:00 by default, with an editable hour. Notification permission is requested only when the user enables a reminder. A denied iOS permission is not repeatedly requested; Settings explains how to open iOS Settings instead. Notification taps open Today or Progress, never a private photo. While Sport is foregrounded, local reminders may appear as a banner and in Notification Center without sound or badge.

## 13. Apple integrations

### Reminders

Optional synchronization/export only.

The internal workout schedule remains independent from Apple Reminders.

### Shortcuts

Expose useful actions through App Intents where practical.

### Live Activities

The rest timer may provide a Live Activity in a later implementation phase.

## 14. Navigation

Primary navigation:

* Today
* History
* Progress
* Settings

Navigation should use native iOS patterns wherever possible.

## 15. Offline behavior

Core application features must work without internet access.

No online account is required.

No remote server is required.

## 16. Data export

A future version may provide export to CSV or JSON.

Numbers is not a dependency.

## 17. Non-goals

The application is not intended to be:

* a social network
* a coaching service
* an AI personal trainer
* a calorie tracker
* a nutrition tracker
* a subscription product
* a cloud-dependent service
* a multi-user application

Do not add these features unless explicitly requested.

## 18. Product quality

The final product should feel like a real iOS application rather than a web application wrapped in React Native.

Visual quality, animation quality, responsiveness, spacing and interaction feedback are first-class requirements.

Correctness and privacy are more important than feature count.
