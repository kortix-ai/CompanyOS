/**
 * `kortix templates doctor <id>` — one green/red list that says whether a
 * template is ready to run for real: added and imported, workspace linked,
 * secrets set, triggers live, dev image built, a model that answers, GitHub
 * webhooks in place. Onboarding ends when every line is green.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifestCandidatePaths, parseManifestText } from '@kortix/manifest-schema';
import { getTemplate, type TemplateInfo } from '@kortix/starter/templates';
import { resolveProjectContext } from '../command-helpers.ts';
import { runGit } from '../git-run.ts';
import { C, status } from '../style.ts';

export type CheckState = 'ok' | 'fail' | 'warn';
export interface Check {
  name: string;
  state: CheckState;
  detail: string;
  /** The command or action that turns it green. */
  fix?: string;
}

interface SecretRow { name: string; configured: boolean }
interface TriggerRow { slug: string; enabled: boolean; webhook_url?: string | null }
interface SandboxRow { slug: string; source: string; ready: boolean; daytona_state: string }
interface PickerModel { available?: boolean }

/** Trigger slugs the template's rendered YAML declares, read from the repository. */
export function templateTriggerSlugs(root: string, template: TemplateInfo): string[] {
  const dir = join(root, template.import_path);
  if (!existsSync(dir)) return [];
  const slugs: string[] = [];
  const walk = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.ya?ml$/.test(entry.name)) {
        const doc = parseManifestText(readFileSync(full, 'utf8')) as { triggers?: Array<{ slug?: string }> };
        for (const trigger of doc.triggers ?? []) if (trigger.slug) slugs.push(trigger.slug);
      }
    }
  };
  walk(dir);
  return slugs;
}

/** The pure verdict for one check list: exit 1 when any line is red. */
export function doctorExitCode(checks: Check[]): number {
  return checks.some((check) => check.state === 'fail') ? 1 : 0;
}

function gh(args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('gh', args, { encoding: 'utf8' });
  return { ok: r.status === 0, out: r.stdout ?? '' };
}

