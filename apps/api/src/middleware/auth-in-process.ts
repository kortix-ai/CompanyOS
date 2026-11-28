/**
 * Auth for a request this process runs as a caller (`shared/in-process-caller.ts`):
 * the `kortix` connector's calls. The caller's token is loaded by id with the
 * checks a presented token gets, except the sandbox lease: the gateway checked
 * the live token when the call came in, and an approved held call runs after
 * the session's box may have stopped. The agent rule gate is not asked again:
 * the gateway decided the call's rules, holds and approvals.
 */
import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { validateAccountTokenByIdForHeldRun } from '../repositories/account-tokens';
import { inProcessCaller } from '../shared/in-process-caller';
import { patPrincipal } from './auth-principal';
import { enforceTokenProjectScope } from './auth-scope';

/** Authenticate an in-process request and run `next`. False for every HTTP request. */
export async function resolveInProcessCaller(c: Context, next: Next): Promise<boolean> {
  const caller = inProcessCaller(c);
  if (!caller) return false;
  const result = await validateAccountTokenByIdForHeldRun(caller.tokenId);
  if (!result.isValid || !result.userId) throw new HTTPException(401, { message: result.error || 'The caller token is no longer valid' });
  if (result.projectId) await enforceTokenProjectScope(c, result.projectId, { sessionBound: Boolean(result.sessionId) });
  patPrincipal(c, result);
  // A person approved this exact call: authorize lets its HUMAN_ONLY action through.
  if (caller.approvedExecutionId) c.set('approvedExecutionId', caller.approvedExecutionId);
  await next();
  return true;
}
