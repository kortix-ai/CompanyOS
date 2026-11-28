import { expect, test } from 'bun:test';
import { normalizeSlackLinks } from './slack-links';

test('normalizes labelled HTTP links and escapes markdown punctuation', () => {
  expect(normalizeSlackLinks('<https://example.com/a(b)|A [report] *now*>'))
    .toBe('[A \\[report\\] \\*now\\*](https://example.com/a%28b%29)');
});

test('keeps literal and existing markdown contexts unchanged', () => {
  const link = '<https://example.com/a|Report>';
  for (const text of [`\`${link}\``, `\`\`code ${link}\`\``, `\`\`\`\n${link}\n\`\`\``, `~~~\n${link}\n~~~`, `    ${link}`, `[${link}](https://example.com)`, `$${link}$`, `$$\n${link}\n$$`, `\`\`\`\n${link}`]) {
    expect(normalizeSlackLinks(text)).toBe(text);
  }
});

test('leaves incomplete, unsafe, unlabelled and multiline syntax alone', () => {
  for (const text of ['<https://example.com|Report', '<javascript:alert(1)|Report>', '<https://example.com>', '<https://example.com|Report\nmore>', '<https://example.com|>']) {
    expect(normalizeSlackLinks(text)).toBe(text);
  }
});
