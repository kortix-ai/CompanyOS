/**
 * `kortix_agent_authenticator`: an authenticator app for an agent. It keeps
 * TOTP keys (RFC 6238, the "Google Authenticator" standard) for the sites the
 * agent signs in to, and gives the current code. The secret never leaves the
 * account's encrypted state: tools return codes and labels only.
 */
import { randomBytes } from 'node:crypto';
import { parseTotpKey, totp, TotpInputError, type TotpKey } from './totp';
import { type AgentTool, DESTRUCTIVE, i, optInt, optStr, READ, s, schema, ToolInputError, WRITE } from './tool';

/** At most this many keys per authenticator account. */
export const AUTHENTICATOR_MAX_KEYS = 200;

export interface AuthenticatorEntry {
  id: string;
  /** What the agent calls it; defaults to "<issuer> (<account>)". */
  label: string;
  key: TotpKey;
  addedAt: string;
}

export interface AuthenticatorData {
  entries?: AuthenticatorEntry[];
}

function view(entry: AuthenticatorEntry) {
  return { id: entry.id, label: entry.label, issuer: entry.key.issuer, account: entry.key.account, digits: entry.key.digits, period: entry.key.period, added_at: entry.addedAt };
}

/** The one entry `args` names by id, label, issuer or account. Pure. */
export function findEntry(entries: readonly AuthenticatorEntry[], args: Record<string, unknown>): AuthenticatorEntry {
  const id = optStr(args, 'id');
  if (id) {
    const hit = entries.find((e) => e.id === id);
    if (!hit) throw new ToolInputError(`no key with id ${id}; list_accounts names them`);
    return hit;
  }
  const query = optStr(args, 'label', 'issuer', 'account', 'site')?.toLowerCase();
  if (!query) throw new ToolInputError('give id, or label, issuer or account');
  const hits = entries.filter((e) => [e.label, e.key.issuer, e.key.account].some((v) => v?.toLowerCase().includes(query)));
  if (hits.length === 1) return hits[0]!;
  if (hits.length === 0) throw new ToolInputError(`no key matches "${query}"; list_accounts names them`);
  throw new ToolInputError(`"${query}" matches ${hits.length} keys (${hits.map((h) => `${h.id} ${h.label}`).join(', ')}); give the id`);
}

export const AUTHENTICATOR_TOOLS: readonly AgentTool<AuthenticatorData>[] = [
  {
    name: 'add_account',
    title: 'Add a 2FA key',
    description:
      'Store the TOTP key a site shows when you turn on two-factor authentication: the otpauth:// URI behind its QR code, or the "can\'t scan? enter this key" text. Returns the current code, which most sites ask for to finish the setup. The key itself is never shown again.',
    inputSchema: schema({
      uri: s('The otpauth://totp/... URI from the QR code.'),
      secret: s('The base32 setup key, when there is no URI.'),
      issuer: s('The site, e.g. "GitHub". Taken from the URI when it has one.'),
      account: s('The login on that site, e.g. the email address.'),
      label: s('Your own name for this key. Default: "<issuer> (<account>)".'),
      digits: i('6 (default) or 8.'),
      period: i('Seconds per code; 30 by default.'),
      algorithm: s('SHA1 (default), SHA256 or SHA512.'),
    }),
    annotations: WRITE,
    async run(args, ctx) {
      const entries = ctx.state.data.entries ?? [];
      if (entries.length >= AUTHENTICATOR_MAX_KEYS) throw new ToolInputError(`this authenticator holds ${AUTHENTICATOR_MAX_KEYS} keys; remove one first`);
      let key: TotpKey;
      try {
        key = parseTotpKey({
          uri: optStr(args, 'uri', 'otpauth_uri'),
          secret: optStr(args, 'secret', 'key'),
          issuer: optStr(args, 'issuer', 'site'),
          account: optStr(args, 'account', 'username', 'email'),
          digits: optInt(args, 'digits'),
          period: optInt(args, 'period'),
          algorithm: optStr(args, 'algorithm'),
        });
      } catch (error) {
        if (error instanceof TotpInputError) throw new ToolInputError(error.message);
        throw error;
      }
      const label = optStr(args, 'label') ?? ([key.issuer, key.account && `(${key.account})`].filter(Boolean).join(' ') || 'Unnamed key');
      const entry: AuthenticatorEntry = { id: `totp_${randomBytes(5).toString('hex')}`, label, key, addedAt: new Date(ctx.now()).toISOString() };
      await ctx.update((data) => {
        const now = data.entries ?? [];
        if (now.length >= AUTHENTICATOR_MAX_KEYS) throw new ToolInputError(`this authenticator holds ${AUTHENTICATOR_MAX_KEYS} keys; remove one first`);
        return { ...data, entries: [...now, entry] };
      });
      const now = totp(key, ctx.now());
      return { ...view(entry), code: now.code, expires_in_seconds: now.expiresInSeconds };
    },
  },
  {
    name: 'list_accounts',
    title: 'List 2FA keys',
    description: 'The keys this authenticator holds: id, label, issuer and account. Never the secrets.',
    inputSchema: schema({}),
    annotations: READ,
    async run(_args, ctx) {
      return { accounts: (ctx.state.data.entries ?? []).map(view) };
    },
  },
  {
    name: 'get_code',
    title: 'Get a 2FA code',
    description: 'The current one-time code for one key, and how many seconds it stays valid. Name the key by id, or by label, issuer or account. If it expires in under 5 seconds, wait and call again.',
    inputSchema: schema({
      id: s('The key id from list_accounts.'),
      label: s('Its label, or part of it.'),
      issuer: s('The site, e.g. "GitHub".'),
      account: s('The login on that site.'),
    }),
    annotations: READ,
    async run(args, ctx) {
      const entry = findEntry(ctx.state.data.entries ?? [], args);
      const now = totp(entry.key, ctx.now());
      return { id: entry.id, label: entry.label, code: now.code, expires_in_seconds: now.expiresInSeconds };
    },
  },
  {
    name: 'remove_account',
    title: 'Remove a 2FA key',
    description: 'Delete one key. Do this only after two-factor authentication is turned off on that site, or the login is lost for good.',
    inputSchema: schema({ id: s('The key id from list_accounts.') }, ['id']),
    annotations: DESTRUCTIVE,
    async run(args, ctx) {
      const entries = ctx.state.data.entries ?? [];
      const entry = findEntry(entries, { id: optStr(args, 'id') });
      await ctx.update((data) => ({ ...data, entries: (data.entries ?? []).filter((e) => e.id !== entry.id) }));
      return { removed: view(entry) };
    },
  },
];
