import { describe, expect, test } from 'bun:test';
import { metaString } from './session-board';
import { oneLine } from './session-where';
import { stringOrNull } from './runtime-session-snapshot';

describe('shared string helpers', () => {
  test('oneLine collapses whitespace and ellipsizes at max', () => {
    expect(oneLine('  a \n\t b  ', 20)).toBe('a b');
    expect(oneLine('abcdefghij', 5)).toBe('abcd…');
    expect(oneLine('abcde', 5)).toBe('abcde');
  });

  test('metaString reads a non-empty string metadata key and returns it as stored', () => {
    expect(metaString({ k: ' v ' }, 'k')).toBe(' v ');
    expect(metaString({ k: '   ' }, 'k')).toBeNull();
    expect(metaString({ k: 3 }, 'k')).toBeNull();
    expect(metaString(null, 'k')).toBeNull();
  });

  test('stringOrNull trims, and blank or non-strings are null', () => {
    expect(stringOrNull(' x ')).toBe('x');
    expect(stringOrNull('   ')).toBeNull();
    expect(stringOrNull('')).toBeNull();
    expect(stringOrNull(4)).toBeNull();
    expect(stringOrNull(undefined)).toBeNull();
  });
});
