export type Audience = 'developer' | 'enterprise';

/** Where the choice is kept. The inline script reads the same key. */
export const AUDIENCE_KEY = 'kortix-audience';
/** The enterprise page, relative to the home route (the locale prefix is kept). */
export const ENTERPRISE_PATH = 'companyos';

/**
 * Decides what a visit to the home route shows. A stored "developer", a
 * section link (`/#factories`) or `?audience=developer` opens the page with no
 * gate. A stored "enterprise" goes to the enterprise page. Anything else shows
 * the gate. Self-contained: it also runs as an inline script before the first
 * paint, so it reads nothing from this module.
 */
export function decide(key: string, enterprisePath: string): void {
  const root = document.documentElement;
  delete root.dataset.audience;
  try {
    let audience = localStorage.getItem(key);
    if (/[?&]audience=developer(&|$)/.test(location.search)) {
      localStorage.setItem(key, 'developer');
      audience = 'developer';
    }
    if (audience === 'enterprise' && !location.hash) {
      location.replace(`${location.pathname.replace(/\/$/, '')}/${enterprisePath}`);
      return;
    }
    if (audience === 'developer' || location.hash) root.dataset.audience = 'developer';
  } catch {
    // Storage is blocked: never trap the visitor behind a choice that cannot be kept.
    root.dataset.audience = 'developer';
  }
}

/** `decide` as an inline script: the gate puts it in the server HTML, so it runs before the first paint. */
export const AUDIENCE_BOOT = `(${decide.toString()})(${JSON.stringify(AUDIENCE_KEY)},${JSON.stringify(ENTERPRISE_PATH)})`;

export function rememberAudience(audience: Audience) {
  try {
    localStorage.setItem(AUDIENCE_KEY, audience);
  } catch {
    // Storage is off: the gate shows again on the next visit.
  }
}
