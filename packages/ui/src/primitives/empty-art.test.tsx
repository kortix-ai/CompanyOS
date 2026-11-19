/**
 * EmptyArt (D49): every catalogued kind draws, and the defaults pick the
 * picture a caller expects without naming a kind.
 */
import { describe, expect, test } from 'bun:test';
import { TargetIcon } from '@phosphor-icons/react';
import { renderToStaticMarkup } from 'react-dom/server';

import { EMPTY_ART_KINDS, EmptyArt } from './empty-art';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';

const kindOf = (html: string) => /data-kind="([a-z]+)"/.exec(html)?.[1];

describe('EmptyArt', () => {
  test('every catalogued kind draws its own picture', () => {
    for (const kind of EMPTY_ART_KINDS) {
      const html = renderToStaticMarkup(<EmptyArt kind={kind} />);
      expect(kindOf(html)).toBe(kind);
      // Each picture is more than its 100 × 56 box: at least one card.
      expect(html).toContain('rounded-(--control-xs-radius)');
    }
  });

  test('no kind and no icon is the document', () => {
    expect(kindOf(renderToStaticMarkup(<EmptyArt />))).toBe('document');
  });

  test('an icon alone lands on the fan, muted', () => {
    const html = renderToStaticMarkup(<EmptyArt icon={TargetIcon} />);
    expect(kindOf(html)).toBe('fan');
    expect(html).toContain('text-muted-foreground');
  });

  test('only error and done carry a hue', () => {
    expect(renderToStaticMarkup(<EmptyArt kind="error" />)).toContain('text-kortix-red');
    expect(renderToStaticMarkup(<EmptyArt kind="done" />)).toContain('text-kortix-green');
    for (const kind of EMPTY_ART_KINDS.filter((k) => k !== 'error' && k !== 'done')) {
      expect(renderToStaticMarkup(<EmptyArt kind={kind} />)).not.toMatch(/text-kortix-(red|green)/);
    }
  });
});

describe('EmptyState and ErrorState', () => {
  test('EmptyState draws the kind named by art', () => {
    expect(kindOf(renderToStaticMarkup(<EmptyState art="search" title="No results" />))).toBe('search');
  });

  test('ErrorState draws the error picture by default', () => {
    expect(kindOf(renderToStaticMarkup(<ErrorState title="Something went wrong" />))).toBe('error');
  });
});
