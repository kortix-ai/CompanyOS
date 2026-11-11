/**
 * Workspaces Release 2a-3b (design.md §4 steps 1 and 4, account side), against a
 * freshly migrated database:
 *
 * - uq_workspaces_legacy_account exists and is valid; every foreign key into
 *   kortix.accounts(account_id) except projects' own has a twin into
 *   kortix.workspaces(legacy_account_id): NO ACTION, DEFERRABLE INITIALLY DEFERRED.
 * - the writes where the R1 reconcile deletes or clears the row that holds an
 *   account's legacy_account_id commit with every account-keyed row intact:
 *   a new account's first project (the project-less row is replaced) and a
 *   transfer between two one-project accounts (the source row is tombstoned).
 * - an account delete still cascades through the old key; a stray delete of a
 *   live row fails at commit; a second active project in one account is refused.
 * - the step-1 migration refuses to build while an account holds two rows.
 *
 * Every row is synthetic and deleted in `finally`.
 */
import { describe, expect, test } from 'bun:test';
import pg from 'pg';

import { up as buildLegacyAccountUnique } from '../migrations/20261111231000000_workspaces_legacy_account_unique.concurrent.ts';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

const A = '00000000-0000-4000-a000-00000000f101';
const B = '00000000-0000-4000-a000-00000000f102';
const P = '00000000-0000-4000-a000-00000000f201';
const P2 = '00000000-0000-4000-a000-00000000f202';
const USER_A = '00000000-0000-4000-a000-00000000f301';
const USER_B = '00000000-0000-4000-a000-00000000f302';

async function withClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.query(`delete from kortix.accounts where account_id = any($1::uuid[])`, [[A, B]]).catch(() => undefined);
    await client.end();
  }
}

const insertAccount = (client: pg.Client, id: string, name: string) =>
  client.query(`insert into kortix.accounts (account_id, name) values ($1, $2)`, [id, name]);
const insertProject = (client: pg.Client, id: string, account: string, extra = '') =>
  client.query(
    `insert into kortix.projects (project_id, account_id, name, repo_url${extra ? ', split_pending' : ''})
     values ($1, $2, 'Synthetic', $3${extra ? `, ${extra}` : ''})`,
    [id, account, `https://example.invalid/${id}.git`],
  );
const addMember = (client: pg.Client, account: string, user: string) =>
  client.query(`insert into kortix.account_memberships (account_id, user_id) values ($1, $2)`, [account, user]);

async function liveRows(client: pg.Client, account: string): Promise<Array<{ workspace_id: string; lifecycle: string }>> {
  const { rows } = await client.query(
    `select workspace_id::text, lifecycle from kortix.workspaces where legacy_account_id = $1 order by 1`,
    [account],
  );
  return rows;
}
const members = async (client: pg.Client, account: string) =>
  Number((await client.query(`select count(*)::int as n from kortix.account_memberships where account_id = $1`, [account])).rows[0].n);

