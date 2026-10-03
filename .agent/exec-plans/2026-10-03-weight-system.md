# ExecPlan: Weight System

## Objective and scope

Manage the fixed 3.000 kg base bag and user-owned weighted objects in SQLite, generate available added loads from their real combinations, preserve each selected load's composition on every set, and use the closest strictly higher available load for the existing progression recommendation. Replace the workout's free-form load field with a quick native-feeling selector and implement Settings > Lest. Do not change progression eligibility, tabs, timer, workout state transitions, or unrelated roadmap features.

## Context and decisions

- Current schema is v3. `workout_sets.added_weight REAL` stores the actual historic load, and progression is a pure rule that only returns `increase_load_recommended`. There are no weight inventory or composition tables yet.
- Schema v4 will add a singleton weight-inventory settings row with fixed base-bag grams, user-owned `weight_items` in integer grams, and two set columns: canonical `added_weight_grams` plus a JSON snapshot of selected load components. Snapshots contain component IDs, names, and gram weights without foreign keys to current inventory, so rename/deactivation/deletion cannot rewrite old history. Existing `added_weight` values remain untouched; old unconfigured NULL loads mean bodyweight for deciding a future load.
- Seed one 3,000 g fixed bag and three one-unit items: 900 g `La rivière à l'envers`, 2,100 g `1200 voitures`, and 1,500 g `2 livres programmation`. Seeds use stable IDs and `INSERT OR IGNORE` so later settings survive restarts. Bag weight is not represented as an add-on and cannot be edited/disabled in this version.
- Store inventory and selected loads as integer grams (precision 1 g). User-entered object weights accept positive decimal kilograms up to three decimal places and are converted once to grams. Display uses normalized kg text with at most three decimals.
- Generate subsets dynamically from active one-unit items plus the bag. Always include 0 g/bodyweight. Deduplicate by total grams, keep a deterministic first composition, and sort ascending. The seed inventory produces: 0, 3.0, 3.9, 4.5, 5.1, 5.4, 6.0, 6.6, and 7.5 kg.
- When progression is eligible, compare the available choices against the greatest per-set load in the previous performance, so a mixed-load session cannot recommend a load below something already lifted. For legacy sets without gram metadata, derive grams by rounding the existing real value; NULL is interpreted as 0 g. Choose the first greater load. If none exists, keep the current displayed load and explicitly report that no higher load is available. Non-eligible statuses never recommend an increase.
- A saved set stores `added_weight` for compatibility/readable existing history, canonical grams for exact comparison, and a composition snapshot. Free numeric load remains in manual History entry/edit because historical values may no longer exist in today's inventory; new workout sessions only select available loads.
- Today and preparation use one shared pure assessment composed from `assessProgression` plus the available-load list. The progression eligibility thresholds do not change.
- Settings remains a grouped native list. Its Lest detail shows the fixed bag, editable/toggleable/deletable objects, generated ascending loads, and a light disclosure of each combination. The workout uses a native page sheet/modal list with one-tap load selection and composition labels; no external UI/date/state library is introduced.

## Implementation steps

1. Add and commit this plan.
2. Add schema v4 and idempotent equipment seed; add integer-gram/snapshot set persistence and repository operations for reading/adding/editing/toggling/deleting inventory; implement pure combination generation, load formatting, and progression-to-next-available-load assessment; add SQLite/domain tests.
3. Integrate the composed assessment into Today and workout preparation, showing concrete maintain/increase/no-higher targets without changing eligibility; add focused recommendation tests.
4. Replace workout's free-text load field with a fast native load picker, persist selection snapshots per set, show prior set load and composition where useful, and keep historical manually entered values untouched.
5. Replace Settings > Lest placeholder with inventory management and available-combinations preview. Show saved composition in history details while keeping rows concise. Document the user-facing design/data behavior.
6. Run the requested TypeScript, lint, full tests, Expo dependency check, iOS export, and whitespace checks. Report that physical iPhone testing remains manual.

## Files in scope

- `.agent/exec-plans/2026-10-03-weight-system.md`
- `src/shared/database/schema.ts`
- `src/features/workout/domain/models.ts`
- `src/features/workout/domain/progressionEngine.ts`
- `src/features/workout/domain/workoutService.ts`
- `src/features/workout/data/workoutRepository.ts`
- `src/features/weights/domain/*`
- `src/features/weights/data/*`
- `src/features/weights/components/*`
- `src/features/weights/screens/*`
- `src/features/today/screens/TodayScreen.tsx`
- `src/features/workout/components/ExercisePlanRow.tsx`
- `src/features/workout/screens/WorkoutPreparationScreen.tsx`
- `src/features/workout/screens/WorkoutSessionScreen.tsx`
- `src/features/history/domain/historyPresentation.ts`
- `src/features/history/screens/WorkoutHistoryDetailScreen.tsx`
- `app/(tabs)/settings/weighted-items.tsx`
- `tests/weights.test.mjs`, relevant existing workout/progression/history tests
- `docs/DESIGN.md`, `PROJECT.md`

## Verification

- Pure tests cover every seeded combination, order/deduplication, invalid and decimal object weights, inventory CRUD, recomputation after toggle/delete, progression thresholds and no-next-load case.
- SQLite integration tests verify migration/idempotent seed, per-set integer load/composition storage, and historic values/snapshots remaining unchanged after inventory edits/deletion.
- Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx expo install --check`, `npx expo export --platform ios`, and `git diff --check`.
- Check manually on iPhone: manage inventory, inspect combinations/compositions, choose a charge during a set, confirm next-workout objective, and verify old History remains unchanged after editing inventory. No physical-device verification will be claimed from this Linux session.

## Progress

- [x] Read project/product/design/plan guidance, the stage 4 progression and stage 5 History plans, current SQLite schema/progression engine, Today, workout, History, Settings placeholder, and shared controls.
- [x] Implement schema/inventory/combinations/snapshots and tests.
- [x] Integrate concrete next-load assessment into Today and preparation.
- [x] Implement workout selector and History composition display.
- [x] Implement Settings management and available-load preview.
- [x] Run all requested checks and update final implementation notes.

## Implementation notes

- Existing history sets currently store only numeric load; snapshots must be additive, nullable, and independent of the current inventory. Migration will not rewrite any existing historic load value.
- Current free numeric workout field is validated as a number but has no inventory integration. The rest/workout state machine and set progression remain unchanged; only the set load input and persistence payload will change.
- The first domain test pass caught an omitted bag-only combination and a nullable TypeScript value at the insert boundary; both were fixed before committing this layer. Combination generation explicitly includes bodyweight and the base bag, then all unique bag-plus-object subsets.
- Today and preparation now call the same pure load-aware progression assessment used later by the workout picker. Eligibility remains delegated to the existing progression engine; these screens show the selected concrete target and explain when no heavier available load exists.
- The workout load input is a one-tap native page sheet backed by available combinations; each saved set carries both grams and a frozen composition snapshot. History detail exposes those snapshots, while existing performance values use their stored grams for stable display.
- Settings > Lest now edits inventory items, previews every current load and composition, and recomputes the list after add/edit/enable/disable/delete. The fixed 3.0 kg bag is displayed without an edit control. Product and design docs now describe the inventory, picker, progression target, and snapshot behavior.
- Final verification passed: TypeScript, ESLint, all five test files, iOS Expo export, and `git diff --check`. Expo dependency validation used the local SDK map because network access was disabled; it reported dependencies up to date, with the remote check unavailable. Physical iPhone behavior remains for the user to verify.
