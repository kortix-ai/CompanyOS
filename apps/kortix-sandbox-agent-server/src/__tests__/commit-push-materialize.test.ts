/**
 * "Save changes" on a session whose workspace holds no checkout.
 *
 * #12136 stopped checking the repository out at boot: a fresh session's
 * /workspace is empty, so `commitAndPushWorkingTree` had no repo to commit
 * from and answered 409 `project repo is not materialized` forever — the
 * release gate's RUN-7 (2026-11-10). The route's contract is that agent work
 * lands on the session branch, so the commit now materializes the branch
 * into the existing workspace first: the agent's untracked files stay in
 * place and become the commit, and a file that collides with repository
 * content is git's own refusal.
 *
 * Real repositories, no mocks: the behaviour under test is git's.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Config } from '@/lib/config/config'
import { commitAndPushWorkingTree } from '@/lib/git/git'

function git(args: string[], cwd?: string) {
  execFileSync('git', args, {
    cwd,
    stdio: 'ignore',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
}

function gitOut(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim()
}

let root: string
let origin: string
let work: string

const SESSION_ID = '00000000-0000-4000-8000-00000000a0c2'

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kortix-commit-push-'))
  origin = join(root, 'origin.git')
  work = join(root, 'workspace')

  git(['init', '--bare', '-b', 'main', origin])
  const seed = join(root, 'seed')
  mkdirSync(seed)
  git(['init', '-b', 'main'], seed)
  writeFileSync(join(seed, 'README.md'), 'base\n')
  git(['add', '.'], seed)
  git(['-c', 'user.email=t@k.dev', '-c', 'user.name=T', 'commit', '-m', 'base'], seed)
  git(['remote', 'add', 'origin', origin], seed)
  git(['push', '-u', 'origin', 'main'], seed)

  // The session box: an empty workspace and a session branch nobody pushed.
  mkdirSync(work)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function cfg(): Config {
  // No apiUrl/projectId/sandboxToken, so credential resolution short-circuits
  // and this stays offline.
  return {
    projectTarget: work,
    branchName: SESSION_ID,
    defaultBranch: 'main',
    repoUrl: origin,
    gitUserName: 'Kortix Agent',
    gitUserEmail: 'agent@kortix.test',
  } as unknown as Config
}

describe('commitAndPushWorkingTree with no checkout', () => {
  test('the agent file lands on the session branch', async () => {
    writeFileSync(join(work, 'ke2e-agent-file.md'), 'work\n')

    const result = await commitAndPushWorkingTree(cfg(), { message: 'agent change' })

    expect(result.committed).toBe(true)
    expect(result.pushed).toBe(true)
    expect(result.branch).toBe(SESSION_ID)
    // The pushed tip carries both the repository's tree and the agent's file.
    git(['clone', '--branch', SESSION_ID, origin, join(root, 'check')])
    const check = join(root, 'check')
    if (typeof result.headSha !== 'string') throw new Error('no head sha on the push result')
    expect(gitOut(['rev-parse', 'HEAD'], check)).toBe(result.headSha)
  })

  test('a second save has nothing to do', async () => {
    writeFileSync(join(work, 'ke2e-agent-file.md'), 'work\n')
    await commitAndPushWorkingTree(cfg(), { message: 'agent change' })

    const again = await commitAndPushWorkingTree(cfg(), { message: 'agent change' })

    expect(again.committed).toBe(false)
    expect(again.nothingToDo).toBe(true)
  })

  test('a workspace file at a tracked path is refused, never overwritten', async () => {
    // The agent wrote a file the repository also carries. Materializing must
    // refuse instead of silently replacing the agent's work.
    writeFileSync(join(work, 'README.md'), 'agent wrote here\n')

    await expect(commitAndPushWorkingTree(cfg(), { message: 'agent change' })).rejects.toThrow(
      /git checkout failed/,
    )
    // The agent's file is untouched.
    expect(await Bun.file(join(work, 'README.md')).text()).toBe('agent wrote here\n')
  })

  test('a pushed session branch materializes at its own tip', async () => {
    // The session pushed before (or another box did): the branch exists on
    // the remote, and the materialize starts from THAT tree, not main's.
    const pushed = join(root, 'pushed')
    git(['clone', origin, pushed])
    git(['checkout', '-b', SESSION_ID], pushed)
    writeFileSync(join(pushed, 'earlier.txt'), 'earlier work\n')
    git(['add', '.'], pushed)
    git(['-c', 'user.email=a@k.dev', '-c', 'user.name=A', 'commit', '-m', 'earlier'], pushed)
    git(['push', 'origin', SESSION_ID], pushed)

    writeFileSync(join(work, 'now.txt'), 'now\n')
    const result = await commitAndPushWorkingTree(cfg(), { message: 'second box' })

    expect(result.committed).toBe(true)
    git(['clone', '--branch', SESSION_ID, origin, join(root, 'check2')])
    const check = join(root, 'check2')
    if (typeof result.headSha !== 'string') throw new Error('no head sha on the push result')
    expect(gitOut(['rev-parse', 'HEAD'], check)).toBe(result.headSha)
  })
})
