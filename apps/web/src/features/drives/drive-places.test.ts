import type { DriveEntry, FolderAccess } from '@kortix/sdk';
import { expect, test } from 'bun:test';

import { drivePlaces } from './drive-places';

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
