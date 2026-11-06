import { authUser, browserLogins, type BrowserBrokerOptions } from '@kortix/sdk';

export interface BrowserRequestOptions {
  /** Trusted deployment configuration, never forwarded Host or Origin. */
  frontendOrigin: string;
  backendOrigin: string;
  fetch?: BrowserBrokerOptions['fetch'];
}

/** Request-scoped SDK host adapter. Never retains a token or a user globally. */
export async function resolveBrowserRequest(request: Request, slot: string, options: BrowserRequestOptions) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(slot)) throw new Error('Invalid browser route');
  const frontend = new URL(options.frontendOrigin);
  const backend = new URL(options.backendOrigin);
  for (const origin of [frontend, backend]) {
    if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) {
      throw new Error('Browser identity requires HTTPS outside loopback');
    }
    if (origin.username || origin.password) throw new Error('Invalid broker origin');
  }
  const cookieName = frontend.protocol === 'https:' ? '__Host-kortix-vault' : `kortix-vault-local-${frontend.port || '80'}`;
  const cookies = (request.headers.get('cookie') ?? '').split(';').map((pair) => pair.trim()).filter((pair) => pair.startsWith(`${cookieName}=`));
  if (cookies.length !== 1 || !cookies[0].slice(cookieName.length + 1)) throw new Error('Browser handle required');
  const cookie = cookies[0];
  return browserLogins.token(slot, {
    signal: request.signal,
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('origin', frontend.origin);
      if (cookie) headers.set('cookie', cookie);
      return (options.fetch ?? fetch)(new URL(String(input), backend.origin), { ...init, headers, redirect: 'error' });
    },
  });
}

export async function resolveVerifiedBrowserRequest(request: Request, slot: string, options: BrowserRequestOptions) {
  const token = await resolveBrowserRequest(request, slot, options);
  const { user } = await authUser(token.access_token, {
    backendUrl: options.backendOrigin,
    signal: request.signal,
    fetch: (input, init) => (options.fetch ?? fetch)(input, { ...init, cache: 'no-store', redirect: 'error' }),
  });
  if (user.id !== token.user_id) throw new Error('Browser identity unavailable');
  return { ...token, user };
}
