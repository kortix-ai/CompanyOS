/**
 * Templates: hand-approved sets of agents and triggers that a repository adds
 * with one import line in its `kortix.yaml`. `kortix templates add` and the
 * one-prompt setup guide read them from here.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import embeddedStarter from './embedded.generated.json' with { type: 'json' };
import { TEMPLATE_IDS, type TemplateId } from './template-ids';

export { TEMPLATE_IDS, type TemplateId };

export interface TemplateSecret {
  name: string;
  required: boolean;
  /** `sandbox`: the agents' environment. `connector`: only Kortix reads it (webhook secrets). */
  delivery: 'sandbox' | 'connector';
  why: string;
  /** Kortix may generate a random value: nobody has to bring one. */
  generate?: boolean;
}

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  summary: string;
  secrets: TemplateSecret[];
  /** GitHub repository webhooks to create: the trigger slug and its GitHub events. */
  github_webhooks: Array<{ trigger: string; events: string[] }>;
  label?: string;
  /** The template's agents run the repository's dev environment. */
  needs_dev_sandbox: boolean;
  /** The folder a repository imports, such as `.kortix/software-factory/`. */
  import_path: string;
}

export interface TemplateVars {
  /** `owner/repo` on GitHub. */
  repoFullName: string;
  defaultBranch: string;
}

const TEMPLATES_DIR = join(import.meta.dir, '..', 'templates');
const EMBEDDED = embeddedStarter as Record<string, { files: Array<{ path: string; content: string }> }>;

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === 'string' && (TEMPLATE_IDS as readonly string[]).includes(value);
}

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === '.DS_Store' || entry === 'node_modules') continue;
    const abs = join(root, entry);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

/** Raw files (placeholders intact): from disk in a checkout, else the compiled-in snapshot. */
function rawTemplateFiles(id: TemplateId): Array<{ path: string; content: string }> {
  const dir = join(TEMPLATES_DIR, id);
  if (existsSync(dir)) {
    return walk(dir)
      .map((abs) => ({ path: relative(dir, abs).split(sep).join('/'), content: readFileSync(abs, 'utf8') }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }
  const embedded = EMBEDDED[`template:${id}`];
  if (!embedded) throw new Error(`template ${id} is not in this build`);
  return embedded.files;
}

export function getTemplate(id: TemplateId): TemplateInfo {
  const meta = rawTemplateFiles(id).find((file) => file.path === 'template.json');
  if (!meta) throw new Error(`template ${id} has no template.json`);
  const parsed = JSON.parse(meta.content) as Omit<TemplateInfo, 'import_path'>;
  return { ...parsed, id, github_webhooks: parsed.github_webhooks ?? [], import_path: `.kortix/${id}/` };
}

export function listTemplates(): TemplateInfo[] {
  return TEMPLATE_IDS.map(getTemplate);
}

/** The files a repository receives, `{{repoFullName}}` and `{{defaultBranch}}` resolved. */
export function getTemplateFiles(id: TemplateId, vars: TemplateVars): Array<{ path: string; content: string }> {
  const values: Record<string, string> = { repoFullName: vars.repoFullName, defaultBranch: vars.defaultBranch };
  return rawTemplateFiles(id)
    .filter((file) => file.path !== 'template.json')
    .map((file) => ({
      path: file.path,
      content: file.content.replace(/\{\{(repoFullName|defaultBranch)\}\}/g, (_m, key: string) => values[key]!),
    }));
}
