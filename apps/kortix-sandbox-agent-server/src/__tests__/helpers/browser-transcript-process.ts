/** Real pi runtime + local API journal; only external inference is scripted.
 * Launch with Bun from apps/kortix-sandbox-agent-server using --tsconfig-override tsconfig.json.
 * stdin: JSON {apiUrl, projectId, sessionId, token}, then disconnect, release, or stop.
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'

const lines = createInterface({ input: process.stdin })[Symbol.asyncIterator]()
async function line() {
  const next = await lines.next()
  assert(!next.done, 'stdin closed before fixture command')
  return next.value
}
const input = z.object({
  apiUrl: z.string().url(), projectId: z.string().min(1),
  sessionId: z.string().min(1), token: z.string().min(1),
}).parse(JSON.parse(await line()))
assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(input.apiUrl).hostname), 'local API required')
const workspace = await mkdtemp(join(tmpdir(), 'pi-transcript-'))
// Do not inherit provider credentials, user configuration, or debug dump sinks.
for (const key of Object.keys(process.env)) delete process.env[key]
Object.assign(process.env, {
  HOME: workspace, PATH: '/usr/local/bin:/usr/bin:/bin',
  KORTIX_MANAGED_SKILLS_DIR: join(workspace, 'absent'),
  KORTIX_PT_ENV_PATH: join(workspace, 'absent'),
  KORTIX_HARNESS: 'pi', KORTIX_PROJECT_AUTO_CLONE: '0',
  KORTIX_WORKSPACE: workspace, KORTIX_PROJECT_TARGET: workspace,
  KORTIX_RUNTIME_STATE_DIR: join(workspace, '.runtime'),
  KORTIX_PI_STATE_DIR: join(workspace, '.state'),
  KORTIX_PI_AGENT_DIR: join(workspace, '.pi-agent'),
  KORTIX_PI_PACKAGES_DIR: join(workspace, '.pi-packages'),
  KORTIX_API_URL: input.apiUrl, KORTIX_PROJECT_ID: input.projectId,
  KORTIX_SESSION_ID: input.sessionId, KORTIX_TOKEN: input.token,
})
const { startFakeModel } = await import('./fake-model')
const modelId = 'test-model'
const model = startFakeModel(modelId, {
  [modelId]: { name: 'Scripted external inference fixture', limit: { context: 64_000, output: 4_096 } },
})
model.script([{ text: 'This reply is stored in the database.' }])
const gate = Promise.withResolvers<void>()
const proxy = Bun.serve({
  hostname: '127.0.0.1', port: 0, idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/chat/completions')) await gate.promise
    return fetch(new Request(`${model.origin}${url.pathname}${url.search}`, request))
  },
})
// The real API credential belongs only to the journal, never to inference.
const env = { ...process.env, KORTIX_TOKEN: 'dummy-not-a-real-key',
  KORTIX_LLM_BASE_URL: `http://127.0.0.1:${proxy.port}/v1/llm` }
const { loadConfig } = await import('@/harness/harness')
const { requirePiConfig } = await import('@/harness/pi/config')
const { createPiHarnessService } = await import('@/harness/pi/service')
const { createPiSessionLogPort } = await import('@/harness/pi/session-log')
const { startSessionLogJournal, flushSessionLogJournal, stopSessionLogJournal } =
  await import('@/harness/shared/session-log-journal')
const service = createPiHarnessService(requirePiConfig(loadConfig(env)), undefined, { env, releases: { api: null } })
const streams = new Set<() => void>()
const relay = Bun.serve({
  hostname: '127.0.0.1', port: 0, idleTimeout: 0,
  async fetch(request) {
    const url = new URL(request.url)
    assert(url.pathname.endsWith(`/sessions/${input.sessionId}/events`), 'only this session events may be relayed')
    const upstream = await fetch(`${new URL(input.apiUrl).origin}${url.pathname}${url.search}`, { method: request.method, headers: request.headers })
    assert(upstream.body, 'events response has no body')
    const reader = upstream.body.getReader()
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reset = () => {
          controller.error(new Error('controlled SSE transport interruption'))
          void reader.cancel().catch(() => {})
        }
        streams.add(reset)
        try {
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) break
            controller.enqueue(chunk.value)
          }
          controller.close()
        } catch (error) { controller.error(error) }
        finally { streams.delete(reset); await reader.cancel().catch(() => {}) }
      },
      cancel: () => reader.cancel(),
    })
    return new Response(body, { status: upstream.status, headers: upstream.headers })
  },
})
try {
  await service.lifecycle.start()
  const runtime = service.runtime()
  assert(runtime, 'pi runtime did not start')
  assert(startSessionLogJournal(createPiSessionLogPort(() => runtime.sessionLogSnapshot()), { generation: 0 }))
  const turn = runtime.admit({ text: 'Show my saved conversation.', files: [],
    model: { providerID: 'kortix', modelID: modelId } })
  const deadline = Date.now() + 15_000
  while (!runtime.sessionLogSnapshot()?.entries.some(entry => entry.type === 'message' && entry.message.role === 'user')) {
    assert(Date.now() < deadline, 'native user message not persisted')
    await Bun.sleep(10)
  }
  assert.equal(model.bodies.length, 0, 'inference escaped hold')
  assert.equal(await flushSessionLogJournal(), true, 'user journal not acknowledged')
  console.log(JSON.stringify({ ready: true, rootId: runtime.rootId, relayPort: relay.port }))
  for (;;) {
    const command = await line()
    if (command === 'stop') break
    if (command === 'disconnect') {
      assert(streams.size > 0, 'no live SSE connection to reset')
      for (const reset of streams) reset()
      streams.clear()
    } else {
      assert.equal(command, 'release')
      gate.resolve()
      assert.equal(await turn.done, 'completed')
      assert.equal(await flushSessionLogJournal(), true, 'completed journal not acknowledged')
      assert.equal(model.bodies.length, 1)
      console.log(JSON.stringify({ complete: true, modelCalls: model.bodies.length }))
    }
  }
} finally {
  gate.resolve()
  await stopSessionLogJournal()
  await service.lifecycle.stop()
  relay.stop(true)
  proxy.stop(true)
  model.stop()
  await lines.return?.()
  await rm(workspace, { recursive: true, force: true })
}
