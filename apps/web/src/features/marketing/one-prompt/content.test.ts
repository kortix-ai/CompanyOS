import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import { TEMPLATES } from './content';

// The home shows the hand-approved templates. A name, summary or excerpt line
// that is not in the template's own files is a claim the product does not make.
const ROOT = join(__dirname, '../../../../../../packages/starter/templates');

describe('one-prompt home templates', () => {
  test.each(TEMPLATES.map((t) => [t.id, t] as const))('%s matches packages/starter/templates', (id, template) => {
    const meta = JSON.parse(readFileSync(join(ROOT, id, 'template.json'), 'utf8')) as { name: string; summary: string };
    expect(template.name).toBe(meta.name);
    expect(template.summary).toBe(meta.summary);
    const file = readFileSync(join(ROOT, id, template.file), 'utf8').replaceAll('{{defaultBranch}}', 'main');
    for (const line of template.excerpt) expect(file).toContain(line);
  });
});
