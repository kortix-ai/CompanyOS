-- Migration: chat_installs_mark_own_apps
--
-- SAFETY HEADER (house rules -- see packages/db/MIGRATIONS.md#zero-downtime-rules).
set lock_timeout = '2s';
set statement_timeout = '30s';

-- Mark the Slack installs of a Kortix workspace's OWN Slack app, written
-- before `own_app` existed (20261112025705420). Until this release only the
-- own-app install (`saveSlackInstall`) wrote SLACK_SIGNING_SECRET: the shared
-- Kortix app's install never did. The install writes it as a connector-scoped,
-- ownerless row with identifier = name, so only that row counts. The secret
-- names no Slack workspace SQL can read (its team id is encrypted), so only a
-- Kortix workspace with exactly ONE Slack install is marked: a second install
-- may be the shared app in another Slack workspace (none on prod, 2026-11-11),
-- and such a workspace reinstalls its own app once. From this
-- release on, `own_app` is the only own-app signal (apps/api
-- channels/slack/link.ts): the install path sets it, and no secret a member
-- can write changes it.
-- backfill-safe: kortix.chat_installs holds about 120 rows on prod (102 Slack workspaces, 2026-11-11), and 3 are own-app installs; one UPDATE in a separate transaction from the column add.
UPDATE "kortix"."chat_installs" AS ci
SET "own_app" = true
WHERE ci."platform" = 'slack'
  AND ci."own_app" = false
  AND EXISTS (
    SELECT 1
    FROM "kortix"."project_secrets" AS ps
    WHERE ps."project_id" = ci."project_id"
      AND ps."name" = 'SLACK_SIGNING_SECRET'
      AND ps."identifier" = 'SLACK_SIGNING_SECRET'
      AND ps."scope" = 'connector'
      AND ps."owner_user_id" IS NULL
  )
  AND (
    SELECT count(*)
    FROM "kortix"."chat_installs" AS other
    WHERE other."platform" = 'slack' AND other."project_id" = ci."project_id"
  ) = 1;
