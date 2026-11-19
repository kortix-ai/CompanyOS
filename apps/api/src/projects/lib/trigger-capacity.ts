import { isBlockingWindow } from '@kortix/llm-gateway';
import { z } from 'zod';
const capacityUsage = z.object({ limited: z.boolean(), observed_at: z.string().datetime(), windows: z.array(z.object({ id: z.string(), used_percent: z.number().min(0).max(100), resets_at: z.string().datetime().nullable() })) });

/** Explicit trigger policy only. Re-evaluate the intended model for every fire. */
export function selectTriggerCapacityModel(input: {
  model: string | null; fallbacks?: string[]; snapshots: unknown[]; available: string[]; now: number;
}): { model: string | null; intendedModel?: string; reason?: 'claude-exhausted' } {
  const { model, fallbacks, snapshots, available, now } = input;
  if (!model?.startsWith('claude-agent/') || !fallbacks?.length) return { model };
  if (!snapshots.length) throw new Error('Shared Claude capacity is unknown');
  const usages = snapshots.map(snapshot => {
    const parsed = capacityUsage.safeParse(snapshot);
    if (!parsed.success) throw new Error('Shared Claude capacity is invalid');
    const usage = parsed.data;
    const age = now - Date.parse(usage.observed_at);
    if (age < 0 || age > 300_000) throw new Error('Shared Claude capacity is stale');
    if (usage.limited && usage.windows.some(window => window.used_percent >= 100 && !isBlockingWindow(window.id) && !/^(seven_day_|7d_)(opus|sonnet|fable)$/.test(window.id))) throw new Error('Shared Claude limit has unknown scope');
    if (!usage.windows.length) throw new Error('Shared Claude capacity has no windows');
    if (usage.windows.some(window => window.used_percent >= 100 && (!window.resets_at || Date.parse(window.resets_at) <= now))) throw new Error('Shared Claude exhaustion has no future reset');
    return usage;
  });
  for (const candidate of [model, ...fallbacks]) {
    if (!candidate.startsWith('claude-agent/')) {
      if (available.includes(candidate)) return { model: candidate, intendedModel: model, reason: 'claude-exhausted' };
      continue;
    }
    if (candidate !== model && !available.includes(candidate)) continue;
    const family = candidate.slice('claude-agent/'.length);
    const ready = usages.some(usage => {
      const full = usage.windows.filter(window => window.used_percent >= 100);
      const blocked = full.some(window => isBlockingWindow(window.id) || window.id.replace(/^seven_day_/, '7d_') === `7d_${family}`);
      if (usage.limited && !full.length) throw new Error('Shared Claude limit has unknown scope');
      return !blocked;
    });
    if (ready) return candidate === model ? { model } : { model: candidate, intendedModel: model, reason: 'claude-exhausted' };
  }
  throw new Error('No available trigger capacity fallback');
}
