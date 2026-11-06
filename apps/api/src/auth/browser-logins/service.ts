import { sql } from "drizzle-orm";
import { db } from "../../shared/db";
import { config } from "../../config";
import { gotrue } from "../gotrue";
import { revokeLocalSession } from "../revoke-session";
import { createBrowserHandle } from "./credentials";
import { browserLoginConfig } from "./config";
import { createVault, VaultError } from "./store";
export const settings = browserLoginConfig(config);
export const vault = settings.codec ? createVault(settings.codec) : null;
export async function removeBrowserLogin(
  h: string,
  slot?: string,
  attempt?: string,
) {
  const credentials = await vault!.run(
    h,
    async (tx) => {
      if (attempt) {
        // Candidate retention is required until local-session revocation succeeds.
        const rows = await tx.execute(
          sql`update kortix.browser_login_attempts set consumed=true,expires_at=least(expires_at,now()) where handle_hash=${h} and attempt=${attempt} returning *`,
        );
        return rows.map((r: any) => ({ kind: "attempt", ...r }));
      }
      const rows = await tx.execute(
        sql`update kortix.browser_login_slots set removed_at=coalesce(removed_at,now()),revoke_pending=true,revision=revision+1 where handle_hash=${h} and (${slot ?? null}::text is null or slot=${slot ?? null}) returning *`,
      );
      if (slot && !rows.length)
        throw new VaultError(404, "browser_login_slot_unavailable");
      return rows.map((r: any) => ({ kind: "slot", ...r }));
    },
    true,
  );
  return vault!.run(
    h,
    async () => {
      let pending = false;
      for (const row of credentials) {
        const encrypted =
          row.kind === "attempt" ? row.candidate : row.credential;
        if (encrypted) {
          let session = JSON.parse(
            settings.codec!.open(encrypted, {
              handleHash: h,
              slot: row.slot ?? row.attempt,
              userId: row.user_id,
            }),
          );
          const live = await db.execute(
            sql`select id from auth.sessions where id=${row.session_id}::uuid and user_id=${row.user_id}::uuid`,
          );
          if (
            live.length &&
            session.expires_at * 1000 < Date.now() &&
            (session.refresh_uncertain || session.refresh_owner)
          ) {
            pending = true;
            continue;
          }
          if (live.length && session.expires_at * 1000 < Date.now()) {
            // Revocation also owns refresh durably before sending the rotating credential.
            session.refresh_owner = createBrowserHandle();
            const owned = settings.codec!.seal(JSON.stringify(session), {
              handleHash: h,
              slot: row.slot ?? row.attempt,
              userId: row.user_id,
            });
            if (row.kind === "slot")
              await db.execute(
                sql`update kortix.browser_login_slots set credential=${owned} where handle_hash=${h} and slot=${row.slot}`,
              );
            else
              await db.execute(
                sql`update kortix.browser_login_attempts set candidate=${owned} where handle_hash=${h} and attempt=${row.attempt}`,
              );
            const refreshed = await gotrue("/token", {
              body: { refresh_token: session.refresh_token },
              query: { grant_type: "refresh_token" },
            });
            if (!refreshed.ok) {
              pending = true;
              continue;
            }
            session = refreshed.body;
            const next = settings.codec!.seal(JSON.stringify(session), {
              handleHash: h,
              slot: row.slot ?? row.attempt,
              userId: row.user_id,
            });
            if (row.kind === "slot")
              await db.execute(
                sql`update kortix.browser_login_slots set credential=${next} where handle_hash=${h} and slot=${row.slot} and removed_at is not null`,
              );
            else
              await db.execute(
                sql`update kortix.browser_login_attempts set candidate=${next} where handle_hash=${h} and attempt=${row.attempt}`,
              );
          }
          const result = live.length
            ? await revokeLocalSession(
                session.access_token,
                row.user_id,
                row.session_id,
              )
            : { ok: true };
          if (!result.ok) {
            pending = true;
            continue;
          }
        }
        if (row.kind === "attempt")
          await db.execute(
            sql`delete from kortix.browser_login_attempts where handle_hash=${h} and attempt=${row.attempt}`,
          );
        else
          await db.execute(
            sql`update kortix.browser_login_slots set revoke_pending=false where handle_hash=${h} and slot=${row.slot}`,
          );
      }
      return { removed: true, revocation_pending: pending };
    },
    true,
  );
}
/** Leader-owned bounded retention pass. Failed revocations retain encrypted credentials. */
export async function sweepBrowserLogins() {
  if (!vault) return;
  const attempts = await db.execute(
    sql`select handle_hash,attempt from kortix.browser_login_attempts where expires_at<=now() and revoke_after<=now() and revoke_attempts<12 order by revoke_after,handle_hash,attempt limit 10`,
  );
  for (const row of attempts) {
    // Commit scheduling before I/O. A crash cannot immediately select the same poison row.
    await db.execute(
      sql`update kortix.browser_login_attempts set revoke_attempts=revoke_attempts+1,revoke_after=now()+least(interval '1 hour',interval '30 seconds'*power(2,least(revoke_attempts,7))) where handle_hash=${row.handle_hash} and attempt=${row.attempt}`,
    );
    try {
      await removeBrowserLogin(
        String(row.handle_hash),
        undefined,
        String(row.attempt),
      );
    } catch {
      /* Retain the encrypted row and its durable retry schedule. */
    }
  }
  const slots = await db.execute(
    sql`select s.handle_hash,s.slot from kortix.browser_login_slots s join kortix.browser_login_handles h using(handle_hash) where s.revoke_after<=now() and s.revoke_attempts<12 and (s.revoke_pending or (s.removed_at is null and (h.idle_expires_at<=now() or h.absolute_expires_at<=now()))) order by s.revoke_after,s.handle_hash,s.slot limit 10`,
  );
  for (const row of slots) {
    await db.execute(
      sql`update kortix.browser_login_slots set revoke_attempts=revoke_attempts+1,revoke_after=now()+least(interval '1 hour',interval '30 seconds'*power(2,least(revoke_attempts,7))) where handle_hash=${row.handle_hash} and slot=${row.slot}`,
    );
    try {
      await removeBrowserLogin(String(row.handle_hash), String(row.slot));
    } catch {
      /* Retain the encrypted row and its durable retry schedule. */
    }
  }
  await db.execute(
    sql`delete from kortix.browser_login_slots where (handle_hash,slot) in (select handle_hash,slot from kortix.browser_login_slots where removed_at<now()-interval '1 day' and not revoke_pending limit 100)`,
  );
  await db.execute(
    sql`delete from kortix.browser_login_handles where handle_hash in (select h.handle_hash from kortix.browser_login_handles h where (h.idle_expires_at<=now() or h.absolute_expires_at<=now()) and not exists(select 1 from kortix.browser_login_slots s where s.handle_hash=h.handle_hash) and not exists(select 1 from kortix.browser_login_attempts a where a.handle_hash=h.handle_hash) limit 100)`,
  );
}

export async function checkEmailAttempt(h: string, a: string) {
  await vault!.run(h, async (tx) => {
    const rows = await tx.execute(
      sql`select attempt from kortix.browser_login_attempts where handle_hash=${h} and attempt=${a} and method='email' and not consumed and expires_at>now()`,
    );
    if (!rows.length)
      throw new VaultError(409, "browser_login_attempt_unavailable");
  });
}
export async function cancelAllCandidates(h: string) {
  const rows = await db.execute(
    sql`select attempt from kortix.browser_login_attempts where handle_hash=${h}`,
  );
  for (const row of rows)
    await removeBrowserLogin(h, undefined, String(row.attempt));
}
