import { describe, expect, test } from 'bun:test';
import { formatTestCaseId, parseTestCaseId, testCaseLogPath } from '../test-case';

describe('test case id', () => {
  test('round-trips a runner case id and maps it to one file under the run', () => {
    const id = formatTestCaseId({ runId: '20261111-ab12', flowId: 'CONN-5', attempt: 2, step: 3 });
    expect(id).toBe('20261111-ab12/CONN-5/2/3');
    expect(parseTestCaseId(id)).toEqual({ runId: '20261111-ab12', flowId: 'CONN-5', attempt: 2, step: 3 });
    expect(testCaseLogPath('/logs/', id)).toBe('/logs/20261111-ab12/case-logs/CONN-5.2.3.jsonl');
  });

  test('sanitizes unsafe characters instead of sending them', () => {
    expect(formatTestCaseId({ runId: 'a b/c', flowId: 'X→1', attempt: 1, step: 0 })).toBe('a_b_c/X_1/1/0');
  });

  test('refuses traversal and malformed values', () => {
    for (const bad of ['../x/1/1', 'run/../1/1', 'run/F/1', 'run/F/x/1', 'run/F/1/1/9', '', 'run/F/1/1 ', 'a/./1/1']) {
      expect(parseTestCaseId(bad)).toBeNull();
      expect(testCaseLogPath('/logs', bad)).toBeNull();
    }
  });
});
