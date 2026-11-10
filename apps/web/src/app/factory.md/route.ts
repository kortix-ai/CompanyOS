import { SETUP_GUIDE } from '@kortix/shared/setup-guide';
import { composeTemplateOnboarding } from '@kortix/starter/templates';
import { MACHINE_CONTENT_CACHE_CONTROL } from '@/lib/seo/response';

// The guide the Software Factory prompt points at (`FACTORY_PROMPT`): the
// template's own onboarding, then the setup guide. Same text as
// `kortix templates onboard software-factory`.
export const dynamic = 'force-static';
export const revalidate = 3600;

export function GET() {
  return new Response(composeTemplateOnboarding('software-factory', SETUP_GUIDE), {
    headers: {
      'Cache-Control': MACHINE_CONTENT_CACHE_CONTROL,
      'Content-Disposition': 'inline',
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
