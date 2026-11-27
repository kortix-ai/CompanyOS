import { expect, test } from 'bun:test';
import { base32Decode, hotp, parseTotpKey, totp, TotpInputError } from './totp';

// RFC 6238 appendix B: the seeds are the ASCII bytes of "12345678901234567890" (SHA1),
// that repeated to 32 bytes (SHA256) and to 64 bytes (SHA512); 8 digits, 30 s.
const ascii = (len: number) => Buffer.from('1234567890'.repeat(7).slice(0, len));
const b32 = (buf: Buffer) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
};

const VECTORS: Array<[number, string, string, string]> = [
  [59, '94287082', '46119246', '90693936'],
  [1111111109, '07081804', '68084774', '25091201'],
  [1111111111, '14050471', '67062674', '99943326'],
  [1234567890, '89005924', '91819424', '93441116'],
  [2000000000, '69279037', '90698825', '38618901'],
  [20000000000, '65353130', '77737706', '47863826'],
];

test('RFC 6238 test vectors for SHA1, SHA256 and SHA512', () => {
  for (const [seconds, sha1, sha256, sha512] of VECTORS) {
    for (const [algorithm, len, expected] of [['SHA1', 20, sha1], ['SHA256', 32, sha256], ['SHA512', 64, sha512]] as const) {
      const key = { secret: b32(ascii(len)), issuer: null, account: null, algorithm, digits: 8, period: 30 };
      expect(totp(key, seconds * 1000).code).toBe(expected);
    }
  }
});

test('RFC 4226 HOTP test values', () => {
  const key = ascii(20);
  expect([0, 1, 2, 9].map((c) => hotp(key, c, 6, 'SHA1'))).toEqual(['755224', '287082', '359152', '520489']);
});

test('a code says how long it stays valid', () => {
  const key = parseTotpKey({ secret: 'JBSWY3DPEHPK3PXP' });
  expect(totp(key, 1_000_000_000).expiresInSeconds).toBe(30 - (1_000_000 % 30));
});

test('an otpauth URI gives issuer, account and options', () => {
  const key = parseTotpKey({ uri: 'otpauth://totp/Example%20Co:otto%40example.test?secret=jbswy3dpehpk3pxp&issuer=Example%20Co&digits=8&period=60&algorithm=SHA256' });
  expect(key).toEqual({ secret: 'JBSWY3DPEHPK3PXP', issuer: 'Example Co', account: 'otto@example.test', algorithm: 'SHA256', digits: 8, period: 60 });
  const bare = parseTotpKey({ uri: 'otpauth://totp/otto@example.test?secret=JBSWY3DPEHPK3PXP' });
  expect(bare.issuer).toBeNull();
  expect(bare.account).toBe('otto@example.test');
});

test('bad keys are refused with a reason', () => {
  expect(() => parseTotpKey({ uri: 'otpauth://hotp/x?secret=JBSWY3DP' })).toThrow('time-based');
  expect(() => parseTotpKey({ uri: 'otpauth://totp/x' })).toThrow('no secret');
  expect(() => parseTotpKey({ secret: 'not base32!' })).toThrow(TotpInputError);
  expect(() => parseTotpKey({ secret: 'JBSWY3DP', digits: 4 })).toThrow('digits');
  expect(() => parseTotpKey({})).toThrow('uri');
  expect(base32Decode('jbsw y3dp-ehpk 3pxp====').toString('hex')).toBe('48656c6c6f21deadbeef');
});
