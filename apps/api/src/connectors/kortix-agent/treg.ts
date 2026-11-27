/**
 * The hosted treg.to API (https://treg.to/integrate.md): its catalog of paid
 * tools and the call that runs one on treg's provider keys. Kortix Toolbox
 * (./toolbox.ts) is the only caller. Every call carries the workspace as an
 * `X-Treg-Meta` tag, set here and never by a model, and a cost ceiling
 * (`X-Treg-Route-Max-Cost`); the real cost comes back in `X-Treg-Cost-Micro`.
 *
 * Only tools treg serves on its own keys are offered (`platform_eligible`,
 * not `own_account`): a tool that acts on a customer's own account (ads,
 * analytics, social posting) belongs to a regular Kortix connector with the
 * customer's sign-in.
 */
import { config } from '../../config';
import { ToolInputError } from './tool';

export interface TregCost {
  type?: string;
  usd?: number | null;
  per?: number;
  unit?: string;
  note?: string;
}

export interface TregEndpoint {
  id: string;
  name?: string;
  summary?: string;
  method?: string;
  path?: string;
  kind?: string;
  scope?: string;
  domain?: string;
  platform_eligible?: boolean;
  platform_blocked?: unknown;
  async?: unknown;
  superseded_by?: string | null;
  cost?: TregCost | null;
  input?: unknown;
  docs_url?: string;
  [key: string]: unknown;
}

export interface TregCallResult {
  status: number;
  body: unknown;
  costMicro: number;
  callId: string | null;
}

/** The treg API Toolbox uses. Tests replace it. */
export interface TregApi {
  search(query: string, limit: number): Promise<TregEndpoint[]>;
  get(id: string): Promise<TregEndpoint | null>;
  call(input: { id: string; method: string; query?: Record<string, string>; body?: unknown; meta: string; maxCostUsd: number }): Promise<TregCallResult>;
}

/** A tool Toolbox may offer: treg's own key serves it, a price is known, it answers at once. Pure. */
export function offerable(e: TregEndpoint): boolean {
  return (
    e.platform_eligible === true &&
    e.scope !== 'own_account' &&
    !e.platform_blocked &&
    !e.superseded_by &&
    e.async == null &&
    typeof e.cost?.usd === 'number'
  );
}

const base = () => config.TREG_API_URL.replace(/\/+$/, '');

async function tregFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${base()}${path}`, {
    ...init,
    headers: { 'X-Treg-Token': config.TREG_API_TOKEN ?? '', Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(60_000),
  });
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

/**
 * A treg refusal as the error the agent should see. Team-level refusals
 * carry Kortix's balance or a top-up link: never shown, only "unavailable".
 */
function refusal(status: number, body: unknown): Error {
  const b = (body && typeof body === 'object' ? body : {}) as { error?: string; message?: string; alternatives?: unknown; estimated_cost_micro?: number };
  switch (b.error) {
    case 'route_max_cost':
      return new ToolInputError(`this call would cost more than Toolbox allows for one call${typeof b.estimated_cost_micro === 'number' ? ` (about ${(b.estimated_cost_micro / 10_000).toFixed(2)} credits)` : ''}; narrow it (fewer results) or pick a cheaper tool`);
    case 'provider_capacity_unavailable':
      return new ToolInputError(`the provider is out of capacity right now; try again in a minute, or another tool${b.alternatives ? `: ${JSON.stringify(b.alternatives).slice(0, 300)}` : ''}`);
    case 'tag_spend_cap_reached':
    case 'tag_blocked':
      return new ToolInputError('this workspace reached its Toolbox spending limit for today');
    case 'insufficient_balance':
    case 'platform_daily_cap_reached':
    case 'funds_required':
      return new Error('the Toolbox catalog is unavailable right now; Kortix has been told');
    default:
      if (status >= 400 && status < 500) return new ToolInputError(`the tool refused the request (${status}): ${(b.message ?? b.error ?? JSON.stringify(body) ?? '').toString().slice(0, 400)}`);
      return new Error(`treg answered ${status}`);
  }
}

const tregApi: TregApi = {
  async search(query, limit) {
    const res = await tregFetch(`/catalog/search?${new URLSearchParams({ q: query, limit: String(limit) })}`);
    const body = (await readJson(res)) as { results?: TregEndpoint[] };
    if (!res.ok) throw refusal(res.status, body);
    return body.results ?? [];
  },
  async get(id) {
    const res = await tregFetch(`/catalog/endpoints/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    const body = (await readJson(res)) as { endpoint?: TregEndpoint } | null;
    if (!res.ok) throw refusal(res.status, body);
    // The endpoint route wraps the tool (`{ endpoint, call_template, example_response, … }`).
    return body?.endpoint ?? null;
  },
  async call({ id, method, query, body, meta, maxCostUsd }) {
    const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : '';
    const send = method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD' && body !== undefined;
    const res = await tregFetch(`/call/${encodeURIComponent(id)}${qs}`, {
      method: method.toUpperCase(),
      headers: { 'X-Treg-Meta': meta, 'X-Treg-Route-Max-Cost': maxCostUsd.toFixed(4), ...(send ? { 'Content-Type': 'application/json' } : {}) },
      ...(send ? { body: JSON.stringify(body) } : {}),
    });
    const parsed = await readJson(res);
    const costMicro = Number(res.headers.get('x-treg-cost-micro') ?? 0) || 0;
    // A treg refusal (its own JSON error) costs nothing; a provider's own 4xx/5xx is relayed as the answer.
    if (!res.ok && parsed && typeof parsed === 'object' && 'error' in parsed && !res.headers.get('x-treg-call-id')) throw refusal(res.status, parsed);
    return { status: res.status, body: parsed, costMicro, callId: res.headers.get('x-treg-call-id') };
  },
};

let api: TregApi = tregApi;
/** Tests replace treg; never called in production. */
export function setTregApiForTests(next: TregApi | null): void {
  api = next ?? tregApi;
}

export function treg(): TregApi {
  return api;
}

export function tregConfigured(): boolean {
  return api !== tregApi || Boolean(config.TREG_API_TOKEN);
}

/** The `X-Treg-Meta` tag of one call: letters, digits and `. _ - :` only. Pure. */
export function tregMeta(input: { workspaceId: string; sessionId: string | null }): string {
  const clean = (v: string) => v.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 128);
  return [`workspace=${clean(input.workspaceId)}`, ...(input.sessionId ? [`session=${clean(input.sessionId)}`] : []), 'product=kortix-toolbox'].join(', ');
}
