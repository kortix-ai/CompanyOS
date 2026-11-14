import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Badge } from './badge';

describe('Badge casing', () => {
  // Tone labels read in sentence case, so a legend that mixes them reads as one set.
  for (const variant of ['warning', 'info', 'secondary', 'outline', 'muted'] as const) {
    test(`${variant} keeps the label's own case`, () => {
      const out = renderToStaticMarkup(<Badge variant={variant}>Environment variable</Badge>);
      expect(out).toMatch(/class="[^"]*\bnormal-case\b/);
    });
  }
});
