/**
 * My Kortix reads sessions with its person's standing.
 *
 * My Kortix acts with exactly its person's rights: its grant is not governed
 * (`isGovernedAgentGrant`), so `authorize` evaluates its token as that person.
 * The token is still bound to its own session, and the session read rules
 * (`session-visibility.ts`, `session-list.ts`) drop every bound token's
 * manager and oversight standing, so a sandbox started by an admin cannot read
 * the project's other private sessions. That rule is right for an agent and
 * wrong for My Kortix: it listed a trigger run its person can open, then got
 * "not found" when it read it.
 *
 * The standing comes back on read routes only, and only for sessions no
 * person owns (a trigger run, a session an agent or a key started). A private
 * session another member started stays closed to My Kortix even when its
 * person may open it through account oversight.
 *
 * Its own module, not `iam/actor.ts`: 19 suites replace that module wholesale
 * with `mock.module`, and every name added there is a name each stub would have
 * to declare.
 */
import { isMyKortixAgentName } from '@kortix/shared';
import type { Actor } from '../../iam/actor';

/**
 * The person a My Kortix session credential acts for, or null.
 *
 * Null for every other credential; for an agent that authorizes as its
 * service account (governed, activated, or an agent key); for a grant that is
 * not `permissions: 'all'` (`disabledMyKortixAgentGrant`: My Kortix turned off
 * in kortix.yaml); and when `on_behalf_of` is not the token's user: an
 * unattended turn, or another member prompted the session
 * (`projects/lib/on-behalf-of.ts`).
 */
export function myKortixPersonId(actor: Actor | null | undefined): string | null {
  if (!actor) return null;
  const c = actor.credential;
  if (c.kind !== 'agent_session') return null;
  if (c.agentPrincipal || c.activated || c.serviceAccountKey || !c.sessionId) return null;
  if (!c.agentGrant || !isMyKortixAgentName(c.agentGrant.agent)) return null;
  if (c.agentGrant.permissions !== 'all') return null;
  return c.onBehalfOfUserId && c.onBehalfOfUserId === actor.userId ? actor.userId : null;
}
