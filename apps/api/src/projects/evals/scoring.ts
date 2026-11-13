/**
 * Harbor's scoring rules, as pure functions.
 *
 * REWARD: the verifier writes `/logs/verifier/reward.json` (named numbers) or
 * `/logs/verifier/reward.txt` (one number). JSON wins when both exist.
 *
 * ERROR POLICY: each exception type has three independent flags. `should_retry`
 * starts another run of the trial. `should_grade` still runs the verifier.
 * `has_valid_reward` lets the reward count. The groups are Harbor's
 * (`harbor/models/trial/error_policy.py`); a type not listed retries, grades
 * and counts.
 *
 * METRIC: an aggregate over the valid rewards of one agent × model. A trial
 * whose reward is invalid is in neither the numerator nor the denominator. A
 * valid trial with no reward counts as 0.
 */
import type {
  EvalAgentStats,
  EvalErrorPolicy,
  EvalException,
  EvalJobConfig,
  EvalJobStats,
  EvalMetricConfig,
  EvalRewards,
  EvalTrialStatus,
} from '@kortix/api-contract';

export class EvalTrialError extends Error {
  constructor(
    /** The exception type, in Harbor's names where Harbor has one. */
    readonly type: string,
    message: string,
  ) {
    super(message);
    this.name = type;
  }
}

const policy = (should_retry: boolean, should_grade: boolean, has_valid_reward: boolean): EvalErrorPolicy => ({
  should_retry,
  should_grade,
  has_valid_reward,
});

const POLICY_GROUPS: Array<[EvalErrorPolicy, string[]]> = [
  // The agent's own failure: grade what it left, and the reward counts.
  [policy(false, true, true), [
    'NonZeroAgentExitCodeError',
    'AgentTimeoutError',
    'ContextWindowExceededError',
    'OutputTokenExceededError',
    'ContextLengthExceededError',
    'OutputLengthExceededError',
    'AgentSafetyRefusalError',
    'ContentPolicyViolationError',
  ]],
  // The sandbox failed: nothing to grade, run it again.
  [policy(true, false, false), [
    'EnvironmentStartTimeoutError',
    'SandboxBuildFailedError',
    'HealthcheckError',
    'SandboxLikelyOutOfMemoryError',
    'RuntimeRequestError',
    'AddTestsDirError',
    'DownloadVerifierDirError',
    // Kortix: the sandbox stopped under the turn.
    'SandboxGoneError',
  ]],
  // The model API failed: grade for the record, the reward does not count, run it again.
  [policy(true, true, false), [
    'ApiError',
    'ApiRateLimitError',
    'ApiInternalServerError',
    'ApiOverloadedError',
    'ApiConnectionError',
    'ApiUsageLimitError',
    'RateLimitError',
    'InternalServerError',
    'ServiceUnavailableError',
    'UnknownApiError',
    // Kortix: the turn failed with an error no other type names.
    'AgentTurnFailedError',
  ]],
  // A grading failure or a request the model refuses for good: no retry, no valid reward.
  [policy(false, true, false), [
    'BadRequestError',
    'BudgetExceededError',
    'VerifierTimeoutError',
    'RewardFileNotFoundError',
    'RewardFileEmptyError',
    'VerifierOutputParseError',
  ]],
  // Nothing can run: no retry, no grade.
  [policy(false, false, false), [
    'AgentAuthenticationError',
    'ModelNotFoundError',
    'AuthenticationError',
    'PermissionDeniedError',
    'NotFoundError',
    'CancelledError',
    // Kortix: the task cannot run here, the account may not run, or the trial could not be set up.
    'TaskUnsupportedError',
    'TaskLoadError',
    'BillingBlockedError',
    'SessionCreateError',
    'SolutionNotFoundError',
  ]],
];

const POLICY_BY_TYPE = new Map<string, EvalErrorPolicy>(
  POLICY_GROUPS.flatMap(([value, types]) => types.map((type) => [type, value] as const)),
);
const DEFAULT_POLICY = policy(true, true, true);

