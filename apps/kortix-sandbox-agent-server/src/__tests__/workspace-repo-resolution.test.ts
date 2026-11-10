/**
 * The host-driven git flows must find the session's clone.
 *
 * A session no longer checks the repository out at boot (2026-11-08,
 * kortix-ai/CompanyOS#12136): `/workspace` starts empty, and an agent that
 * needs the code runs `kortix workspaces clone`, which lands the checkout in
 * `<projectTarget>/<repo-name>` on the session branch. `commitAndPushWorkingTree`
 * and `refreshRepo` read only `<projectTarget>/.git`, so on every new session
 * `POST /kortix/git/commit-push` answered 409 "project repo is not
 * materialized" — the API's published session commit-push route (spec
 * `tests/spec/end-to-end.md` RUN-7) could never succeed again.
 *
 * Real repositories, no mocks: the behaviour under test is git's (where a
 * clone lands, what its origin is), matching refresh-unpushed-branch.test.ts.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Config } from '@/lib/config/config'
import { commitAndPushWorkingTree, refreshRepo } from '@/lib/git/git'

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

const SESSION_ID = '00000000-0000-4000-8000-00000000a0b1'

let root: string
let origin: string
let workspace: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'kortix-repo-resolution-'))
  origin = join(root, 'origin.git')
  workspace = join(root, 'workspace')

  git(['init', '--bare', '-b', 'main', origin])

  const seed = join(root, 'seed')
  mkdirSync(seed)
  git(['init', '-b', 'main'], seed)
  writeFileSync(join(seed, 'README.md'), 'base\n')
  git(['add', '.'], seed)
  git(['-c', 'user.email=t@k.dev', '-c', 'user.name=T', 'commit', '-m', 'base'], seed)
  git(['remote', 'add', 'origin', origin], seed)
  git(['push', '-u', 'origin', 'main'], seed)

  // The box post-#12136: an empty workspace root, no checkout anywhere.
  mkdirSync(workspace)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** The clone an in-session `kortix workspaces clone` produces: the repo's
 *  basename under the workspace root, checked out on the session branch. */
function cloneIntoWorkspace(): string {
  const clone = join(workspace, 'origin')
  git(['clone', origin, clone])
  git(['checkout', '-b', SESSION_ID], clone)
  return clone
}

function cfg(): Config {
  // No apiUrl/projectId/sandboxToken, so credential resolution short-circuits
  // and this stays offline.
  return {
    projectTarget: workspace,
    branchName: SESSION_ID,
    defaultBranch: 'main',
    repoUrl: origin,
    // The daemon always boots with the platform git identity set.
    gitUserName: 'Kortix Agent',
    gitUserEmail: 'agent@kortix.test',
  } as unknown as Config
}

describe('the workspace repository working tree', () => {
  test('commit-push commits and pushes the session clone under an empty boot root', async () => {
    const clone = cloneIntoWorkspace()
    writeFileSync(join(clone, 'agent-work.md'), 'work\n')

    const result = await commitAndPushWorkingTree(cfg(), { message: 'agent change' })

    expect(result.committed).toBe(true)
    expect(result.pushed).toBe(true)
    expect(result.branch).toBe(SESSION_ID)
    const pushedTip = gitOut(['log', '--format=%s', `-1`, `origin/${SESSION_ID}`], clone)
    expect(pushedTip).toBe('agent change')
  })

  test('refresh fetches the session branch in the clone under an empty boot root', async () => {
    const clone = cloneIntoWorkspace()

    const { before, after } = await refreshRepo(cfg())

    expect(before.branch).toBe(SESSION_ID)
    expect(after.branch).toBe(SESSION_ID)
  })

  test('an empty workspace with no clone stays "not materialized"', async () => {
    expect(commitAndPushWorkingTree(cfg())).rejects.toThrow('project repo is not materialized')
  })

  test('the boot root wins when it already holds the checkout', async () => {
    // Sessions booted before #12136 (and template images) keep a checkout at
    // the boot root; it must keep working unchanged.
    git(['clone', origin, workspace])
    git(['checkout', '-b', SESSION_ID], workspace)
    writeFileSync(join(workspace, 'agent-work.md'), 'work\n')

    const result = await commitAndPushWorkingTree(cfg(), { message: 'agent change' })

    expect(result.pushed).toBe(true)
    expect(result.branch).toBe(SESSION_ID)
  })
})
