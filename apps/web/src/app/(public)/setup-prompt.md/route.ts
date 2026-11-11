import { DISCOVERY_CACHE_CONTROL } from '@/lib/agent-discovery';
import { renderSetupPrompt } from '@/lib/seo/setup-prompt';

export const dynamic = 'force-static';

/** The prompt a person pastes into their own coding agent to connect it to Kortix. */
export function GET() {
  return new Response(renderSetupPrompt(), {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': DISCOVERY_CACHE_CONTROL,
      'Content-Disposition': 'inline',
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'index, follow',
    },
  });
}

export const HEAD = GET;