/** The policy of one exception type, with the job's overrides applied. */
export function errorPolicyFor(type: string, overrides: EvalJobConfig['override_error_policy'] = {}): EvalErrorPolicy {
  return { ...(POLICY_BY_TYPE.get(type) ?? DEFAULT_POLICY), ...(overrides[type] ?? {}) };
}

export function toEvalException(
  err: unknown,
  overrides: EvalJobConfig['override_error_policy'] = {},
  now: Date = new Date(),
): EvalException {
  const type = err instanceof EvalTrialError ? err.type : 'RuntimeRequestError';
  const message = err instanceof Error ? err.message : String(err);
  return {
    exception_type: type,
    exception_message: message.slice(0, 4_000),
    occurred_at: now.toISOString(),
    policy: errorPolicyFor(type, overrides),
  };
}

/** Whether the job runs the trial again after this exception. */
export function shouldRetry(exception: EvalException, retry: EvalJobConfig['retry'], retriesDone: number): boolean {
  if (retriesDone >= retry.max_retries) return false;
  if (retry.exclude_exceptions?.includes(exception.exception_type)) return false;
  if (retry.include_exceptions?.length) return retry.include_exceptions.includes(exception.exception_type);
  return exception.policy.should_retry;
}

/**
 * The error a failed turn names, mapped to an exception type. `name` and
 * `message` are what the session turn ledger recorded (`session_turns.end_error`).
 */
export function turnFailureType(error: { name?: string | null; message?: string | null } | null): string {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (/context (window|length)|too long|maximum context|input is too long/.test(text)) return 'ContextWindowExceededError';
  if (/rate.?limit|429|too many requests/.test(text)) return 'ApiRateLimitError';
  if (/overloaded|529/.test(text)) return 'ApiOverloadedError';
  if (/insufficient credits|payment required|402|budget|out of credits/.test(text)) return 'BudgetExceededError';
  if (/unauthori[sz]ed|401|invalid api key|authentication/.test(text)) return 'AgentAuthenticationError';
  if (/model.*not found|unknown model|no such model/.test(text)) return 'ModelNotFoundError';
  if (/content policy|safety|refus/.test(text)) return 'ContentPolicyViolationError';
  if (/5\d\d|internal server|service unavailable|bad gateway/.test(text)) return 'ApiInternalServerError';
  return 'AgentTurnFailedError';
}

// ── Rewards ──────────────────────────────────────────────────────────────────

/** Parse `reward.json`: an object of named numbers. */
export function parseRewardJson(raw: string): EvalRewards {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EvalTrialError('VerifierOutputParseError', 'reward.json is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new EvalTrialError('VerifierOutputParseError', 'reward.json must be an object of named numbers.');
  }
  const rewards: EvalRewards = {};
  for (const [key, value] of Object.entries(parsed)) {
    const number = typeof value === 'boolean' ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isFinite(number)) {
      throw new EvalTrialError('VerifierOutputParseError', `reward.json: "${key}" is not a number.`);
    }
    rewards[key] = number;
  }
  return rewards;
}

/** Parse `reward.txt`: one number. */
export function parseRewardText(raw: string): EvalRewards {
  const text = raw.trim();
  if (!text) throw new EvalTrialError('RewardFileEmptyError', 'reward.txt is empty.');
  const number = Number(text);
  if (!Number.isFinite(number)) throw new EvalTrialError('VerifierOutputParseError', `reward.txt is not a number: "${text.slice(0, 80)}".`);
  return { reward: number };
}

/** The reward the verifier left. `json` wins over `text`; neither is `RewardFileNotFoundError`. */
export function parseRewards(files: { json: string | null; text: string | null }): EvalRewards {
  if (files.json !== null) return parseRewardJson(files.json);
  if (files.text !== null) return parseRewardText(files.text);
  throw new EvalTrialError('RewardFileNotFoundError', 'The verifier wrote no /logs/verifier/reward.json or /logs/verifier/reward.txt.');
}

// ── Metrics ──────────────────────────────────────────────────────────────────

