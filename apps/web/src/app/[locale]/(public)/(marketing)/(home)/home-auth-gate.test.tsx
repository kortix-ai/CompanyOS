/**
 * Regression tests for the marketing home's auth gate (KRTX-4736).
 *
 * A signed-in visitor whose session cookie the middleware cannot settle
 (expired or inside the refresh margin — `cookieIdentityPlan` must not create
 * an auth client, KRTX-2111) fell through to the static marketing home and
 * nothing ever redirected them: the browser client refreshed the session, the
 * navbar flipped to signed-in, and the visitor stayed on the landing.
 *
 * The gate holds a session-cookie visitor on the pending frame while
 * `useAuth()` resolves, then `router.replace`s into the app; a signed-out
 * resolution renders the landing. Every destination must be an app path.
 */
import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });

/** The mutable auth state the mocked `useAuth` reads at call time. */
const auth = {
  user: null as { id: string } | null,
  isLoading: true,
};

const replaced: string[] = [];

// One stable router object: the real `useRouter()` returns a stable reference,
// so the gate's effect must not re-run on every render.
const routerMock = { replace: (path: string) => replaced.push(path) };

mock.module('next/navigation', () => ({
  useRouter: () => routerMock,
}));

mock.module('@/features/providers/auth-provider', () => ({
  useAuth: () => ({
    supabase: {},
    session: null,
    user: auth.user,
    isLoading: auth.isLoading,
    bootstrapError: null,
    retryAuth: () => {},
    signOut: async () => {},
  }),
}));

mock.module('@/components/projects/project-pending-screen', () => ({
  ProjectPendingScreen: () => <div data-testid="pending-frame" />,
}));

const { HomeAuthGate } = await import('./home-auth-gate');
const { KORTIX_SUPABASE_AUTH_COOKIE } = await import('@/lib/supabase/constants');

const USER_ID = '0f9adf38-1111-4222-8333-444455556666';
const PROJECT_ID = 'aa0adf38-1111-4222-8333-444455556666';
const LAST_PROJECT_COOKIE = 'kortix_last_project';

let win: InstanceType<typeof Window> | null = null;

function installWindow() {
  win = new Window();
  const globals = globalThis as Record<string, unknown>;
  globals.window = win;
  globals.document = win.document;
  globals.navigator = win.navigator;
  win.location.href = 'http://localhost:13000/';
}

beforeEach(() => {
  auth.user = null;
  auth.isLoading = true;
  replaced.length = 0;
});

afterEach(() => {
  win?.happyDOM.abort();
  win = null;
});

function setBrowserCookie(name: string, value: string) {
  win!.document.cookie = `${name}=${value}`;
}

