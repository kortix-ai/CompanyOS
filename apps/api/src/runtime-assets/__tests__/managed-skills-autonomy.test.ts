import { describe, expect, test } from 'bun:test';
import { getStarterFiles } from '@kortix/starter';
import { managedSkillOverlayFiles } from '../managed-skills';

// Skills are the runtime payload, not implementation source. Assert the bytes
// delivered to agents and fresh workspaces, without changing permission gates.
describe('KRTX-1588 session autonomy guidance', () => {
  for (const path of ['kortix-system/SKILL.md', 'kortix-memory/SKILL.md']) {
    test(`${path} honors the session grant and preserves configuration review`, () => {
      const content = managedSkillOverlayFiles().find((file) => file.path === path)?.content;
      expect(content).toBeDefined();
      expect(content).toMatch(/rest of the session/);
      expect(content).toMatch(/do not ask again/i);
      expect(content).toContain('workspace.gitops.merge');
      expect(content).toContain('CR_SELF_MERGE_REFUSED');
      expect(content).toMatch(/configuration changes/);
      expect(content).toContain('kortix.yaml');
    });
  }

  test('fresh-workspace CLI guidance delegates to the same session contract', () => {
    const content = getStarterFiles({ projectName: 'Synthetic' })
      .find((file) => file.path === 'skills/kortix-cli/SKILL.md')?.content;
    expect(content).toBeDefined();
    expect(content).toContain('rest of the session');
    expect(content).toContain('configuration changes');
    expect(content).not.toContain('Never merge your own CR.');
  });
});
