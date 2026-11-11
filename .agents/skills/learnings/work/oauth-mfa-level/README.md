---
title: "Sign in with Kortix" tokens in workspaces that require MFA
status: parked (not built). The App viewer token half is on branch app-viewer-mfa (column `mfa_aal` exists).
owner: unassigned
updated: 2026-11-11
---

# "Sign in with Kortix" tokens carry no MFA level

## The problem

A `kortix_oat_` token from the authorization-code flow (`apps/api/src/oauth/index.ts`: a third-party client, an MCP client, a Kortix Backend that signs in with Kortix) acts as the person who consented. `applyOAuthAccessTokenPrincipal` (`apps/api/src/middleware/auth-oauth.ts`) sets no MFA level and no `iamTokenId`, so `mfaGateBlocks` (`apps/api/src/iam/authorize.ts`) refuses it in every account with `mfa_required`. Every project and account action answers `403 account_mfa_required` for every member who is not a super admin. Identity probes (`/v1/accounts/me`, `/v1/oauth/userinfo`) still work.

The App viewer token had the same bug. It is fixed by recording the level at mint time: `access-session` marks the App cookie `aal: 'aal2'` only for a browser session at aal2, the gate copies it into `oauth_access_tokens.mfa_aal`, and `requestMfaAal` (`apps/api/src/middleware/actor.ts`) honors it in the token's own account only. Third-party tokens never set the column: consent (`/v1/oauth/authorize`, `/v1/oauth/consent`) does not record the session's level today.

## The design to build

1. At consent, read the consenting session's `aal` (`c.get('mfaAal')`). Store it on the authorization code.
2. Carry it to `oauth_access_tokens.mfa_aal` (exists) and a new `oauth_refresh_tokens.mfa_aal`. A refresh keeps it.
3. `validateOAuthAccessToken` already returns it and `buildActor` already honors it in the token's `account_id`. Decide whether a bound token should use its bound workspace's account instead. An unbound token (issued before 2026-11-06) keeps no level.
4. When the consenting account requires MFA and the session is aal1, the consent page asks for the second factor first (the web step-up already keys on `code: 'account_mfa_required'`).
5. Tests: a REST flow in an MFA account (local Supabase has MFA off: consent before the requirement is switched on, as `APP-6` does), plus a unit test that the level never crosses accounts.

## Open questions

- Should a token minted at aal1, in an account that turns MFA on later, stop working at once? Today an App sign-in (8 h, renewed) keeps working, and so would this.
- Migration: three tables, nullable column, no backfill (old tokens stay without a level).

## How to pick it up

Read the ledger entry "Record a delegated token's MFA level when it is minted" (`entries/2026-11-11T133430Z-record-a-delegated-token-s-mfa-level-when-it-is-minted-from.md`), then `apps/api/src/oauth/index.ts` (consent and `issueTokenPair`) and the migration skill.
