import { NextResponse } from 'next/server';

// Vercel answers a non-GET method on a prerendered page or static file route
// (`/`, `/llms.txt`, …) itself, with a bare 405 and no `Allow` header, before
// any route handler runs (RFC 9110 §15.5.6 requires `Allow`; KRTX-4826, the
// same class as KRTX-3380). The middleware runs ahead of that layer, so it
// answers these requests with the 405 and the header.
const STATIC_ONLY_PATHS = new Set(['/', '/llms.txt', '/llms-full.txt', '/robots.txt', '/sitemap.xml']);

const ALLOWED_METHODS = 'GET, HEAD, OPTIONS';

export function staticRouteMethodNotAllowed(
  method: string,
  pathname: string,
  headers: Headers,
): NextResponse | null {
  if (!STATIC_ONLY_PATHS.has(pathname)) return null;
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  // A Server Action posts to the page it belongs to; Next answers it.
  if (headers.has('next-action')) return null;
  return new NextResponse(null, { status: 405, headers: { Allow: ALLOWED_METHODS } });
}
