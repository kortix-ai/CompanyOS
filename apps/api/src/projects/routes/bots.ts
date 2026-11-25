// GET /v1/projects/:projectId/bots — the project's bots for the caller (flag
// `kortix_bot`). A bot is an agent from kortix.yaml; its chat is the caller's
// DM space with it, opened through `POST /spaces/dm` (lib/bots.ts).
import { createRoute, z } from '@hono/zod-openapi';
import { BotListSchema, BotPauseInputSchema, BotPauseResultSchema } from '@kortix/api-contract';
import { PROJECT_ACTIONS } from '../../iam';
import { requireFeatureFlag } from '../../feature-flags/gate';
import { auth, errors, json } from '../../openapi';
import { workspaceIdParam } from '../../shared/route-params';
import { loadProjectAgents } from '../agents';
import { assertProjectCapability, loadProjectForUser } from '../lib/access';
import { projectsApp } from '../lib/app';
import { botsFromAgents, dmSpacesByAgent, pausedAgents, setBotPaused, stopBotRuns } from '../lib/bots';

export function registerBotRoutes(): void {
  projectsApp.openapi(
    createRoute({
      method: 'get',
      path: '/{workspaceId}/bots',
      tags: ['bots'],
      summary: 'List the bots the caller can message',
      description:
        'The project\'s agents a person can message, as bots: every agent in kortix.yaml except `mode: subagent` ones, and My Kortix when ' +
        'the project runs it. `chat_space_id` is the caller\'s chat with the bot, null until they open it with `POST /spaces/dm`. Flag `kortix_bot`.',
      ...auth,
      request: { params: z.object({ workspaceId: z.string() }) },
      responses: { 200: json(BotListSchema, 'The bots'), ...errors(403, 404) },
    }),
    async (c) => {
      const loaded = await loadProjectForUser(c, workspaceIdParam(c)!, 'session');
      if (!loaded) return c.json({ error: 'Not found' }, 404);
      const gate = requireFeatureFlag(c, loaded.row.metadata, 'kortix_bot');
      if (gate) return gate;
      const [agents, dms] = await Promise.all([
        loadProjectAgents(loaded.row, { forceRefresh: 'tip-proof' }),
        dmSpacesByAgent(loaded.row.projectId, loaded.userId),
      ]);
      return c.json({ bots: botsFromAgents(agents, dms, pausedAgents(loaded.row.metadata)) }, 200);
    },
  );

  projectsApp.openapi(
    createRoute({
      method: 'post',
      path: '/{workspaceId}/bots/{name}/pause',
      tags: ['bots'],
      summary: 'Pause or resume a bot',
      description:
        'Body `{ paused }`. A paused bot still gets messages, but no schedule, webhook, event or monitor starts it: an automatic trigger fire of its agent ' +
        'is skipped with reason `bot <name> is paused`. A person firing a trigger by hand still runs it. Pausing also stops every running task of the bot, for every person ' +
        '(`stopped_sessions` counts them). Needs the trigger-update permission. Flag `kortix_bot`.',
      ...auth,
      request: {
        params: z.object({ workspaceId: z.string(), name: z.string() }),
        body: { required: true, content: { 'application/json': { schema: BotPauseInputSchema } } },
      },
      responses: { 200: json(BotPauseResultSchema, 'The bot after the change'), ...errors(400, 403, 404) },
    }),
    async (c) => {
      const projectId = workspaceIdParam(c)!;
      const loaded = await loadProjectForUser(c, projectId, 'session');
      if (!loaded) return c.json({ error: 'Not found' }, 404);
      const gate = requireFeatureFlag(c, loaded.row.metadata, 'kortix_bot');
      if (gate) return gate;
      await assertProjectCapability(c, loaded.userId, loaded.row.accountId, projectId, PROJECT_ACTIONS.PROJECT_TRIGGER_UPDATE);
      const name = c.req.param('name');
      const agents = await loadProjectAgents(loaded.row, { forceRefresh: 'tip-proof' });
      const known = botsFromAgents(agents, new Map()).some((bot) => bot.name === name);
      if (!known) return c.json({ error: `No bot "${name}" in this workspace.`, code: 'bot_not_found' }, 404);
      const { paused } = c.req.valid('json');
      const metadata = await setBotPaused(projectId, name, paused);
      if (metadata === null) return c.json({ error: 'Not found' }, 404);
      // Written first: a trigger that fires while the tasks stop is already held.
      const stopped = paused ? await stopBotRuns(projectId, name, loaded.userId) : 0;
      const dms = await dmSpacesByAgent(projectId, loaded.userId);
      const bot = botsFromAgents(agents, dms, pausedAgents(metadata)).find((b) => b.name === name)!;
      return c.json({ bot, stopped_sessions: stopped }, 200);
    },
  );
}
