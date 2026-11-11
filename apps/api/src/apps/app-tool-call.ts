/**
 * A tool an App exposes (`apps.<slug>.tools`): the connector gateway runs it
 * through the same in-cluster path a trigger target takes (`callAppTarget`).
 * The App is woken when it is stopped. No stored credential goes to it.
 *
 * Every call carries who makes it:
 *
 * - `x-kortix-app-viewer`: the person the call acts for, signed with the App's
 *   own `KORTIX_APP_VIEWER_SECRET` (`readAppViewer(request)` in
 *   `@kortix/sdk/server` verifies it), unless the App shares nothing
 *   (`viewer_token_scope: off`).
 * - `X-Kortix-App-Authorization`: for an agent session, the same ≤ 60 s
 *   assertion naming the session token that an openapi/http connector call to
 *   an App host carries (`createAppAgentAssertion`).
 * - `x-kortix-tool` (`connectors.app-<slug>.<operationId>`), and
 *   `x-kortix-agent` / `x-kortix-session-id` when an agent session calls.
 *   Kortix sets them on this call only; an App authorizes on the signed
 *   headers, never on these.
 */
import { apps } from '@kortix/db';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../shared/db';
import { createAppAgentAssertion } from './access';
import { callAppTarget, type AppCallResult } from './app-call';
import { APP_VIEWER_HEADER, appViewerSecret, encodeAppViewerContext, normalizeViewerTokenScope, resolveAppViewerIdentity, type ViewerIdentity } from './viewer';

/** Header names Kortix owns on an App tool call: never taken from the caller's request. */
const RESERVED_HEADER_RE = /^(authorization|cookie|x-kortix-.*)$/i;

export interface AppToolCaller {
  /** The person the call acts for (a service account id for a service account). */
  userId: string;
  sessionId: string | null;
  /** The presented account token's id. With `sessionId`, the agent session's token. */
  actingTokenId: string | null;
  agentSlug: string | null;
  /** `connectors.app-<slug>.<operationId>`. */
  tool: string;
}

export interface AppToolCallInput {
  projectId: string;
  app: string;
  method: string;
  /** Path and query, already filled from the arguments. */
  path: string;
  /** The request's own headers (`content-type`). Kortix-owned names are dropped. */
  headers: Record<string, string>;
  body?: string;
  caller: AppToolCaller;
  signal?: AbortSignal;
  maxResponseBytes: number;
}

export interface AppToolCallAnswer {
  status: number;
  ok: boolean;
  text: string;
}

export interface AppToolCallDeps {
  loadApp(projectId: string, slug: string): Promise<{ appId: string; accountId: string; accessMode: string; viewerTokenScope: string | null } | null>;
  viewerIdentity(userId: string, accountId: string): Promise<ViewerIdentity>;
  callAppTarget: typeof callAppTarget;
}

const DEFAULT_DEPS: AppToolCallDeps = {
  loadApp: async (projectId, slug) => {
    const [row] = await db
      .select({ appId: apps.appId, accountId: apps.accountId, accessMode: apps.accessMode, viewerTokenScope: apps.viewerTokenScope })
      .from(apps)
      .where(and(eq(apps.projectId, projectId), eq(apps.slug, slug), isNull(apps.deletedAt)))
      .limit(1);
    return row ?? null;
  },
  viewerIdentity: (userId, accountId) => resolveAppViewerIdentity(userId, accountId),
  callAppTarget,
};

/** The headers Kortix adds to an App tool call. Exported for the unit test. */
export async function appToolCallHeaders(
  input: Pick<AppToolCallInput, 'projectId' | 'caller'>,
  app: { appId: string; accountId: string; accessMode: string; viewerTokenScope: string | null },
  viewerIdentity: AppToolCallDeps['viewerIdentity'],
): Promise<Record<string, string>> {
  const { caller } = input;
  const headers: Record<string, string> = { 'x-kortix-tool': caller.tool };
  if (caller.sessionId) headers['x-kortix-session-id'] = caller.sessionId;
  if (caller.agentSlug) headers['x-kortix-agent'] = caller.agentSlug;
  if (caller.sessionId && caller.actingTokenId) {
    headers['X-Kortix-App-Authorization'] = `Bearer ${createAppAgentAssertion({ appId: app.appId, projectId: input.projectId, tokenId: caller.actingTokenId })}`;
  }
  if (normalizeViewerTokenScope(app.viewerTokenScope) !== 'off') {
    const identity = await viewerIdentity(caller.userId, app.accountId);
    headers[APP_VIEWER_HEADER] = encodeAppViewerContext(
      {
        appId: app.appId,
        userId: caller.userId,
        email: identity.email,
        name: identity.name ?? null,
        picture: identity.picture ?? null,
        groupIds: identity.groupIds,
        groups: identity.groups ?? [],
        role: identity.role ?? null,
        projectId: input.projectId,
        accountId: app.accountId,
        accessMode: app.accessMode,
      },
      appViewerSecret(app.appId),
    );
  }
  return headers;
}

/**
 * Run one App tool call. An answer from the App (any status) is returned with
 * its body; no answer at all (no App, no serving release, the machine did not
 * wake, a network error) throws with the reason, which the gateway reports.
 */
export async function callAppTool(input: AppToolCallInput, deps: AppToolCallDeps = DEFAULT_DEPS): Promise<AppToolCallAnswer> {
  const app = await deps.loadApp(input.projectId, input.app);
  if (!app) throw new Error(`app_not_found: no App "${input.app}" in this project. Deploy it, or remove apps.${input.app}.tools from kortix.yaml.`);
  const own = Object.fromEntries(Object.entries(input.headers).filter(([name]) => !RESERVED_HEADER_RE.test(name)));
  const result: AppCallResult = await deps.callAppTarget({
    projectId: input.projectId,
    app: input.app,
    method: input.method,
    path: input.path,
    ...(input.body !== undefined ? { body: input.body } : {}),
    headers: { ...own, ...(await appToolCallHeaders(input, app, deps.viewerIdentity)) },
    readBody: { maxBytes: input.maxResponseBytes },
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (result.status === null) throw new Error(`app_unavailable: ${result.error ?? `App "${input.app}" did not answer`}`);
  return { status: result.status, ok: result.ok, text: result.body?.text ?? '' };
}
