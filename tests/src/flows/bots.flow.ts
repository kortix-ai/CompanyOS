/**
 * Bots — the project's agents a person can message, behind `kortix_bot`.
 * Spec: tests/spec/end-to-end.md § 7a2. Source of truth:
 * apps/api/src/projects/routes/bots.ts + projects/lib/bots.ts. A bot's chat
 * is the caller's DM space (§ 7a, SPACE-4).
 */
import { BotListSchema, BotPauseResultSchema, type BotList, SpaceSchema } from '@kortix/api-contract';
import { webhookSignature } from '../fixtures/chat';
import { flow, flowMeta } from '../core/flow';
import { insertSession, openWorld } from '../fixtures/agent-principals';
import type { Space } from '../fixtures/space';

const ROUTES = {
  list: 'GET /v1/projects/:projectId/bots',
  dm: 'POST /v1/projects/:projectId/spaces/dm',
};
const FEATURES_ROUTE = 'PATCH /v1/projects/:projectId/features';
const BOTS = '/v1/workspaces/:projectId/bots';
const DM = '/v1/workspaces/:projectId/spaces/dm';

flow('BOT-1', flowMeta('spaces', [...Object.values(ROUTES), FEATURES_ROUTE], { timeoutMs: 120_000 }), async (ctx) => {
  const { team, project, world } = await openWorld(ctx, { manifest: 'bots' });
  const params = { projectId: project.id };
  try {
    await ctx.step('with kortix_bot off (the default), GET /bots → 403 feature_disabled', async () => {
      (await world.owner.get(BOTS, { params })).status(403).body().has('$.code', 'feature_disabled').has('$.feature', 'kortix_bot');
    });

    await ctx.step('an anonymous caller → 401', async () => {
      (await ctx.client.as(ctx.P.ANON).get(BOTS, { params })).status(401);
    });

    await world.setFeature('kortix_bot', true);

    await ctx.step('flag on: the kortix agent is a bot, the default, with no chat yet', async () => {
      const res = await world.owner.get(BOTS, { params });
      res.status(200).body().schema(BotListSchema);
      const bot = res.json<BotList>().bots.find((b) => b.name === 'kortix');
      if (!bot) throw new Error('kortix is not in the bot list');
      const want = { display_name: 'kortix', status: 'active', is_default: true, builtin: false, chat_space_id: null };
      for (const [key, value] of Object.entries(want)) {
        if (bot[key as keyof typeof bot] !== value) throw new Error(`bot.${key} = ${JSON.stringify(bot[key as keyof typeof bot])}, want ${JSON.stringify(value)}`);
      }
    });

    let dmId = '';
    await ctx.step('chat is merged into kortix_bot: with only kortix_bot set, the DM opens and gives the bot its chat_space_id', async () => {
      const dm = await world.owner.post(DM, { agent_name: 'kortix' }, { params });
      dm.status(200).body().schema(SpaceSchema).has('$.kind', 'dm');
      dmId = dm.json<Space>().space_id;
      const res = await world.owner.get(BOTS, { params });
      const bot = res.status(200).json<BotList>().bots.find((b) => b.name === 'kortix');
      if (bot?.chat_space_id !== dmId) throw new Error(`chat_space_id ${bot?.chat_space_id}, want ${dmId}`);
    });

    await ctx.step('another member reads the same bot with no chat of their own', async () => {
      const member = await team.addMember('member');
      await team.grantProjectRole(project.id, member.userId!, 'member');
      await world.grantRun('kortix', member);
      const res = await ctx.client.as(member).get(BOTS, { params });
      const bot = res.status(200).json<BotList>().bots.find((b) => b.name === 'kortix');
      if (!bot || bot.chat_space_id !== null) throw new Error(`member chat_space_id ${bot?.chat_space_id}, want null`);
    });
  } finally {
    await world.close();
  }
});

