const { describe, expect, test } = require('bun:test');
const { allowsMedia, installMediaPermissionPolicy } = require('./media-permission');

const APP = 'https://kortix.com';
const main = { id: 1 };
const popup = { id: 2 };
const base = { webContents: main, appWebContents: main, requestingUrl: 'https://kortix.com/workspaces/w', isMainFrame: true, mediaTypes: ['audio'] };

describe('allowsMedia', () => {
  test('grants the microphone to the main window on the app origin', () => {
    expect(allowsMedia(base, APP)).toBe(true);
  });

  test('refuses a popup, an iframe, another origin, the camera and an unknown media type', () => {
    expect(allowsMedia({ ...base, webContents: popup }, APP)).toBe(false);
    expect(allowsMedia({ ...base, isMainFrame: false }, APP)).toBe(false);
    expect(allowsMedia({ ...base, requestingUrl: 'https://accounts.example.test/oauth' }, APP)).toBe(false);
    expect(allowsMedia({ ...base, requestingUrl: 'https://kortix.com.evil.test/' }, APP)).toBe(false);
    expect(allowsMedia({ ...base, mediaTypes: ['audio', 'video'] }, APP)).toBe(false);
    expect(allowsMedia({ ...base, mediaTypes: [] }, APP)).toBe(false);
    expect(allowsMedia({ ...base, appWebContents: null }, APP)).toBe(false);
  });
});

describe('installMediaPermissionPolicy', () => {
  function install() {
    const handlers = {};
    const denied = [];
    installMediaPermissionPolicy(
      {
        setPermissionRequestHandler: (fn) => (handlers.request = fn),
        setPermissionCheckHandler: (fn) => (handlers.check = fn),
      },
      { appWebContents: () => main, appUrl: () => APP, onDenied: (url) => denied.push(url) },
    );
    return { handlers, denied };
  }

  test('keeps every other permission granted, as Electron did without a handler', () => {
    const { handlers } = install();
    let answer;
    handlers.request(popup, 'notifications', (ok) => (answer = ok), { requestingUrl: 'https://x.test' });
    expect(answer).toBe(true);
    expect(handlers.check(popup, 'clipboard-sanitized-write', 'https://x.test', {})).toBe(true);
  });

  test('answers a microphone request and check by the rule, and reports a refusal', () => {
    const { handlers, denied } = install();
    let granted;
    handlers.request(main, 'media', (ok) => (granted = ok), { requestingUrl: `${APP}/w`, isMainFrame: true, mediaTypes: ['audio'] });
    expect(granted).toBe(true);
    let refused;
    handlers.request(popup, 'media', (ok) => (refused = ok), { requestingUrl: 'https://provider.test/', isMainFrame: true, mediaTypes: ['audio'] });
    expect(refused).toBe(false);
    expect(denied).toEqual(['https://provider.test/']);
    expect(handlers.check(main, 'media', APP, { requestingUrl: `${APP}/w`, isMainFrame: true, mediaType: 'audio' })).toBe(true);
    expect(handlers.check(popup, 'media', 'https://provider.test', { isMainFrame: true, mediaType: 'audio' })).toBe(false);
  });
});
