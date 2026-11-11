/**
 * The per-case evidence contract between the flow runner (`tests/`) and the
 * API's local test profile.
 *
 * The runner sends `x-kortix-test-case: <runId>/<flowId>/<attempt>/<step>` on
 * every request. An API started with the local test profile and a case-log
 * directory appends its log lines, SQL statements and request lines for that
 * case to `<dir>/<runId>/case-logs/<flowId>.<attempt>.<step>.jsonl`. The run's
 * report links each failed step to that file. Any other API ignores the header.
 *
 * `step` is the 1-based step index inside the attempt; `0` is the flow body
 * outside any step (fixtures, setup).
 */

export const TEST_CASE_HEADER = 'x-kortix-test-case';

export interface TestCaseId {
  runId: string;
  flowId: string;
  attempt: number;
  step: number;
}

const SEGMENT = /^[A-Za-z0-9._-]{1,96}$/;

/** Replace every character outside `[A-Za-z0-9._-]` so a segment is safe in a header and a file name. */
export function sanitizeTestCaseSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96);
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? '_' : cleaned;
}

export function formatTestCaseId(id: TestCaseId): string {
  return [
    sanitizeTestCaseSegment(id.runId),
    sanitizeTestCaseSegment(id.flowId),
    String(Math.max(0, Math.trunc(id.attempt))),
    String(Math.max(0, Math.trunc(id.step))),
  ].join('/');
}

/** Parse a header value. Returns null for anything that is not exactly the four safe segments. */
export function parseTestCaseId(value: string | null | undefined): TestCaseId | null {
  if (!value || value.length > 320) return null;
  const parts = value.split('/');
  if (parts.length !== 4) return null;
  const [runId, flowId, attempt, step] = parts as [string, string, string, string];
  if (!SEGMENT.test(runId) || !SEGMENT.test(flowId)) return null;
  if (runId === '.' || runId === '..' || flowId === '.' || flowId === '..') return null;
  if (!/^\d{1,4}$/.test(attempt) || !/^\d{1,4}$/.test(step)) return null;
  return { runId, flowId, attempt: Number(attempt), step: Number(step) };
}

/** The case log path relative to the run's results directory (`<dir>/<runId>/`). */
export function testCaseLogFile(id: TestCaseId): string {
  return `case-logs/${id.flowId}.${id.attempt}.${id.step}.jsonl`;
}

/** The absolute case log path under a log root. Null when the header value is not a valid case id. */
export function testCaseLogPath(root: string, caseId: string): string | null {
  const id = parseTestCaseId(caseId);
  if (!id) return null;
  return `${root.replace(/\/+$/, '')}/${id.runId}/${testCaseLogFile(id)}`;
}
