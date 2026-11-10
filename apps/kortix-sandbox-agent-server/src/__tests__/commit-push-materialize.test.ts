/**
 * Host-driven commit-push on a STATELESS session (#12136): `/workspace` starts
 * empty, so `commitAndPushWorkingTree` materializes the connected repository
 * under the agent's files first. The rows guard the union semantics (repo ∪
 * agent files, the agent winning on a shared path, untouched repo paths never
 * staged as deletions), the no-work no-op, and the restart case (a session
 * branch that exists fast-forwards, never loses pushed work). Real `git`, a
 * local bare remote.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'bun:test'

import { commitAndPushWorkingTree } from '@/lib/git/git'
import { testConfig } from './helpers/daemon-test-app'

function git(args: string[], cwd?: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).trim()
}

const tempDirs: string[] = []
function makeRepo(): { root: string; remote: string; target: string } {
  const root = mkdtempSync(join(tmpdir(), 'commit-push-materialize-'))
  tempDirs.push(root)
  const remote = join(root, 'remote.git')
  const seed = join(root, 'seed')
  const target = join(root, 'workspace')
  git(['init', '--bare', '-b', 'main', remote])
  mkdirSync(seed)
  git(['init', '-b', 'main'], seed)
  writeFileSync(join(seed, 'README.md'), 'base\n')
  mkdirSync(join(seed, 'apps'))
  writeFileSync(join(seed, 'apps', 'x.ts'), 'repo version\n')
  git(['add', '-A'], seed)
  git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'base'], seed)
  git(['remote', 'add', 'origin', remote], seed)
  git(['push', '-q', 'origin', 'main'], seed)
  mkdirSync(target, { recursive: true })
  return { root, remote, target }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** The base repo carries a submodule pointer (a gitlink); the submodule's own
 * checkout never exists in this sandbox — exactly the stateless session. */
function makeRepoWithSubmodule(): { root: string; remote: string; target: string; linkSha: string } {
  const base = makeRepo()
  const seed = join(base.root, 'sub-seed')
  mkdirSync(seed)
  git(['clone', '-q', base.remote, seed])
  const linkSha = git(['rev-parse', 'HEAD'], seed)
  git(['update-index', '--add', '--cacheinfo', `160000,${linkSha},vendor/sub`], seed)
  git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'submodule pointer'], seed)
  git(['push', '-q', 'origin', 'main'], seed)
  return { ...base, linkSha }
}

