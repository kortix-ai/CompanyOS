/**
 * Time-based one-time passwords (RFC 6238, over HOTP RFC 4226) and the
 * `otpauth://` key URI that sites show as a QR code. Pure: the clock is an
 * argument.
 */
import { createHmac } from 'node:crypto';

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export interface TotpKey {
  /** The shared secret, base32 (RFC 4648), as the site shows it. */
  secret: string;
  issuer: string | null;
  account: string | null;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export class TotpInputError extends Error {}

/** Base32 to bytes. Spaces, hyphens and padding are ignored; case does not matter. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!clean) throw new TotpInputError('the secret is empty');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new TotpInputError(`the secret is not base32: "${char}" is not allowed`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226) for one counter value. */
export function hotp(key: Buffer, counter: number, digits: number, algorithm: TotpAlgorithm): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac(algorithm.toLowerCase(), key).update(message).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The code at `atMs`, and how many seconds it stays valid. */
export function totp(key: TotpKey, atMs: number): { code: string; expiresInSeconds: number } {
  const seconds = Math.floor(atMs / 1000);
  const counter = Math.floor(seconds / key.period);
  return {
    code: hotp(base32Decode(key.secret), counter, key.digits, key.algorithm),
    expiresInSeconds: key.period - (seconds % key.period),
  };
}

function algorithmOf(raw: string | null): TotpAlgorithm {
  const value = (raw ?? 'SHA1').toUpperCase().replace('-', '');
  if (value === 'SHA1' || value === 'SHA256' || value === 'SHA512') return value;
  throw new TotpInputError(`algorithm must be SHA1, SHA256 or SHA512, not ${raw}`);
}

function intIn(raw: string | null, fallback: number, min: number, max: number, name: string): number {
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new TotpInputError(`${name} must be a whole number from ${min} to ${max}`);
  return value;
}

/**
 * A key from an `otpauth://totp/<issuer>:<account>?secret=…` URI, or from a bare
 * secret with optional fields. Throws {@link TotpInputError} on anything a site
 * would not accept.
 */
export function parseTotpKey(input: {
  uri?: string | null;
  secret?: string | null;
  issuer?: string | null;
  account?: string | null;
  digits?: number | null;
  period?: number | null;
  algorithm?: string | null;
}): TotpKey {
  if (input.uri) {
    let url: URL;
    try {
      url = new URL(input.uri);
    } catch {
      throw new TotpInputError('the otpauth URI is not a URL');
    }
    if (url.protocol !== 'otpauth:') throw new TotpInputError('the URI must start with otpauth://');
    if (url.hostname.toLowerCase() !== 'totp') throw new TotpInputError('only time-based keys (otpauth://totp/…) are supported');
    const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    const [labelIssuer, labelAccount] = label.includes(':') ? label.split(/:(.*)/s, 2) : [null, label];
    const secret = url.searchParams.get('secret');
    if (!secret) throw new TotpInputError('the otpauth URI has no secret');
    const key: TotpKey = {
      secret: secret.toUpperCase(),
      issuer: url.searchParams.get('issuer') ?? labelIssuer?.trim() ?? null,
      account: labelAccount?.trim() || null,
      algorithm: algorithmOf(url.searchParams.get('algorithm')),
      digits: intIn(url.searchParams.get('digits'), 6, 6, 8, 'digits'),
      period: intIn(url.searchParams.get('period'), 30, 15, 120, 'period'),
    };
    base32Decode(key.secret);
    return key;
  }
  if (!input.secret) throw new TotpInputError('give either uri (otpauth://…) or secret');
  const key: TotpKey = {
    secret: input.secret.toUpperCase().replace(/[\s-]/g, ''),
    issuer: input.issuer?.trim() || null,
    account: input.account?.trim() || null,
    algorithm: algorithmOf(input.algorithm ?? null),
    digits: intIn(input.digits == null ? null : String(input.digits), 6, 6, 8, 'digits'),
    period: intIn(input.period == null ? null : String(input.period), 30, 15, 120, 'period'),
  };
  base32Decode(key.secret);
  return key;
}
