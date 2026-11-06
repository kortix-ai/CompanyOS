import { expect, test } from 'bun:test';
import { browserLoginWriteAllowed, browserHandleCookieName } from './ingress';

test('browser broker requires exact configured origin and explicit CSRF header', () => {
  const trusted = 'https://app.example.test';
  const request = (headers: Record<string, string>) => new Request(`${trusted}/v1/auth/browser-logins/token`, { method: 'POST', headers });
  expect(browserLoginWriteAllowed(request({ origin: trusted, 'x-kortix-browser-login': '1' }), trusted)).toBe(true);
  for (const origin of ['https://attacker.example.test', 'null', `${trusted}.attacker.test`, 'http://app.example.test']) {
    expect(browserLoginWriteAllowed(request({ origin, 'x-kortix-browser-login': '1', 'x-forwarded-host': 'app.example.test' }), trusted)).toBe(false);
  }
  expect(browserLoginWriteAllowed(request({ origin: trusted }), trusted)).toBe(false);
  expect(browserLoginWriteAllowed(request({ 'x-kortix-browser-login': '1' }), trusted)).toBe(false);
  expect(browserLoginWriteAllowed(request({ origin: trusted, 'x-kortix-browser-login': '1', 'sec-fetch-site': 'cross-site' }), trusted)).toBe(false);
});

test('local browser handles are isolated by port; HTTPS uses host-only cookie prefix', () => {
  expect(browserHandleCookieName('https://app.example.test')).toBe('__Host-kortix-vault');
  expect(browserHandleCookieName('http://localhost:17700')).not.toBe(browserHandleCookieName('http://localhost:3000'));
  expect(() => browserHandleCookieName('http://app.example.test')).toThrow();
});
