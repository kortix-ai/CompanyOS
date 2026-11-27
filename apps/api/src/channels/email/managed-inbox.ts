/**
 * A managed inbox for a workspace, created by the server (no request, no own
 * Resend key): the Humanoid's address on create. It follows the managed path
 * of `POST /{ws}/channels/email/inboxes` (projects/routes/channel-email.ts):
 * create the Resend inbox, ensure the webhook, reserve the address, make sure
 * `kortix_email` exists, store the account; undo the inbox on any failure.
 */
import { config } from '../../config';
import { reconcileChannelConnectors } from '../../connectors/sync';
import {
  createResendInbox,
  deleteResendInbox,
  emailUpstreamStatus,
  ensureResendInboxWebhook,
  resolveEmailApiKey,
} from '../resend-email-api';
import {
  emailConnectorState,
  insertEmailInboxAccount,
  normalizeSenderPolicy,
  releaseEmailInbox,
  reserveEmailInbox,
  type EmailInboxAccount,
} from './installs';
import { managedInboxLocalPart } from './managed-address';

export class ManagedInboxUnavailable extends Error {
  readonly code = 'email_managed_unavailable';
}

/** The managed domain, or null when this server offers no managed inbox. */
export function managedInboxDomain(): string | null {
  if (!config.RESEND_MANAGED_EMAIL_ENABLED || !config.RESEND_API_KEY) return null;
  return config.RESEND_MANAGED_DOMAIN?.trim().toLowerCase() || null;
}

/** The part before the @ for a name: lower case, letters, digits, dots and hyphens. Pure. */
export function inboxUsername(name: string): string | null {
  const raw = name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/\.{2,}/g, '.').replace(/^[-.]+|[-.]+$/g, '');
  return raw.slice(0, 40).replace(/[-.]+$/g, '') || null;
}

/**
 * The addresses to try, in order: the bare name, then the name with four
 * characters of the workspace id, then with four random ones. The managed
 * domain is one namespace for every customer, so a first name is often taken.
 */
export function inboxCandidates(username: string, projectId: string, random: () => string = () => crypto.randomUUID()): string[] {
  const ws = projectId.replace(/-/g, '').slice(0, 4);
  return [username, `${username}-${ws}`, `${username}-${random().replace(/-/g, '').slice(0, 4)}`];
}

export async function createManagedProjectInbox(input: {
  projectId: string;
  accountId: string;
  name: string;
  agentName: string;
  createdBy: string | null;
  /** Where Resend posts inbound mail: KORTIX_URL, else the request's origin. */
  webhookBaseUrl: string;
}): Promise<EmailInboxAccount> {
  const domain = managedInboxDomain();
  const apiKey = resolveEmailApiKey(null);
  if (!domain || !apiKey) throw new ManagedInboxUnavailable('this server offers no managed inbox');
  const username = inboxUsername(input.name);
  if (!username) throw new ManagedInboxUnavailable(`"${input.name}" makes no address`);

  let inbox: Awaited<ReturnType<typeof createResendInbox>> | null = null;
  let lastError: unknown = null;
  for (const candidate of inboxCandidates(username, input.projectId)) {
    const local = managedInboxLocalPart(candidate, config.INTERNAL_KORTIX_ENV);
    if ('error' in local) {
      lastError = new ManagedInboxUnavailable(local.error);
      continue;
    }
    try {
      inbox = await createResendInbox({ apiKey, address: `${local.localPart}@${domain}`, fromName: input.name });
      break;
    } catch (err) {
      lastError = err;
      // 409: the address is taken; try the next one. Anything else is final.
      if (emailUpstreamStatus(err) !== 409) throw err;
    }
  }
  if (!inbox) throw lastError ?? new ManagedInboxUnavailable('no address was free');
  const created = inbox;
  const undo = () => deleteResendInbox(apiKey, created.id).catch(() => {});

  let webhook: Awaited<ReturnType<typeof ensureResendInboxWebhook>>;
  try {
    webhook = await ensureResendInboxWebhook(apiKey, `${input.webhookBaseUrl.replace(/\/+$/, '')}/v1/webhooks/email/resend`);
  } catch (err) {
    await undo();
    throw err;
  }
  await reserveEmailInbox({ projectId: input.projectId, inboxId: created.id, email: created.email_address, agentName: input.agentName });
  let connector = await emailConnectorState(input.projectId);
  if (!connector?.live) {
    await reconcileChannelConnectors(input.projectId);
    connector = await emailConnectorState(input.projectId);
  }
  if (!connector?.live) {
    await releaseEmailInbox(input.projectId, created.id);
    await undo();
    throw new ManagedInboxUnavailable('the email connector could not be set up');
  }
  try {
    return await insertEmailInboxAccount({
      accountId: input.accountId,
      projectId: input.projectId,
      connectorId: connector.connectorId,
      ownerType: 'project',
      ownerId: null,
      label: null,
      inboxId: created.id,
      email: created.email_address,
      displayName: created.from_name ?? input.name,
      senderPolicy: normalizeSenderPolicy({ mode: 'allow_all' }),
      agentName: input.agentName,
      managed: true,
      createdByKortix: true,
      webhookId: webhook.id,
      apiKey: null,
      webhookSecret: webhook.signing_secret,
      createdBy: input.createdBy,
    });
  } catch (err) {
    await releaseEmailInbox(input.projectId, created.id);
    await undo();
    throw err;
  }
}
