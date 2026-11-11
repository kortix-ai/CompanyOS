/**
 * The runner: discover flows, build the world (principals + fixtures), schedule
 * across lanes (isolated-parallel / serial / global-serial), run each flow with
 * per-step capture, infra-only retry, timeout, and guaranteed teardown.
 */
import { Glob } from "bun";
import { resolve } from "node:path";
import { Client } from "./client";
import { allFlows, clearRegistry, type RegisteredFlow } from "./flow";
import { runOneFlow } from "./flow-exec";
import { loadEnv } from "./env";
import { waitFor } from "./poll";
import { log } from "./log";
import { formatFlowProgress, redactSensitiveLogText } from "./progress";
import { partitionParallelFlows, runScheduled, type ConcurrentLane } from "./lanes";
import { planLocalFlows } from "./local-profile";
import { isKe2eRetryableError } from "./client";
import { reconcileExecuted, summarize, type FlowResult, type RunResult } from "./result";
import { selectFlows } from "./selection";
import { runTargetKind, targetCounts, targetSkipReason } from "./targets";
import { buildWorld } from "../fixtures/world";
import { postSessionWithRetry } from "./sandbox-prebuild";

export interface RunOptions {
  profile?: "all" | "local";
  ids?: string[];
  domains?: string[];
  tags?: string[];
  grep?: string;
  workers?: number;
  /** API-only lane concurrency. Used only when workers is not set. */
  apiWorkers?: number;
  /** Live sandbox lane concurrency. Used only when workers is not set. */
  sandboxWorkers?: number;
  /** Read-mostly subset for prod smoke. */
  smoke?: boolean;
  runId: string;
  gitSha?: string | null;
}

const FLOWS_DIR = resolve(import.meta.dir, "../flows");

// Idempotent on purpose. `flow(...)` registers at module-evaluation time and
// ES module imports are cached per process, so a SECOND discoverFlows() that
// clears the registry and re-imports gets nothing back — the flow files never
// re-execute — and the registry ends up empty. That is exactly what happened
// on the first sharded release-gate run: `--shard` resolves its ids via
// discoverFlows(), then runSuite() discovered again → "no flows matched the
// selected filters" on every API shard (run 32222342409). Discover once.
let discovered = false;
export async function discoverFlows(): Promise<void> {
  if (discovered) return;
  clearRegistry();
  const glob = new Glob("*.flow.ts");
  const files: string[] = [];
  for await (const f of glob.scan({ cwd: FLOWS_DIR, absolute: true })) files.push(f);
  files.sort();
  for (const f of files) await import(f);
  discovered = true;
}

