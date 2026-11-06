'use client';
import { authUser, browserLogins, createBrowserIdentity } from '@kortix/sdk';
import type { Session, User, SupabaseClient } from '@supabase/supabase-js';
import { parseBrowserRoute } from './browser-route';

let documentSlot: string | null = null;
let identity: ReturnType<typeof createBrowserIdentity> | null = null;
export function browserDocumentIdentity() {
  if (typeof window === 'undefined') return null;
  const selected = parseBrowserRoute(window.location.pathname);
  if (!selected) {
    if (identity) throw new Error('Saved sign-in navigation lost its selector. Reload this page.');
    return null;
  }
  if (!identity) {
    documentSlot = selected.slot;
    identity = createBrowserIdentity();
    identity.select(selected.slot);
  } else if (documentSlot !== selected.slot) {
    identity.select(null);
    window.location.replace(window.location.href);
    throw new Error('Browser identity changed. Reloading.');
  }
  return identity;
}

export async function selectedDocumentSession(): Promise<Session> {
  const selected = browserDocumentIdentity();
  if (!selected) throw new Error('Browser identity unavailable');
  const access_token = await selected.getToken();
  if (!access_token) throw new Error('Browser token acquisition superseded');
  const { user } = await authUser(access_token, { backendUrl: '/v1' });
  if (user.id !== await selected.getUserId()) throw new Error('Browser subject snapshot changed');
  return { access_token, refresh_token: '', token_type: 'bearer', expires_in: 0, user: { ...user, aud: 'authenticated', app_metadata: user.app_metadata ?? {}, user_metadata: user.user_metadata ?? {}, created_at: user.created_at ?? '' } as User };
}

// Selected documents cannot use legacy credentials or credential writers.
export function selectedSupabaseCapability(client: SupabaseClient): SupabaseClient {
  const auth = new Proxy(client.auth, {
    get(_target, key) {
      if (key === 'getSession') return async () => ({ data: { session: await selectedDocumentSession() }, error: null });
      if (key === 'getUser') return async () => ({ data: { user: (await selectedDocumentSession()).user }, error: null });
      if (key === 'onAuthStateChange') return () => ({ data: { subscription: { unsubscribe() {} } } });
      return () => { throw new Error('This control is unavailable for a saved sign-in'); };
    },
  });
  return new Proxy(client, { get(target, key) { return key === 'auth' ? auth : Reflect.get(target, key); } });
}

/** Removal broadcasts only the affected opaque slot. No token or active selection leaves this document. */
export async function removeBrowserDocumentLogin(slot: string): Promise<void> {
  await browserLogins.remove(slot);
  if (identity?.getSlot() === slot) identity.invalidateRoster();
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('kortix-browser-roster');
    channel.postMessage({ slot });
    channel.close();
  }
}
