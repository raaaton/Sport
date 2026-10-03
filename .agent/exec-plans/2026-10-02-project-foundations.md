# ExecPlan: Sport project foundations

## Objective

Replace the create-expo-app tabs starter with a small, maintainable foundation for Sport: feature-oriented structure, native-leaning design primitives, four primary Expo Router destinations, reusable haptics/SF Symbols/Liquid Glass entry points, and an SQLite access boundary. Keep every feature screen as a placeholder. Do not implement workout behavior, timer, photo vault/security, notifications, Shortcuts, or Live Activities.

## Context and decisions

- `AGENTS.md` and root `PROJECT.md` define a private, offline-first iOS app in Expo/TypeScript; SQLite is the future source of truth.
- The repository had no `.agent/PLANS.md`, despite `AGENTS.md` referencing it. Establish this plan format as the missing project convention, then keep this plan here.
- Existing app is the stock Expo Router tabs template. Keep Expo Router and strict TypeScript; no state manager or UI framework.
- Dependencies target Expo SDK 57 / React Native 0.86.3 / TypeScript 6. Expo's September 3, 2026 changelog confirms App Store Expo Go now supports SDK 57; iOS Expo Go requires the CLI and app to be signed in to the same Expo account.
- Use Expo APIs that are present in Expo Go and guard platform-specific Liquid Glass rendering so importing shared UI never requires a custom native binary.

## Implementation steps

1. Inspect the starter, versions, app config, and SDK package alignment; record known runtime constraints.
2. Replace starter routes with Today, History, Progress, and Settings placeholders using Expo Router tabs and SF Symbols.
3. Establish design tokens and a small shared UI layer for color, type, spacing, radii, symbols, haptics, and Liquid Glass.
4. Add a minimal SQLite initialization/access boundary without domain schema or migrations.
5. Remove starter-only UI and unused starter routes/configuration; keep changes limited to this foundation.
6. Add the requested lint command/configuration if the installed toolchain permits it without introducing unjustified dependencies.
7. Run TypeScript, lint, Expo configuration/dependency checks, and a Metro iOS bundle/start check. Clearly state that physical Expo Go launch/navigation cannot be claimed from this Linux environment.

## Verification

- `npx expo install --check` (network may be unavailable; report local/offline validation limits).
- TypeScript check and ESLint.
- Expo config resolution and Metro startup/iOS bundle check.
- Manual route navigation and launch in Expo Go require a compatible Expo Go binary and device; no physical iPhone test is claimed from Linux.

## Progress

- [x] Read the complete `AGENTS.md` and root `PROJECT.md`.
- [x] Inspect the generated template and package versions.
- [x] Confirm `.agent/PLANS.md` was absent; create this format and plan before application code changes.
- [x] Verify Expo's SDK 57 App Store Expo Go support and preserve SDK 57.
- [x] Replace starter screens with four feature-owned placeholders and native Expo Router tabs.
- [x] Add design tokens and shared UI, haptics, symbols, Liquid Glass and SQLite boundaries.
- [x] Configure ESLint using Expo's SDK 57 config after the offline npm cache lacked package metadata.
- [x] Run `npx tsc --noEmit`, `npm run lint`, `npx expo install --check`, `npx expo config --type public`, and `npx expo export --platform ios` successfully.
- [x] Start Expo with `EXPO_OFFLINE=1 npm start -- --host localhost --port 8081`; Metro reported `Waiting on http://localhost:8081` and `/status` returned `packager-status:running`.
- [ ] Open the project in Expo Go and tap through all four tabs on a physical iPhone; this remains unverified from Linux.
- [ ] Run verification and record results.
