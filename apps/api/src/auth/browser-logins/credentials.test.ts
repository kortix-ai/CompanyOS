import { describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { createBrowserCredentialCodec, createBrowserHandle, hashBrowserHandle } from './credentials';

const binding = { handleHash: 'synthetic-handle-hash', slot: 'synthetic-slot', userId: 'synthetic-user' };

describe('browser login credential protection', () => {
  test('encrypts credentials with randomized authenticated ciphertext', () => {
    const codec = createBrowserCredentialCodec('key-1', { 'key-1': randomBytes(32) });
    const first = codec.seal('synthetic-refresh-credential', binding);
    expect(first).not.toContain('synthetic-refresh-credential');
    expect(codec.open(first, binding)).toBe('synthetic-refresh-credential');
    expect(codec.seal('synthetic-refresh-credential', binding)).not.toBe(first);
  });

  test('rejects ciphertext moved to another handle, slot, or user', () => {
    const codec = createBrowserCredentialCodec('key-1', { 'key-1': randomBytes(32) });
    const sealed = codec.seal('synthetic-refresh-credential', binding);
    for (const field of ['handleHash', 'slot', 'userId'] as const) {
      expect(() => codec.open(sealed, { ...binding, [field]: 'different' })).toThrow();
    }
    expect(() => codec.open(sealed.slice(0, -4) + 'AAAA', binding)).toThrow();
  });

  test('reads previous keys while writing only with the active key', () => {
    const oldKey = randomBytes(32);
    const old = createBrowserCredentialCodec('old', { old: oldKey });
    const sealed = old.seal('synthetic-refresh-credential', binding);
    const rotated = createBrowserCredentialCodec('new', { old: oldKey, new: randomBytes(32) });
    expect(rotated.open(sealed, binding)).toBe('synthetic-refresh-credential');
    expect(rotated.seal('synthetic-refresh-credential', binding)).toStartWith('v1.new.');
    expect(() => createBrowserCredentialCodec('new', { new: randomBytes(32) }).open(sealed, binding)).toThrow();
  });

  test('validates keys eagerly and hashes random 256-bit browser handles', () => {
    expect(() => createBrowserCredentialCodec('missing', {})).toThrow();
    expect(() => createBrowserCredentialCodec('bad', { bad: randomBytes(16) })).toThrow();
    const handle = createBrowserHandle();
    expect(Buffer.from(handle, 'base64url').length).toBe(32);
    expect(createBrowserHandle()).not.toBe(handle);
    expect(hashBrowserHandle(handle)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashBrowserHandle(handle)).toBe(hashBrowserHandle(handle));
    expect(hashBrowserHandle(handle)).not.toBe(handle);
  });
});
