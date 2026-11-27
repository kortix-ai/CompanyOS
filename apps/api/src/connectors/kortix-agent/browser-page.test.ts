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

  test('open, snapshot refs, fill a login into every password field, submit', async () => {
    const opened = await pages.navigate(page, `${base}/login`);
    expect(opened).toEqual({ url: `${base}/login`, title: 'Sign in', status: 200 });

    const snap = await pages.snapshot(page);
    expect(snap.elements.map((e) => [e.role, e.name])).toEqual([
      ['textbox', 'Email'],
      ['textbox', 'Password'],
      ['textbox', 'Confirm'],
      ['button', 'Sign in'],
      ['link', 'Other page'],
    ]);

    const filled = await pages.fillLogin(page, { username: 'otto@example.test', password: 'S3cret!pass' }, false);
    expect(filled).toMatchObject({ username: true, password: true, title: 'Sign in' });
    // The snapshot never shows a password value.
    const after = await pages.snapshot(page);
    expect(after.elements[1]).toMatchObject({ type: 'password', value: '(filled)' });
    expect(JSON.stringify(after)).not.toContain('S3cret');

    const done = await pages.click(page, { text: 'sign in' });
    expect(done.title).toBe('Done');
    expect((await pages.read(page, 'text', 0)).text).toBe('otto@example.test|true');
  });

  test('type with clear and submit, press, links, screenshot', async () => {
    await pages.navigate(page, `${base}/login`);
    const snap = await pages.snapshot(page);
    await pages.type(page, { ref: snap.elements[0]!.ref }, 'first');
    await pages.type(page, { ref: snap.elements[0]!.ref }, 'otto@example.test', { clear: true });
    expect(await pages.evaluate(page, 'document.querySelector("#u").value')).toBe('otto@example.test');

    const links = await pages.read(page, 'links', 0);
    expect(links.links).toEqual([{ text: 'Other page', href: `${base}/other` }]);

    const shot = await pages.screenshot(page, false);
    expect(shot.mime_type).toBe('image/jpeg');
    expect(Buffer.from(shot.data_base64, 'base64').subarray(0, 2).toString('hex')).toBe('ffd8');

    const moved = await pages.click(page, { selector: 'a' });
    expect(moved).toMatchObject({ url: `${base}/other`, title: 'Other' });
  });

  test('a missing element and a failing script are tool errors', async () => {
    await pages.navigate(page, `${base}/login`);
    expect(await failure(pages.click(page, { ref: 'e999' }))).toContain('no element matches ref e999');
    expect(await failure(pages.runScript(page, 'nope.nope'))).toContain('page script failed');
  });
});
