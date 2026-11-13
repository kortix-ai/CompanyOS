import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Button } from './button';

/** The labels the icon-side padding depends on: one span per text run, no whitespace spans. */
describe('Button text wrapping', () => {
  test('an icon and a label render two children, not a space span between them', () => {
    const label = 'Connect';
    const out = renderToStaticMarkup(
      <Button>
        <svg data-i="" /> {label}
      </Button>,
    );
    expect(out).toContain('<svg data-i=""></svg><span>');
    expect(out.match(/<span/g)?.length).toBe(1);
  });

  test('adjacent text and numbers join into one span', () => {
    const n = 3;
    const out = renderToStaticMarkup(<Button>Delete {n} files</Button>);
    expect(out).toContain('<span>Delete 3 files</span>');
    expect(out.match(/<span/g)?.length).toBe(1);
  });

  test('a lone icon stays a lone child', () => {
    const out = renderToStaticMarkup(
      <Button iconOnly aria-label="Add">
        <svg data-i="" />
      </Button>,
    );
    expect(out).not.toContain('<span');
  });
});

describe('Button asChild', () => {
  test('a void child renders: no children are forced onto it', () => {
    const out = renderToStaticMarkup(
      <Button asChild>
        <input type="submit" value="Go" />
      </Button>,
    );
    expect(out).toContain('<input');
    expect(out).toContain('value="Go"');
  });
});
