/**
 * Run one registered flow: per-step capture, the case id every request
 * carries, infra-only retry, timeout, the proof rule for a pass, and
 * guaranteed teardown. Free of Bun-only imports, so the runner unit tests run
 * a real flow in process (unit/flow-evidence.test.ts).
 */
import { formatTestCaseId } from "@kortix/api-contract/test-case";
import { Client, ke2eRetryDelayMs } from "./client";
import { withRecorder, withTestCase, type StepRecorder } from "./context";
import type { Env } from "./env";
import { AssertionError } from "./expect";
import {
  attemptsFor,
  classifyFlowError,
  maxAttemptBound,
  readAttemptPolicy,
  resolveFlowTimeoutMs,
  withFlowDeadline,
  type RegisteredFlow,
} from "./flow";
import { log } from "./log";
import { redactSensitiveLogText } from "./progress";
import {
  unprovenPassReason,
  type Assertion,
  type Captured,
  type FlowResult,
  type StepResult,
  type Status,
} from "./result";
import type { FlowContext } from "./types";
import type { World } from "../fixtures/world";

/** The slice of the world one flow attempt uses. */
export type FlowWorld = Pick<World, "principals" | "newStack" | "makeFixtures">;

class StepCollector implements StepRecorder {
  requests: Captured[] = [];
  assertions: Assertion[] = [];
  pushRequest(c: Captured) {
    this.requests.push(c);
  }
  pushAssertion(a: Assertion) {
    this.assertions.push(a);
  }
}

class SkipSignal extends Error {
  constructor(public reason: string) {
    super(reason);
  }
}

interface AttemptScope {
  runId: string;
  flowId: string;
  attempt: number;
}

const caseIdOf = (scope: AttemptScope, step: number) =>
  formatTestCaseId({ runId: scope.runId, flowId: scope.flowId, attempt: scope.attempt, step });

/**
 * The attempt-scoped context a flow runs against: a fresh client, the run's
 * principals, and fixture factories bound to this attempt's stack, names and
 * abort signal.
 */
function mkFlowContext(
  env: Env,
  world: FlowWorld,
  stack: ReturnType<World["newStack"]>,
  steps: StepResult[],
  scope: AttemptScope,
  signal: AbortSignal,
): FlowContext {
  let stepIndex = 0;
  return {
    // Every flow's client retries gateway-generated transient 502/503/504
    // (incl. the Cloudflare worker's MAINTENANCE_MODE laundering of an
    // overloaded staging origin — see accounts.flow.ts and
    // isKe2eTransientGatewayResponse). This is SAFE because that classifier
    // requires the response to carry NO x-request-id; a genuine app 5xx does
    // carry one and is never retried. Retrying at the request layer (not just
    // on .status() gates) also self-heals body-only assertions that would
    // otherwise surface the laundered 503 as a hard AssertionError.
    client: new Client(env.apiUrl).withTransientGatewayRetries(
      Number(process.env.KE2E_GATEWAY_RETRIES ?? 3),
    ),
    P: world.principals,
    env,
    track: (kind, id, meta) => stack.push(kind, id, meta),
    skip: (reason) => {
      throw new SkipSignal(reason);
    },
    // Attempt-scoped: a retry must not re-derive the SAME names its failed
    // predecessor already committed (see world.ts attemptSuffix).
    fixtures: world.makeFixtures(stack, scope.attempt, signal),
    step: async (name, fn) => {
      const collector = new StepCollector();
      const caseId = caseIdOf(scope, ++stepIndex);
      const start = performance.now();
      try {
        const out = await withTestCase(caseId, () => withRecorder(collector, fn));
        steps.push(stepResult(name, "pass", start, collector, caseId));
        return out;
      } catch (err) {
        // A ctx.skip() fired inside this step: the step did not FAIL — it
        // asserted what it could (its passing assertions are recorded) and
        // then declared the rest unreachable on this target. Recording it
        // as "fail" made every one-step assert-then-skip flow (CHN-6) count
        // as an unasserted skip under --require-all (run 32344222963
        // shard 1: 34/35 passed, 0 failed, exit 1).
        steps.push(
          stepResult(name, err instanceof SkipSignal ? "skip" : "fail", start, collector, caseId,
            err instanceof SkipSignal ? undefined : err),
        );
        throw err;
      }
    },
  };
}

