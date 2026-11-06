import { sameOriginRequest } from '@/lib/auth/submit-auth';
import { KORTIX_SUPABASE_AUTH_COOKIE } from '@/lib/supabase/constants';
import { readUnverifiedSession } from '@/lib/supabase/session-cookie';
import { authUser, browserLogins, recordPlatformLogout } from '@kortix/sdk';
import { NextRequest, NextResponse } from 'next/server';

/** No auth-js client: reading this session must never rotate its refresh credential. */
export async function POST(request: NextRequest) {
  if (!sameOriginRequest(request)) return new NextResponse(null, { status: 403 });
  const legacy = readUnverifiedSession(request.cookies.getAll(), KORTIX_SUPABASE_AUTH_COOKIE);
  if (!legacy) return new NextResponse(null, { status: 204 });
  const body = await request.json().catch(() => null);
  if (typeof body?.slot !== 'string') return new NextResponse(null, { status: 400 });
  const frontendOrigin = process.env.KORTIX_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const backendOrigin = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!frontendOrigin || !backendOrigin) return new NextResponse(null, { status: 503 });
  try {
    const { slots } = await browserLogins.roster({
      fetch: (input, init) =>
        fetch(new URL(String(input), backendOrigin), {
          ...init,
          headers: {
            ...Object.fromEntries(new Headers(init?.headers)),
            cookie: request.headers.get('cookie') ?? '',
          },
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
          cache: 'no-store',
        }),
    });
    const selected = slots.find((slot) => slot.slot === body.slot);
    if (!selected) return new NextResponse(null, { status: 404 });
    const hint = legacy.user as { id?: unknown } | undefined;
    // Removing B must never retire an unrelated legacy A session.
    if (hint?.id !== selected.user_id) return new NextResponse(null, { status: 204 });
    if (typeof legacy.access_token !== 'string') return new NextResponse(null, { status: 409 });
    if (typeof legacy.expires_at === 'number' && legacy.expires_at > Date.now() / 1000) {
      let live = true;
      try {
        const { user } = await authUser(legacy.access_token, {
          backendUrl: backendOrigin,
          signal: AbortSignal.timeout(5000),
        });
        if (user.id !== selected.user_id) return new NextResponse(null, { status: 409 });
      } catch (error) {
        // Lost responses are retryable: an already revoked legacy session needs only cookie cleanup.
        if ((error as { status?: number }).status !== 401) throw error;
        live = false;
      }
      if (live) {
        try {
          await recordPlatformLogout({
            backendUrl: backendOrigin,
            accessToken: legacy.access_token,
            signal: AbortSignal.timeout(5000),
          });
        } catch (error) {
          if ((error as { status?: number }).status !== 401) throw error;
        }
      }
    }
    const response = new NextResponse(null, { status: 204 });
    for (const name of [
      KORTIX_SUPABASE_AUTH_COOKIE,
      ...Array.from({ length: 6 }, (_, i) => `${KORTIX_SUPABASE_AUTH_COOKIE}.${i}`),
    ])
      response.cookies.set(name, '', {
        path: '/',
        maxAge: 0,
        sameSite: 'lax',
        secure: new URL(frontendOrigin).protocol === 'https:',
      });
    response.headers.set('cache-control', 'private, no-store');
    return response;
  } catch (error) {
    return new NextResponse(null, {
      status: (error as { status?: number }).status === 403 ? 403 : 503,
    });
  }
}
