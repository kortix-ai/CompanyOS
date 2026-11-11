// Migration: workspaces_legacy_account_unique  (NON-TRANSACTIONAL -- CONCURRENTLY escape hatch)
//
// Workspaces Release 2a step 1 (design: .agents/skills/learnings/work/workspaces/design.md §4).
//
//   CREATE UNIQUE INDEX CONCURRENTLY uq_workspaces_legacy_account
//     ON kortix.workspaces (legacy_account_id)
//
// One account = one workspace (§1.3 invariant 1). The account-side twin foreign
// keys (next files) reference workspaces(legacy_account_id), and a foreign key
// needs a full unique index on the referenced column: the R1 partial index
// uq_workspaces_live_account (WHERE lifecycle <> 'tombstone' AND NOT
// split_pending) cannot back one. Tombstones hold legacy_account_id NULL, which a
// unique index never compares, so they need no predicate.
//
// GATE: valid only when no account holds two rows, that is 0 split_pending
// accounts (the legacy split finished; design.md §2, R2 gate). On a database
// that still has one, this file FAILS ON PURPOSE before it builds anything, so it
// leaves no INVALID index and says why. Merge it into dev only after dev,
// staging and prod show 0 (design.md §4 "R2a build order", R2a-3). A migration
// that skipped itself would be recorded as applied and never run again.
//
// An INVALID leftover of this file's own earlier attempt (a 55P03 or a crash
// mid-build) is dropped first (DROP INDEX CONCURRENTLY), then CREATE UNIQUE
// INDEX CONCURRENTLY IF NOT EXISTS.
//
// mixed-version-safe: the only DROP is DROP INDEX CONCURRENTLY of the index this
// file names, and only while it is INVALID: an INVALID index enforces nothing and
// serves no reads. The R1 image never writes kortix.workspaces (its triggers do,
// one row per account outside split_pending), so the index refuses no R1 write.
//
// lock_timeout 180s: CREATE INDEX CONCURRENTLY waits for every older
// transaction (lint floor 120s). ShareUpdateExclusive on kortix.workspaces only.
// Prod 2026-11-11: ~51k rows, 29 MB with every index; the build takes seconds.
//
// ROLL BACK: a forward migration with
//   drop index concurrently if exists kortix.uq_workspaces_legacy_account
// after the twin foreign keys that reference it are dropped.

export const shorthands = undefined;

const INDEX = 'uq_workspaces_legacy_account';

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
async function indexState(pgm) {
  const { rows } = await pgm.db.query(
    `select i.indisvalid as valid
       from pg_index i
       join pg_class c on c.oid = i.indexrelid
      where c.relname = $1
        and c.relnamespace = 'kortix'::regnamespace`,
    [INDEX],
  );
  if (rows.length === 0) return 'missing';
  return rows[0].valid ? 'valid' : 'invalid';
}

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
export const up = async (pgm) => {
  pgm.noTransaction();
  // pgm.db.query, one statement each: CONCURRENTLY cannot run in a multi-statement string.
  await pgm.db.query(`set lock_timeout = '180s'`);
  await pgm.db.query(`set statement_timeout = '30min'`);
  const state = await indexState(pgm);
  if (state === 'valid') return;
  const { rows } = await pgm.db.query(`
    select count(*)::int as accounts
      from (select legacy_account_id from kortix.workspaces
             where legacy_account_id is not null
             group by legacy_account_id having count(*) > 1) shared
  `);
  const shared = Number(rows[0]?.accounts ?? 0);
  if (shared > 0) {
    throw new Error(
      `workspaces_legacy_account_unique: ${shared} account(s) still hold 2+ workspace rows (split_pending). ` +
        'Release 2a needs the legacy split finished (design.md §2): run the split in apply mode until ' +
        'kortix.projects has no active split_pending row, then rerun the migration.',
    );
  }
  if (state === 'invalid') await pgm.db.query(`drop index concurrently if exists kortix.${INDEX}`);
  await pgm.db.query(`create unique index concurrently if not exists ${INDEX} on kortix.workspaces (legacy_account_id)`);
};

export const down = false;
