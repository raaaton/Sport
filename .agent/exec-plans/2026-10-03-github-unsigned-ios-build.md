# ExecPlan: GitHub Actions unsigned iOS IPA

## Objective and scope

Replace EAS as the source of development iOS IPAs with a GitHub Actions pipeline that runs on `main`, generates the Expo iOS project, builds an unsigned `iphoneos` Release app on a GitHub macOS runner, packages it as a standard `Sport.ipa`, and publishes a unique prerelease with the IPA attached. SideStore is responsible for signing and installing the IPA. No Apple credentials are used by GitHub Actions. Do not modify app features or delete EAS setup before the replacement path has been validated.

## Context and decisions

- The repository uses Expo SDK 57 Continuous Native Generation. There is no tracked `ios/` directory; `.gitignore` excludes it. The local file-protection Expo module must be autolinked from `modules/` by prebuild. Expo's resolver did not include its root podspec until `podspecPath` was declared explicitly in `expo-module.config.json`; that declaration is now tested.
- There is no `docs/ROADMAP.md`. Read `AGENTS.md`, `PROJECT.md`, `docs/DESIGN.md`, `docs/SECURITY.md`, README, current Expo/EAS config, lockfile metadata, and Git state before editing.
- EAS configuration currently includes `eas.json`, the EAS project ID/owner in `app.json`, the iOS bundle identifier `com.raaaton.sport`, and `ITSAppUsesNonExemptEncryption: true`. The iOS app store encryption declaration remains in app configuration but is not part of GitHub signing. Retain EAS files during this stage; identify cleanup only after a successful GitHub Release proves the replacement works.
- GitHub workflow triggers only on pushes to `main` and `workflow_dispatch`. Use a GitHub-hosted macOS/Xcode runner, `npm ci`, `npx expo prebuild --platform ios --no-install`, CocoaPods, and `xcodebuild` for Release on `iphoneos`. Pass `CODE_SIGNING_ALLOWED=NO`, `CODE_SIGNING_REQUIRED=NO`, and an empty `CODE_SIGN_IDENTITY`.
- Build number is `GITHUB_RUN_NUMBER`; marketing version comes from `app.json`; short commit SHA participates in release title, asset name, and immutable tag. `gh release create` uses the default `GITHUB_TOKEN`, `contents: write`, and `--prerelease`; no personal token or Apple secret is configured.
- Package the built app as `Payload/Sport.app` and zip to IPA format without generating or applying any code signature. Validate the plist, bundle identifier, iPhone arm64 executable, unsigned state, archive structure, and non-empty file before publication.
- Upload `Sport-IPA` as a workflow artifact and publish the release only after all build/package validations succeed. Do not overwrite an existing tag.
- No GitHub-hosted macOS execution is available from the current Linux workspace. The first push must prove Xcode/CocoaPods build behavior; actual installation/re-signing must be confirmed by the user in SideStore on a physical iPhone.

## Implementation steps

1. Commit this plan before workflow or documentation edits.
2. Add the `main`/manual GitHub Actions workflow with dependency install, native generation, CocoaPods, unsigned Xcode build, package verification, artifact upload, and immutable GitHub prerelease. Review that no EAS/Apple credential step exists; commit workflow separately.
3. Add `docs/BUILD.md` for local Expo development, push-to-Release flow, unsigned IPA facts, SideStore install steps, and validation limits. Update README's development/build summary and commit docs separately.
4. Run TypeScript, lint, tests, Expo dependency check, workflow syntax/static checks, and `git diff --check`. Verify Expo config and generated CNG expectations locally. Update this plan with results and limitations.
5. Keep EAS files until the first GitHub workflow completes and a SideStore installation has been validated. Report candidates for later cleanup without removing them now.

## Files in scope

- `.agent/exec-plans/2026-10-03-github-unsigned-ios-build.md`
- `.github/workflows/build-ios.yml`
- `modules/sport-vault-file-protection/expo-module.config.json` (Expo podspec discovery fix)
- `docs/BUILD.md`
- `README.md`

No application runtime code, native feature code, database, or UI files are in scope. `app.json`, `eas.json`, and package files are read-only for this change unless pipeline evidence shows a strictly necessary correction.

## Verification

- Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npx expo install --check`, and `git diff --check`.
- Parse workflow YAML and perform static checks that the triggers, permissions, CNG command, CocoaPods command, unsigned build flags, bundle/version/hash checks, IPA zip verification, artifact, release tag, and no-EAS/no-Apple-secret constraints are present.
- Local Linux cannot run Xcode, CocoaPods for iOS, or GitHub-hosted actions. The macOS GitHub run is required to verify generated app output; SideStore/iPhone is required to establish sideload compatibility. Do not claim the unsigned IPA installs until that manual test succeeds.

## Progress

- [x] Read required project docs and inspect current Git, Expo, and EAS configuration. `docs/ROADMAP.md` is absent; no `ios/` project or GitHub workflow exists; branch is `main` and remote is `origin`.
- [x] Inspect the existing Kavi GitHub IPA workflow as a pattern; intentionally do not copy its ad-hoc signing, which conflicts with this request.
- [x] Commit this plan before implementation.
- [x] Fix local vault module CocoaPods autolinking and confirm the Expo resolver reports its pod and Swift module.
- [x] Add unsigned iOS build workflow with an autolinking guard. YAML/shell static validation remains in final verification.
- [x] Document build and SideStore steps; update README.
- [x] Run local checks. TypeScript, ESLint, all 7 test files, Expo dependency validation, YAML parsing, embedded Bash syntax, autolinking assertions, workflow static checks, and whitespace checks pass. Expo reported that networking is disabled and used the SDK's local bundled-module map; dependencies were reported up to date.
- [x] Leave `eas.json` and EAS project metadata untouched pending the first GitHub build and SideStore installation.
- [ ] Run the workflow on GitHub's macOS runner and validate a SideStore-signed installation on a physical iPhone; this requires the user to push the committed workflow to GitHub.

## Review notes

- GitHub Releases are the primary distribution; an Actions artifact is also retained. Release creation runs last, so a failing build or validation cannot publish an incomplete release.
- A ZIP with the expected IPA layout is packaging, not signing. No ad-hoc or fake signature is to be added; SideStore will perform the device-specific signing.
- Actual Xcode/CocoaPods build, Release creation, SideStore install, and Face ID runtime verification remain pending because the current environment is Linux and the workflow has not yet been pushed to GitHub.
