import { createHash } from 'crypto';
/** 96-bit SHA-256 prefix, lowercase RFC4648 base32 without padding. */
export function previewIdentityPartition(subject: string): string {
  const bytes = createHash('sha256').update(`kortix-preview-identity:v1:${subject}`).digest().subarray(0, 12);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0, accumulator = 0, result = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(accumulator >>> bits) & 31]; }
  }
  if (bits) result += alphabet[(accumulator << (5 - bits)) & 31];
  return result;
}

/** A removed browser slot refuses immediately, including pending GoTrue revocation. */
export async function previewLoginSessionLive(userId: string, sessionId: string): Promise<boolean> {
  const { authSessionLive } = await import('../shared/jwt-liveness');
  if (!await authSessionLive(userId, sessionId)) return false;
  const { db } = await import('../shared/db');
  const { sql } = await import('drizzle-orm');
  const rows = await db.execute(sql`select 1 from kortix.browser_login_slots s
    join kortix.browser_login_handles h using(handle_hash)
    where s.user_id=${userId}::uuid and s.session_id=${sessionId}::uuid
      and (s.removed_at is not null or s.revoke_pending or h.idle_expires_at<=now() or h.absolute_expires_at<=now()) limit 1`);
  return rows.length === 0;
}
