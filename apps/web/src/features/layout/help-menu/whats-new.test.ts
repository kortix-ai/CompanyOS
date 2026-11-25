import { describe, expect, test } from 'bun:test';

import { parseWhatsNew } from './whats-new';

const week = { slug: '2026-11-16', title: 'Shared drives', href: '/changelog/2026-11-16' };

describe('parseWhatsNew', () => {
  test('keeps a well-formed body', () => {
    expect(parseWhatsNew({ enabled: true, weeks: [week] })).toEqual({ enabled: true, weeks: [week] });
  });

  test('turns the list off for a body that is not an object', () => {
    expect(parseWhatsNew(null)).toEqual({ enabled: false, weeks: [] });
    expect(parseWhatsNew('<html>')).toEqual({ enabled: false, weeks: [] });
  });

  test('drops a week whose link leaves the changelog', () => {
    const outside = { ...week, href: 'https://example.com/changelog/x' };
    const script = { ...week, href: 'javascript:alert(1)' };
    expect(parseWhatsNew({ enabled: true, weeks: [outside, script, week] }).weeks).toEqual([week]);
  });

  test('drops a week with a missing field', () => {
    expect(parseWhatsNew({ enabled: true, weeks: [{ slug: 'x', href: '/changelog/x' }] }).weeks).toEqual([]);
  });
});
