import { and, eq, sql } from "drizzle-orm";
import { accountSessionActivity } from "@kortix/db";
import { db } from "../shared/db";
import { gotrue } from "./gotrue";
/** Revoke exactly one GoTrue session, then record the local session gate receipt. */
export async function revokeLocalSession(
  token: string | undefined,
  userId: string,
  sessionId: string | undefined,
) {
  if (token) {
    const result = await gotrue("/logout", {
      method: "POST",
      bearer: token,
      body: {},
      query: { scope: "local" },
    });
    if (!result.ok) return { ok: false, count: 0 };
  }
  if (!sessionId) return { ok: true, count: 0 };
  const rows = await db
    .update(accountSessionActivity)
    .set({
      revokedAt: sql`COALESCE(${accountSessionActivity.revokedAt}, now())`,
      revokedReason: sql`COALESCE(${accountSessionActivity.revokedReason}, 'user_action')`,
      revokedBy: userId,
    })
    .where(
      and(
        eq(accountSessionActivity.userId, userId),
        eq(accountSessionActivity.sessionId, sessionId),
      ),
    )
    .returning({ accountId: accountSessionActivity.accountId });
  return { ok: true, count: rows.length };
}