describe('commitAndPushWorkingTree on a stateless session', () => {
  it('materializes the repo under the agent’s files and pushes the union, agent wins', async () => {
    const { remote, target } = makeRepo()
    // The agent's work in an empty /workspace: a new file and an edit of a
    // tracked path (the agent never saw the repo version).
    writeFileSync(join(target, 'agent-file.md'), 'agent work\n')
    mkdirSync(join(target, 'apps'))
    writeFileSync(join(target, 'apps', 'x.ts'), 'agent version\n')

    const result = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'agent change' },
    )
    expect(result.committed).toBe(true)
    expect(result.pushed).toBe(true)
    expect(result.branch).toBe('session-abc')

    // The pushed tree: the repo's files are NOT deleted, the agent's file is
    // there, and the shared path carries the agent's version.
    const tree = git(['ls-tree', '-r', 'refs/heads/session-abc', '--name-only'], remote)
    expect(tree.split('\n').sort()).toEqual(['README.md', 'agent-file.md', 'apps/x.ts'])
    const shared = git(['show', 'refs/heads/session-abc:apps/x.ts'], remote)
    expect(shared).toBe('agent version')
  })

  it('an empty working tree pushes nothing and creates no branch', async () => {
    const { remote, target } = makeRepo()
    const result = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-idle' }),
      { message: 'nothing' },
    )
    expect(result.nothingToDo).toBe(true)
    expect(result.pushed).toBe(false)
    const branches = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], remote)
    expect(branches).not.toContain('session-idle')
  })

  it('a restarted session fast-forwards its existing session branch', async () => {
    const { remote, target, root } = makeRepo()
    // Pushed work from the session's previous boot stays on the branch.
    const seed = join(root, 'prior')
    mkdirSync(seed)
    git(['clone', '-q', remote, seed])
    git(['checkout', '-q', '-b', 'session-abc'], seed)
    writeFileSync(join(seed, 'prior-work.md'), 'pushed last boot\n')
    git(['add', '-A'], seed)
    git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'prior'], seed)
    git(['push', '-q', '-u', 'origin', 'session-abc'], seed)

    writeFileSync(join(target, 'new-work.md'), 'this boot\n')
    const result = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'this boot' },
    )
    expect(result.pushed).toBe(true)
    expect(result.branch).toBe('session-abc')
    const tree = git(['ls-tree', '-r', 'refs/heads/session-abc', '--name-only'], remote)
    expect(tree.split('\n')).toContain('prior-work.md')
    expect(tree.split('\n')).toContain('new-work.md')
    expect(tree.split('\n')).toContain('README.md')
  })

  it('a second commit-push on the same workspace keeps the repo files it never staged as deletions', async () => {
    const { remote, target } = makeRepo()
    writeFileSync(join(target, 'agent-file.md'), 'agent work\n')
    const first = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'first push' },
    )
    expect(first.pushed).toBe(true)

    // The first materialize left the repo's files on disk (it populated them),
    // so the second call is an ordinary commit-push: the new agent file is
    // added and nothing else disappears.
    writeFileSync(join(target, 'second-file.md'), 'more agent work\n')
    const second = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'second push' },
    )
    expect(second.pushed).toBe(true)
    const tree = git(['ls-tree', '-r', 'refs/heads/session-abc', '--name-only'], remote)
    expect(tree.split('\n').sort()).toEqual(
      ['README.md', 'agent-file.md', 'apps/x.ts', 'second-file.md'],
    )
  })

  it('a fresh session bases on the remote default branch, not the first branch fetch saw', async () => {
    const { remote, target, root } = makeRepo()
    // `aaa` sorts before `main`, so FETCH_HEAD's first entry is aaa — the
    // session must still base on the remote's default branch (HEAD -> main).
    const other = join(root, 'other')
    mkdirSync(other)
    git(['clone', '-q', remote, other])
    git(['checkout', '-q', '-b', 'aaa'], other)
    writeFileSync(join(other, 'wrong-branch.md'), 'aaa only\n')
    git(['add', '-A'], other)
    git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'aaa'], other)
    git(['push', '-q', 'origin', 'aaa'], other)
    expect(git(['symbolic-ref', 'HEAD'], remote)).toBe('refs/heads/main')

    writeFileSync(join(target, 'agent-file.md'), 'agent work\n')
    await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-def' }),
      { message: 'agent change' },
    )
    const tree = git(['ls-tree', '-r', 'refs/heads/session-def', '--name-only'], remote)
    expect(tree.split('\n').sort()).toEqual(['README.md', 'agent-file.md', 'apps/x.ts'])
  })

  it('a failed materialization retries on the next call instead of keeping the partial repo', async () => {
    const { root, target } = makeRepo()
    // The remote does not exist yet: the first materialization must fail and
    // leave no .git behind — a partial repo would read as materialized and
    // the next call would commit without the repository's tree.
    const remote = join(root, 'remote-later.git')
    writeFileSync(join(target, 'agent-file.md'), 'agent work\n')
    await expect(
      commitAndPushWorkingTree(
        testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
        { message: 'too early' },
      ),
    ).rejects.toThrow('git fetch failed')
    expect(existsSync(join(target, '.git'))).toBe(false)

    // The remote comes back: the retry materializes and pushes the union.
    const seed = join(root, 'seed-later')
    mkdirSync(seed)
    git(['init', '--bare', '-b', 'main', remote])
    git(['init', '-b', 'main'], seed)
    writeFileSync(join(seed, 'README.md'), 'base\n')
    mkdirSync(join(seed, 'apps'))
    writeFileSync(join(seed, 'apps', 'x.ts'), 'repo version\n')
    git(['add', '-A'], seed)
    git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'base'], seed)
    git(['remote', 'add', 'origin', remote], seed)
    git(['push', '-q', 'origin', 'main'], seed)

    writeFileSync(join(target, 'second-file.md'), 'more agent work\n')
    const result = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'after recovery' },
    )
    expect(result.pushed).toBe(true)
    const tree = git(['ls-tree', '-r', 'refs/heads/session-abc', '--name-only'], remote)
    expect(tree.split('\n').sort()).toEqual(
      ['README.md', 'agent-file.md', 'apps/x.ts', 'second-file.md'],
    )
  })

  it('populating a pathspec-magic filename never overwrites the agent’s files', async () => {
    const { root, remote, target } = makeRepo()
    // The repo tracks a file whose NAME is git pathspec magic. The populate
    // must restore it as a literal path — a glob would match and overwrite
    // the agent's `real.txt` edit.
    const seed = join(root, 'magic-seed')
    mkdirSync(seed)
    git(['clone', '-q', remote, seed])
    writeFileSync(join(seed, ':(glob)*.txt'), 'magic\n')
    writeFileSync(join(seed, 'real.txt'), 'base\n')
    git(['add', '-A'], seed)
    git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'magic'], seed)
    git(['push', '-q', 'origin', 'main'], seed)

    writeFileSync(join(target, 'real.txt'), 'agent edit\n')
    await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'agent change' },
    )
    const tree = git(['ls-tree', '-r', 'refs/heads/session-abc', '--name-only'], remote)
    expect(tree.split('\n').sort()).toEqual([':(glob)*.txt', 'README.md', 'apps/x.ts', 'real.txt'].sort())
    const kept = git(['show', 'refs/heads/session-abc:real.txt'], remote)
    expect(kept).toBe('agent edit')
  })

  it('a repo directory where the workspace has a file refuses instead of deleting the agent file', async () => {
    const { root, remote, target } = makeRepo()
    // The repo tracks foo/base.txt; the agent made a FILE foo. The union does
    // not exist — the call must refuse and leave the agent's bytes alone.
    const seed = join(root, 'dir-seed')
    mkdirSync(seed)
    git(['clone', '-q', remote, seed])
    mkdirSync(join(seed, 'foo'), { recursive: true })
    writeFileSync(join(seed, 'foo', 'base.txt'), 'repo\n')
    git(['add', '-A'], seed)
    git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'dir'], seed)
    git(['push', '-q', 'origin', 'main'], seed)

    writeFileSync(join(target, 'foo'), 'agent bytes\n')
    await expect(
      commitAndPushWorkingTree(
        testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
        { message: 'agent change' },
      ),
    ).rejects.toThrow('git materialize conflict')
    expect(readFileSync(join(target, 'foo'), 'utf8')).toBe('agent bytes\n')
    expect(existsSync(join(target, '.git'))).toBe(false)
  })

  it('a repo file where the workspace has a directory refuses instead of staging the deletion', async () => {
    const { root, remote, target } = makeRepo()
    // The mirror collision: the repo tracks a blob foo, the agent made a
    // directory foo/. Staging would push the repo file as deleted — refuse.
    const seed = join(root, 'blob-seed')
    mkdirSync(seed)
    git(['clone', '-q', remote, seed])
    writeFileSync(join(seed, 'foo'), 'repo blob\n')
    git(['add', '-A'], seed)
    git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'blob'], seed)
    git(['push', '-q', 'origin', 'main'], seed)

    mkdirSync(join(target, 'foo'))
    writeFileSync(join(target, 'foo', 'bar.md'), 'agent bytes\n')
    await expect(
      commitAndPushWorkingTree(
        testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
        { message: 'agent change' },
      ),
    ).rejects.toThrow('git materialize conflict')
    expect(readFileSync(join(target, 'foo', 'bar.md'), 'utf8')).toBe('agent bytes\n')
    expect(existsSync(join(target, '.git'))).toBe(false)
  })

  it('a symlink ancestor occupying a repo directory refuses instead of replacing the subtree', async () => {
    const { remote, target, root } = makeRepo()
    // The repo tracks a/b; the workspace has `a` as a symlink to an outside
    // directory. lstat resolves the leaf THROUGH the link, so only the
    // ancestor walk sees the collision — staging would replace the repo's
    // whole a/ subtree with the agent's symlink.
    const seed = join(root, 'link-seed')
    mkdirSync(seed)
    git(['clone', '-q', remote, seed])
    mkdirSync(join(seed, 'a'))
    writeFileSync(join(seed, 'a', 'b'), 'repo\n')
    git(['add', '-A'], seed)
    git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'tree'], seed)
    git(['push', '-q', 'origin', 'main'], seed)

    const outside = join(root, 'outside')
    mkdirSync(outside)
    writeFileSync(join(outside, 'b'), 'elsewhere\n')
    symlinkSync(outside, join(target, 'a'))
    await expect(
      commitAndPushWorkingTree(
        testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
        { message: 'agent change' },
      ),
    ).rejects.toThrow('git materialize conflict')
    expect(readFileSync(join(target, 'a', 'b'), 'utf8')).toBe('elsewhere\n')
    expect(existsSync(join(target, '.git'))).toBe(false)
  })

  it('a repo with a submodule keeps its gitlink in the pushed tree, on every push', async () => {
    const { remote, target, linkSha } = makeRepoWithSubmodule()
    writeFileSync(join(target, 'agent-file.md'), 'agent work\n')
    const first = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'first push' },
    )
    expect(first.pushed).toBe(true)

    // The pushed tree still carries the repository's submodule pointer — the
    // materialize cannot check out a submodule, and staging must not read
    // that absence as a deletion.
    const firstTree = git(['ls-tree', '-r', 'refs/heads/session-abc'], remote)
    const firstLink = firstTree.split('\n').find((line) => line.endsWith('\tvendor/sub'))
    expect(firstLink).toMatch(/^160000 commit [0-9a-f]{40}\tvendor\/sub$/)
    expect(firstLink).toContain(linkSha)

    // The second call faces the same absent path (the worktree never has the
    // submodule): the restore must run on every push, not just the first.
    writeFileSync(join(target, 'second-file.md'), 'more agent work\n')
    const second = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'second push' },
    )
    expect(second.pushed).toBe(true)
    const secondTree = git(['ls-tree', '-r', 'refs/heads/session-abc'], remote)
    const secondLink = secondTree.split('\n').find((line) => line.endsWith('\tvendor/sub'))
    expect(secondLink).toMatch(/^160000 commit [0-9a-f]{40}\tvendor\/sub$/)
  })

  it('an empty workspace on a repo with a submodule pushes nothing and creates no branch', async () => {
    // The gitlink's worktree deletion is the only dirty state: the agent
    // wrote nothing. That must be a no-op, not a spurious session branch
    // duplicating the base tip.
    const { remote, target } = makeRepoWithSubmodule()
    const result = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-idle' }),
      { message: 'nothing' },
    )
    expect(result.nothingToDo).toBe(true)
    expect(result.pushed).toBe(false)
    const branches = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads/'], remote)
    expect(branches).not.toContain('session-idle')
  })

  it('a session branch that gained a config-release commit remotely rebases and pushes (GOLD-1)', async () => {
    const { remote, target, root } = makeRepo()
    writeFileSync(join(target, 'agent-file.md'), 'agent work\n')
    const first = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'first push' },
    )
    expect(first.pushed).toBe(true)

    // The API's config-release commit lands on the session branch after the
    // box last fetched (GOLD-1, run 42868914454: the next host push came
    // back non-fast-forward).
    const api = join(root, 'api-release')
    mkdirSync(api)
    git(['clone', '-q', remote, api])
    git(['checkout', '-q', 'session-abc'], api)
    writeFileSync(join(api, 'kortix.yaml'), 'config release\n')
    git(['add', '-A'], api)
    git(['-c', 'user.email=test@kortix.dev', '-c', 'user.name=Kortix Test', 'commit', '-m', 'config release'], api)
    git(['push', '-q', 'origin', 'session-abc'], api)

    // The box's next push integrates the remote tip instead of failing.
    writeFileSync(join(target, 'second-file.md'), 'more agent work\n')
    const second = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'second push' },
    )
    expect(second.pushed).toBe(true)
    const tree = git(['ls-tree', '-r', 'refs/heads/session-abc', '--name-only'], remote)
    expect(tree.split('\n').sort()).toEqual(
      ['README.md', 'agent-file.md', 'apps/x.ts', 'kortix.yaml', 'second-file.md'],
    )
  })

  it('an unborn partial .git from a killed materialize re-materializes instead of a root commit', async () => {
    const { remote, target } = makeRepo()
    // A kill mid-materialize can leave .git initialized with no commit —
    // readRepoInfo answers non-null with branch/commit null. A commit in it
    // would be a root commit holding only the agent files; the push would
    // delete every base file from the session branch.
    writeFileSync(join(target, 'agent-file.md'), 'agent work\n')
    git(['init', '-q'], target)
    git(['remote', 'add', 'origin', remote], target)

    const result = await commitAndPushWorkingTree(
      testConfig({ projectTarget: target, repoUrl: remote, branchName: 'session-abc' }),
      { message: 'agent change' },
    )
    expect(result.pushed).toBe(true)
    const tree = git(['ls-tree', '-r', 'refs/heads/session-abc', '--name-only'], remote)
    expect(tree.split('\n').sort()).toEqual(['README.md', 'agent-file.md', 'apps/x.ts'])
  })

  it('a connected repository with zero commits still refuses with the standing error', async () => {
    const { root, target } = makeRepo()
    // The remote exists but has no commit: nothing to adopt. The standing
    // refusal (the route maps it to 409), not a 500 the route cannot classify.
    const emptyRemote = join(root, 'empty.git')
    git(['init', '--bare', '-b', 'main', emptyRemote])

    await expect(
      commitAndPushWorkingTree(
        testConfig({ projectTarget: target, repoUrl: emptyRemote, branchName: 'session-abc' }),
        { message: 'nothing to adopt' },
      ),
    ).rejects.toThrow('project repo is not materialized')
    expect(existsSync(join(target, '.git'))).toBe(false)
  })

  it('no connected repository still refuses with the standing error', async () => {
    const { target } = makeRepo()
    expect(
      commitAndPushWorkingTree(testConfig({ projectTarget: target })),
    ).rejects.toThrow('project repo is not materialized')
  })
})
