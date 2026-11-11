/**
 * Flow selection is exact. Every value a caller names must select something:
 * `--id A,BOGUS` fails naming BOGUS instead of running A alone, an unknown
 * `--domain` or `--tag` fails, and an empty `--id=` is a usage error instead
 * of "run everything". A selector that silently shrinks or widens the run
 * makes a green result prove less than the command line says.
 */
import type { FlowMeta } from './types';

export class SelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelectionError';
  }
}

export interface FlowSelector {
  ids?: string[];
  domains?: string[];
  tags?: string[];
  grep?: string;
  smoke?: boolean;
}

interface SelectableFlow {
  id: string;
  meta: Pick<FlowMeta, 'domain' | 'tags'>;
}

/** The flag values `ke2e` and `pnpm test` accept as flow filters (each takes a value). */
export const FLOW_FILTER_VALUE_FLAGS = ['id', 'domain', 'tag', 'grep'] as const;

/**
 * Parse one comma-separated filter flag. `undefined` when the flag is absent.
 * Throws a SelectionError when it is present without a usable value
 * (`--id`, `--id=`, `--id=,`).
 */
export function parseListFlag(name: string, value: string | boolean | undefined): string[] | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true) throw new SelectionError(`--${name} requires a value`);
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) throw new SelectionError(`--${name} requires a non-empty value (got "${value}")`);
  return items;
}

/** `--grep` takes one non-empty substring. */
export function parseGrepFlag(value: string | boolean | undefined): string | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true || value.trim() === '') throw new SelectionError('--grep requires a non-empty value');
  return value.trim();
}

function matches(f: SelectableFlow, o: FlowSelector): boolean {
  if (o.ids?.length && !o.ids.includes(f.id)) return false;
  if (o.domains?.length && !o.domains.includes(f.meta.domain)) return false;
  if (o.tags?.length && !(f.meta.tags ?? []).some((t) => o.tags!.includes(t))) return false;
  if (o.grep && !f.id.includes(o.grep) && !f.meta.domain.includes(o.grep)) return false;
  if (o.smoke && !(f.meta.tags ?? []).includes('smoke')) return false;
  return true;
}

/**
 * Select flows. Throws a SelectionError naming every id, domain or tag that
 * the registry does not know, every named id the other selectors exclude, and
 * a selection that matches nothing.
 */
export function selectFlows<F extends SelectableFlow>(all: F[], o: FlowSelector): F[] {
  const problems: string[] = [];
  const ids = new Set(all.map((f) => f.id));
  const domains = new Set(all.map((f) => f.meta.domain));
  const tags = new Set(all.flatMap((f) => f.meta.tags ?? []));
  const unknown = (label: string, values: string[] | undefined, known: Set<string>) => {
    const missing = (values ?? []).filter((v) => !known.has(v));
    if (missing.length) problems.push(`unknown ${label}: ${missing.join(', ')}`);
  };
  unknown('flow id', o.ids, ids);
  unknown('domain', o.domains, domains);
  unknown('tag', o.tags, tags);
  const selected = all.filter((f) => matches(f, o));
  if (o.ids?.length) {
    const chosen = new Set(selected.map((f) => f.id));
    const dropped = o.ids.filter((id) => ids.has(id) && !chosen.has(id));
    if (dropped.length) problems.push(`flow id excluded by the other filters: ${dropped.join(', ')}`);
  }
  if (problems.length) throw new SelectionError(problems.join('; '));
  if (selected.length === 0) throw new SelectionError('no flows matched the selected filters');
  return selected;
}

/**
 * Validate the flow filters on a `pnpm test` command line before a lane
 * starts: `--id`, `--domain`, `--tag` and `--grep` each need a non-empty value,
 * as `--x=v` or `--x v`. Throws a SelectionError otherwise.
 */
export function assertFlowFilterArgs(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    const name = arg.slice(2, eq === -1 ? undefined : eq);
    if (!(FLOW_FILTER_VALUE_FLAGS as readonly string[]).includes(name)) continue;
    const next = args[i + 1];
    const value = eq !== -1 ? arg.slice(eq + 1) : next !== undefined && !next.startsWith('--') ? next : true;
    if (name === 'grep') parseGrepFlag(value);
    else parseListFlag(name, value);
  }
}
