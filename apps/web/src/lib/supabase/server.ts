'use server';
import { authUser } from '@kortix/sdk';
import type { Session, User } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { KORTIX_SUPABASE_AUTH_COOKIE } from './constants';
import { authCookieOptions, hasPanelMarker } from './panel-cookies';

export async function createClient() {
  const cookieStore = await cookies();

  // IMPORTANT: NEXT_PUBLIC_ vars are inlined at build time by Next.js, so in
  // Docker containers they contain placeholder values from the build host.
  // We MUST use non-NEXT_PUBLIC_ runtime env vars (SUPABASE_URL, SUPABASE_ANON_KEY)
  // which are read at runtime from process.env, falling back to NEXT_PUBLIC_ only
  // for dev mode where they match the actual Supabase instance.
  //
  // SUPABASE_SERVER_URL is the internal Docker network URL (e.g. http://supabase-kong:8000)
  // used for server-side calls that run inside the Docker container.
  const supabaseUrl =
    process.env.SUPABASE_SERVER_URL ||
    process.env.SUPABASE_URL ||
    process.env.KORTIX_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.KORTIX_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // GoTrue records the User-Agent and client IP of the request that signs in
  // (`auth.sessions`), and Settings → Security names each signed-in device by
  // them. A sign-in through this client reaches GoTrue from the server, so
  // without these it records `node` and the server's address for every
  // browser. Forward the browser's own.
  const requestHeaders = await headers();
  const forwarded: Record<string, string> = {};
  const userAgent = requestHeaders.get('user-agent');
  const clientIp = requestHeaders.get('x-forwarded-for') ?? requestHeaders.get('x-real-ip');
  if (userAgent) forwarded['user-agent'] = userAgent;
  if (clientIp) forwarded['x-forwarded-for'] = clientIp;

  const client = createServerClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: forwarded },
    // `@supabase/ssr` never sets `secure` itself — see the doc comment in
    // `lib/supabase/client.ts`. Server-side, `NODE_ENV` is the reliable signal
    // (mirrors `MAINTENANCE_BYPASS_COOKIE`'s route handler). A request from the
    // Kortix in Chrome side panel gets partitioned cookies (panel-cookies.ts).
    cookieOptions: {
      name: KORTIX_SUPABASE_AUTH_COOKIE,
      ...authCookieOptions(hasPanelMarker(cookieStore), process.env.NODE_ENV === 'production'),
    },
    cookies: {
      getAll() {
        return requestHeaders.has('x-kortix-browser-slot') ? [] : cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (requestHeaders.has('x-kortix-browser-slot')) throw new Error('Saved sign-in credential writes are unavailable');
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      },
    },
  });
  if (!requestHeaders.has('x-kortix-browser-slot')) return client;
  const token = requestHeaders.get('x-kortix-browser-token');
  if (!token) throw new Error('Browser identity unavailable');
  const read = async () => {
    const { user } = await authUser(token, {
      backendUrl: process.env.BACKEND_URL || process.env.KORTIX_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL,
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', redirect: 'error' }),
    });
    return { access_token: token, refresh_token: '', token_type: 'bearer', expires_in: 0, user: { ...user, aud: 'authenticated', app_metadata: user.app_metadata ?? {}, user_metadata: user.user_metadata ?? {}, created_at: user.created_at ?? '' } as User } as Session;
  };
  const auth = new Proxy(client.auth, { get(_target, key) {
    if (key === 'getSession') return async () => ({ data: { session: await read() }, error: null });
    if (key === 'getUser') return async () => ({ data: { user: (await read()).user }, error: null });
    return () => { throw new Error('Saved sign-in credential operation unavailable'); };
  } });
  return new Proxy(client, { get(target, key) { return key === 'auth' ? auth : Reflect.get(target, key); } });
}
