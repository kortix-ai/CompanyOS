import { manifestCandidatePaths, parseManifestText } from '@kortix/manifest-schema';
import { sessionSandboxes } from '@kortix/db';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { buildConfigArchive } from '../../config-releases/release-tree';
import { getProvider, isProviderName } from '../../platform/providers';
import { db } from '../../shared/db';
import { ManifestWriteRefusedError } from '../manifest-io';
import { readManifestFromRepo } from './files';
import { ensureTreeContents, runGitBuffer } from './mirror';
import type { GitBackedProject } from './types';

const DEADLINE_MS = 30_000;
const MAX_BYTES = 32 * 1024 * 1024;
const q = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export interface ValidatorBox {
  exec(command: string[], timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

/** Runs outside the API process; the existing project's sandbox is the trust boundary. */
export async function runWorkspaceValidator(box: ValidatorBox, command: string, archive: Uint8Array): Promise<void> {
  const dir = `/var/tmp/kortix-config-${randomUUID()}`;
  const exec = async (script: string) => {
    const result = await box.exec(['env', '-u', 'BASH_ENV', '-u', 'ENV', 'bash', '--noprofile', '--norc', '-c', script], DEADLINE_MS);
    if (result.exitCode !== 0) throw new Error((result.stderr || result.stdout || `Validator exited ${result.exitCode}`).slice(0, 4000));
    return result;
  };
  try {
    await exec(`mkdir -m 700 -- ${q(dir)}`);
    for (let offset = 0; offset < archive.byteLength; offset += 48 * 1024) {
      const chunk = Buffer.from(archive.subarray(offset, offset + 48 * 1024)).toString('base64');
      await exec(`printf %s ${q(chunk)} | base64 -d >> ${q(`${dir}/candidate.tar`)}`);
    }
    await exec(`mkdir -- ${q(`${dir}/tree`)} && tar -xf ${q(`${dir}/candidate.tar`)} -C ${q(`${dir}/tree`)} && cd -- ${q(`${dir}/tree`)} && timeout --kill-after=2s 20s env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=${q(dir)} bash --noprofile --norc -c ${q(command)}`);
  } finally {
    await box.exec(['rm', '-rf', '--', dir], 5000).catch(() => undefined);
  }
}

async function projectBox(projectId: string): Promise<ValidatorBox> {
  const [box] = await db.select({ provider: sessionSandboxes.provider, externalId: sessionSandboxes.externalId })
    .from(sessionSandboxes).where(and(eq(sessionSandboxes.projectId, projectId), eq(sessionSandboxes.status, 'active'))).limit(1);
  if (!box?.externalId || !isProviderName(box.provider)) throw new Error('Required workspace validator unavailable: no running project sandbox.');
  const externalId = box.externalId;
  const provider = getProvider(box.provider);
  const exec = provider.exec?.bind(provider);
  if (!exec) throw new Error('Required workspace validator unavailable: sandbox has no exec channel.');
  return { exec: (command, timeoutMs) => exec(externalId, command, { timeoutMs }) };
}

let resolveBox = projectBox;
/** Replace only the provider/DB boundary; validation and Git operations stay real. */
export function setValidatorBoxForTests(resolve: typeof projectBox | null): void {
  resolveBox = resolve ?? projectBox;
}

/** Read the policy from the parent, not from a candidate that can remove its own gate. */
export async function validateWorkspaceCommit(project: GitBackedProject, repoPath: string, parent: string | null, candidate: string): Promise<boolean> {
  if (!parent) return false;
  const manifest = await readManifestFromRepo(project, manifestCandidatePaths(project.manifestPath), parent, { strictRef: true });
  if (!manifest) return false;
  const raw = parseManifestText(manifest.content);
  if (raw.config_validator === undefined) return false;
  try {
    if (typeof raw.config_validator !== 'string' || !raw.config_validator.trim()) throw new Error('config_validator must be a non-empty command.');
    const box = await resolveBox(project.projectId);
    await ensureTreeContents(repoPath, candidate, { maxBytes: MAX_BYTES, timeoutMs: DEADLINE_MS });
    const tree = await runGitBuffer(['rev-parse', `${candidate}^{tree}`], repoPath, false);
    // Reuse the release archive builder: scratch attributes preserve every blob.
    const archive = await buildConfigArchive(repoPath, tree.stdout.toString().trim(), MAX_BYTES);
    await runWorkspaceValidator(box, raw.config_validator, archive);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ManifestWriteRefusedError(`Workspace validator refused the change: ${message.slice(0, 4000)}`, [{ path: 'config_validator', message: message.slice(0, 4000), severity: 'error' }]);
  }
}
