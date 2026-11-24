import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parseManifestText } from '@kortix/manifest-schema';

const TEMPLATES_ROOT = join(import.meta.dir, '..', '..', 'templates');

type AgentBlocks = Record<string, { model?: unknown }>;

function walk(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules') continue;
    const abs = join(root, entry);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

function agentPromptFiles(): string[] {
  return walk(TEMPLATES_ROOT)
    .filter((abs) => abs.endsWith('.md') && relative(TEMPLATES_ROOT, abs).split(sep).at(-2) === 'agents')
    .sort();
}

/** Every agent block the templates ship: the base kortix.yaml and each template's `<id>/<id>.yaml`. */
function agentBlocks(): Array<{ where: string; block: { model?: unknown } }> {
  const manifests = [
    'base/kortix.yaml',
    ...readdirSync(TEMPLATES_ROOT)
      .map((id) => `${id}/${id}.yaml`)
      .filter((path) => statSync(join(TEMPLATES_ROOT, path), { throwIfNoEntry: false })?.isFile()),
  ];
  return manifests.flatMap((path) => {
    const manifest = parseManifestText(readFileSync(join(TEMPLATES_ROOT, path), 'utf8')) as { agents?: AgentBlocks };
    return Object.entries(manifest.agents ?? {}).map(([name, block]) => ({ where: `${path} agents.${name}`, block }));
  });
}

describe('starter template agents', () => {
  test('finds the prompt files and agent blocks it guards', () => {
    const files = agentPromptFiles();

    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(files.some((f) => f.endsWith('templates/base/agents/worker.md'))).toBe(true);
    expect(files.some((f) => f.endsWith('templates/software-factory/agents/engineer.md'))).toBe(true);
    expect(agentBlocks().some(({ where }) => where.startsWith('software-factory/software-factory.yaml'))).toBe(true);
    expect(agentBlocks().length).toBeGreaterThanOrEqual(6);
  });

  test('every agent prompt file is the prompt alone: the agent block holds its behavior', () => {
    const withFrontmatter = agentPromptFiles()
      .filter((abs) => readFileSync(abs, 'utf8').startsWith('---'))
      .map((abs) => relative(TEMPLATES_ROOT, abs));

    expect(withFrontmatter).toEqual([]);
  });

  test('first-party agents pin no model and inherit the platform default', () => {
    expect(agentBlocks().filter(({ block }) => block.model !== undefined).map(({ where }) => where)).toEqual([]);
  });
});
