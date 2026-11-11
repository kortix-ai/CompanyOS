-- Migration: connector_calls_call_log
--
-- SAFETY HEADER (house rules -- see packages/db/MIGRATIONS.md#zero-downtime-rules).
-- Tune these down further for large/hot tables; raise statement_timeout only
-- for an operation you've deliberately reasoned about (e.g. a NOT VALID
-- constraint's later VALIDATE, or a batched backfill with its own paging).
set lock_timeout = '2s';
set statement_timeout = '30s';

-- REVIEW THE GENERATED SQL BELOW. drizzle-kit writes it from the diff between
-- kortix.ts and the snapshot; it knows the target shape, not how to reach it
-- without downtime. Check the same list `migrate:create` prints:
--   [ ] Bare NOT NULL added to an existing populated table (needs a backfill first).
--   [ ] Plain CREATE INDEX / DROP INDEX on an EXISTING table -- move it to
--       `pnpm migrate:create <slug> --concurrent`; it blocks writes here.
--   [ ] New FK/constraint on an existing table -- add NOT VALID, VALIDATE after.
--   [ ] A DROP/RENAME/ALTER ... TYPE the generator proposed from a STALE
--       snapshot. Delete anything already applied by an earlier migration.
--   [ ] Any DROP/RENAME/ALTER ... TYPE/DROP NOT NULL needs the enforced line:
-- mixed-version-safe: <why old code tolerates this change, or why it cannot still be running>
--   [ ] Any ALTER TYPE ... ADD VALUE needs:
-- enum-value-checked: <how you verified every env, including any faked baseline, has this value>

-- The call log: who ran each tool call (credential, principal, agent), from
-- which surface, how its approval was delivered, why it was refused, where it
-- stopped, its request/trace ids and the Kortix vs upstream time split.
-- All columns are nullable and have no default, so ADD COLUMN is metadata-only
-- and old code never reads or writes them.
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "credential_id" varchar(64);--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "principal_kind" varchar(32);--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "agent_slug" varchar(128);--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "surface" varchar(32);--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "approval_delivery" varchar(16);--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "refusal_reason" varchar(64);--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "phase" varchar(32);--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "request_id" varchar(64);--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "trace_id" varchar(32);--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "kortix_ms" integer;--> statement-breakpoint
ALTER TABLE "kortix"."connector_calls" ADD COLUMN "upstream_ms" integer;