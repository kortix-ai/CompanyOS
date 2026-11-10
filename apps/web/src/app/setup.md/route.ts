import { SETUP_GUIDE } from '@kortix/shared/setup-guide';
import { MACHINE_CONTENT_CACHE_CONTROL } from '@/lib/seo/response';

// The guide the one setup prompt points a coding agent at (`SETUP_PROMPT`).
export const dynamic = 'force-static';
export const revalidate = 3600;

export function GET() {
  return new Response(SETUP_GUIDE, {
    headers: {
      'Cache-Control': MACHINE_CONTENT_CACHE_CONTROL,
      'Content-Disposition': 'inline',
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
