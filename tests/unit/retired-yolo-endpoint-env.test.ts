import { describe, expect, it } from 'vitest';
import { gitOrEmpty } from '../src/fixtures/git-or-empty';

// The per-member YOLO usage endpoint is retired. Nothing in the codebase reads
// its URL: the sandbox no longer mints or injects a kyolo_ token
// (apps/api/src/platform/services/session-sandbox.ts), and the retired origin
// answers Cloudflare 530 / 1033 on every path. The env plumbing (KORTIX_YOLO_URL
// in each tracked .env.<environment> and its Secrets Manager ARN in Terraform)
// kept provisioning a credential no code parses, so every new deployment still
// carried the dead surface. Re-adding the var is the failure this guard pins;
// the actual retire-remediation is the Cloudflare zone record, outside the repo.
const retiredEnvVar = 'KORTIX_YOLO_URL';

const scope = [
  // Migrations are immutable once applied, so their old comments stay.
  ':!packages/db/migrations/',
  ':!packages/db/drizzle/meta/',
  // Generated black-box reports contain captured history; evidence, not source.
  ':!tests/test-results/',
  ':!tests/unit/retired-yolo-endpoint-env.test.ts',
];

describe('retired YOLO usage endpoint', () => {
  it('has no env plumbing in any tracked file', () => {
    // git grep exits 1 on "no matches"; gitOrEmpty normalizes it to [].
    const offenders = gitOrEmpty(['grep', '-n', '-F', retiredEnvVar, '--', ':/', ...scope]);
    expect(offenders).toEqual([]);
  }, 20_000);
});
