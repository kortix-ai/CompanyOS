import { sql } from "drizzle-orm";
import { db } from "../../shared/db";
import { createBrowserHandle } from "./credentials";
import type { browserLoginConfig } from "./config";
import { gotrue, sessionFrom } from "../gotrue";
type Codec = NonNullable<ReturnType<typeof browserLoginConfig>["codec"]>;
export class VaultError extends Error {
  constructor(
    public status: 401 | 404 | 409 | 429 | 503,
    public code: string,
  ) {
    super(code);
  }
}
export function createVault(codec: Codec) {
  const binding = (handleHash: string, slot: string, userId = "attempt") => ({
    handleHash,
    slot,
    userId,
  });
  return {
    async init(h: string) {
      await db.execute(
        sql`insert into kortix.browser_login_handles(handle_hash) values (${h})`,
      );
    },
    async run<T>(
      h: string,
      operation: (tx: any) => Promise<T>,
      recovery = false,
    ): Promise<T> {
      return db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = '3s'`);
        const handles = await tx.execute(
          sql`select * from kortix.browser_login_handles where handle_hash=${h} and removed_at is null and (${recovery} or (idle_expires_at>now() and absolute_expires_at>now())) for update`,
        );
        if (!handles.length)
          throw new VaultError(401, "browser_login_required");
        if (!recovery)
          await tx.execute(
            sql`update kortix.browser_login_handles set idle_expires_at=least(absolute_expires_at, now()+interval '30 days') where handle_hash=${h}`,
          );
        return operation(tx);
      });
    },
    async roster(h: string) {
      return this.run(h, async (tx) =>
        Array.from(
          await tx.execute(
            sql`select s.slot,s.user_id,u.email,s.expires_at from kortix.browser_login_slots s join auth.users u on u.id=s.user_id where s.handle_hash=${h} and s.removed_at is null`,
          ),
        ),
      );
    },
    async begin(h: string, method: string) {
      return this.run(h, async (tx) => {
        const count = await tx.execute(
          sql`select count(*)::int as n from kortix.browser_login_attempts where handle_hash=${h} and expires_at>now()`,
        );
        if (count[0].n >= 10) throw new VaultError(429, "browser_login_limit");
        const attempt = createBrowserHandle();
        const verifier = createBrowserHandle();
        await tx.execute(
          sql`insert into kortix.browser_login_attempts(handle_hash,attempt,method,secret) values (${h},${attempt},${method},${codec.seal(verifier, binding(h, attempt))})`,
        );
        return { attempt, verifier };
      });
    },
    async complete(
      h: string,
      a: string,
      authenticate: (
        method: string,
        verifier: string,
      ) => Promise<Record<string, unknown>>,
    ) {
      return this.run(h, async (tx) => {
        const rows = await tx.execute(
          sql`select * from kortix.browser_login_attempts where handle_hash=${h} and attempt=${a} and not consumed and expires_at>now() for update`,
        );
        const row = rows[0];
        if (!row)
          throw new VaultError(409, "browser_login_attempt_unavailable");
        const body = await authenticate(
          row.method,
          codec.open(row.secret, binding(h, a)),
        );
        const session = sessionFrom(body);
        if (!session) throw new VaultError(503, "browser_login_unavailable");
        const verified = await gotrue("/user", {
          bearer: session.access_token,
        });
        if (
          !verified.ok ||
          typeof verified.body.id !== "string" ||
          !verified.body.email_confirmed_at
        )
          throw new VaultError(409, "browser_login_verification_required");
        // Read only after GoTrue verifies the JWT. Never trust a caller-supplied subject/session.
        const claims = JSON.parse(
          Buffer.from(
            session.access_token.split(".")[1]!,
            "base64url",
          ).toString(),
        );
        const userId = verified.body.id;
        const refs = await tx.execute(
          sql`select id from auth.sessions where id=${claims.session_id}::uuid and user_id=${userId}::uuid`,
        );
        if (!refs.length)
          throw new VaultError(409, "browser_login_verification_required");
        await tx.execute(
          sql`update kortix.browser_login_attempts set consumed=true,candidate=${codec.seal(JSON.stringify(session), binding(h, a, userId))},user_id=${userId}::uuid,session_id=${claims.session_id}::uuid where handle_hash=${h} and attempt=${a}`,
        );
        return {
          candidate: a,
          user: { id: userId, email: verified.body.email },
        };
      });
    },
    async confirm(h: string, a: string) {
      return this.run(h, async (tx) => {
        const rows = await tx.execute(
          sql`select * from kortix.browser_login_attempts where handle_hash=${h} and attempt=${a} and consumed and candidate is not null and expires_at>now() for update`,
        );
        const row = rows[0];
        if (!row)
          throw new VaultError(409, "browser_login_attempt_unavailable");
        const existing = await tx.execute(
          sql`select slot from kortix.browser_login_slots where handle_hash=${h} and user_id=${row.user_id}::uuid and removed_at is null`,
        );
        if (existing.length)
          return { slot: existing[0].slot, duplicate_candidate: a };
        const pending = await tx.execute(
          sql`select slot from kortix.browser_login_slots where handle_hash=${h} and user_id=${row.user_id}::uuid and revoke_pending`,
        );
        if (pending.length)
          throw new VaultError(409, "browser_login_revocation_pending");
        const count = await tx.execute(
          sql`select count(*)::int as n from kortix.browser_login_slots where handle_hash=${h} and removed_at is null`,
        );
        if (count[0].n >= 5) throw new VaultError(429, "browser_login_limit");
        const session = JSON.parse(
          codec.open(row.candidate, binding(h, a, row.user_id)),
        );
        const slot = createBrowserHandle().slice(0, 16);
        await tx.execute(
          sql`insert into kortix.browser_login_slots(handle_hash,slot,user_id,session_id,credential,expires_at) values (${h},${slot},${row.user_id}::uuid,${row.session_id}::uuid,${codec.seal(JSON.stringify(session), binding(h, slot, row.user_id))},to_timestamp(${session.expires_at})) on conflict(handle_hash,user_id) do update set slot=excluded.slot,session_id=excluded.session_id,credential=excluded.credential,expires_at=excluded.expires_at,removed_at=null,revoke_pending=false,revision=kortix.browser_login_slots.revision+1 where not kortix.browser_login_slots.revoke_pending`,
        );
        await tx.execute(
          sql`delete from kortix.browser_login_attempts where handle_hash=${h} and attempt=${a}`,
        );
        return { slot };
      });
    },
    async token(h: string, slot: string) {
      const owner = createBrowserHandle();
      const read = async (tx: any) => {
        const rows = await tx.execute(
          sql`select s.* from kortix.browser_login_slots s join auth.sessions a on a.id=s.session_id and a.user_id=s.user_id where s.handle_hash=${h} and s.slot=${slot} and s.removed_at is null for update of s`,
        );
        const row = rows[0];
        if (!row) throw new VaultError(404, "browser_login_slot_unavailable");
        return {
          row,
          session: JSON.parse(
            codec.open(row.credential, binding(h, slot, row.user_id)),
          ),
        };
      };
      // Commit ownership before contacting GoTrue. A process crash leaves a durable marker.
      // Another replica may wait for the owner, but must never reuse its refresh credential.
      for (let attempt = 0; attempt < 30; attempt++) {
        const claimed = await this.run(h, async (tx) => {
          const { row, session } = await read(tx);
          if (session.refresh_uncertain)
            throw new VaultError(
              503,
              "browser_login_reauthentication_required",
            );
          if (session.refresh_owner) return { waiting: true as const };
          if (session.expires_at * 1000 >= Date.now() + 60_000)
            return {
              token: {
                access_token: session.access_token,
                expires_at: session.expires_at,
                user_id: row.user_id,
              },
            };
          session.refresh_owner = owner;
          await tx.execute(
            sql`update kortix.browser_login_slots set credential=${codec.seal(JSON.stringify(session), binding(h, slot, row.user_id))} where handle_hash=${h} and slot=${slot} and revision=${row.revision} and removed_at is null`,
          );
          return { refresh: true as const };
        });
        if ("token" in claimed) return claimed.token;
        if ("waiting" in claimed) {
          await new Promise((resolve) => setTimeout(resolve, 25));
          continue;
        }
        const result = await this.run(h, async (tx) => {
          const { row, session } = await read(tx);
          if (session.refresh_owner !== owner)
            throw new VaultError(503, "browser_login_unavailable");
          const upstream = await gotrue("/token", {
            body: { refresh_token: session.refresh_token },
            query: { grant_type: "refresh_token" },
          });
          const next = upstream.ok ? sessionFrom(upstream.body) : null;
          const saved = next ?? { ...session, refresh_uncertain: true };
          await tx.execute(
            sql`update kortix.browser_login_slots set credential=${codec.seal(JSON.stringify(saved), binding(h, slot, row.user_id))},expires_at=to_timestamp(${saved.expires_at}),revision=revision+1 where handle_hash=${h} and slot=${slot} and revision=${row.revision} and removed_at is null`,
          );
          if (!next) return { unavailable: true as const };
          return {
            token: {
              access_token: next.access_token,
              expires_at: next.expires_at,
              user_id: row.user_id,
            },
          };
        });
        if ("token" in result) return result.token;
        throw new VaultError(503, "browser_login_reauthentication_required");
      }
      throw new VaultError(503, "browser_login_refresh_pending");
    },
  };
}
