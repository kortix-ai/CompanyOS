import { describe, expect, test } from 'bun:test';
import { sessionOwnerSeesGroup } from './session-group-viewer';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const CREATOR = '00000000-0000-4000-8000-0000000000c1';
const ACCOUNT = '00000000-0000-4000-8000-0000000000ac';
const privateSpace = { visibility: 'private', createdBy: CREATOR };
const never = async () => {
  throw new Error('oversight must not be read');
};

describe('sessionOwnerSeesGroup: a session keeps its Space only while its owner sees it', () => {
  test('a member of a private Space sees it, without reading oversight', async () => {
    expect(await sessionOwnerSeesGroup(privateSpace, OWNER, true, ACCOUNT, never)).toBe(true);
  });

  test('the Space creator and a project-wide Space are seen without reading oversight', async () => {
    expect(await sessionOwnerSeesGroup(privateSpace, CREATOR, false, ACCOUNT, never)).toBe(true);
    expect(await sessionOwnerSeesGroup({ visibility: 'project', createdBy: CREATOR }, OWNER, false, ACCOUNT, never)).toBe(true);
  });

  test('an owner removed from a private Space no longer sees it', async () => {
    expect(await sessionOwnerSeesGroup(privateSpace, OWNER, false, ACCOUNT, async () => false)).toBe(false);
  });

  test('an owner or admin under session oversight still sees it', async () => {
    expect(await sessionOwnerSeesGroup(privateSpace, OWNER, false, ACCOUNT, async () => true)).toBe(true);
  });

  test('a session no person started keeps its Space', async () => {
    expect(await sessionOwnerSeesGroup(privateSpace, null, false, ACCOUNT, never)).toBe(true);
  });
});
