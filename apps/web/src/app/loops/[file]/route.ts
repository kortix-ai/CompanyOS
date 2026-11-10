import { SETUP_GUIDE } from '@kortix/shared/setup-guide';
import { composeTemplateOnboarding, isTemplateId, TEMPLATE_IDS } from '@kortix/starter/templates';
import { MACHINE_CONTENT_CACHE_CONTROL } from '@/lib/seo/response';

// kortix.com/loops/<id>.md: the guide one loop's prompt points at (`loopPrompt`).
// Same text as `kortix templates onboard <id>`.
export const dynamic = 'force-static';
export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return TEMPLATE_IDS.map((id) => ({ file: `${id}.md` }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const id = (await params).file.replace(/\.md$/, '');
  if (!isTemplateId(id)) return new Response('Not found', { status: 404 });
  return new Response(composeTemplateOnboarding(id, SETUP_GUIDE), {
    headers: {
      'Cache-Control': MACHINE_CONTENT_CACHE_CONTROL,
      'Content-Disposition': 'inline',
      'Content-Type': 'text/markdown; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