function positiveWorkerCount(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

export async function runSuite(opts: RunOptions): Promise<RunResult> {
  const env = loadEnv();
  await discoverFlows();
  // Exact: an unknown id, domain or tag, or a named id the other filters drop,
  // throws a SelectionError naming it (src/core/selection.ts).
  const candidates = selectFlows(allFlows(), opts);
  const targetKind = runTargetKind(opts.profile);
  const localPlan = opts.profile === "local" ? planLocalFlows(candidates) : null;
  // A flow that declares `targets[kind] = { skip }` is not applicable on this
  // target: never scheduled, listed with its reason. The local plan already
  // applied the local declarations.
  const targetExcluded = localPlan
    ? []
    : candidates.flatMap((f) => {
        const reason = targetSkipReason(f.meta, targetKind);
        return reason ? [{ id: f.id, reason: `targets.${targetKind}: ${reason}` }] : [];
      });
  const excludedIds = new Set(targetExcluded.map((f) => f.id));
  const flows = localPlan?.runnable ?? candidates.filter((f) => !excludedIds.has(f.id));
  const excludedFlows = localPlan?.excluded ?? targetExcluded;
  if (flows.length === 0) {
    const excluded = excludedFlows.map((flow) => `${flow.id} (${flow.reason})`).join(", ");
    throw new Error(
      excluded
        ? `no ${targetKind} flows selected; excluded: ${excluded}`
        : "no flows matched the selected filters",
    );
  }
  const perTarget = targetCounts(candidates);
  log.info(
    `target ${targetKind}: ${flows.length}/${candidates.length} scheduled · ` +
      `${excludedFlows.length} excluded with a reason`,
  );
  log.info(
    "targets declared: " +
      Object.entries(perTarget)
        .map(([kind, c]) => `${kind} ${c.declared} applicable / ${c.skipped.length} skip`)
        .join(" · "),
  );
  const startedAt = new Date().toISOString();
  const start = performance.now();

  const world = await buildWorld(env, flows);

  try {
    // Cold provider images can take longer than a flow's runtime deadline. Build
    // one through the real session route before measuring concurrent user flows.
    if (env.capabilities.sandbox && flows.some((f) =>
      f.meta.requires?.includes('sandbox') && f.meta.requires.includes('funded'))) {
      const stack = world.newStack();
      try {
        const fixtures = world.makeFixtures(stack);
        const project = await fixtures.sharedSeededProject();
        const client = new Client(env.apiUrl).as(world.principals.OWNER);
        // The create honors the API's own typed PRE-COMMIT degradations as
        // retryable — `git_mirror_unavailable` (cold-clone/fetch race) and
        // `retry: true` (deploy in progress). .status() marks both, but this
        // pre-build is NOT a flow, so it owns its own retry; only those
        // proven-pre-commit responses are re-sent (ambiguous marked errors —
        // a laundered synthetic 503 or a network failure that may have
        // committed — are never replayed, the POST replay-safety contract).
        // Without a retry here one transient mirror blip on a cold deploy
        // red-gates the release (run 42666114535 attempt 3: 503
        // GitOperationError at 17:54:38, thirty seconds after the provision
        // returned 201).
        const created = await postSessionWithRetry(client, project);
        const sessionId = created.json<{ session_id: string }>().session_id;
        if (!sessionId) throw new Error('sandbox setup returned no session_id');
        stack.push('session', sessionId, { projectId: project.id });
        // TWO SEQUENTIAL PHASES, TWO INDEPENDENT BUDGETS.
        //
        // These waits used to share one `setupDeadline = Date.now() + 900_000`
        // while the FIRST was itself allowed `timeoutMs: 900_000`. So a cold
        // image build that legitimately took most of its 15 minutes left the
        // second wait `Math.max(1, setupDeadline - Date.now())` === 1 ms, and
        // it "timed out" instantly on a runtime that was never given a chance
        // to boot.
        //
        // That is exactly how every API shard of the release gate died on
        // v0.13.21, v0.13.22, v0.13.23 and v0.13.24: the log shows phase one
        // starting, no image-readiness error, the "…image and runtime ready"
        // line never printed, and `Timed out waiting for sandbox fixture
        // readiness` at 942 s — 900 s of image build plus overhead, then 1 ms
        // for the boot. The gate reported the product broken four releases
        // running while nothing about the product was wrong.
        //
        // Budget arithmetic against the API job's 30-minute cap
        // (`tests-release.yml`): 15 min image + 10 min runtime = 25 min worst
        // case, leaving 5 min for the `deployed` flows, which run in ~3 min.
        // Both phases are fast whenever the image is already baked, which is
        // the normal case; these ceilings only cover a cold deploy.
        const IMAGE_READY_TIMEOUT_MS = 900_000;
        const RUNTIME_READY_TIMEOUT_MS = 600_000;
        log.info('sandbox setup: waiting for the current default image (up to 15 minutes), then its runtime (up to 10 minutes)');
        // Session boot can use the previous ready image while the current one
        // builds. The preview gate must exercise this deploy's baked daemon.
        await waitFor(async () => {
          const snapshots = await client.get('/v1/projects/:projectId/snapshots',
            { params: { projectId: project.id } });
          snapshots.status(200);
          const template = snapshots.json<{ templates: Array<{
            is_default: boolean;
            ready: boolean;
            provider_coverage?: Array<{ launch_ready: boolean }>;
          }> }>().templates.find((template) => template.is_default);
          return template?.ready === true ||
            template?.provider_coverage?.some((provider) => provider.launch_ready === true) === true;
        }, { until: (ready) => ready, timeoutMs: IMAGE_READY_TIMEOUT_MS, intervalMs: 5000,
          // A transport error while staging bakes this deploy's image is not a
          // verdict on the image: keep polling inside the same deadline.
          retryOnError: isKe2eRetryableError,
          description: 'current default sandbox image readiness' });
        await waitFor(async () => {
          const ready = await client.post('/v1/projects/:projectId/sessions/:sessionId/start', {},
            { params: { projectId: project.id, sessionId }, query: { wait_ms: '8000' }, timeoutMs: 30_000 });
          ready.status(200);
          const body = ready.json<{ stage: string; retriable: boolean; message?: string }>();
          if (body.stage === 'error' && !body.retriable) throw new Error(JSON.stringify(body));
          return body.stage;
        }, { until: (stage) => stage === 'ready', timeoutMs: RUNTIME_READY_TIMEOUT_MS, intervalMs: 3000,
          // POST /start is idempotent. One timed-out call during the first boot
          // on a fresh image killed whole release shards; poll again instead.
          retryOnError: isKe2eRetryableError,
          description: 'sandbox fixture readiness' });
        log.info('sandbox setup: current default image and runtime ready');
      } finally {
        await stack.teardown();
      }
    }
    const parallelLane = flows.filter((f) => !f.meta.serial && !f.meta.global);
    const serialLane = flows.filter((f) => f.meta.serial && !f.meta.global);
    const globalLane = flows.filter((f) => f.meta.global);

    const out: FlowResult[] = [];
    let started = 0;
    let completed = 0;
    const runTrackedFlow = async (flow: RegisteredFlow): Promise<FlowResult> => {
      started += 1;
      log.step(`[${started}/${flows.length}] START ${flow.id}`);
      try {
        const result = await runOneFlow(flow, env, world, opts.runId);
        completed += 1;
        const progress = formatFlowProgress(result, completed, flows.length);
        if (result.status === "pass") log.pass(progress);
        else if (result.status === "fail") log.fail(progress);
        else log.skip(progress);
        return result;
      } catch (error) {
        completed += 1;
        log.fail(
          `[${completed}/${flows.length}] ERROR ${flow.id} — ` +
            `${redactSensitiveLogText((error as Error)?.message ?? String(error))}`,
        );
        throw error;
      }
    };
    let concurrent: ConcurrentLane[];
    if (opts.workers !== undefined) {
      const workers = positiveWorkerCount(opts.workers, 4);
      log.info(
        `lanes: ${parallelLane.length} parallel flows × ${workers} explicit workers · ` +
          `${serialLane.length} serial flows × 1 worker (overlapped)`,
      );
      concurrent = [{ flows: parallelLane, workers }];
    } else {
      const { apiLane, sandboxLane } = partitionParallelFlows(parallelLane);
      const apiWorkers = positiveWorkerCount(
        opts.apiWorkers ?? Number(process.env.KE2E_API_WORKERS),
        4,
      );
      const sandboxWorkers = positiveWorkerCount(
        opts.sandboxWorkers ?? Number(process.env.KE2E_SANDBOX_WORKERS),
        4,
      );
      log.info(
        `lanes: ${apiLane.length} API flows × ${apiWorkers} workers · ` +
          `${sandboxLane.length} sandbox flows × ${sandboxWorkers} workers · ` +
          `${serialLane.length} serial flows × 1 worker (overlapped) · ` +
          `${globalLane.length} global flows last`,
      );
      concurrent = [
        { flows: apiLane, workers: apiWorkers },
        { flows: sandboxLane, workers: sandboxWorkers },
      ];
    }
    const executed = await runScheduled(
      { concurrent, serial: serialLane, global: globalLane },
      runTrackedFlow,
    );
    // Proof that every scheduled flow ran exactly once: a missing or
    // duplicated result becomes a failed result, never a silent green.
    out.push(...reconcileExecuted(flows.map((f) => ({ id: f.id, domain: f.meta.domain, tags: f.meta.tags })), executed));
    const missing = flows.length - executed.length;
    if (missing !== 0) log.fail(`executed ${executed.length} of ${flows.length} scheduled flows`);

    out.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const durationMs = performance.now() - start;
    return {
      runId: opts.runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      apiUrl: env.apiUrl,
      target: env.target,
      gitSha: opts.gitSha ?? null,
      capabilities: env.capabilities as unknown as Record<string, boolean>,
      profile: opts.profile ?? "all",
      excludedFlows,
      targetKind,
      scheduled: flows.map((f) => f.id),
      targets: perTarget,
      fixtureStats: world.fixtureStats(),
      flows: out,
      summary: summarize(out, durationMs),
    };
  } finally {
    await world.teardownAll();
  }
}
