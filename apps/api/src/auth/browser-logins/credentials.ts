import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

interface CredentialBinding {
  handleHash: string;
  slot: string;
  userId: string;
}

/** The database stores this hash, never the browser's bearer handle. */
export function hashBrowserHandle(handle: string): string {
  return createHash('sha256').update('kortix-browser-handle:v1\0').update(handle).digest('hex');
}

export function createBrowserHandle(): string {
  return randomBytes(32).toString('base64url');
}

/** Keys come from the server secret configuration, independently of the database. */
export function createBrowserCredentialCodec(activeKeyId: string, keys: Readonly<Record<string, Uint8Array>>) {
  const keyring = new Map<string, Buffer>();
  for (const [id, key] of Object.entries(keys)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || key.byteLength !== 32) {
      throw new Error('Invalid browser credential key configuration');
    }
    keyring.set(id, Buffer.from(key));
  }
  if (!keyring.has(activeKeyId)) throw new Error('Missing active browser credential key');

  const aad = (keyId: string, binding: CredentialBinding) => Buffer.from(JSON.stringify([
    'kortix-browser-credential', 'v1', keyId, binding.handleHash, binding.slot, binding.userId,
  ]));

  return {
    seal(credential: string, binding: CredentialBinding): string {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', keyring.get(activeKeyId)!, nonce);
      cipher.setAAD(aad(activeKeyId, binding));
      const ciphertext = Buffer.concat([cipher.update(credential, 'utf8'), cipher.final()]);
      return ['v1', activeKeyId, nonce.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
    },
    open(envelope: string, binding: CredentialBinding): string {
      try {
        const parts = envelope.split('.');
        if (parts.length !== 5 || parts[0] !== 'v1') throw new Error();
        const [, keyId, nonceText, ciphertextText, tagText] = parts as [string, string, string, string, string];
        const key = keyring.get(keyId);
        if (!key) throw new Error();
        const nonce = Buffer.from(nonceText, 'base64url');
        const tag = Buffer.from(tagText, 'base64url');
        if (nonce.length !== 12 || tag.length !== 16) throw new Error();
        const decipher = createDecipheriv('aes-256-gcm', key, nonce);
        decipher.setAAD(aad(keyId, binding));
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
      } catch {
        // Never expose ciphertext, key ids, credentials, or identity bindings in errors.
        throw new Error('Browser credential unavailable');
      }
    },
  };
}
