---
recorded: 2026-11-23T16:12:59Z
incident_date: 2026-11-21
supersedes: 2026-11-21T152442Z-turn-on-deferred-publishing-before-you-submit-a-store-build.md
---
# Upload a Chrome Web Store version only from the release workflow, after prod serves the release

**Rule:** Ship an extension change by raising `version` in
`apps/chrome-extension/src/manifest.json` on dev. Do not upload the package by hand. The
**Chrome Web Store** workflow uploads it after Deploy Prod proved prod serves the release, so an
approved version never reaches users ahead of the API or web change it needs. Keep deferred
publishing off: a staged version blocks every later automatic upload. A manual upload stays the
fallback, and the superseded rule (deferred publishing on first) still applies to it.

**Trigger surface:** Changing anything `apps/chrome-extension/scripts/build.ts` reads, or
publishing a new extension version.

**Incident:** 2026-11-21: version 1.0.1, uploaded by hand on 2026-11-18 without deferred
publishing, passed review and went public while the product side was off in prod. Every attach
answered 403 `feature_disabled` until the next release (see the superseded entry). The upload
had no link to the release that made it usable.

**Enforcement:** `.github/workflows/chrome-store.yml` runs only after `deploy-prod-gate.yml`
passes. `apps/chrome-extension/scripts/store-release.ts` fails the run when extension files
changed after the live version was set, and warns when a version is held as `STAGED`. Its
decisions are covered by `apps/chrome-extension/scripts/store-release.test.ts`.