flow(
  'BOT-2',
  flowMeta(
    'spaces',
    [
      'POST /v1/projects/:projectId/bots/:name/pause',
      'GET /v1/projects/:projectId/bots',
      'POST /v1/workspaces/:projectId/secrets',
      'POST /v1/workspaces/:projectId/triggers',
      'POST /v1/webhooks/workspaces/:projectId/:slug',
      FEATURES_ROUTE,
    ],
    { timeoutMs: 180_000 },
  ),
  async (ctx) => {
    const { team, project, world } = await openWorld(ctx, { manifest: 'bots' });
    const params = { projectId: project.id };
    const PAUSE = '/v1/workspaces/:projectId/bots/:name/pause';
    const secret = `ke2e-bot-hook-${crypto.randomUUID()}`;
    const rawBody = JSON.stringify({ action: 'opened' });
    const deliver = () => {
      const ts = String(Math.floor(Date.now() / 1000));
      return ctx.client.as(ctx.P.ANON).post('/v1/webhooks/workspaces/:projectId/:slug', rawBody, {
        params: { projectId: project.id, slug: 'bot-hook' },
        raw: true,
        headers: { 'content-type': 'application/json', 'x-kortix-timestamp': ts, 'x-kortix-signature': webhookSignature(secret, `${ts}.${rawBody}`) },
      });
    };
    try {
      await ctx.step('with kortix_bot off, POST /bots/kortix/pause → 403 feature_disabled', async () => {
        (await world.owner.post(PAUSE, { paused: true }, { params: { ...params, name: 'kortix' } }))
          .status(403).body().has('$.code', 'feature_disabled').has('$.feature', 'kortix_bot');
      });

      await world.setFeature('kortix_bot', true);

      await ctx.step('a webhook trigger that runs kortix → 201', async () => {
        (await world.owner.post('/v1/workspaces/:projectId/secrets', { name: 'BOT_HOOK_SECRET', value: secret, strategy: 'broker', consumer: 'connector' }, { params }))
          .status(200);
        (await world.owner.post(
          '/v1/workspaces/:projectId/triggers',
          { name: 'bot-hook', slug: 'bot-hook', type: 'webhook', secret_env: 'BOT_HOOK_SECRET', agent: 'kortix', prompt_template: 'New {{ body.action }}' },
          { params },
        )).status(201);
      });

      await ctx.step('an unknown bot → 404 bot_not_found; a non-boolean body → 400', async () => {
        (await world.owner.post(PAUSE, { paused: true }, { params: { ...params, name: 'ghost' } })).status(404).body().has('$.code', 'bot_not_found');
        (await world.owner.post(PAUSE, { paused: 'yes' }, { params: { ...params, name: 'kortix' } })).status(400);
      });

      await ctx.step('a member without trigger.update → 403', async () => {
        const member = await team.addMember('member');
        await team.grantProjectRole(project.id, member.userId!, 'user');
        (await ctx.client.as(member).post(PAUSE, { paused: true }, { params: { ...params, name: 'kortix' } })).status(403);
      });

      await ctx.step('the owner pauses kortix → 200 status paused, stopping its 2 running tasks (one per person); the list says paused', async () => {
        // Two running tasks of kortix, from two people, and one of another agent's that the pause leaves alone.
        const member = await team.addMember('member');
        const running = [await insertSession(world, world.ownerUserId, 'private'), await insertSession(world, member.userId!, 'private')];
        const other = await insertSession(world, world.ownerUserId, 'private', { agentName: 'writer' });
        await world.db.query("UPDATE kortix.project_sessions SET status = 'running' WHERE session_id = ANY($1::text[])", [[...running, other]]);
        (await world.owner.post(PAUSE, { paused: true }, { params: { ...params, name: 'kortix' } }))
          .status(200).body().schema(BotPauseResultSchema).has('$.bot.name', 'kortix').has('$.bot.status', 'paused').has('$.stopped_sessions', 2);
        const bot = (await world.owner.get(BOTS, { params })).status(200).json<BotList>().bots.find((b) => b.name === 'kortix');
        if (bot?.status !== 'paused') throw new Error(`listed status ${bot?.status}, want paused`);
      });

      await ctx.step('a signed webhook delivery while paused → 200 skipped, reason "bot kortix is paused"', async () => {
        (await deliver()).status(200).body().has('$.status', 'skipped').has('$.reason', 'bot kortix is paused');
      });

      await ctx.step('resume → 200 status active; the next delivery is no longer held by the pause', async () => {
        (await world.owner.post(PAUSE, { paused: false }, { params: { ...params, name: 'kortix' } }))
          .status(200).body().has('$.bot.status', 'active').has('$.stopped_sessions', 0);
        const res = await deliver();
        const body = res.json<{ reason?: string }>();
        if (body.reason === 'bot kortix is paused') throw new Error('the delivery after resume was still held by the bot pause');
      });
    } finally {
      await world.close();
    }
  },
);
