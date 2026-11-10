import { createHash } from 'node:crypto';

/**
 * Client `Idempotency-Key` replay for the inference edge (KRTX-4612).
 *
 * A client retrying an inference request — a network reset after the provider
 * answered, a double-fired submit — used to execute the provider again and
 * settle a second usage record: every HTTP request minted a fresh request id,
 * so metering had no memory of the first attempt. With a key, the edge now
 * materializes the first 2xx answer and serves it to every same-key retry:
 * one execution, one usage record, and the client sees one completion id.
 *
 * The key is scoped to the credential AND the exact body. A key reused with a
 * different body is a different operation: OpenAI and Stripe reject that case,
 * and replaying the first body's answer here would serve a wrong result —
 * executing fresh is the safer relaxation.
 *
 * Errors are never replayed: a retry after a 4xx/5xx must re-execute, and an
 * error settles no tokens (so it cannot double-meter). A caller that shares
 * another's failed execution gets the 503 envelope; the entry is forgotten,
 * so its own next retry executes fresh.
 *
 * ponytail: replica-local replay, same ceiling as route-memory — a retry that
 * lands on another gateway replica re-executes and re-meters (today's
 * behavior). Move the key to a shared store if cross-replica double-metering
 * is ever measured.
 */

/** A replayable answer: everything needed to rebuild the Response per caller. */
export interface ReplayedResponse {
  status: number;
  statusText: string;
  headers: [string, string][];
  body: string;
}

/** The fields of an inference request the replay reads; the edge passes its full request. */
export interface ReplayRequest {
  authorization: string | undefined;
  rawBody: string;
}

/** Longer than any realistic client retry window (OpenAI holds keys for 24 h). */
const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const MAX_CACHED_BYTES = 64 * 1024 * 1024;

interface ReplayEntry {
  expiresAt: number;
  /** Byte length of the cached body, accounted once the execution resolves. */
  bytes: number;
  result: Promise<ReplayedResponse>;
}

/** A Response body is single-use; the cached answer is not. Rebuild one per caller. */
function replayedResponse(answer: ReplayedResponse): Response {
  return new Response(answer.body, {
    status: answer.status,
    statusText: answer.statusText,
    headers: answer.headers,
  });
}

export function createIdempotencyReplay(now: () => number = Date.now) {
  const entries = new Map<string, ReplayEntry>();
  let cachedBytes = 0;

  const forget = (key: string, entry?: ReplayEntry): void => {
    const held = entries.get(key);
    // Only forget the entry the caller means: a slot may have been replaced
    // (expired and re-executed) between the call and the forget.
    if (!held || (entry !== undefined && held !== entry)) return;
    cachedBytes -= held.bytes;
    entries.delete(key);
  };

  // Map iteration is insertion order: the first key is the oldest entry.
  const evict = (): void => {
    while (entries.size > MAX_ENTRIES || cachedBytes > MAX_CACHED_BYTES) {
      const oldest = entries.keys().next();
      if (oldest.done) return;
      forget(oldest.value);
    }
  };

  return async <Req extends ReplayRequest>(
    idempotencyKey: string | undefined,
    request: Req,
    call: (request: Req) => Promise<Response>,
  ): Promise<Response> => {
    if (!idempotencyKey) return call(request);
    // A streaming request has no replayable answer: its retry re-executes.
    let streaming = false;
    try {
      streaming = (JSON.parse(request.rawBody) as { stream?: unknown } | null)?.stream === true;
    } catch {
      // The pipeline answers invalid JSON with a 400; nothing to replay either way.
    }
    if (streaming) return call(request);

    const key = createHash('sha256')
      .update(`${request.authorization ?? ''}\u0000${idempotencyKey}\u0000`)
      .update(request.rawBody)
      .digest('hex');
    const hit = entries.get(key);
    if (hit && hit.expiresAt > now()) return replayedResponse(await hit.result);
    forget(key);

    const result = (async (): Promise<ReplayedResponse> => {
      const res = await call(request);
      return {
        status: res.status,
        statusText: res.statusText,
        headers: [...res.headers],
        body: await res.text(),
      };
    })();
    const entry: ReplayEntry = { expiresAt: now() + TTL_MS, bytes: 0, result };
    entries.set(key, entry);
    result.then(
      (answer) => {
        if (entries.get(key) !== entry) return;
        const isOk = answer.status >= 200 && answer.status < 300;
        if (!isOk) {
          forget(key, entry); // an error stays retryable
          return;
        }
        entry.bytes = Buffer.byteLength(answer.body);
        cachedBytes += entry.bytes;
        evict();
      },
      () => forget(key, entry), // a failed execution is retryable
    );
    return replayedResponse(await result);
  };
}
