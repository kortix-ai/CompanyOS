import { test, expect } from 'bun:test';
import { authorizePreviewUrl } from './preview-auth';
import { partitionPreviewUrl } from './preview-partition';
test('identity origins are distinct, bounded and retain paths', async () => {
 const a = await partitionPreviewUrl('http://p3000-sbx-test.localhost:8008/a?q=1', 'user-a');
 const b = await partitionPreviewUrl('http://p3000-sbx-test.localhost:8008/a?q=1', 'user-b');
 expect(a).not.toBe(b);
 expect(new URL(a).hostname).toMatch(/--i[a-z2-7]{20}\.localhost$/);
 expect(new URL(a).pathname).toBe('/a');
 await expect(partitionPreviewUrl(`https://staging-p65535-${'a'.repeat(50)}.p.example`, 'user-a')).rejects.toThrow();
});

test('maximum supported sandbox labels fit one wildcard label in every environment', async () => {
 for (const env of ['dev','staging','prod','preview']) {
  const url=await partitionPreviewUrl(`https://${env}-p65535-sbx-${'a'.repeat(26)}.p.example/`, 'user-a');
  expect(new URL(url).hostname.split('.')[0]!.length).toBeLessThanOrEqual(63);
 }
});

test('UUID sandbox identity uses reversible base36 without truncation', async () => {
 const url=await partitionPreviewUrl('https://staging-p65535-00000000-0000-4000-8000-000000000001.p.example/', 'user-a');
 expect(new URL(url).hostname.split('.')[0]!.length).toBeLessThanOrEqual(63);
 expect(new URL(url).hostname).toContain('-uuid-');
});