const AGGREGATE: Record<EvalMetricConfig['type'], (values: number[]) => number> = {
  mean: (values) => values.reduce((a, b) => a + b, 0) / values.length,
  sum: (values) => values.reduce((a, b) => a + b, 0),
  min: (values) => Math.min(...values),
  max: (values) => Math.max(...values),
};

/**
 * One metric over the valid trials' rewards. `null` is a valid trial with no
 * reward: it counts as 0 for every key. With one reward key overall, the value
 * is named after the metric (`{ mean: 0.5 }`); with several, each key
 * aggregates by itself and a trial that lacks a key counts 0 for it.
 */
export function computeMetric(type: EvalMetricConfig['type'], rewards: Array<EvalRewards | null>): Record<string, number> {
  if (rewards.length === 0) return {};
  const keys = [...new Set(rewards.flatMap((reward) => Object.keys(reward ?? {})))];
  if (keys.length <= 1) {
    const key = keys[0];
    return { [type]: AGGREGATE[type](rewards.map((reward) => (key && reward ? (reward[key] ?? 0) : 0))) };
  }
  return Object.fromEntries(keys.map((key) => [key, AGGREGATE[type](rewards.map((reward) => reward?.[key] ?? 0))]));
}

export interface ScoredTrial {
  taskName: string;
  agent: string;
  model: string | null;
  attempt: number;
  status: EvalTrialStatus;
  rewards: EvalRewards | null;
  rewardValid: boolean;
  hasException: boolean;
  /** A later retry of the same attempt replaced this run: it is in no count. */
  superseded: boolean;
}

/** A trial passes when every reward it has is 1 or more. */
const passed = (rewards: EvalRewards | null): boolean => {
  const values = Object.values(rewards ?? {});
  return values.length > 0 && values.every((value) => value >= 1);
};

/** pass@k: the share of tasks with a pass in their first `k` valid attempts, for k = 1 and each power of 2 up to the attempt count. */
function passAtK(trials: ScoredTrial[]): Record<string, number> {
  const byTask = new Map<string, ScoredTrial[]>();
  for (const trial of trials) byTask.set(trial.taskName, [...(byTask.get(trial.taskName) ?? []), trial]);
  const tasks = [...byTask.values()].map((list) => list.sort((a, b) => a.attempt - b.attempt));
  const most = Math.max(0, ...tasks.map((list) => list.length));
  const out: Record<string, number> = {};
  for (let k = 1; k <= most; k *= 2) {
    const eligible = tasks.filter((list) => list.length >= k);
    if (eligible.length === 0) break;
    out[String(k)] = eligible.filter((list) => list.slice(0, k).some((trial) => passed(trial.rewards))).length / eligible.length;
  }
  return out;
}

/** The job's counts and each agent × model's score. */
export function computeJobStats(trials: ScoredTrial[], metrics: EvalMetricConfig[]): EvalJobStats {
  const live = trials.filter((trial) => !trial.superseded);
  const count = (statuses: EvalTrialStatus[]) => live.filter((trial) => statuses.includes(trial.status)).length;
  const types = metrics.length ? metrics.map((metric) => metric.type) : (['mean'] as const);
  const groups = new Map<string, ScoredTrial[]>();
  for (const trial of live) {
    const key = `${trial.agent}\u0000${trial.model ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), trial]);
  }
  const agents: EvalAgentStats[] = [...groups.values()].map((group) => {
    const valid = group.filter((trial) => trial.rewardValid);
    return {
      agent: group[0]!.agent,
      model: group[0]!.model,
      n_trials: valid.length,
      n_errors: group.filter((trial) => trial.hasException).length,
      metrics: types.map((type) => computeMetric(type, valid.map((trial) => trial.rewards))),
      pass_at_k: passAtK(valid),
    };
  });
  return {
    n_total_trials: live.length,
    n_queued: count(['queued']),
    n_running: count(['starting', 'agent_running', 'verifying']),
    n_completed: count(['completed']),
    n_errored: count(['errored']),
    n_cancelled: count(['cancelled']),
    agents,
  };
}