suite('Workspaces R2a-3b: one row per account, account-side twin foreign keys', () => {
  test('the unique index is valid and every key into accounts has its deferred NO ACTION twin', async () => {
    await withClient(async (client) => {
      const { rows: index } = await client.query(
        `select i.indisvalid, i.indisunique, pg_get_indexdef(i.indexrelid) as def from pg_index i
          join pg_class c on c.oid = i.indexrelid where c.relname = 'uq_workspaces_legacy_account'`,
      );
      expect(index).toHaveLength(1);
      expect(index[0]).toMatchObject({ indisvalid: true, indisunique: true });
      expect(index[0].def).toContain('(legacy_account_id)');
      expect(index[0].def).not.toContain('WHERE');

      const { rows } = await client.query<{ child: string; twin: string | null; on_delete: string | null; deferred: boolean | null }>(`
        select old.conrelid::regclass::text as child, twin.conname as twin,
               twin.confdeltype::text as on_delete, twin.condeferred as deferred
          from pg_constraint old
          left join pg_constraint twin
            on twin.contype = 'f' and twin.conrelid = old.conrelid and twin.conkey = old.conkey
           and twin.confrelid = 'kortix.workspaces'::regclass
         where old.contype = 'f' and old.confrelid = 'kortix.accounts'::regclass
           and old.conrelid <> 'kortix.projects'::regclass
         order by 1`);
      expect(rows.length).toBeGreaterThan(50);
      expect(rows.filter((row) => row.twin === null).map((row) => row.child)).toEqual([]);
      expect(rows.filter((row) => row.on_delete !== 'a' || row.deferred !== true).map((row) => row.child)).toEqual([]);
    });
  });

  test("a new account's first project replaces its project-less row in one transaction; the members stay", async () => {
    await withClient(async (client) => {
      await client.query('begin');
      await insertAccount(client, A, 'Synthetic new');
      await addMember(client, A, USER_A);
      expect(await liveRows(client, A)).toEqual([{ workspace_id: A, lifecycle: 'dormant' }]);
      await insertProject(client, P, A);
      await client.query('commit');
      expect(await liveRows(client, A)).toEqual([{ workspace_id: P, lifecycle: 'active' }]);
      expect(await members(client, A)).toBe(1);
    });
  });

  test('a transfer between two one-project accounts commits; both accounts keep their rows and members', async () => {
    await withClient(async (client) => {
      await insertAccount(client, A, 'Synthetic source');
      await insertAccount(client, B, 'Synthetic target');
      await addMember(client, A, USER_A);
      await addMember(client, B, USER_B);
      await insertProject(client, P, A);
      // moveProjectRowAccount's statement (apps/api/src/workspaces/rows.ts).
      await client.query(`update kortix.projects set account_id = $1 where project_id = $2 and account_id = $3`, [B, P, A]);
      expect(await liveRows(client, A)).toEqual([{ workspace_id: A, lifecycle: 'dormant' }]);
      expect(await liveRows(client, B)).toEqual([{ workspace_id: P, lifecycle: 'active' }]);
      expect([await members(client, A), await members(client, B)]).toEqual([1, 1]);
    });
  });

  test('an account delete cascades through the old key; a stray delete of a live row fails at commit', async () => {
    await withClient(async (client) => {
      await insertAccount(client, A, 'Synthetic');
      await addMember(client, A, USER_A);
      await insertProject(client, P, A);

      await client.query('begin');
      await client.query(`delete from kortix.workspaces where workspace_id = $1`, [P]);
      const refused = await client.query('commit').then(
        () => null,
        (error: { code?: string; constraint?: string }) => error,
      );
      expect(refused?.code).toBe('23503');
      expect(refused?.constraint).toMatch(/_workspaces_fk$|_ws_account_fk$/);
      expect(await liveRows(client, A)).toEqual([{ workspace_id: P, lifecycle: 'active' }]);

      await client.query(`delete from kortix.accounts where account_id = $1`, [A]);
      expect(await members(client, A)).toBe(0);
      expect(await liveRows(client, A)).toEqual([]);
    });
  });

  test('a second active project in one account is refused, the split_pending way included', async () => {
    await withClient(async (client) => {
      await insertAccount(client, A, 'Synthetic');
      await insertProject(client, P, A);
      const plain = await insertProject(client, P2, A).then(() => null, (error: { code?: string }) => error);
      expect(plain?.code).toBe('23505');
      await client.query(`update kortix.projects set split_pending = true where project_id = $1`, [P]).catch(() => undefined);
      const legacy = await insertProject(client, P2, A, 'true').then(
        () => null,
        (error: { code?: string; constraint?: string }) => error,
      );
      expect(legacy?.code).toBe('23505');
      expect(legacy?.constraint).toBe('uq_workspaces_legacy_account');
    });
  });
});

describe('the step-1 migration refuses to build while an account holds two rows', () => {
  test('it throws before any index statement, with the count and the reason', async () => {
    const statements: string[] = [];
    const pgm = {
      noTransaction: () => undefined,
      db: {
        query: async (text: string) => {
          statements.push(text.trim().split(/\s+/).slice(0, 3).join(' '));
          if (text.includes('from pg_index')) return { rows: [] };
          if (text.includes('having count(*) > 1')) return { rows: [{ accounts: 3 }] };
          return { rows: [] };
        },
      },
    };
    await expect(buildLegacyAccountUnique(pgm as never)).rejects.toThrow(/3 account\(s\) still hold 2\+ workspace rows \(split_pending\)/);
    expect(statements.some((s) => /^(create|drop) /i.test(s))).toBe(false);
  });
});
