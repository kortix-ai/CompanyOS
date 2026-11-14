import { describe, expect, test } from 'bun:test';
import { projectsApp } from '../lib/app';
import { registerArtifactRoutes } from './artifacts';

/**
 * One publish carries at most 48 MB (the `bodyLimit`); the 413 tells the caller
 * the same number, from the same constant.
 */
describe('artifact publish size limit', () => {
  registerArtifactRoutes();

  test('a publish over the limit is a 413 that names 48 MB', async () => {
    const res = await projectsApp.request('/p1/artifacts', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(48 * 1024 * 1024 + 1) },
      body: '{}',
    });
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: 'One publish carries at most 48 MB', code: 'publish_too_large' });
  });
});