export async function runOneFlow(
  f: RegisteredFlow,
  env: Env,
  world: FlowWorld,
  runId: string,
): Promise<FlowResult> {
  const steps: StepResult[] = [];
  const flowStart = performance.now();
  // Retries are budgeted PER ERROR CLASS (see flow.ts):
  //   assertion / unmarked   → 1 attempt, never retried
  //   flow-level timeout     → KE2E_TIMEOUT_ATTEMPTS, default 1
  //   session-runtime ready  → KE2E_SESSION_RUNTIME_ATTEMPTS, default 2
  //   marked infra (network, laundered 503) → KE2E_FLOW_ATTEMPTS, default 3
  // A per-flow `meta.retry.attempts` overrides every class explicitly.
  const policy = readAttemptPolicy();
  const declaredAttempts = f.meta.retry?.attempts;
  const maxAttempts = declaredAttempts ?? maxAttemptBound(policy);

  // Capability gating → skip with reason.
  const missing = (f.meta.requires ?? []).filter((cap) => !env.capabilities[cap]);
  if (missing.length) {
    return mkResult(f, "skip", `missing capabilities: ${missing.join(", ")}`, [], performance.now() - flowStart, 0);
  }
  if (f.meta.todo) {
    return mkResult(f, "todo", f.meta.todo, [], performance.now() - flowStart, 0);
  }

  let attempt = 0;
  let lastError: unknown;
  let caseId: string | undefined;
  while (attempt < maxAttempts) {
    attempt++;
    steps.length = 0;
    const scope = { runId, flowId: f.id, attempt };
    caseId = caseIdOf(scope, 0);
    const stack = world.newStack();
    // Aborted when this attempt ends for any reason, so fixture work it left
    // behind (a queued or rate-limited provision) stops with it.
    const attemptController = new AbortController();
    const ctx = mkFlowContext(env, world, stack, steps, scope, attemptController.signal);

    try {
      await withFlowDeadline(
        withTestCase(caseId, () => f.fn(ctx)),
        resolveFlowTimeoutMs(f.meta.timeoutMs),
        f.id,
        attemptController,
      );
      attemptController.abort(new Error(`flow ${f.id} attempt ${attempt} finished`));
      await stack.teardown();
      const unproven = unprovenPassReason(steps);
      return mkResult(f, unproven ? "fail" : "pass", unproven ?? undefined, steps, performance.now() - flowStart, attempt, caseId);
    } catch (err) {
      if (!attemptController.signal.aborted) {
        attemptController.abort(new Error(`flow ${f.id} attempt ${attempt} failed`));
      }
      await stack.teardown();
      if (err instanceof SkipSignal) {
        return mkResult(f, "skip", err.reason, steps, performance.now() - flowStart, attempt, caseId);
      }
      lastError = err;
      // Never retry assertion failures — only infra signals, and each class
      // gets its own budget so a timeout can never triple the serial tail.
      const retryClass = classifyFlowError(err, err instanceof AssertionError);
      const allowed = declaredAttempts ?? attemptsFor(retryClass, policy);
      if (attempt >= allowed || attempt >= maxAttempts) break;
      log.warn(
        `retry ${f.id} (${retryClass}) after attempt ${attempt}/${allowed}: ` +
          `${redactSensitiveLogText((err as Error)?.message ?? String(err))}`,
      );
      await new Promise((resolve) => setTimeout(resolve, ke2eRetryDelayMs(err)));
    }
  }
  const reason = (lastError as Error)?.message ?? String(lastError);
  return mkResult(f, "fail", reason, steps, performance.now() - flowStart, attempt, caseId);
}

function stepResult(
  name: string,
  status: Status,
  start: number,
  c: StepCollector,
  caseId: string,
  err?: unknown,
): StepResult {
  return {
    name,
    status,
    durationMs: performance.now() - start,
    requests: c.requests,
    assertions: c.assertions,
    error: err ? { message: (err as Error)?.message ?? String(err), stack: (err as Error)?.stack } : undefined,
    caseId,
  };
}

function mkResult(
  f: RegisteredFlow,
  status: Status,
  reason: string | undefined,
  steps: StepResult[],
  durationMs: number,
  attempts: number,
  caseId?: string,
): FlowResult {
  return {
    id: f.id,
    domain: f.meta.domain,
    tags: f.meta.tags ?? [],
    status,
    reason,
    durationMs,
    attempts,
    steps: [...steps],
    // A skip that already PASSED at least one step asserted the reachable
    // contract on this target (see FlowResult.asserted / runExitCode).
    // Asserted = the flow proved SOMETHING before skipping: a fully passed
    // step, or at least one passing assertion inside the step the skip fired
    // from (the one-step assert-then-skip shape).
    asserted:
      status === "skip"
        ? steps.some((s) => s.status === "pass" || s.assertions.some((a) => a.pass))
        : undefined,
    caseId,
  };
}
