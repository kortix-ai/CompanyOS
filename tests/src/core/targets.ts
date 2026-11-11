/**
 * Per-target applicability of a flow (`FlowMeta.targets`).
 *
 * A run has one target kind:
 * - `local`    — `ke2e local` / `pnpm test`: the deterministic local profile.
 * - `deployed` — a cloud deployment (staging in the release gate).
 * - `selfhost` — a `kortix self-host` distribution (the pull request preview).
 *
 * `targets[kind] = true` declares the flow applicable there. `targets.deployed
 * = true` puts the flow in the release gate's deployed set; the `deployed` tag
 * is its alias and both stay supported. `targets[kind] = { skip }` declares
 * the flow NOT applicable there: the runner never schedules it on that target
 * and records the reason. A skip reason is a sentence a reader can act on.
 */
import type { FlowMeta } from './types';

export type TargetKind = 'local' | 'deployed' | 'selfhost';
export const TARGET_KINDS: readonly TargetKind[] = ['local', 'deployed', 'selfhost'];
export type TargetApplicability = true | { skip: string };
export type FlowTargets = Partial<Record<TargetKind, TargetApplicability>>;

/** The tag the deployed API lanes select (`--tag deployed`). */
export const DEPLOYED_TAG = 'deployed';

/**
 * A skip reason is one non-empty sentence: at least three words, starting with
 * a letter, ending with `.`. "n/a" or "skip" tells the next reader nothing.
 */
export function isSkipSentence(reason: unknown): reason is string {
  if (typeof reason !== 'string') return false;
  const text = reason.trim();
  return /^[A-Za-z`]/.test(text) && text.endsWith('.') && text.split(/\s+/).length >= 3;
}

/**
 * Validate `meta.targets` and fold the `deployed` tag alias into it, in place,
 * so every reader (runner, shard planner, deployed-set test) sees one shape.
 * Throws at registration (module import) on an invalid declaration.
 */
export function normalizeFlowTargets(id: string, meta: FlowMeta): void {
  const targets = meta.targets;
  if (targets !== undefined) {
    if (targets === null || typeof targets !== 'object' || Array.isArray(targets)) {
      throw new Error(`flow ${id}: meta.targets must be an object`);
    }
    for (const [kind, value] of Object.entries(targets)) {
      if (!(TARGET_KINDS as readonly string[]).includes(kind)) {
        throw new Error(`flow ${id}: unknown target "${kind}" (use ${TARGET_KINDS.join(', ')})`);
      }
      if (value === true) continue;
      if (!value || typeof value !== 'object' || !isSkipSentence((value as { skip?: unknown }).skip)) {
        throw new Error(
          `flow ${id}: targets.${kind} must be true or { skip: '<one sentence, at least three words, ending with a period.>' }`,
        );
      }
    }
  }
  const tagged = (meta.tags ?? []).includes(DEPLOYED_TAG);
  const deployed = targets?.deployed;
  if (tagged && deployed !== undefined && deployed !== true) {
    throw new Error(`flow ${id}: tagged "${DEPLOYED_TAG}" but targets.deployed is a skip`);
  }
  if (tagged && deployed === undefined) meta.targets = { ...targets, deployed: true };
  if (deployed === true && !tagged) meta.tags = [...(meta.tags ?? []), DEPLOYED_TAG];
}

/** The declared skip reason for one target, or null when the flow is applicable there. */
export function targetSkipReason(meta: Pick<FlowMeta, 'targets'>, kind: TargetKind): string | null {
  const value = meta.targets?.[kind];
  return value && value !== true ? value.skip.trim() : null;
}

/** The target kind of a run: the local profile, a self-host preview, or a cloud deployment. */
export function runTargetKind(
  profile: 'all' | 'local' | undefined,
  vars: Record<string, string | undefined> = process.env,
): TargetKind {
  if (profile === 'local') return 'local';
  const explicit = (vars.KE2E_TARGET ?? vars.E2E_TARGET ?? '').trim().toLowerCase();
  if (explicit === 'preview' || explicit === 'selfhost') return 'selfhost';
  if (explicit === 'local') return 'local';
  return 'deployed';
}

export interface TargetCount {
  /** Flows of the selection that declare `targets[kind] = true` (for `deployed`: the deployed set). */
  declared: number;
  /** Flows of the selection that declare `targets[kind] = { skip }`. */
  skipped: Array<{ id: string; reason: string }>;
}

/** Per-target declarations over a selection, for the report. */
export function targetCounts(flows: Array<{ id: string; meta: Pick<FlowMeta, 'targets'> }>): Record<TargetKind, TargetCount> {
  const out = {} as Record<TargetKind, TargetCount>;
  for (const kind of TARGET_KINDS) {
    const skipped: TargetCount['skipped'] = [];
    let declared = 0;
    for (const flow of flows) {
      const reason = targetSkipReason(flow.meta, kind);
      if (reason) skipped.push({ id: flow.id, reason });
      else if (flow.meta.targets?.[kind] === true) declared += 1;
    }
    out[kind] = { declared, skipped };
  }
  return out;
}
