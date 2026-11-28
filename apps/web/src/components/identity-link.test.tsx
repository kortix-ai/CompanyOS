import { expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
mock.module('next/link', () => ({ default: ({ prefetch, ...props }: any) => <a {...props} /> }));
const { IdentityLink } = await import('./identity-link');
test('selected session anchors retain identity for modified clicks and new tabs', () => {
  const html = renderToStaticMarkup(
    <IdentityLink
      currentPathname="/u/synthetic-slot/projects"
      href="/projects/synthetic/sessions/synthetic-session"
      target="_blank"
    >
      Session
    </IdentityLink>,
  );
  expect(html).toContain('href="/u/synthetic-slot/projects/synthetic/sessions/synthetic-session"');
  expect(html).toContain('target="_blank"');
});
