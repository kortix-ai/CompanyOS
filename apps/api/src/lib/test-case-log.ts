/**
 * Per-case evidence for the flow runner, on the local test stack only.
 *
 * The runner sends `x-kortix-test-case: <runId>/<flowId>/<attempt>/<step>` on
 * every request (`@kortix/api-contract/test-case`). When the API runs with
 * `KORTIX_LOCAL_TEST_PROFILE=1` and `KORTIX_TEST_LOG_DIR`, the request-context
 * middleware stores the case id, and the logger, the SQL hook and the request
 * line append JSONL to `<dir>/<runId>/case-logs/<flowId>.<attempt>.<step>.jsonl`.
 * The run's report links each failed step to that file.
 *
 * Off (the default everywhere else): `enableTestCaseLog` is never called, the
 * middleware never reads the header, and every append returns on its first
 * comparison. No file is opened and no request field is set.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TEST_CASE_HEADER, parseTestCaseId, testCaseLogPath } from '@kortix/api-contract/test-case';
import { getRequestContext } from './request-context';

export { TEST_CASE_HEADER };

/** The request-context field that holds the case id. */
export const TEST_CASE_CONTEXT_FIELD = 'testCase';

let root: string | null = null;
// replica-local: directories this process already created; a cache of mkdir calls, no shared state.
const createdDirs = new Set<string>();

/** Turn the case log on for this process. Called once at boot by the HTTP middleware. */
export function enableTestCaseLog(dir: string): void {
  root = dir;
}

/** Turn it off again (tests). */
export function disableTestCaseLog(): void {
  root = null;
  createdDirs.clear();
}

export function testCaseLogEnabled(): boolean {
  return root !== null;
}

/** The validated case id of a header value, or undefined. Never reads anything when off. */
export function testCaseFromHeader(value: string | undefined): string | undefined {
  if (root === null || !value) return undefined;
  return parseTestCaseId(value) ? value : undefined;
}

/** Append one JSON line to a case's log. Never throws: evidence must not change the request. */
export function appendTestCaseLog(caseId: string | undefined, entry: Record<string, unknown>): void {
  if (root === null || !caseId) return;
  const file = testCaseLogPath(root, caseId);
  if (!file) return;
  try {
    const dir = dirname(file);
    if (!createdDirs.has(dir)) {
      mkdirSync(dir, { recursive: true });
      createdDirs.add(dir);
    }
    appendFileSync(file, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch {
    /* a full disk or a removed directory loses evidence, never a request */
  }
}

/** Append to the log of the case the current request belongs to. */
export function appendCurrentTestCaseLog(entry: Record<string, unknown>): void {
  if (root === null) return;
  appendTestCaseLog(getRequestContext()?.[TEST_CASE_CONTEXT_FIELD], entry);
}
