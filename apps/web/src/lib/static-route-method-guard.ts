import { NextResponse } from 'next/server';

// Vercel answers a non-GET method on a prerendered page or static file route
// (`/`, `/pricing`, `/llms.txt`, …) itself, with a bare 405 and no `Allow`
// header, before any route handler runs (RFC 9110 §15.5.6 requires `Allow`;
// KRTX-4826, the same class as KRTX-3380). The middleware runs ahead of that
// layer, so it answers every page request with a mutating method with the 405
// and the header. Only prefixes that legitimately take writes are skipped:
// route handlers and the proxies of next.config.ts (rewrites to the API,
// SCIM, PostHog, Supabase and the blog app).
const WRITE_PREFIXES = ['/api', '/v1', '/scim', '/ingest', '/supabase', '/blog'];

const ALLOWED_METHODS = 'GET, HEAD, OPTIONS';

export function staticRouteMethodNotAllowed(
  method: string,
  pathname: string,
  headers: Headers,
): NextResponse | null {
  if (WRITE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  // A Server Action posts to the page it belongs to; Next answers it.
  if (headers.has('next-action')) return null;
  return new NextResponse(null, { status: 405, headers: { Allow: ALLOWED_METHODS } });
}
