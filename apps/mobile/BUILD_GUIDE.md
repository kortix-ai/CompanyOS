# Mobile Build Guide

## Setup
```bash
pnpm install -g eas-cli
eas login
```

## Android Development Setup

**Default workflow (cloud build - recommended):**
```bash
cd apps/mobile
pnpm run android:setup
pnpm run android:build
pnpm run android:dev
```

## iOS Development Setup
```bash
cd apps/mobile
npx expo run:ios
```

## Build profiles (`eas.json`)

Every profile name states its backend and its artifact. Every profile increments
the build number (EAS keeps it remotely).

| Profile | Backend | EAS environment | Update channel | Artifact |
|---|---|---|---|---|
| `prod-store` | `api.kortix.com` | `production` | `production` | App Store / Play (AAB) |
| `prod-testflight` | `api.kortix.com` | `production` | `testflight-production` | iOS TestFlight only |
| `prod-apk` | `api.kortix.com` | `production` | `production` | installable APK |
| `dev-store` | `dev-api.kortix.com` | `preview` | `dev` | TestFlight / Play internal (AAB) |
| `dev-apk` | `dev-api.kortix.com` | `preview` | `dev` | installable APK |
| `development` | local `.env` | — | `development` | dev client |

`EXPO_PUBLIC_*` values come from the EAS environment only, for builds and for
OTA updates alike: `eas env:list production`. Change them there, never in
`eas.json`, or a build and an update of the same release disagree.

## TestFlight with the production API

`Mobile TestFlight` runs automatically after mobile changes merge into `dev`.
Changes to the TestFlight workflow also trigger it. SDK or shared-package
changes that affect mobile must include the required mobile version bump,
which triggers this workflow. The repo-wide lockfile alone does not trigger it.
Markdown-only and test-only changes do not trigger a build. A running build
continues. New pushes replace the pending build with the newest commit.
To retry manually: Actions → Mobile TestFlight → Run workflow → select `dev`.
Each run consumes EAS iOS build quota and keeps a GitHub runner active while
waiting. The workflow timeout is 180 minutes.

The workflow builds iOS with `prod-testflight`, then uploads that exact build
to TestFlight with EAS Submit. It checks that the production EAS environment
points at `https://api.kortix.com/v1` and that the API answers `/health`.
The `testflight-production` update channel separates these builds from public
production OTA updates. The public store workflow selects only `prod-store`
builds, so it does not reuse a TestFlight candidate from this profile.

This workflow does not submit App Review, release an App Store version, upload
Android, promote the backend, or publish an OTA. After Apple processes the
upload, internal testers can install it through their existing TestFlight group.
If the build is not visible, assign it to that group in App Store Connect.
External testers can require Apple's separate Beta App Review.
After Apple approves version X, its upload train closes. Further uploads for X
fail; run `node apps/mobile/scripts/set-version.mjs --next` before a new build.

Read-only preflight from the repo root:

```sh
node apps/mobile/scripts/testflight-publish.mjs --dry-run
```

To build and upload manually from a clean committed checkout with EAS login
or `EXPO_TOKEN`, omit `--dry-run`. Use the dedicated command; `store-release.mjs`
also performs public store release operations.

## Release a store version

Agents bump the version once per mobile task, including code, assets,
dependencies, and native configuration. Documentation-only work needs no bump.
The build number changes on every build. `runtimeVersion` equals the version,
so an OTA update only reaches binaries built from the same release.

In the task's worktree, run this from the repo root and commit every changed
version file. Let the normal release carry the version:

```bash
node apps/mobile/scripts/set-version.mjs --next
```

The command keeps major and minor unchanged. A single-digit patch starts a
two-digit sequence. Examples: `1.6.2` → `1.6.21`, `1.5.6` → `1.5.61`, or
`1.0.0` → `1.0.10`. Later calls increment the patch numerically:
`1.5.61` → `1.5.62` → `1.5.63`, `1.6.29` → `1.6.30`.
Run once per task, not once per edit. Before the final push, fetch `origin/dev`.
If its version differs from the task's base version, sync first. Resolve the
version conflicts to `origin/dev`'s version while keeping other native changes.
If needed, synchronize the six fields with the explicit version command below,
then run `--next` once. Compare version components as integers, never as text.

```sh
node apps/mobile/scripts/set-version.mjs <version>
```

Use the explicit argument only for that synchronization or a release version
the user requests.

Every bump also changes the runtime and requires a new binary. The bumped
bundle cannot reach an older runtime through OTA. Once the bump reaches `prod`,
the existing `mobile-store.yml` builds on EAS, submits Android to Play production,
and submits iOS for App Review. JS-only changes also wait for that new binary.
A mobile task does not authorize a production promotion or a manual submission.

`scripts/set-version.test.ts` fails when the copies disagree. A native change
(new native module, permission, Expo SDK, anything under `ios/` or `android/`)
needs a new version and a store build: OTA cannot ship it.

After every successful `Deploy Prod`, `.github/workflows/mobile-store.yml` runs
`scripts/store-release.mjs` on the deployed commit. Per platform it does each
step only when it is missing:

