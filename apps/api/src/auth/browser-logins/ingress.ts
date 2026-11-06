/** Never derive the trusted origin from forwarded request headers. */
export function browserLoginWriteAllowed(request: Request, frontendUrl: string): boolean {
  const trusted = new URL(frontendUrl).origin;
  return request.method === 'POST'
    && request.headers.get('origin') === trusted
    && request.headers.get('x-kortix-browser-login') === '1'
    && request.headers.get('sec-fetch-site') !== 'cross-site';
}

/** Cookies ignore ports. Local worktrees must use different cookie names. */
export function browserHandleCookieName(frontendUrl: string): string {
  const url = new URL(frontendUrl);
  if (url.protocol === 'https:') return '__Host-kortix-vault';
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Browser login requires HTTPS outside loopback');
  }
  return `kortix-vault-local-${url.port || '80'}`;
}
