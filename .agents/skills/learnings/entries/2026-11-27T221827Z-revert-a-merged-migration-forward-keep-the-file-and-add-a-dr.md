---
recorded: 2026-11-27T22:18:27Z
incident_date: 2026-11-27
---
# Revert a merged migration forward: keep the file and add a drop migration in the same revert PR

**Rule:** When you revert a PR whose migration `dev` already applied, keep the migration file. A missing applied file fails every later `migrate`. In the same revert PR, add a new migration that undoes it (`DROP TABLE`, `DROP COLUMN`). Also remove the tables from `kortix.ts`, the `@kortix/db` exports and `workspace-key-classes.ts`. Never leave a reverted product's schema on `dev`. The next Promote ships it to staging and prod.

**Trigger surface:** reverting a merged PR that touches `packages/db/migrations` or `packages/db/src/schema`; a revert PR body that says "everything except `packages/db`".

**Incident:** 2026-11-27, v0.16.6. #13192 reverted a feature but kept its migration and schema, so 2 empty tables stayed on `dev`. The `Tests` dispatch on `dev` then failed in `core-db` and `packages-rest`: the tables had no workspace twin foreign key and no workspace key class. Promote had already merged the candidate into staging, and staging's database applied the tables. The first Promote was cancelled. #13211 added a forward drop migration, and #13212 cherry-picked it onto `staging`. Prod v0.16.6 created and dropped the tables in one deploy. Cost: one cancelled Promote and 2 staging rebuilds. A branch that ships the feature later must use a new migration timestamp.

**Enforcement:** partial. `packages/db/scripts/workspaces-twin-foreign-keys.integration.test.ts` and `packages/db/src/workspace-key-classes.test.ts` go red for a kept table that has a `project_id` key, but only in the nightly or release lanes. A kept table without that key passes everything. None yet: a revert check that fails when a PR deletes schema code but keeps that code's migration with no later drop.
