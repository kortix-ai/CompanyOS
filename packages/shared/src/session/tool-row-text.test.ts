import { describe, expect, test } from 'bun:test';

import { bashRowTitle, dedentCommand } from './tool-row-text';

/** Pins the row-title and dedent rules both hosts re-export (KRTX-4772). */
describe('bashRowTitle', () => {
  test('sentence-cases a lower-case description', () => {
    expect(bashRowTitle('install the workspace dependencies', false)).toBe('Install the workspace dependencies');
  });

  test('keeps an opener that is already sentence-cased', () => {
    expect(bashRowTitle('Run CI on the release branch', false)).toBe('Run CI on the release branch');
    expect(bashRowTitle('CI smoke test', false)).toBe('CI smoke test');
  });

  test('collapses whitespace and newlines', () => {
    expect(bashRowTitle('  run the\n  unit suite  ', false)).toBe('Run the unit suite');
  });

  test('no description reads "Ran command"', () => {
    expect(bashRowTitle(undefined, false)).toBe('Ran command');
    expect(bashRowTitle('   ', false)).toBe('Ran command');
  });

  test('a failure keeps its verdict over any description', () => {
    expect(bashRowTitle('install the workspace dependencies', true)).toBe('Command failed');
  });

  test('a title of exactly 60 characters is kept whole', () => {
    const sixty = `A${'a'.repeat(59)}`;
    expect(bashRowTitle(sixty, false)).toBe(sixty);
    expect(bashRowTitle(sixty, false)).not.toContain('…');
  });

  test('a longer title ellipsizes at 60 characters without a stranded space', () => {
    const long = `Aa${' a'.repeat(80)}`;
    expect(bashRowTitle(long, false)).toBe(`${long.slice(0, 60).trimEnd()}…`);
  });
});

describe('dedentCommand', () => {
  test('a one-line command loses every leading blank, including Unicode space', () => {
    expect(dedentCommand('\u00a0 agent-browser open https://kortix.com')).toBe('agent-browser open https://kortix.com');
    expect(dedentCommand('  pnpm test')).toBe('pnpm test');
  });

  test('a script loses only its common indent', () => {
    expect(dedentCommand('  a\n  b\n    c')).toBe('a\nb\n  c');
  });

  test('a heredoc whose terminator pins the indent is a no-op', () => {
    const script = 'cat <<EOF\n  keep\nEOF';
    expect(dedentCommand(`  ${script}`)).toBe(`  ${script}`);
  });

  test('blank edges go; blank lines never lower the common indent', () => {
    expect(dedentCommand('\n\n  a\n\n  b\n')).toBe('a\n\nb');
  });

  test('an empty command stays empty', () => {
    expect(dedentCommand('')).toBe('');
    expect(dedentCommand('\n \n')).toBe('');
  });
});
