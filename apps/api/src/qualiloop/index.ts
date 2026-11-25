/**
 * `POST /v1/qualiloop/chat`: the endpoint QualiLoop tests the Kortix agent
 * through (QualiLoop's connect contract: `{prompt, metadata.session_id}` in,
 * `{reply}` out). Off (404) unless `QUALILOOP_AGENT_SECRET` and
 * `QUALILOOP_KORTIX_PROJECT_ID` are set; QualiLoop proves itself with the
 * secret in `X-Agent-Secret`.
 *
 * A turn can run for minutes (a sandbox boot, tool calls) and Cloudflare cuts a
 * response whose first byte takes over 100 s. The route answers 200 at once
 * and sends a space every 15 s until the JSON follows: leading whitespace is
 * valid JSON. A failed turn ends the body as `{"error": ...}`, with no `reply`.
 */
import { timingSafeEqual } from 'node:crypto';
import { z } from '@hono/zod-openapi';
import { config } from '../config';
import { logger } from '../lib/logger';
import { makeOpenApiApp } from '../openapi';
import { QualiloopTurnError, runQualiloopTurn } from '../projects/surface';

export const qualiloopApp = makeOpenApiApp();

const KEEPALIVE_MS = 15_000;

const ChatBody = z.object({
  prompt: z.string().min(1).max(100_000),
  metadata: z.object({
    session_id: z.string().min(1).max(200),
    turn_index: z.number().int().min(0).optional(),
  }).passthrough(),
});

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function registerQualiloopRoutes(): void {
  qualiloopApp.post('/chat', async (c) => {
    const secret = config.QUALILOOP_AGENT_SECRET;
    if (!secret || !config.QUALILOOP_KORTIX_PROJECT_ID) return c.json({ error: 'Not found' }, 404);
    if (!secretMatches(c.req.header('x-agent-secret') ?? '', secret)) return c.json({ error: 'Unauthorized' }, 401);
    const parsed = ChatBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Expected {prompt, metadata: {session_id}}' }, 400);
    const { prompt, metadata } = parsed.data;

    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const keepalive = setInterval(() => controller.enqueue(encoder.encode(' ')), KEEPALIVE_MS);
        let result: Record<string, string>;
        try {
          result = { reply: await runQualiloopTurn({ conversationId: metadata.session_id, turnIndex: metadata.turn_index ?? 0, prompt }) };
        } catch (error) {
          const message = error instanceof QualiloopTurnError ? error.message : 'The turn failed inside Kortix.';
          if (!(error instanceof QualiloopTurnError)) logger.error('[qualiloop] turn failed', { error: String(error) });
          result = { error: message };
        } finally {
          clearInterval(keepalive);
        }
        controller.enqueue(encoder.encode(JSON.stringify(result)));
        controller.close();
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  });
}
