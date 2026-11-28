-- Migration: humanoid_tables_drop
--
-- SAFETY HEADER (house rules -- see packages/db/MIGRATIONS.md#zero-downtime-rules).
set lock_timeout = '2s';
set statement_timeout = '30s';

-- #13192 took the humanoid off dev but kept 20261127134523104_humanoid_identity_and_events,
-- because dev had applied it and a missing applied file fails every later
-- `migrate`. This drops its 2 tables, so no environment keeps a schema for a
-- product that did not ship. Both are empty on dev and staging (0 rows,
-- 2026-11-27); prod creates and drops them in the same deploy. The humanoid
-- branch adds its tables again with a new migration when it ships.
-- No CASCADE: nothing references these tables, and an unknown dependent
-- object must fail this migration, not vanish with it.
-- Locks: each DROP removes the table's foreign-key triggers on projects (and
-- workspaces, where 20261127200620822 added the twins), a brief ACCESS
-- EXCLUSIVE lock bounded by lock_timeout. A 55P03 is retried by rerunning the
-- migration job.
-- mixed-version-safe: no code reads or writes either table since #13192 (eb6b11bda4); v0.16.5 in prod never knew them.
DROP TABLE "kortix"."humanoid_events";--> statement-breakpoint
DROP TABLE "kortix"."humanoid_identities";
