import path from 'path';

/**
 * Turbopack loader paths relative to the web app, so its dev disk cache (`.next/dev/cache`) works in
 * another worktree.
 *
 * Turbopack records each loader's path and options as next.config hands them over. This config and
 * fumadocs-mdx pass absolute ones (the phosphor loader, `.source/source.config.mjs`), so a cache copied
 * into a new worktree points at the old checkout and every module fails: "webpack loader path … is
 * outside configured roots", 5,406 errors, no page. With the same paths relative to the app the copied
 * cache serves the first page after the API in 33.2 s instead of 64-66 s cold (suna-dev, 6 vCPU,
 * 2026-11-27). `pnpm worktree create` seeds a new worktree's cache from the newest one it finds.
 *
 * Only paths inside `dir` change; loader package names, other values and paths elsewhere stay as given.
 */
export function relativizeTurbopackLoaders<T>(config: T, dir: string): T {
  const turbopack = (config as { turbopack?: { rules?: Record<string, unknown> } }).turbopack;
  if (!turbopack?.rules) return config;
  const inside = (value: unknown): value is string => {
    if (typeof value !== 'string' || !path.isAbsolute(value)) return false;
    const rel = path.relative(dir, value);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  };
  const portable = (value: unknown) => (inside(value) ? `./${path.relative(dir, value).split(path.sep).join('/')}` : value);
  const loader = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') return entry;
    const { loader: name, options, ...rest } = entry as { loader?: unknown; options?: unknown };
    const out: Record<string, unknown> = { ...rest, loader: portable(name) };
    if (options && typeof options === 'object' && !Array.isArray(options)) {
      out.options = Object.fromEntries(Object.entries(options).map(([key, value]) => [key, portable(value)]));
    } else if (options !== undefined) {
      out.options = options;
    }
    return out;
  };
  const rule = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rule);
    if (!value || typeof value !== 'object') return value;
    const { loaders } = value as { loaders?: unknown };
    return Array.isArray(loaders) ? { ...value, loaders: loaders.map(loader) } : value;
  };
  return {
    ...config,
    turbopack: { ...turbopack, rules: Object.fromEntries(Object.entries(turbopack.rules).map(([glob, value]) => [glob, rule(value)])) },
  };
}
