import { gatewayIdempotencyReplays } from '@kortix/db';
import { eq, gt, and, count, sql } from 'drizzle-orm';
import { z } from '@hono/zod-openapi';
import { db } from '../shared/db';

/**
 * The gateway's Idempotency-Key replay, shared across its replicas (KRTX-4612).
 * `key` is the gateway's sha256 over credential + operation + client key + body.
 * The gateway keeps the same one-hour TTL for its own copy.
 */
const TTL_MS = 60 * 60 * 1000;
/** Matches the gateway's cap on what it shares, with room for header bytes. */
const MAX_BODY_CHARS = 2 * 1024 * 1024;

export const ReplayKeySchema = z.string().regex(/^[0-9a-f]{64}$/);
export const ReplayAnswerSchema = z.object({
  status: z.number().int().min(200).max(299),
  statusText: z.string().max(200),
  headers: z.array(z.tuple([z.string().max(200), z.string().max(8192)])).max(100),
  body: z.string().max(MAX_BODY_CHARS),
});
export type ReplayAnswer = z.infer<typeof ReplayAnswerSchema>;

export async function getReplay(key: string): Promise<ReplayAnswer | null> {
  const [row] = await db
    .select({
      status: gatewayIdempotencyReplays.status,
      statusText: gatewayIdempotencyReplays.statusText,
      headers: gatewayIdempotencyReplays.headers,
      body: gatewayIdempotencyReplays.body,
    })
    .from(gatewayIdempotencyReplays)
    .where(and(eq(gatewayIdempotencyReplays.keyHash, key), gt(gatewayIdempotencyReplays.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** Past this many live rows an answer stays replica-local: the table is shared by every tenant. */
const MAX_LIVE_ROWS = 10_000;
/** Expired rows reclaimed per write, so a backlog is swept over many writes, never in one statement. */
const SWEEP_ROWS = 200;

/** First writer wins: a retry that raced the first answer keeps the answer clients already saw. */
export async function putReplay(key: string, answer: ReplayAnswer, now = new Date()): Promise<void> {
  // An expired row of this very key blocks its insert (primary key), so it always goes;
  // the rest of the expired backlog goes in a bounded batch.
  await db.execute(sql`
    DELETE FROM ${gatewayIdempotencyReplays}
    WHERE (${gatewayIdempotencyReplays.keyHash} = ${key} AND ${gatewayIdempotencyReplays.expiresAt} < ${now.toISOString()})
       OR ctid IN (
         SELECT ctid FROM ${gatewayIdempotencyReplays}
         WHERE ${gatewayIdempotencyReplays.expiresAt} < ${now.toISOString()}
         LIMIT ${SWEEP_ROWS}
       )`);
  const [live] = await db
    .select({ n: count() })
    .from(gatewayIdempotencyReplays)
    .where(gt(gatewayIdempotencyReplays.expiresAt, now));
  if ((live?.n ?? 0) >= MAX_LIVE_ROWS) return;
  await db
    .insert(gatewayIdempotencyReplays)
    .values({ keyHash: key, ...answer, expiresAt: new Date(now.getTime() + TTL_MS) })
    .onConflictDoNothing();
}
