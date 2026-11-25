import { describe, expect, test } from 'bun:test';

import { compareVersions, fetchWithRetry, iosStep, pickBuild, shippedBuildIds } from './store-release.mjs';

const build = (id: string) => ({ id, appBuildVersion: id });

describe('store release decisions', () => {
  test('compares versions numerically, not as text', () => {
    expect(compareVersions('1.5.10', '1.5.9')).toBe(1);
    expect(compareVersions('1.5.5', '1.5.5')).toBe(0);
    expect(compareVersions('1.4.9', '1.5.0')).toBe(-1);
  });

  test('submits only a version nobody has sent to Apple', () => {
    expect(iosStep('PREPARE_FOR_SUBMISSION')).toBe('submit');
    expect(iosStep('READY_FOR_REVIEW')).toBe('submit');
  });

  test('never resubmits what Apple rejected or a person pulled from review', () => {
    for (const state of ['REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY', 'DEVELOPER_REJECTED']) {
      expect(iosStep(state)).toBe('blocked');
    }
  });

  test('releases an approved version held for a manual release', () => {
    expect(iosStep('PENDING_DEVELOPER_RELEASE')).toBe('release');
  });

  test('leaves a version alone while Apple has it or after it is live', () => {
    for (const state of ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'PENDING_APPLE_RELEASE', 'PROCESSING_FOR_DISTRIBUTION']) {
      expect(iosStep(state)).toBe('wait');
    }
    expect(iosStep('READY_FOR_DISTRIBUTION')).toBe('live');
    expect(iosStep('READY_FOR_SALE')).toBe('live');
  });
});

describe('only released code ships', () => {
  test('an Android build sent to internal testing is not shipped', () => {
    const subs = [
      { status: 'FINISHED', submittedBuild: { id: 'internal' }, androidConfig: { track: 'internal' } },
      { status: 'FINISHED', submittedBuild: { id: 'prod' }, androidConfig: { track: 'production' } },
      { status: 'ERRORED', submittedBuild: { id: 'failed' }, androidConfig: { track: 'production' } },
    ];
    expect([...shippedBuildIds(subs, 'android', 'production')]).toEqual(['prod']);
  });

  test('a newer build from unreleased code is ignored; the trusted one ships', () => {
    const picked = pickBuild({
      platform: 'android',
      builds: [build('rogue'), build('released')],
      shipped: new Set<string>(),
      trusted: (b: { id: string }) => b.id === 'released',
    });
    expect(picked.build?.id).toBe('released');
    expect(picked.ship).toBe(true);
    expect(picked.ignored.map((b: { id: string }) => b.id)).toEqual(['rogue']);
  });

  test('with no trusted build the run builds from the released commit', () => {
    const picked = pickBuild({ platform: 'ios', builds: [build('rogue')], shipped: new Set<string>(), trusted: () => false });
    expect(picked.build).toBeNull();
    expect(picked.ignored.map((b: { id: string }) => b.id)).toEqual(['rogue']);
  });

  test('an Android version already on the production track is never shipped twice', () => {
    const picked = pickBuild({ platform: 'android', builds: [build('14')], shipped: new Set(['14']), trusted: () => false });
    expect(picked.build?.id).toBe('14');
    expect(picked.ship).toBe(false);
  });

  test('App Review never gets an untrusted iOS upload', () => {
    const picked = pickBuild({
      platform: 'ios',
      builds: [build('uploaded-from-dev'), build('released')],
      shipped: new Set(['uploaded-from-dev']),
      trusted: (b: { id: string }) => b.id === 'released',
    });
    expect(picked.build?.id).toBe('released');
    expect(picked.ship).toBe(true);
  });
});

describe('store API calls survive one dropped connection', () => {
  const noWait = async () => {};

  test('retries a network error and returns the next response', async () => {
    let calls = 0;
    const fetchFn = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('fetch failed');
      return new Response('{}', { status: 200 });
    };
    const res = await fetchWithRetry('https://example.test', {}, { fetchFn, wait: noWait });
    expect(res.status).toBe(200);
    expect(calls).toBe(2);
  });

  test('retries 429 and 5xx, never another 4xx', async () => {
    const statuses = [503, 429, 200];
    const res = await fetchWithRetry('https://example.test', {}, {
      fetchFn: async () => new Response('', { status: statuses.shift() }),
      wait: noWait,
    });
    expect(res.status).toBe(200);

    let calls = 0;
    const conflict = await fetchWithRetry('https://example.test', {}, {
      fetchFn: async () => { calls += 1; return new Response('', { status: 409 }); },
      wait: noWait,
    });
    expect(conflict.status).toBe(409);
    expect(calls).toBe(1);
  });

  test('throws the last network error after the final attempt', async () => {
    let calls = 0;
    const fetchFn = async () => { calls += 1; throw new TypeError('fetch failed'); };
    await expect(fetchWithRetry('https://example.test', {}, { fetchFn, wait: noWait, attempts: 3 })).rejects.toThrow('fetch failed');
    expect(calls).toBe(3);
  });
});
