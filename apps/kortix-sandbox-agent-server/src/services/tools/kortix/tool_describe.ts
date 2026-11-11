/**
 * tool_describe: the agent tool surface's `describe` verb in a session. Every Kortix
 * agent surface serves the same six tools (skills, search, describe, call,
 * execute, resume); in pi, `codemode` is `execute`. Kortix maintains this
 * file and every session loads it; an agent's `tools` grant decides whether
 * that agent can call it.
 *
 * A call goes to `POST /v1/agent-tools/describe` with the session token, so it
 * runs as this session's agent: its grant, its policies, its approvals, and
 * one row in the project's call log (surface `session`).
 */

interface ToolContext {
  env: Record<string, string | undefined>
  signal?: AbortSignal
}

const TIMEOUT_MS = 60_000

async function verb(name: string, body: Record<string, unknown>, context: ToolContext): Promise<unknown> {
  const api = context.env.KORTIX_API_URL?.trim().replace(/\/+$/, '')
  const token = context.env.KORTIX_TOKEN?.trim()
  if (!api || !token) throw new Error('This session has no Kortix API (KORTIX_API_URL and KORTIX_TOKEN are not set).')
  const project = context.env.KORTIX_PROJECT_ID?.trim()
  const url = `${api.endsWith('/v1') ? api : `${api}/v1`}/agent-tools/${name}${project ? `?project_id=${encodeURIComponent(project)}` : ''}`
  const signal = context.signal ? AbortSignal.any([context.signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS)
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-kortix-surface': 'session' },
    body: JSON.stringify(body),
    signal,
  })
  const text = await res.text()
  let data: unknown = text
  try {
    data = JSON.parse(text)
  } catch {
    /* plain text */
  }
  if (res.status >= 500 || res.status === 401 || res.status === 404) throw new Error(`describe failed: HTTP ${res.status} ${text.slice(0, 500)}`)
  return data
}

export default {
  description: 'The full input and output schema of one tool id from tool_search.',
  parameters: { type: 'object', properties: { id: { type: 'string', description: 'A tool id from tool_search.' } }, required: ['id'] },
  async execute(args: Record<string, unknown>, context: ToolContext) {
    return verb('describe', args, context)
  },
}
