/**
 * Structured result model. A single results.json is the only artifact the
 * report viewer and the coverage gate consume — everything else derives from it.
 */

import type { TargetCount, TargetKind } from "./targets";

export type Status = "pass" | "fail" | "skip" | "todo";

export interface CapturedRequest {
  method: string;
  url: string;
  /** Redacted at capture time. */
  headers: Record<string, string>;
  body?: string;
}

export interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  /** Parsed JSON body if content was JSON, else undefined. */
  json?: unknown;
}

export interface Captured {
  /** Path template the client was given (normalized), for coverage aggregation. e.g. GET /v1/projects/:id */
  routeTemplate: string;
  req: CapturedRequest;
  res: CapturedResponse;
  ms: number;
}

export interface Assertion {
  kind: string;
  description: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
  /** Why it failed, for a response the assert can see: origin/edge classification
   *  and the body, so a deployed 5xx names its own cause instead of a bare status. */
  detail?: string;
}

export interface StepResult {
  name: string;
  status: Status;
  durationMs: number;
  requests: Captured[];
  assertions: Assertion[];
  error?: { message: string; stack?: string };
  /** The `x-kortix-test-case` id every request of this step carried (`<runId>/<flowId>/<attempt>/<step>`). */
  caseId?: string;
  /**
   * The API's case log for this step, relative to the results directory
   * (`case-logs/<flowId>.<attempt>.<step>.jsonl`). Set by `writeResults` only
   * when the file exists: an API without the local test profile writes none.
   */
  caseLog?: string;
}

export interface FlowResult {
  id: string;
  domain: string;
  tags: string[];
  status: Status;
  reason?: string;
  durationMs: number;
  attempts: number;
  steps: StepResult[];
  /**
   * A "skip" that first PASSED at least one step: the flow asserted the
   * contract that is reachable on this target and documented why the rest is
   * not (e.g. CHN-6 asserts the Slack install gate, then skips the dispatch
   * that needs a real workspace). Distinct from a skip that ran nothing.
   */
  asserted?: boolean;
  /** The case id of the flow body outside any step (step 0) on the last attempt. */
  caseId?: string;
  /** The API's case log for step 0, relative to the results directory, when it exists. */
  caseLog?: string;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  /** Skips that ran nothing — --require-all fails on these. */
  skippedUnasserted: number;
  durationMs: number;
}

export interface FixtureStats {
  databaseProjectCount: number;
  managedProjectCount: number;
}

export interface RunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  apiUrl: string;
  target: string;
  gitSha: string | null;
  capabilities: Record<string, boolean>;
  profile?: "all" | "local";
  excludedFlows?: Array<{ id: string; reason: string }>;
  /** The target kind this run ran against (`src/core/targets.ts`). */
  targetKind?: TargetKind;
  /**
   * Every flow id the scheduler was handed, in order. `runSuite` fails when
   * the executed ids differ from this list, so a green run proves every
   * scheduled flow actually ran.
   */
  scheduled?: string[];
  /** Per-target declarations over the selection: `declared` count and `skipped` with reasons. */
  targets?: Record<TargetKind, TargetCount>;
  /** Run-scoped project fixtures created before teardown starts. */
  fixtureStats: FixtureStats;
  flows: FlowResult[];
  summary: RunSummary;
}

/**
 * A pass must prove something. A flow that "passed" with zero steps, or with
 * steps that recorded zero assertions, ran no contract: a bare `return`
 * recorded a pass with zero steps and hid a connector OAuth regression on
 * every run without that provider (KRTX-2852). Returns the failure reason, or
 * null when the pass is proven. `.status()`, `.body()` and `assert()` record
 * assertions; a bare `throw` does not.
 */
export function unprovenPassReason(steps: Pick<StepResult, "assertions">[]): string | null {
  if (steps.length === 0) {
    return "passed with zero steps: the flow proved nothing (wrap the contract in ctx.step)";
  }
  const assertions = steps.reduce((n, s) => n + s.assertions.length, 0);
  if (assertions === 0) {
    return `passed ${steps.length} step(s) with zero recorded assertions: use .status(), .body() or assert() from core/expect (a bare throw records nothing)`;
  }
  return null;
}

/**
 * Prove that the run executed exactly the scheduled flows. A scheduled id with
 * no result, or an id with more than one result, becomes a failed result, so
 * the run cannot report green on a subset.
 */
export function reconcileExecuted(
  scheduled: Array<{ id: string; domain: string; tags?: string[] }>,
  results: FlowResult[],
): FlowResult[] {
  const seen = new Map<string, number>();
  for (const r of results) seen.set(r.id, (seen.get(r.id) ?? 0) + 1);
  const wanted = new Set(scheduled.map((f) => f.id));
  const out = results.map((r): FlowResult => {
    if (!wanted.has(r.id)) {
      return { ...r, status: "fail", reason: `executed but never scheduled: ${r.reason ?? r.status}` };
    }
    if ((seen.get(r.id) ?? 0) > 1) {
      return { ...r, status: "fail", reason: `executed ${seen.get(r.id)} times; scheduled once` };
    }
    return r;
  });
  for (const f of scheduled) {
    if (seen.has(f.id)) continue;
    out.push({
      id: f.id,
      domain: f.domain,
      tags: f.tags ?? [],
      status: "fail",
      reason: "scheduled but never executed: the runner returned no result for this flow",
      durationMs: 0,
      attempts: 0,
      steps: [],
    });
  }
  return out;
}

export function summarize(flows: FlowResult[], durationMs: number): RunSummary {
  return {
    total: flows.length,
    passed: flows.filter((f) => f.status === "pass").length,
    failed: flows.filter((f) => f.status === "fail").length,
    skipped: flows.filter((f) => f.status === "skip").length,
    todo: flows.filter((f) => f.status === "todo").length,
    skippedUnasserted: flows.filter(
      (f) => f.status === "skip" && !f.asserted,
    ).length,
    durationMs,
  };
}

/**
 * --require-all is an anti-shrinkage gate: a release run must exercise every
 * registered contract. It fails on `todo` (unimplemented contract) and on any
 * skip that RAN NOTHING (a capability missing on the release target is a
 * misconfigured target, not a pass). It accepts one documented outcome: a
 * skip that first passed ≥1 step (`asserted`) — the flow proved the contract
 * reachable on this target and named why the rest is not.
 */
export function runExitCode(
  summary: Pick<RunSummary, "failed" | "skipped" | "todo" | "skippedUnasserted">,
  requireAll = false,
): 0 | 1 {
  if (summary.failed > 0) return 1;
  if (requireAll && (summary.skippedUnasserted > 0 || summary.todo > 0)) return 1;
  return 0;
}
