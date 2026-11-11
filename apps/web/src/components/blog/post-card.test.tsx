/**
 * Characterization tests for the post grid card: the rendered markup shared
 * by the blog card and the use-case card (cover, title, `tag · date` row).
 * These pin the markup across the dedupe that merges `BlogPostCard` and
 * `UseCaseCard` into one `PostCard`: the two drifted rows (the tag case and
 * the article wrapper) are asserted here exactly as they render today.
 */
import { expect, mock, test } from 'bun:test';
import type { ReactElement } from 'react';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('@/i18n/use-translations', () => ({
  useTranslations: () => Object.assign((key: string) => key, { raw: (key: string) => key }),
}));

const { BlogPostCard } = await import('./blog-post-card');
const { UseCaseCard } = await import('@/components/use-cases/use-case-card');
import type { Post } from '@/lib/blog';

const post: Post = {
  slug: 'test-post',
  url: '/blog/test-post',
  data: {
    title: 'A test post',
    description: 'Its description',
    date: '2026-10-25',
    author: 'team',
    tags: ['Field notes'],
    draft: false,
  },
  author: { name: 'The Kortix Team', role: 'Kortix', email: 'team@kortix.ai' },
  readingTime: 4,
};

/** Renders one card and returns its static HTML. */
function markup(element: ReactElement): string {
  return renderToStaticMarkup(element);
}

test('the blog card renders article > link > cover, title, tag · date', () => {
  const html = markup(<BlogPostCard post={post} />);
  expect(html).toContain('<article>');
  expect(html).toContain(
    '<a class="group outline-ring flex flex-col rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4" href="/blog/test-post">',
  );
  expect(html).toContain(
    '<h3 class="text-foreground mt-5 text-base font-medium text-pretty">A test post</h3>',
  );
  expect(html).toContain(
    '<p class="text-muted-foreground flex items-center gap-2 text-sm mt-2"><span class="capitalize">Field notes</span><span aria-hidden="true">·</span><time dateTime="2026-10-25">October 25, 2026</time></p>',
  );
});

test('the use-case card renders link > cover, title, tag · date', () => {
  const html = markup(<UseCaseCard post={post} />);
  expect(html).not.toContain('<article>');
  expect(html).toContain(
    '<a class="outline-ring flex flex-col rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4" href="/blog/test-post">',
  );
  expect(html).toContain(
    '<h3 class="text-foreground mt-5 text-base font-medium text-pretty">A test post</h3>',
  );
  expect(html).toContain(
    '<p class="text-muted-foreground flex items-center gap-2 text-sm mt-2"><span>Field notes</span><span aria-hidden="true">·</span><time dateTime="2026-10-25">October 25, 2026</time></p>',
  );
});

test('a card without a tag renders the date alone', () => {
  const untagged: Post = { ...post, data: { ...post.data, tags: [] } };
  const html = markup(<BlogPostCard post={untagged} />);
  expect(html).not.toContain('capitalize');
  expect(html).toContain(
    '<p class="text-muted-foreground flex items-center gap-2 text-sm mt-2"><time dateTime="2026-10-25">October 25, 2026</time></p>',
  );
});
