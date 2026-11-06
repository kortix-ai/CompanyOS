import { browserLogins } from "../rest/platform-client/browser-logins";
import { HeadlessAuthError } from "../rest/platform-client/auth";

export interface BrowserLoginToken {
  access_token: string;
  expires_at: number;
  user_id: string;
}
export interface BrowserIdentityOptions {
  /** Inject the host fetch. Requests always use the same-origin broker. */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Host persists only the opaque per-tab slot, never credentials. */
  saveSlot?: (slot: string | null) => void;
  now?: () => number;
}
/** Memory-only token adapter. Create once per tab and pass getToken/getUserId to createKortix. */
export function createBrowserIdentity(options: BrowserIdentityOptions = {}) {
  let slot: string | null = null;
  let generation = 0;
  let selectionVersion = 0;
  let token: BrowserLoginToken | null = null;
  let pending: Promise<string | null> | null = null;
  const listeners = new Set<() => void>();
  const invalidate = () => {
    generation++;
    token = null;
    pending = null;
    for (const listener of listeners) listener();
  };
  const getToken = Object.assign(
    async (): Promise<string | null> => {
      if (!slot) return null;
      if (
        token &&
        token.expires_at * 1000 > (options.now?.() ?? Date.now()) + 60_000
      )
        return token.access_token;
      if (pending) return pending;
      const selected = slot;
      const version = generation;
      const request = (async () => {
        let next: BrowserLoginToken;
        try {
          next = await browserLogins.token(selected, { fetch: options.fetch });
        } catch (error) {
          if (version !== generation) return null;
          invalidate();
          throw error;
        }
        if (version !== generation) return null;
        if (
          typeof next.access_token !== "string" ||
          typeof next.user_id !== "string" ||
          !Number.isFinite(next.expires_at)
        ) {
          invalidate();
          throw new HeadlessAuthError(
            "invalid_response",
            "Invalid browser identity response",
            503,
          );
        }
        token = next;
        return next.access_token;
      })();
      pending = request;
      try {
        return await request;
      } finally {
        if (version === generation) pending = null;
      }
    },
    {
      identityKey: () => slot === null ? null : `${slot}:${selectionVersion}`,
      invalidate: (lastToken?: string) => {
        if (!lastToken || token?.access_token === lastToken) invalidate();
      },
    },
  );
  return {
    getToken,
    getUserId: async () => token?.user_id ?? null,
    select(next: string | null) {
      if (next === slot) return;
      slot = next;
      selectionVersion++;
      invalidate();
      options.saveSlot?.(next);
    },
    getSlot: () => slot,
    /** Inject a token-free roster/revocation notification from the host. No cross-tab selection sync. */
    invalidateRoster: () => { selectionVersion++; invalidate(); },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
