---
recorded: 2026-11-11T12:54:20Z
incident_date: 2026-11-11
---
# Give every credential that acts as a person an explicit MFA rule: a token the API mints after the MFA gate passed counts as aal2 in that account and no other

**Rule:** When you add or change a credential that acts as a person (an OAuth token, a gate-minted token, a delegated session), decide how `mfaGateBlocks` (`apps/api/src/iam/authorize.ts`) judges it, and test it in an account with `mfa_required`. A token the API mints only after the MFA gate passed carries that pass into the account it was minted for, never into another account: set the level per account in `buildActor` (`apps/api/src/middleware/actor.ts`), never request-wide through `c.set('mfaAal')`, which six routes read with no account check.

**Trigger surface:** Minting a token in `apps/api/src/apps/viewer.ts`, `apps/api/src/oauth/`, or any new `kortix_*` credential; changing `applyOAuthAccessTokenPrincipal`, `buildActor`, or the MFA gate.

**Incident:** 2026-11-11, prod. A member of a workspace that requires MFA built a static App with `viewer_token_scope: 'api'`. Every call the App made as its viewer (`/_kortix/api/v1/*` and the `/_kortix/viewer` token) got `403 account_mfa_required`, although the member's session had passed MFA to open the App. The App viewer token is a `kortix_oat_` OAuth token, and OAuth tokens carried no MFA level, so the gate refused them for every member except a super admin. Present since gate-minted viewer tokens shipped (8f72fde2d6, 2026-08-27). The App gate itself had the same bug and was fixed on 2026-10-19 (`appCheckActor`); the token it mints was not. Third-party "Sign in with Kortix" tokens still carry no level (parked: `work/oauth-mfa-level/`).

**Enforcement:** REST flow `APP-6` step "in a workspace that requires MFA, the App still acts as its viewer" (`tests/src/flows/apps.flow.ts`) goes red with the production `403 account_mfa_required` without the fix. `apps/api/src/__tests__/unit-app-viewer-token-mfa.test.ts` pins aal2 to the App's account only. `unit-oauth-provider.test.ts` pins that an App's implicit OAuth client runs no grant, so only the Apps gate mints its tokens.
