import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import type { SecretValueStatus } from '@kortix/api-contract';
import { config } from '../../config';
import { SecretUndecryptableError } from '../../secrets/undecryptable';

/**
 * The project-secret envelope: AES-256-GCM under a per-project HKDF key.
 *
 * - `v1:<iv>:<tag>:<ciphertext>` — no associated data. Any `v1` ciphertext of a
 *   project decrypts in any row of that project, so a database writer could move
 *   one secret's value into another row (to a row whose policy admits a host the
 *   original did not) and nothing would notice.
 * - `v2:<iv>:<tag>:<ciphertext>` — the same cipher under a v2 key, with AAD
 *   `kortix-project-secret|v2|<projectId>|<aad>`. `aad` is a stable resource
 *   identifier the caller passes at BOTH ends (`projectSecretAad(identifier)` for
 *   a `project_secrets` row). Moved to a row with another identifier, the GCM
 *   tag no longer verifies and decryption throws.
 *
 * Reads accept both versions. A `v2` envelope without the caller's `aad` is
 * refused: there is nothing to bind against. Writes produce `v2` when the caller
 * passes `aad` and `KORTIX_SECRET_ENVELOPE_V2_WRITES` is on, else `v1`.
 */
const ENVELOPE_V1 = 'v1';
const ENVELOPE_V2 = 'v2';
const GCM_AUTH_TAG_LENGTH = 16;

function b64url(input: Buffer): string {
  return input.toString('base64url');
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

function projectSecretKey(projectId: string, version: typeof ENVELOPE_V1 | typeof ENVELOPE_V2): Buffer {
  if (!config.API_KEY_SECRET) {
    throw new Error('API_KEY_SECRET not configured; cannot encrypt project secrets');
  }
  const key = hkdfSync(
    'sha256',
    Buffer.from(config.API_KEY_SECRET, 'utf8'),
    Buffer.from(projectId, 'utf8'),
    Buffer.from(version === ENVELOPE_V1 ? 'kortix-project-secret-v1' : 'kortix-project-secret-v2', 'utf8'),
    32,
  );
  return Buffer.from(key);
}

function associatedData(projectId: string, aad: string): Buffer {
  return Buffer.from(`kortix-project-secret|v2|${projectId}|${aad}`, 'utf8');
}

/** The AAD of a `project_secrets` row: its identifier, the unit grants address. */
export function projectSecretAad(identifier: string): string {
  return `project_secret:${identifier}`;
}

export function encryptProjectSecret(projectId: string, value: string, aad?: string): string {
  const v2 = aad !== undefined && config.KORTIX_SECRET_ENVELOPE_V2_WRITES !== false;
  const version = v2 ? ENVELOPE_V2 : ENVELOPE_V1;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', projectSecretKey(projectId, version), iv, {
    authTagLength: GCM_AUTH_TAG_LENGTH,
  });
  if (v2) cipher.setAAD(associatedData(projectId, aad!));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${version}:${b64url(iv)}:${b64url(tag)}:${b64url(ciphertext)}`;
}

/** Decrypt a `v1` or `v2` envelope. A `v2` envelope requires the `aad` it was written with. */
export function decryptProjectSecret(projectId: string, valueEnc: string, aad?: string): string {
  const [version, ivB64, tagB64, ciphertextB64] = valueEnc.split(':');
  if (
    (version !== ENVELOPE_V1 && version !== ENVELOPE_V2) ||
    !ivB64 ||
    !tagB64 ||
    ciphertextB64 === undefined
  ) {
    throw new Error('Unsupported project secret envelope');
  }
  if (version === ENVELOPE_V2 && aad === undefined) {
    throw new Error('A v2 project secret envelope requires its resource binding');
  }
  const tag = fromB64url(tagB64);
  if (tag.length !== GCM_AUTH_TAG_LENGTH) {
    throw new Error('Unsupported project secret auth tag length');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    projectSecretKey(projectId, version),
    fromB64url(ivB64),
    { authTagLength: GCM_AUTH_TAG_LENGTH },
  );
  if (version === ENVELOPE_V2) decipher.setAAD(associatedData(projectId, aad!));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(fromB64url(ciphertextB64)), decipher.final()]).toString(
    'utf8',
  );
}

/** Can this server decrypt the envelope? The plaintext is discarded. */
export function probeProjectSecret(projectId: string, valueEnc: string, aad?: string): SecretValueStatus {
  try {
    decryptProjectSecret(projectId, valueEnc, aad);
    return 'ok';
  } catch {
    return 'undecryptable';
  }
}

/** `decryptProjectSecret`, but a failure throws `SecretUndecryptableError` naming `label`. */
export function decryptNamedProjectSecret(
  projectId: string,
  valueEnc: string,
  label: string,
  remedy?: string,
  aad?: string,
): string {
  try {
    return decryptProjectSecret(projectId, valueEnc, aad);
  } catch {
    throw new SecretUndecryptableError(label, remedy);
  }
}