async function collect(template: TemplateInfo, root: string, repo: string | null): Promise<Check[]> {
  const checks: Check[] = [];
  const manifest = manifestCandidatePaths().map((path) => join(root, path)).find((path) => existsSync(path));
  const imported = manifest ? readFileSync(manifest, 'utf8').includes(template.import_path.replace(/\/$/, '')) : false;
  const declared = templateTriggerSlugs(root, template);
  checks.push(
    imported && declared.length > 0
      ? { name: 'template added', state: 'ok', detail: `${template.import_path} imported, ${declared.length} triggers` }
      : { name: 'template added', state: 'fail', detail: 'not in this repository', fix: `kortix templates add ${template.id}` },
  );

  const ctx = await resolveProjectContext({}).catch(() => null);
  if (!ctx) {
    checks.push({ name: 'workspace', state: 'fail', detail: 'this folder is not linked to a Kortix workspace', fix: 'kortix ship' });
    return checks;
  }
  checks.push({ name: 'workspace', state: 'ok', detail: ctx.projectId });
  const base = `/workspaces/${ctx.projectId}`;

  const secrets = await ctx.client.get<{ items?: SecretRow[] }>(`${base}/secrets`).catch(() => null);
  const rows = secrets?.items ?? [];
  const set = new Set(rows.filter((row) => row.configured).map((row) => row.name));
  const missing = template.secrets.filter((secret) => secret.required && !set.has(secret.name)).map((secret) => secret.name);
  const optional = template.secrets.filter((secret) => !secret.required && !set.has(secret.name)).map((secret) => secret.name);
  checks.push(
    missing.length === 0
      ? { name: 'secrets', state: optional.length ? 'warn' : 'ok', detail: optional.length ? `optional not set: ${optional.join(', ')}` : 'every secret is set' }
      : { name: 'secrets', state: 'fail', detail: `missing: ${missing.join(', ')}`, fix: `kortix secrets request ${missing.join(' ')} --scope runtime` },
  );

  const triggers = await ctx.client.get<{ triggers: TriggerRow[]; triggers_paused?: boolean }>(`${base}/triggers`).catch(() => null);
  const live = new Set((triggers?.triggers ?? []).map((row) => row.slug));
  const absent = declared.filter((slug) => !live.has(slug));
  if (absent.length > 0) {
    checks.push({ name: 'triggers', state: 'fail', detail: `not on the workspace yet: ${absent.join(', ')}`, fix: 'kortix ship' });
  } else if (triggers?.triggers_paused) {
    checks.push({ name: 'triggers', state: 'warn', detail: 'live, but paused for the workspace', fix: 'kortix triggers resume' });
  } else {
    checks.push({ name: 'triggers', state: 'ok', detail: `${declared.length} live` });
  }

  if (template.needs_dev_sandbox) {
    const sandboxes = await ctx.client.get<{ items: SandboxRow[]; default_slug: string | null }>(`${base}/sandbox-templates`).catch(() => null);
    const chosen = sandboxes?.items.find((row) => row.slug === sandboxes.default_slug);
    if (!chosen || chosen.source === 'platform') {
      checks.push({ name: 'dev image', state: 'fail', detail: 'no dev sandbox template is the default', fix: 'add sandbox.templates + sandbox.default to kortix.yaml (setup guide step 5)' });
    } else if (!chosen.ready) {
      const state = !chosen.daytona_state || chosen.daytona_state === 'unknown' ? 'not built yet' : chosen.daytona_state;
      checks.push({ name: 'dev image', state: 'fail', detail: `${chosen.slug} is ${state}`, fix: `kortix sandboxes build ${chosen.slug}` });
    } else {
      checks.push({ name: 'dev image', state: 'ok', detail: `${chosen.slug} is ready` });
    }
  }

  const picker = await ctx.client.get<{ models?: Record<string, PickerModel>; defaultModel?: string }>(`${base}/model-picker`).catch(() => null);
  const defaultModel = picker?.defaultModel;
  const runnable = defaultModel ? picker?.models?.[defaultModel]?.available !== false : false;
  checks.push(
    runnable
      ? { name: 'model', state: 'ok', detail: `${defaultModel}` }
      : { name: 'model', state: 'fail', detail: defaultModel ? `${defaultModel} is not connected` : 'no default model', fix: 'kortix providers login claude --start --share workspace' },
  );

  if (template.github_webhooks.length > 0) {
    if (!repo) {
      checks.push({ name: 'GitHub webhooks', state: 'warn', detail: 'no GitHub repository known', fix: 'pass --repo <owner/repo>' });
    } else {
      const hooks = gh(['api', `repos/${repo}/hooks`, '--jq', '[.[] | {url: .config.url, code: .last_response.code}]']);
      const list: Array<{ url: string; code: number | null }> = hooks.ok ? JSON.parse(hooks.out || '[]') : [];
      for (const want of template.github_webhooks) {
        const hook = list.find((row) => row.url?.endsWith(`/${want.trigger}`));
        if (!hooks.ok) checks.push({ name: `webhook ${want.trigger}`, state: 'warn', detail: 'gh cannot read the repository hooks', fix: 'gh auth login' });
        else if (!hook) checks.push({ name: `webhook ${want.trigger}`, state: 'fail', detail: `no ${want.events.join(', ')} webhook on ${repo}`, fix: 'setup guide step 10' });
        else if (hook.code !== null && (hook.code < 200 || hook.code >= 300)) checks.push({ name: `webhook ${want.trigger}`, state: 'fail', detail: `last delivery answered ${hook.code}` });
        else checks.push({ name: `webhook ${want.trigger}`, state: 'ok', detail: hook.code ? `last delivery ${hook.code}` : 'created, no delivery yet' });
      }
    }
  }
  return checks;
}

export async function runTemplatesDoctor(template: TemplateInfo, opts: { repo: string | null; json: boolean }): Promise<number> {
  const top = runGit(undefined, ['rev-parse', '--show-toplevel']);
  const root = top.ok ? top.stdout.trim() : process.cwd();
  const checks = await collect(template, root, opts.repo);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ template: template.id, ready: doctorExitCode(checks) === 0, checks }, null, 2)}\n`);
    return doctorExitCode(checks);
  }
  process.stdout.write(`\n  ${C.bold}${template.name}${C.reset}\n\n`);
  for (const check of checks) {
    const line = `${check.name}: ${check.detail}`;
    process.stdout.write(`${check.state === 'ok' ? status.ok(line) : check.state === 'warn' ? status.warn(line) : status.err(line)}\n`);
    if (check.fix && check.state !== 'ok') process.stdout.write(`       ${C.dim}fix: ${check.fix}${C.reset}\n`);
  }
  const code = doctorExitCode(checks);
  process.stdout.write(`\n  ${code === 0 ? 'Ready.' : 'Not ready: fix the red lines, then run this again.'}\n\n`);
  return code;
}

export { getTemplate };
