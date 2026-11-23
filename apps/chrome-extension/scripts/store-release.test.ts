import { describe, expect, test } from 'bun:test';

import { compareVersions, plan, readStatus, type StoreState } from './store-release.ts';

const live = (version: string, submitted: StoreState['submitted'] = null): StoreState => ({
  published: { state: 'PUBLISHED', version },
  submitted,
  takenDown: false,
  warned: false,
});

describe('chrome web store release decisions', () => {
  test('compares versions numerically, with up to four parts', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.1')).toBe(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1', '1.0.1.1')).toBe(-1);
  });

  test('reads the newest version of each revision from fetchStatus', () => {
    const store = readStatus({
      publishedItemRevisionStatus: { state: 'PUBLISHED', distributionChannels: [{ crxVersion: '1.0.9' }, { crxVersion: '1.0.10' }] },
      takenDown: false,
    });
    expect(store.published).toEqual({ state: 'PUBLISHED', version: '1.0.10' });
    expect(store.submitted).toBeNull();
  });

  test('uploads a version above everything in the store', () => {
    expect(plan({ version: '1.0.2', store: live('1.0.1'), changed: [] }).upload).toBe(true);
    expect(plan({ version: '1.0.1', store: { published: null, submitted: null, takenDown: false, warned: false }, changed: [] }).upload).toBe(true);
  });

  test('changes nothing when the live version is the repo version and nothing changed after it', () => {
    const p = plan({ version: '1.0.1', store: live('1.0.1'), changed: [] });
    expect(p).toMatchObject({ upload: false, level: 'notice' });
  });

  test('fails when extension files changed after the live version was set', () => {
    const p = plan({ version: '1.0.1', store: live('1.0.1'), changed: ['apps/chrome-extension/src/overlay.ts'] });
    expect(p).toMatchObject({ upload: false, level: 'error' });
    expect(p.text).toContain('raise "version"');
  });

  test('never interrupts a review: a newer version waits for the next release', () => {
    const p = plan({ version: '1.0.3', store: live('1.0.1', { state: 'PENDING_REVIEW', version: '1.0.2' }), changed: [] });
    expect(p).toMatchObject({ upload: false, level: 'notice' });
    expect(p.text).toContain('1.0.3 waits');
  });

  test('never resubmits a rejected version; a higher version goes to review', () => {
    const rejected = live('1.0.1', { state: 'REJECTED', version: '1.0.2' });
    expect(plan({ version: '1.0.2', store: rejected, changed: [] })).toMatchObject({ upload: false, level: 'error' });
    expect(plan({ version: '1.0.3', store: rejected, changed: [] }).upload).toBe(true);
  });

  test('respects a cancelled review and an approved version held by deferred publishing', () => {
    expect(plan({ version: '1.0.2', store: live('1.0.1', { state: 'CANCELLED', version: '1.0.2' }), changed: [] }))
      .toMatchObject({ upload: false, level: 'notice' });
    expect(plan({ version: '1.0.3', store: live('1.0.1', { state: 'STAGED', version: '1.0.2' }), changed: [] }))
      .toMatchObject({ upload: false, level: 'warning' });
  });

  test('fails when the store holds a version above the repo, or took the item down', () => {
    expect(plan({ version: '1.0.1', store: live('1.0.4'), changed: [] })).toMatchObject({ upload: false, level: 'error' });
    expect(plan({ version: '1.0.2', store: { ...live('1.0.1'), takenDown: true }, changed: [] }))
      .toMatchObject({ upload: false, level: 'error' });
  });
});
