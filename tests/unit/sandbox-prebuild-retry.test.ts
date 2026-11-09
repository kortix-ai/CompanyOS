import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isKe2eRetryableError,
  isTypedRetryableApiDegradation,
  Res,
  transientBreaker,
} from '../src/core/client';
import {
  postSessionWithRetry,
  SANDBOX_PREBUILD_CREATE_ATTEMPTS,
} from '../src/core/sandbox-prebuild';
import type { Captured } from '../src/core/result';

function capturedJson(
  status: number,
  headers: Record<string, string>,
  json: unknown,
): Res {
  const captured: Captured = {
    routeTemplate: 'POST /v1/test',
    req: { method: 'POST', url: 'https://example.test/v1/test', headers: {} },
    res: {
      status,
      headers,
      bodyText: JSON.stringify(json),
      json,
    },
    ms: 1,
  };
  return new Res(captured);
}

function postSessions(client: { post: unknown }): Client {
  return { post: client.post } as unknown as Client;
}

beforeEach(() => {
  transientBreaker.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// .status() marks the API's own typed pre-commit degradation retryable.
// ---------------------------------------------------------------------------

describe('typed retryable api degradation (Res.status)', () => {
  it('marks a git_mirror_unavailable 503 retryable', () => {
    const response = capturedJson(503, { 'x-request-id': 'req-1', 'retry-after': '10' }, {
      error: true,
      code: 'git_mirror_unavailable',
      message: 'git mirror is temporarily unavailable',
      status: 503,
    });

    let error: unknown;
    try {
      response.status(201);
    } catch (caught) {
      error = caught;
    }

    expect(isKe2eRetryableError(error)).toBe(true);
    expect((error as Error & { ke2eRetryAfterMs?: number }).ke2eRetryAfterMs).toBe(10_000);
    expect((error as Error).message).toContain('git_mirror_unavailable');
  });

  it('marks a retry:true 5xx (deploy in progress) retryable', () => {
    const response = capturedJson(503, { 'x-request-id': 'req-2', 'retry-after': '30' }, {
      error: 'An update is in progress. Try again in a moment.',
      code: 'deploy_in_progress',
      retry: true,
    });

    let error: unknown;
    try {
      response.status(201);
    } catch (caught) {
      error = caught;
    }

    expect(isKe2eRetryableError(error)).toBe(true);
    expect((error as Error & { ke2eRetryAfterMs?: number }).ke2eRetryAfterMs).toBe(30_000);
  });

  it('does not mark an unrelated 5xx body retryable', () => {
    const response = capturedJson(500, { 'x-request-id': 'req-3' }, {
      error: 'Failed to create session',
      code: 'SESSION_CREATE_FAILED',
    });

    let error: unknown;
    try {
      response.status(201);
    } catch (caught) {
      error = caught;
    }

    expect(isKe2eRetryableError(error)).toBe(false);
  });

  it('exactly recognizes the degradation in isTypedRetryableApiDegradation', () => {
    const mirror = capturedJson(503, {}, { code: 'git_mirror_unavailable' });
    const retryFlag = capturedJson(502, {}, { retry: true });
    const other = capturedJson(500, {}, { code: 'SESSION_CREATE_FAILED' });
    const ok = capturedJson(201, {}, { session_id: 's1' });

    expect(isTypedRetryableApiDegradation(mirror)).toBe(true);
    expect(isTypedRetryableApiDegradation(retryFlag)).toBe(true);
    expect(isTypedRetryableApiDegradation(other)).toBe(false);
    expect(isTypedRetryableApiDegradation(ok)).toBe(false);
  });

  it("keeps a status(201) pass a pass", () => {
    const response = capturedJson(201, {}, { session_id: 's1' });
    expect(response.status(201)).toBe(response);
  });
});

// ---------------------------------------------------------------------------
// The sandbox pre-build's bounded create retry.
// ---------------------------------------------------------------------------

describe('sandbox pre-build create retry', () => {
  it('retries a marked git_mirror_unavailable 503 and returns the 201', async () => {
    vi.useFakeTimers();
    const retryable = new Error(
      "typed retryable api degradation 503; expected [201] body=git_mirror_unavailable: git mirror is temporarily unavailable",
    );
    (retryable as { ke2eRetryable?: boolean }).ke2eRetryable = true;
    (retryable as { ke2eRetryAfterMs?: number }).ke2eRetryAfterMs = 1;
    const post = vi
      .fn()
      .mockRejectedValueOnce(retryable)
      .mockResolvedValueOnce(capturedJson(201, {}, { session_id: 's1' }));

    const promise = postSessionWithRetry(postSessions({ post }), { id: 'p1' });
    const settled = promise.catch((err) => err);
    await vi.runAllTimersAsync();
    const value = await settled;

    expect(value).toBeTruthy();
    expect((value as Res).statusCode).toBe(201);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt budget and throws the last marked error', async () => {
    vi.useFakeTimers();
    const post = vi.fn().mockResolvedValue(
      capturedJson(503, { 'x-request-id': 'req-4', 'retry-after': '0' }, {
        error: true,
        code: 'git_mirror_unavailable',
        message: 'git mirror is temporarily unavailable',
        status: 503,
      }),
    );

    const promise = postSessionWithRetry(postSessions({ post }), { id: 'p1' });
    const settled = promise.catch((err) => err as Error);
    await vi.runAllTimersAsync();
    const error = await settled;

    expect(post).toHaveBeenCalledTimes(SANDBOX_PREBUILD_CREATE_ATTEMPTS);
    expect(isKe2eRetryableError(error)).toBe(true);
    expect((error as Error).message).toContain('git_mirror_unavailable');
  });

  it('does not retry an unmarked contract failure', async () => {
    const post = vi.fn().mockResolvedValue(
      capturedJson(402, { 'x-request-id': 'req-5' }, { error: 'Insufficient credits' }),
    );

    await expect(
      postSessionWithRetry(postSessions({ post }), { id: 'p1' }),
    ).rejects.toThrow('expected [201]');
    expect(post).toHaveBeenCalledTimes(1);
  });
});