/** A session cookie value the way `@supabase/ssr` writes it. */
function sessionCookieValue(expiresAtSeconds: number): string {
  const base64 = btoa(JSON.stringify({ expires_at: expiresAtSeconds }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `base64-${base64}`;
}

function mountGate() {
  // A fresh element per render: React bails out of re-rendering the same
  // element reference, so a second render call with one shared element would
  // never pick up the mutated auth state.
  const element = () => (
    <HomeAuthGate>
      <div data-testid="landing">landing</div>
    </HomeAuthGate>
  );
  // happy-dom implements the lib.dom surfaces; its own classes carry extra
  // members, so the crossing of that library boundary is one explicit cast
  // (analytics-page-gate.test.tsx). The native node is what joins the document.
  const raw = win!.document.createElement('div');
  const container = raw as unknown as HTMLElement;
  win!.document.body.appendChild(raw);
  let root: Root | null = null;
  const mounted = {
    container,
    async rerender() {
      await act(async () => {
        root!.render(element());
      });
    },
    async unmount() {
      await act(async () => {
        root!.unmount();
      });
      container.remove();
    },
  };
  return {
    ...mounted,
    async start() {
      await act(async () => {
        root = createRoot(container);
        root.render(element());
      });
      return mounted;
    },
  };
}

test('a visitor with a session cookie sees the pending frame, not the landing, while auth resolves', async () => {
  installWindow();
  setBrowserCookie(
    KORTIX_SUPABASE_AUTH_COOKIE,
    sessionCookieValue(Math.floor(Date.now() / 1000) + 3600),
  );
  auth.isLoading = true;
  auth.user = null;
  const { container, unmount } = await mountGate().start();
  expect(container.querySelector('[data-testid="pending-frame"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="landing"]')).toBeNull();
  expect(replaced).toEqual([]);
  await unmount();
});

test('a resolved signed-in visitor is replaced into the remembered project and never onto the landing', async () => {
  installWindow();
  setBrowserCookie(
    KORTIX_SUPABASE_AUTH_COOKIE,
    sessionCookieValue(Math.floor(Date.now() / 1000) + 3600),
  );
  setBrowserCookie(LAST_PROJECT_COOKIE, encodeURIComponent(`${USER_ID}:${PROJECT_ID}`));
  auth.isLoading = true;
  auth.user = null;
  const view = await mountGate().start();
  auth.isLoading = false;
  auth.user = { id: USER_ID };
  await view.rerender();
  expect(replaced).toEqual([`/workspaces/${PROJECT_ID}`]);
  expect(view.container.querySelector('[data-testid="landing"]')).toBeNull();
  await view.unmount();
});

test('a resolved signed-out visitor gets the landing back and is never redirected', async () => {
  installWindow();
  setBrowserCookie(
    KORTIX_SUPABASE_AUTH_COOKIE,
    sessionCookieValue(Math.floor(Date.now() / 1000) + 3600),
  );
  auth.isLoading = true;
  auth.user = null;
  const view = await mountGate().start();
  expect(view.container.querySelector('[data-testid="pending-frame"]')).not.toBeNull();
  auth.isLoading = false;
  auth.user = null;
  await view.rerender();
  expect(view.container.querySelector('[data-testid="landing"]')).not.toBeNull();
  expect(view.container.querySelector('[data-testid="pending-frame"]')).toBeNull();
  expect(replaced).toEqual([]);
  await view.unmount();
});

test('a visitor with no session cookie never activates the gate: no splash, no redirect', async () => {
  installWindow();
  auth.isLoading = true;
  auth.user = null;
  const view = await mountGate().start();
  expect(view.container.querySelector('[data-testid="landing"]')).not.toBeNull();
  expect(view.container.querySelector('[data-testid="pending-frame"]')).toBeNull();
  // Even a resolved user cannot redirect without a session cookie.
  auth.isLoading = false;
  auth.user = { id: USER_ID };
  await view.rerender();
  expect(replaced).toEqual([]);
  expect(view.container.querySelector('[data-testid="landing"]')).not.toBeNull();
  await view.unmount();
});

test('the destination is always an app path: a tampered last-project cookie yields the landing door', async () => {
  installWindow();
  setBrowserCookie(
    KORTIX_SUPABASE_AUTH_COOKIE,
    sessionCookieValue(Math.floor(Date.now() / 1000) + 3600),
  );
  setBrowserCookie(LAST_PROJECT_COOKIE, encodeURIComponent('../../not-a-project'));
  auth.isLoading = false;
  auth.user = { id: USER_ID };
  const view = await mountGate().start();
  expect(replaced).toEqual(['/workspaces/start']);
  await view.unmount();
});

test('a last-project cookie owned by another account yields the landing door', async () => {
  installWindow();
  setBrowserCookie(
    KORTIX_SUPABASE_AUTH_COOKIE,
    sessionCookieValue(Math.floor(Date.now() / 1000) + 3600),
  );
  setBrowserCookie(
    LAST_PROJECT_COOKIE,
    encodeURIComponent(`9a9adf38-1111-4222-8333-444455556666:${PROJECT_ID}`),
  );
  auth.isLoading = false;
  auth.user = { id: USER_ID };
  const view = await mountGate().start();
  expect(replaced).toEqual(['/workspaces/start']);
  await view.unmount();
});

test('the server-rendered HTML is the landing, so the prerendered page and hydration are unchanged', () => {
  const html = renderToStaticMarkup(
    <HomeAuthGate>
      <div data-testid="landing">landing</div>
    </HomeAuthGate>,
  );
  expect(html).toContain('landing');
  expect(html).not.toContain('pending-frame');
});
