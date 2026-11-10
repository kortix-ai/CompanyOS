/**
 * The workspace diff's process contract (KRTX-4601).
 *
 * `vcsDiff` runs on every Changes-tab refetch — on the box's own CPU, while
 * the agent is working. Its cost ceiling is part of the contract: generating
 * the untracked files' patches must cost a bounded number of git processes,
 * not one per file. The per-file `git diff --no-index /dev/null <file>` loop
 * (up to 200 sequential spawns per poll) was the route's dominant CPU cost —
 * ~94 % of a measured diff — and inflated the route's p95 to seconds on busy
 * boxes, with every other daemon route queueing behind it.
 */
import { describe, expect, mock, test } from 'bun:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as gitModule from '@/lib/git/git'

let gitSpawns = 0
const realRunGit = gitModule.runGit
mock.module('@/lib/git/git', () => ({
  ...gitModule,
  runGit: (...args: Parameters<typeof realRunGit>) => {
    gitSpawns++
    return realRunGit(...args)
  },
}))

// Imported after the mock, so vcs-diff binds the counting spy.
const { vcsDiff } = await import('@/lib/git/vcs-diff')

/** A tiny repo: one committed file tree, ready for the caller to dirty. */
async function makeRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'kortix-vcs-diff-'))
  const git = (args: string[]) => realRunGit(args, { cwd: root })
  await git(['init', '-q', '-b', 'main'])
  await git(['config', 'user.email', 'test@kortix.local'])
  await git(['config', 'user.name', 'Kortix Test'])
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src/one.ts'), 'one\n')
  await git(['add', '-A'])
  await git(['commit', '-qm', 'base'])
  return root
}

describe('vcsDiff', () => {
  test('lists tracked modifications and untracked additions with patches', async () => {
    const root = await makeRepo()
    try {
      await writeFile(join(root, 'src/one.ts'), 'one\ntwo\n')
      await writeFile(join(root, 'new.txt'), 'a\nb\nc\n')
      const files = await vcsDiff(root, 'branch', 'main')
      const one = files.find((f) => f.file === 'src/one.ts')
      expect(one?.status).toBe('modified')
      expect(one?.additions).toBe(1)
      expect(one?.patch).toContain('+two')
      const added = files.find((f) => f.file === 'new.txt')
      expect(added?.status).toBe('added')
      expect(added?.additions).toBe(3)
      expect(added?.deletions).toBe(0)
      expect(added?.patch).toContain('new file mode')
      expect(added?.patch).toContain('+c')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('generates the untracked patches in a bounded number of git processes', async () => {
    const root = await makeRepo()
    try {
      // 60 untracked files: the old per-file loop spawns one git per file on
      // top of the fixed calls; the batched pass adds at most three more.
      for (let i = 0; i < 60; i++) await writeFile(join(root, `out-${i}.txt`), `content ${i}\n`)
      gitSpawns = 0
      const files = await vcsDiff(root, 'branch', 'main')
      expect(files.filter((f) => f.file.startsWith('out-')).every((f) => f.patch)).toBe(true)
      expect(gitSpawns).toBeLessThanOrEqual(12)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a file over the patch budget keeps its counts and loses its patch', async () => {
    const root = await makeRepo()
    try {
      await writeFile(join(root, 'big.txt'), 'line\n'.repeat(120_000))
      const files = await vcsDiff(root, 'branch', 'main')
      const big = files.find((f) => f.file === 'big.txt')
      expect(big?.status).toBe('added')
      expect(big?.additions).toBeGreaterThan(0)
      expect(big?.patch).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('past the untracked cap a file is listed with no patch and no counts', async () => {
    const root = await makeRepo()
    try {
      // The cap is 200; one over it pins the degraded-row contract. Zero-padded
      // names so ls-files' byte sort is the numeric order the cap cuts at.
      for (let i = 0; i < 201; i++) await writeFile(join(root, `many-${String(i).padStart(3, '0')}.txt`), 'x\n')
      const files = await vcsDiff(root, 'branch', 'main')
      const over = files.find((f) => f.file === 'many-200.txt')
      expect(over?.status).toBe('added')
      expect(over?.patch).toBeUndefined()
      expect(over?.additions).toBe(0)
      const under = files.find((f) => f.file === 'many-000.txt')
      expect(under?.patch).toBeDefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('a directory that is not a git repo has no changes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kortix-vcs-diff-plain-'))
    try {
      expect(await vcsDiff(root, 'branch', 'main')).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
