import type { DriveEntry, FolderAccess } from '@kortix/sdk';
import { expect, test } from 'bun:test';

import { type DriveWithMemberAccess, drivePlaces, hiddenMemberPath, memberDrivesShown } from './drive-places';

function dir(path: string, access: FolderAccess = 'manage'): DriveEntry {
  return { path, name: path.split('/').pop() ?? path, type: 'dir', size: 0, mtime: 0, access };
}

test('Company comes first, then the team drives by name; People is never a drive', () => {
  const places = drivePlaces([dir('/Sales'), dir('/Users'), dir('/Company'), dir('/Marketing')], []);
  expect(places.map((p) => p.name)).toEqual(['Company', 'Marketing', 'Sales']);
});

test('a folder the caller only passes through is not a drive; the share inside it is', () => {
  const places = drivePlaces([dir('/Company', 'none'), dir('/Users', 'none')], [{ path: '/Company/Marketing' }]);
  expect(places).toEqual([{ path: '/Company/Marketing', name: 'Marketing' }]);
});

test('a shared Drive inside a drive the caller already opens is listed once', () => {
  const places = drivePlaces([dir('/Company'), dir('/Marketing', 'read')], [{ path: '/Marketing' }, { path: '/Company/Plans' }]);
  expect(places.map((p) => p.path)).toEqual(['/Company', '/Marketing']);
});

test('files and hidden folders at the top are not drives', () => {
  const file: DriveEntry = { ...dir('/notes.md'), type: 'file' };
  expect(drivePlaces([file, dir('/.kortix'), dir('/Company')], [])).toEqual([{ path: '/Company', name: 'Company' }]);
});

test('nothing to open lists no drive', () => {
  expect(drivePlaces([], [])).toEqual([]);
});

test('member drives show only for an admin with the workspace setting on; absent reads as off', () => {
  const drive = (access: FolderAccess, adminsOpenUserDrives?: boolean): DriveWithMemberAccess => ({
    driveId: 'synthetic-drive',
    accountId: 'synthetic-account',
    projectId: 'synthetic-project',
    kind: 'project',
    name: 'Test drive',
    sizeBytes: 0,
    sizeLimitBytes: null,
    fileCount: 0,
    lastChangeAt: null,
    createdAt: '',
    updatedAt: '',
    access,
    personalFolder: '/Users/you',
    adminsOpenUserDrives,
  });
  expect(memberDrivesShown(drive('manage', true))).toBe(true);
  expect(memberDrivesShown(drive('manage', false))).toBe(false);
  expect(memberDrivesShown(drive('manage'))).toBe(false);
  expect(memberDrivesShown(drive('write', true))).toBe(false);
});

test('while hidden, /Users and other desktops leave the listings; your own desktop, drives and folder contents stay', () => {
  const me = '/Users/you';
  expect(hiddenMemberPath('/Users', me, false)).toBe(true);
  expect(hiddenMemberPath('/Users/ana.lima', me, false)).toBe(true);
  // Inside a member's folder opened by URL, the API's listing stands.
  expect(hiddenMemberPath('/Users/ana.lima/Notes', me, false)).toBe(false);
  expect(hiddenMemberPath('/Users/you', me, false)).toBe(false);
  expect(hiddenMemberPath('/Users/you/Notes', me, false)).toBe(false);
  expect(hiddenMemberPath('/Users/youth', me, false)).toBe(true);
  expect(hiddenMemberPath('/Company', me, false)).toBe(false);
  expect(hiddenMemberPath('/Users/ana.lima', me, true)).toBe(false);
});
