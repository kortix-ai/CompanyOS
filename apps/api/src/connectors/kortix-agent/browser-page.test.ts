/**
 * The page layer against a real headless Chrome over CDP: a local login form
 * served by Bun. Needs a Chrome binary: KORTIX_TEST_CHROME, or the one
 * agent-browser installs. Without one the file skips and says so.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { CdpConnection } from './cdp';
import * as pages from './browser-page';

function findChrome(): string | null {
  if (process.env.KORTIX_TEST_CHROME) return process.env.KORTIX_TEST_CHROME;
  const root = join(homedir(), '.agent-browser', 'browsers');
  if (!existsSync(root)) return null;
  for (const dir of readdirSync(root)) {
    const bin = join(root, dir, 'chrome');
    if (existsSync(bin)) return bin;
  }
  return null;
}

const chrome = findChrome();
if (!chrome) console.warn('browser-page.test.ts: no Chrome binary (set KORTIX_TEST_CHROME); skipped');

/** The message `promise` rejects with, awaited inside the test. */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'no error';
  } catch (error) {
    return (error as Error).message;
  }
}

const FORM = `<!doctype html><title>Sign in</title>
<form action="/done" method="get">
  <label for="u">Email</label><input id="u" name="email" type="email">
  <input name="password" type="password" placeholder="Password">
  <input name="confirm" type="password" placeholder="Confirm">
  <button type="submit">Sign in</button>
</form>
<a href="/other">Other page</a>`;

describe.skipIf(!chrome)('browser page over real CDP', () => {
  let proc: ReturnType<typeof Bun.spawn>;
  let server: ReturnType<typeof Bun.serve>;
  let conn: CdpConnection;
  let page: pages.Page;
  let base: string;

  beforeAll(async () => {
    server = Bun.serve({
      port: 0,
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === '/done') return new Response(`<title>Done</title><p>${url.searchParams.get('email')}|${url.searchParams.get('password') === url.searchParams.get('confirm')}</p>`, { headers: { 'content-type': 'text/html' } });
        if (url.pathname === '/other') return new Response('<title>Other</title><p>second page</p>', { headers: { 'content-type': 'text/html' } });
        return new Response(FORM, { headers: { 'content-type': 'text/html' } });
      },
    });
    base = `http://127.0.0.1:${server.port}`;
    const profile = mkdtempSync(join(tmpdir(), 'kx-chrome-'));
    proc = Bun.spawn([chrome!, '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdout: 'ignore', stderr: 'ignore' });
    const portFile = join(profile, 'DevToolsActivePort');
    for (let n = 0; n < 100 && !existsSync(portFile); n++) await Bun.sleep(100);
    const [port, path] = readFileSync(portFile, 'utf8').trim().split('\n');
    conn = await CdpConnection.open(`ws://127.0.0.1:${port}${path}`);
    page = await pages.attachPage(conn);
  });

  afterAll(() => {
    conn?.close();
    proc?.kill();
    server?.stop(true);
  });

  /** Open `url` in the page and wait for it to load, over raw CDP (the agent's own job in production). */
  async function open(url: string): Promise<void> {
    await page.conn.send('Page.navigate', { url }, { sessionId: page.sessionId });
    for (let n = 0; n < 100; n++) {
      const state = await pages.evaluate<{ href: string; ready: string }>(page, '({ href: location.href, ready: document.readyState })').catch(() => null);
      if (state?.href === url && state.ready === 'complete') return;
      await Bun.sleep(50);
    }
    throw new Error(`${url} did not load`);
  }

  test('fill_login types the username and every password field, then submits', async () => {
    await open(`${base}/login`);
    expect((await pages.listTabs(conn)).some((t) => t.url === `${base}/login`)).toBe(true);
    const filled = await pages.fillLogin(page, { username: 'otto@example.test', password: 'S3cret!pass' }, false);
    expect(filled).toMatchObject({ username: true, password: true, title: 'Sign in' });
    expect(await pages.evaluate<string[]>(page, '[...document.querySelectorAll("input")].map((i) => i.value)')).toEqual(['otto@example.test', 'S3cret!pass', 'S3cret!pass']);

    // A second fill replaces what is there, it does not append.
    const submitted = await pages.fillLogin(page, { username: 'otto@example.test', password: 'S3cret!pass' }, true);
    expect(submitted.title).toBe('Done');
    expect(await pages.evaluate<string>(page, 'document.body.innerText')).toBe('otto@example.test|true');
  });

  test('a page with no sign-in field is a tool error', async () => {
    await open(`${base}/other`);
    expect(await failure(pages.fillLogin(page, { username: 'otto@example.test', password: 'x' }, false))).toContain('no sign-in field');
    expect(await failure(pages.evaluate(page, 'nope.nope'))).toContain('page script failed');
  });
});
