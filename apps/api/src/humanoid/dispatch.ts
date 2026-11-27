/**
 * The humanoid dispatcher: one job per inbound event (`humanoid.dispatch`),
 * run in order per subject. Code decides where an event goes; the model
 * decides what to do with it.
 *
 *   1. A channel delivery is registered for the source (email, Slack, …):
 *      the channel's own thread routing delivers it — the thread's owning
 *      session gets the follow-up, a new thread starts a working thread.
 *   2. Anything else (connector events, schedules, goal wakes, finished
 *      sessions, posted events) goes to the mind's digest.
 */
import { logger } from '../lib/logger';
import { registerJobHandler } from '../shared/job-queue';
import { HUMANOID_DISPATCH_QUEUE, getHumanoidEvent, markEventDispatched, type HumanoidEventRow } from './events';
import { digestToMind } from './mind';

/** Delivers one event through its channel. Returns the session that took it, or null. */
export type HumanoidDelivery = (event: HumanoidEventRow, run: { finalAttempt: boolean }) => Promise<{ sessionId: string | null }>;

// replica-local: delivery functions registered at import by each channel module; identical on every process.
const deliveries = new Map<string, HumanoidDelivery>();

/** A channel registers how it delivers its own events. */
export function registerHumanoidDelivery(source: string, deliver: HumanoidDelivery): void {
  deliveries.set(source, deliver);
}

let digest: (event: HumanoidEventRow) => Promise<string | null> = digestToMind;
/** Tests replace the mind; never called in production. */
export function setDigestForTests(fn: typeof digest | null): void {
  digest = fn ?? digestToMind;
}

export type DispatchRoute = 'deliver' | 'digest' | 'skip';

/** Pure: where one event goes. */
export function routeOf(event: Pick<HumanoidEventRow, 'direction' | 'dispatchStatus' | 'source'>, hasDelivery: boolean): DispatchRoute {
  if (event.direction !== 'in' || event.dispatchStatus !== 'pending') return 'skip';
  return hasDelivery ? 'deliver' : 'digest';
}

export async function dispatchHumanoidEvent(eventId: number, finalAttempt: boolean): Promise<DispatchRoute> {
  const event = await getHumanoidEvent(eventId);
  if (!event) return 'skip';
  const deliver = deliveries.get(event.source);
  const route = routeOf(event, Boolean(deliver));
  try {
    if (route === 'deliver') {
      const { sessionId } = await deliver!(event, { finalAttempt });
      await markEventDispatched(eventId, 'routed', { sessionId });
    } else if (route === 'digest') {
      const mind = await digest(event);
      if (!mind) throw new Error('the humanoid has no conversation to receive the event');
      await markEventDispatched(eventId, 'digested', { sessionId: mind });
    }
    return route;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (finalAttempt) {
      await markEventDispatched(eventId, 'dead', { error: message.slice(0, 1000) });
      logger.error('[humanoid] event dead after the last attempt', { eventId, projectId: event.projectId, error: message });
    }
    throw err;
  }
}

registerJobHandler(
  HUMANOID_DISPATCH_QUEUE,
  async (job) => {
    const eventId = Number((job.payload as { eventId?: unknown }).eventId);
    if (!Number.isSafeInteger(eventId)) return;
    await dispatchHumanoidEvent(eventId, job.attempts >= job.maxAttempts);
  },
  5 * 60_000,
);