1. **Build:** no finished `prod-store` store build of this version exists, so
   it builds one on EAS.
2. **Submit:** the newest store build has no finished EAS submission. Android
   goes to the Play **production** track (`releaseStatus: completed`, every
   user). iOS goes to App Store Connect.
3. **iOS review:** it creates the App Store version (or renames an unsubmitted
   draft), attaches the build, fills an empty "What's New", and submits it for
   App Review with "release automatically after approval". An approved version
   held for a manual release is released.

Only released code ships. The run builds, submits or sends to review only an
EAS build made from a clean tree at a commit of the deployed history. It
ignores any other build of the version, such as a hand-made build from `dev`
or one with uncommitted changes, and warns. Android counts as shipped only
after a finished submission to the `production` track.

A release without a version bump changes nothing. The run posts what it
changed, and every warning, to the release Slack channel. It warns when native
code changed after the version's store build: bump the version, or phones get
neither a store build nor OTA updates with that change. It never resubmits a
version Apple rejected (`REJECTED`, `METADATA_REJECTED`, `INVALID_BINARY`) or
one a person pulled from review (`DEVELOPER_REJECTED`): fix it in App Store
Connect. When Apple refuses the review submission, the run names Apple's reason.
Example: Apple added the age-rating question `socialMedia` in 2026 and refused
1.5.5 until it had an answer (App Store Connect → App Information → Age
Rating). Questionnaire answers are declarations, so the run never fills them.

Auth is `EXPO_TOKEN` only. App Store Connect calls use the API key that EAS
Submit stores for the app (`eas credentials -p ios`), read from Expo at run
time. CI holds no Apple secret.

Run it by hand: Actions → Mobile Store → Run workflow (it always uses `prod`;
`dry_run` reads every state and changes nothing). Locally, from a `prod`
checkout with `EXPO_TOKEN` set: `node apps/mobile/scripts/store-release.mjs --dry-run`.

## Require a minimum app version

An old build keeps running until its owner updates it. To ask old builds to
update, set these on the API (the EAS environment is for the app, not these):

| Variable | Meaning |
|---|---|
| `MOBILE_MIN_VERSION` | `major.minor.patch`. A build below it shows a blocking "Update required" screen. Unset: no gate. A malformed value stops the API at boot. |
| `MOBILE_STORE_URL_IOS` | App Store page the Update button opens on iOS. Unset: no button. |
| `MOBILE_STORE_URL_ANDROID` | Play Store page the Update button opens on Android. Unset: no button. |

The app reads `GET /v1/clients/mobile` (no auth) at start and on return to the
foreground, and compares it to the native binary version (`nativeAppVersion`).
The gate fails open: a network error, a non-200 answer, a missing or unparsable
minimum never blocks the app. The gate lives in the JS bundle, so an OTA update
(below) delivers it to every existing build with the same `runtimeVersion`.
Unset `MOBILE_MIN_VERSION` to lift it.

## OTA updates

`.github/workflows/mobile-ota.yml` publishes the JS/TS bundle with
`scripts/ota-publish.mjs`:

| Event | Channel | Reaches |
|---|---|---|
| `Deploy Prod` succeeded (each production release) | `production` | `prod-store`, `prod-apk` builds |
| Actions → Mobile OTA → Run workflow, channel `dev` | `dev` | `dev-store`, `dev-apk` builds |
| Actions → Mobile OTA → Run workflow, channel `production` | `production` | a re-run of the released `prod` branch, whichever branch the button runs from (`dry_run` publishes nothing) |

A push to `dev` publishes nothing: since 2026-10-03 only cheap guards and
path-gated infra run on `dev` (Actions minutes).

Per platform the script **skips** (warning on the run) when:
1. no finished build on the channel has the current `runtimeVersion`;
2. the native fingerprint differs from the newest build of each distribution
   (store, internal): the run names the differing sources and says
   "Rebuild required";
3. nothing under `apps/mobile`, `packages/sdk` or `pnpm-lock.yaml` changed since
   the channel's last update.

It **fails** when the environment's `EXPO_PUBLIC_BACKEND_URL` does not answer
`/health` with 200, because that URL is compiled into the bundle.

A device downloads an update in the background on launch and runs it on the
next launch.

### Verify an update

```bash
eas update:list --branch production --limit 5            # what was published, with its commit
eas update:insights <group-id>                           # launches, crashes, unique users
eas fingerprint:compare --build-id <build-id>            # why a platform was skipped
```

On a device: open the app, close it, open it again; the change is visible on the
second launch.

### Roll back a bad update

1. Find the last good update group: `eas update:list --branch production --limit 10`.
2. Serve it again (new update id, same bundle):
   ```bash
   eas update:republish --group <good-group-id> --message "Roll back <bad-group-id>"
   ```
   With no good update for this runtime, send devices back to the bundle inside
   the binary:
   ```bash
   eas update:roll-back-to-embedded --channel production --platform all --runtime-version <runtime> \
     --message "Roll back <bad-group-id>"
   ```
3. Confirm: the new entry is on top of `eas update:list --branch production`,
   and a device shows the old behavior on its second launch.
4. Fix forward on `dev`. The next production release publishes again.
