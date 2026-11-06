---
recorded: 2026-11-06T14:02:41Z
incident_date: 2026-11-06
---
# Lint a new migration before its first local apply

**Rule:** Run migration lint before the first apply, including isolated local databases. Include lock and statement timeouts before DDL.

**Trigger surface:** Writing and applying a new SQL migration.

**Incident:** On 2026-11-06 an unpublished vault migration reached an isolated branch database before lint found missing timeouts. No primary product schema changed. The user explicitly authorized a local-only correction and validation on a fresh isolated database. This ruling does not permit editing shared or published migrations.

**Enforcement:** `pnpm --filter @kortix/db lint` rejects missing timeout declarations. Run it before the migration runner.
