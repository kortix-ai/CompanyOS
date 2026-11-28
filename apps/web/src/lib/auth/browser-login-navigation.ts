import { browserIdentityPath, parseBrowserRoute, stripBrowserSelector } from './browser-route';

/** Only an in-origin app path survives authentication; supplied selectors never do. */
export function loginDestination(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value))
    return '/projects';
  try {
    const clean = stripBrowserSelector(value);
    const url = new URL(clean, 'https://local.invalid');
    if (
      url.origin !== 'https://local.invalid' ||
      /%2f|%5c/i.test(url.pathname) ||
      /(?:^|\/)auth(?:\/|$)/.test(url.pathname)
    )
      return '/projects';
    return url.pathname + url.search;
  } catch {
    return '/projects';
  }
}
export function accountHref(slot: string, destination: string) {
  const scoped = browserIdentityPath(
    loginDestination(destination),
    `/u/${encodeURIComponent(slot)}/projects`,
  );
  return parseBrowserRoute(scoped.split('?')[0])
    ? scoped
    : `/u/${encodeURIComponent(slot)}/projects`;
}

/** OAuth destinations belong to exactly one attempt; legacy or foreign state is discarded. */
export function loginAttemptDestination(
  stored: string | null,
  attempt: string,
  fallback: string,
): string {
  try {
    const value = JSON.parse(stored ?? 'null');
    if (value?.attempt === attempt && typeof value.destination === 'string')
      return loginDestination(value.destination);
  } catch {
    /* A prior unbound value cannot select a new attempt's destination. */
  }
  return loginDestination(fallback);
}
