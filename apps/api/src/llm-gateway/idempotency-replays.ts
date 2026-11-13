import { gatewayIdempotencyReplays } from '@kortix/db';
import { eq, gt, lt, and } from 'drizzle-orm';
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

/** First writer wins: a retry that raced the first answer keeps the answer clients already saw. */
export async function putReplay(key: string, answer: ReplayAnswer, now = new Date()): Promise<void> {
  // An expired row blocks the same key's insert (primary key), so drop it first.
  await db.delete(gatewayIdempotencyReplays).where(lt(gatewayIdempotencyReplays.expiresAt, now));
  await db
    .insert(gatewayIdempotencyReplays)
    .values({ keyHash: key, ...answer, expiresAt: new Date(now.getTime() + TTL_MS) })
    .onConflictDoNothing();
}
