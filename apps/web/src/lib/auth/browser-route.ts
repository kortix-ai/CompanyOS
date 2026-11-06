import { locales } from '../../i18n/catalog.mjs';

export const BROWSER_SLOT_HEADER = 'x-kortix-browser-slot';
const SLOT = /^[A-Za-z0-9_-]{1,128}$/;
const PRIVATE_PATH =
  /^\/(?:projects|dashboard|settings|admin|onboarding|billing|invites|notifications|new|p|setup|connections|connectors|capture|github|cli|oauth|tunnel|approve|panel|preview|(?:slack|teams)\/(?:install|login))(?:\/|$)/;

export function stripBrowserIdentityHeaders(headers: Headers): void {
  for (const key of [...headers.keys()]) {
    if (key.startsWith('x-kortix-browser-')) headers.delete(key);
  }
}

/** Slots select credentials only together with the HttpOnly browser handle. */
export function parseBrowserRoute(pathname: string) {
  const segments = pathname.split('/');
  let offset = 1;
  const locale = (locales as readonly string[]).includes(segments[offset])
    ? segments[offset++]
    : null;
  if (segments[offset] !== 'u') return null;
  const slot = segments[offset + 1];
  if (!slot || !SLOT.test(slot) || slot === '.' || slot === '..')
    throw new Error('Invalid browser route');
  const rest = segments.slice(offset + 2);
  if (rest.some((segment) => segment === '.' || segment === '..' || /%2f|%5c/i.test(segment)))
    throw new Error('Invalid browser route');
  return { locale, slot, pathname: `/${rest.join('/')}` };
}

/** Copy/share URLs omit the browser-local selector. */
export function stripBrowserSelector(href: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const boundary = href.search(/[?#]/);
  const pathname = boundary < 0 ? href : href.slice(0, boundary);
  const suffix = boundary < 0 ? '' : href.slice(boundary);
  const route = parseBrowserRoute(pathname);
  return route ? `${route.locale ? `/${route.locale}` : ''}${route.pathname}${suffix}` : href;
}

export function browserIdentityPath(href: string, currentPathname: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const current = parseBrowserRoute(currentPathname);
  if (!current) return href;
  const explicit = parseBrowserRoute(href.split(/[?#]/)[0]);
  const clean = stripBrowserSelector(href);
  const boundary = clean.search(/[?#]/);
  const path = boundary < 0 ? clean : clean.slice(0, boundary);
  const suffix = boundary < 0 ? '' : clean.slice(boundary);
  const segments = path.split('/');
  const locale = (locales as readonly string[]).includes(segments[1])
    ? segments.splice(1, 1)[0]
    : current.locale;
  const destination = segments.join('/');
  if (!PRIVATE_PATH.test(destination)) return clean;
  return `${locale ? `/${locale}` : ''}/u/${explicit?.slot ?? current.slot}${destination}${suffix}`;
}
