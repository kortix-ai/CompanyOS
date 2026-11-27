/**
 * Slack events in a humanoid workspace (flag `humanoid`): the shape each
 * event takes in the humanoid's event log. Pure.
 */
import type { HumanoidEventInput } from '../../humanoid/events';
import type { SlackEnvelope } from './types';

/**
 * One Slack event as a humanoid event. `addressed`: the agent would act on
 * it (a mention, a DM, a reply in its thread); false keeps it for awareness
 * only. Null when the event is not a message.
 */
export function slackHumanoidEvent(
  projectId: string,
  teamId: string,
  envelope: SlackEnvelope,
  addressed: boolean,
  opts: { ownThreadsOnly?: boolean } = {},
): HumanoidEventInput | null {
  const event = envelope.event;
  if (!event?.channel || !event.ts) return null;
  const isDm = event.channel_type === 'im';
  const thread = event.thread_ts ?? event.ts;
  const text = (event.text ?? '').trim();
  return {
    projectId,
    source: 'slack',
    type: event.type === 'app_mention' || addressed ? 'slack.message.addressed' : 'slack.message.posted',
    subject: `slack:${teamId}:${event.channel}:${thread}`,
    // One row per message: Slack sends a channel mention as both `app_mention`
    // and `message`, and retries with a new event_id.
    externalId: `${teamId}:${event.channel}:${event.ts}`,
    occurredAt: new Date(Number(event.ts) * 1000),
    actor: { kind: 'member', id: event.user ? `slack:${teamId}:${event.user}` : null, name: null },
    audience: isDm && event.user ? `private:slack:${teamId}:${event.user}` : 'team',
    summary: `Slack ${isDm ? 'DM' : 'message'}${text ? `: ${text}` : ''}`,
    payload: { envelope: envelope as unknown as Record<string, unknown>, ownThreadsOnly: opts.ownThreadsOnly ?? false },
    dispatch: addressed,
  };
}
