import { describe, expect, test } from 'bun:test';

import { workspaceMenuGroups } from './workspace-menu-model';

const ALL = { canInvite: true, canOpenSettings: true, hasInbox: true };
const NONE = { canInvite: false, canOpenSettings: false, hasInbox: false };

describe('workspaceMenuGroups — the workspace menu, top to bottom', () => {
  test('an owner: the workspace, then the person, then Help and Log out', () => {
    expect(workspaceMenuGroups(ALL)).toEqual([
      ['switch', 'settings', 'invite'],
      ['inbox', 'preferences', 'apps'],
      ['help', 'logout'],
    ]);
  });

  test('a member: no Invite, no Workspace settings', () => {
    expect(workspaceMenuGroups(NONE)).toEqual([['switch'], ['preferences', 'apps'], ['help', 'logout']]);
  });

  test('Log out is always last', () => {
    for (const gates of [ALL, NONE]) expect(workspaceMenuGroups(gates).flat().at(-1)).toBe('logout');
  });

  test('rows with a better home stay out of the menu', () => {
    const rows = workspaceMenuGroups(ALL).flat() as string[];
    for (const gone of ['header', 'more', 'leave', 'appearance', 'download']) expect(rows).not.toContain(gone);
  });

  test('a host that serves no Inbox page gets no Inbox row', () => {
    expect(workspaceMenuGroups({ ...ALL, hasInbox: false }).flat()).not.toContain('inbox');
  });
});
