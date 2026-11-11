/**
 * The project-secret envelope family (project secrets, connector and OAuth
 * credentials): the decrypt probe the secrets list reports per row, and the
 * named decrypt that session start uses (KRTX-1719).
 */
import { afterEach, describe, expect, test } from 'bun:test';
import { config } from '../../config';
import { SecretUndecryptableError } from '../../secrets/undecryptable';
import {
  decryptNamedProjectSecret,
  decryptProjectSecret,
  encryptProjectSecret,
  probeProjectSecret,
  projectSecretAad,
} from './envelope';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const PLAINTEXT = 'synthetic-secret-value';
const originalKey = config.API_KEY_SECRET;

afterEach(() => {
  config.API_KEY_SECRET = originalKey;
});

/** Flip one character of the ciphertext segment: the GCM tag no longer matches. */
function damaged(envelope: string): string {
  const parts = envelope.split(':');
  const ciphertext = parts[3]!;
  parts[3] = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
  return parts.join(':');
}

describe('probeProjectSecret', () => {
  test('a value written under the current key is ok', () => {
    expect(probeProjectSecret(PROJECT_ID, encryptProjectSecret(PROJECT_ID, PLAINTEXT))).toBe('ok');
  });

  test('a changed API_KEY_SECRET makes every earlier value undecryptable', () => {
    const envelope = encryptProjectSecret(PROJECT_ID, PLAINTEXT);
    config.API_KEY_SECRET = `${originalKey}-rotated`;
    expect(probeProjectSecret(PROJECT_ID, envelope)).toBe('undecryptable');
    config.API_KEY_SECRET = originalKey;
    expect(probeProjectSecret(PROJECT_ID, envelope)).toBe('ok');
  });

  test('a damaged, malformed or foreign-project envelope is undecryptable', () => {
    const envelope = encryptProjectSecret(PROJECT_ID, PLAINTEXT);
    expect(probeProjectSecret(PROJECT_ID, damaged(envelope))).toBe('undecryptable');
    expect(probeProjectSecret(PROJECT_ID, 'not-an-envelope')).toBe('undecryptable');
    expect(probeProjectSecret(PROJECT_ID, `v2:${envelope.slice(3)}`)).toBe('undecryptable');
    expect(probeProjectSecret(OTHER_PROJECT_ID, envelope)).toBe('undecryptable');
  });
});

describe('decryptNamedProjectSecret', () => {
  test('returns the value when the envelope decrypts', () => {
    const envelope = encryptProjectSecret(PROJECT_ID, PLAINTEXT);
    expect(decryptNamedProjectSecret(PROJECT_ID, envelope, 'Project secret OPENAI_API_KEY')).toBe(PLAINTEXT);
  });

  test('a failure throws SecretUndecryptableError naming the label, never the value', () => {
    const envelope = encryptProjectSecret(PROJECT_ID, PLAINTEXT);
    config.API_KEY_SECRET = `${originalKey}-rotated`;
    let thrown: unknown;
    try {
      decryptNamedProjectSecret(PROJECT_ID, envelope, 'Project secret OPENAI_API_KEY');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SecretUndecryptableError);
    const error = thrown as SecretUndecryptableError;
    expect(error.label).toBe('Project secret OPENAI_API_KEY');
    expect(error.message).toBe(
      "Project secret OPENAI_API_KEY cannot be decrypted with this server's encryption key. Re-enter its value.",
    );
    expect(error.message).not.toContain(PLAINTEXT);
  });
});

describe('the v2 envelope binds the ciphertext to its row', () => {
  const AAD = projectSecretAad('BILLING_API_KEY');
  const OTHER_AAD = projectSecretAad('OTHER_API_KEY');

  afterEach(() => {
    config.KORTIX_SECRET_ENVELOPE_V2_WRITES = true;
  });

  test('a write with a binding produces v2 and reads back with the same binding', () => {
    const envelope = encryptProjectSecret(PROJECT_ID, PLAINTEXT, AAD);
    expect(envelope.startsWith('v2:')).toBe(true);
    expect(decryptProjectSecret(PROJECT_ID, envelope, AAD)).toBe(PLAINTEXT);
  });

  test('v2 ciphertext moved to another row does not decrypt', () => {
    const envelope = encryptProjectSecret(PROJECT_ID, PLAINTEXT, AAD);
    expect(() => decryptProjectSecret(PROJECT_ID, envelope, OTHER_AAD)).toThrow();
    expect(probeProjectSecret(PROJECT_ID, envelope, OTHER_AAD)).toBe('undecryptable');
    expect(() =>
      decryptNamedProjectSecret(PROJECT_ID, envelope, 'Project secret OTHER_API_KEY', undefined, OTHER_AAD),
    ).toThrow(SecretUndecryptableError);
  });

  test('v2 ciphertext moved to another project does not decrypt', () => {
    const envelope = encryptProjectSecret(PROJECT_ID, PLAINTEXT, AAD);
    expect(() => decryptProjectSecret(OTHER_PROJECT_ID, envelope, AAD)).toThrow();
  });

  test('a v2 envelope read without a binding is refused', () => {
    const envelope = encryptProjectSecret(PROJECT_ID, PLAINTEXT, AAD);
    expect(() => decryptProjectSecret(PROJECT_ID, envelope)).toThrow('requires its resource binding');
  });

  test('v1 still reads, with or without a binding', () => {
    const v1 = encryptProjectSecret(PROJECT_ID, PLAINTEXT);
    expect(v1.startsWith('v1:')).toBe(true);
    expect(decryptProjectSecret(PROJECT_ID, v1)).toBe(PLAINTEXT);
    expect(decryptProjectSecret(PROJECT_ID, v1, AAD)).toBe(PLAINTEXT);
  });

  test('with v2 writes switched off, a binding still writes v1 (rollback window)', () => {
    config.KORTIX_SECRET_ENVELOPE_V2_WRITES = false;
    const envelope = encryptProjectSecret(PROJECT_ID, PLAINTEXT, AAD);
    expect(envelope.startsWith('v1:')).toBe(true);
    expect(decryptProjectSecret(PROJECT_ID, envelope, AAD)).toBe(PLAINTEXT);
  });
});
