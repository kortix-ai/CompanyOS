/**
 * Kortix in Chrome is not launched: the web app has no Settings page, sidebar
 * row or card for it (#11436). While this is false, no surface may offer it:
 * the `chrome` feature flag is off by default and missing from the flag
 * catalog (so no session box gets the `kortix-chrome` skill or the
 * `kortix chrome` command unless an operator turns it on), and no API
 * response, CLI line or prompt links to `/settings/chrome`, which would open
 * Profile instead.
 *
 * `KORTIX_CHROME_ENABLED` serves `/v1/chrome/*` on every deployment, so the
 * Chrome Web Store build signs in and the store can review it before launch
 * (an operator turns the flag on for a reviewer or test project:
 * `PUT /v1/admin/api/projects/:id/features`). To launch, set this to true: the web surfaces,
 * the flag and the links come back together.
 */
export const CHROME_LAUNCHED = false;
