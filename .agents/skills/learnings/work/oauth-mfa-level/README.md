---
title: "Sign in with Kortix" tokens in workspaces that require MFA
status: parked (not built). The App viewer token half shipped on branch app-viewer-mfa.
owner: unassigned
updated: 2026-11-11
---

# "Sign in with Kortix" tokens carry no MFA level

## The problem

A `kortix_oat_` token from the authorization-code flow (`apps/api/src/oauth/index.ts`: a third-party client, an MCP client, a Kortix Backend that signs in with Kortix) acts as the person who consented. `applyOAuthAccessTokenPrincipal` (`apps/api/src/middleware/auth-oauth.ts`) sets no MFA level and no `iamTokenId`, so `mfaGateBlocks` (`apps/api/src/iam/authorize.ts`) refuses it in every account with `mfa_required`. Every project and account action answers `403 account_mfa_required` for every member who is not a super admin. Identity probes (`/v1/accounts/me`, `/v1/oauth/userinfo`) still work.

The App viewer token had the same bug. It is fixed by counting it as aal2 in the App's account only (`requestMfaAal` in `apps/api/src/middleware/actor.ts`), because the Apps gate admits a viewer only after `access-session` passed the MFA gate. A third-party token has no such gate: consent (`/v1/oauth/authorize`, `/v1/oauth/consent`) does not check the session's MFA level today.

## The design to build

1. At consent, read the consenting session's `aal` (`c.get('mfaAal')`). Store it on the authorization code.
2. Carry it to `oauth_access_tokens` and `oauth_refresh_tokens` (new column, for example `mfa_aal text null`). A refresh keeps it.
3. `validateOAuthAccessToken` returns it. `buildActor` counts it as the token's level, in the token's bound workspace's account only (`boundWorkspaceId`). An unbound token (issued before 2026-11-06) keeps no level.
4. When the consenting account requires MFA and the session is aal1, the consent page asks for the second factor first (the web step-up already keys on `code: 'account_mfa_required'`).
5. Tests: a REST flow in an MFA account (local Supabase has MFA off: consent before the requirement is switched on, as `APP-6` does), plus a unit test that the level never crosses accounts.

## Open questions

- Should a token minted at aal1, in an account that turns MFA on later, stop working at once? Today an App sign-in (8 h, renewed) keeps working, and so would this.
- Migration: three tables, nullable column, no backfill (old tokens stay without a level).

## How to pick it up

Read the ledger entry "Give every credential that acts as a person an explicit MFA rule" (`entries/2026-11-11T125420Z-give-every-credential-that-acts-as-a-person-an-explicit-mfa.md`), then `apps/api/src/oauth/index.ts` (consent and `issueTokenPair`) and the migration skill.
