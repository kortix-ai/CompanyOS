/**
 * What `kortix_browser` does inside a page itself, over CDP (./cdp.ts): find
 * the page's site and fill a stored login with real mouse and keyboard
 * events, so the password never passes through the model. Every other page
 * action is the agent's own, over the CDP URL `connect` hands out.
 *
 * Fields inside iframes and shadow roots are not found.
 */
import type { CdpConnection } from './cdp';
import { ToolInputError } from './tool';

export interface Page {
  conn: CdpConnection;
  sessionId: string;
  targetId: string;
}

export interface Tab {
  id: string;
  url: string;
  title: string;
}

const NAVIGATION_TIMEOUT_MS = 30_000;
const SETTLE_AFTER_ACTION_MS = 3_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function listTabs(conn: CdpConnection): Promise<Tab[]> {
  const { targetInfos } = await conn.send<{ targetInfos: Array<{ targetId: string; type: string; url: string; title: string }> }>('Target.getTargets');
  return targetInfos.filter((t) => t.type === 'page').map((t) => ({ id: t.targetId, url: t.url, title: t.title }));
}

/** Attach to `targetId`, else the first tab, else a new blank tab. */
export async function attachPage(conn: CdpConnection, targetId?: string | null): Promise<Page> {
  const tabs = await listTabs(conn);
  let id = (targetId && tabs.find((t) => t.id === targetId)?.id) || tabs[0]?.id;
  if (!id) id = (await conn.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })).targetId;
  const { sessionId } = await conn.send<{ sessionId: string }>('Target.attachToTarget', { targetId: id, flatten: true });
  await conn.send('Page.enable', {}, { sessionId });
  return { conn, sessionId, targetId: id };
}

interface Evaluated {
  result?: { value?: unknown };
  exceptionDetails?: { text?: string; exception?: { description?: string } };
}

/** Run `expression` in the page and return its JSON value. */
export async function evaluate<T>(page: Page, expression: string, timeoutMs = 10_000): Promise<T> {
  const r = await page.conn.send<Evaluated>(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true, userGesture: true },
    { sessionId: page.sessionId, timeoutMs },
  );
  if (r.exceptionDetails) {
    const message = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'the script threw';
    throw new ToolInputError(`page script failed: ${message.split('\n')[0]}`);
  }
  return r.result?.value as T;
}

interface DocState {
  origin: number;
  ready: string;
}

const DOC_STATE = '({ origin: performance.timeOrigin, ready: document.readyState })';

async function docState(page: Page): Promise<DocState | null> {
  try {
    return await evaluate<DocState>(page, DOC_STATE, 3_000);
  } catch {
    // The context is being replaced by a navigation.
    return null;
  }
}

/** Wait until a document other than `before` has loaded (or `deadline`). */
async function waitForNewDocument(page: Page, before: number | null, deadline: number): Promise<void> {
  let interactiveSince: number | null = null;
  while (Date.now() < deadline) {
    const state = await docState(page);
    if (state && state.origin !== before) {
      if (state.ready === 'complete') return;
      // Some pages never fire load (long polls): interactive for 5 s is enough.
      if (state.ready === 'interactive') {
        interactiveSince ??= Date.now();
        if (Date.now() - interactiveSince > 5_000) return;
      }
    }
    await wait(200);
  }
}

export interface PageInfo {
  url: string;
  title: string;
  status: number | null;
}

const PAGE_INFO = `({
  url: location.href,
  title: document.title,
  status: (performance.getEntriesByType('navigation')[0] || {}).responseStatus || null,
})`;

export function pageInfo(page: Page): Promise<PageInfo> {
  return evaluate<PageInfo>(page, PAGE_INFO);
}

/** After a click or a key, wait for the navigation it started, if any. */
async function settle(page: Page, before: number | null): Promise<void> {
  const deadline = Date.now() + SETTLE_AFTER_ACTION_MS;
  while (Date.now() < deadline) {
    const state = await docState(page);
    if (state === null || state.origin !== before) {
      await waitForNewDocument(page, before, Date.now() + NAVIGATION_TIMEOUT_MS);
      return;
    }
    await wait(250);
  }
}

/** Scroll the element `selector` names into view and return the centre of its box. */
async function locate(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const point = await evaluate<{ x: number; y: number } | null>(
    page,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`,
  );
  if (!point) throw new ToolInputError(`no element matches ${selector}`);
  return point;
}

async function mouseClick(page: Page, x: number, y: number): Promise<void> {
  const opts = { sessionId: page.sessionId };
  await page.conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, opts);
  await wait(40);
  await page.conn.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }, opts);
  await wait(60);
  await page.conn.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }, opts);
}

const KEYS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
};

async function keyStroke(page: Page, name: keyof typeof KEYS): Promise<void> {
  const k = KEYS[name]!;
  const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode };
  const opts = { sessionId: page.sessionId };
  await page.conn.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) }, opts);
  await page.conn.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, opts);
}

async function press(page: Page, name: keyof typeof KEYS): Promise<PageInfo> {
  const before = (await docState(page))?.origin ?? null;
  await keyStroke(page, name);
  await settle(page, before);
  return pageInfo(page);
}

async function clearFocused(page: Page): Promise<void> {
  await evaluate(page, `(() => { const el = document.activeElement; if (el && typeof el.select === 'function') el.select(); else document.execCommand('selectAll'); })()`);
  await keyStroke(page, 'Backspace');
}

/** Click the field `selector` names, then type `text` as keyboard input. */
async function type(page: Page, selector: string, text: string, options: { clear?: boolean } = {}): Promise<void> {
  const { x, y } = await locate(page, selector);
  await mouseClick(page, x, y);
  if (options.clear) await clearFocused(page);
  await page.conn.send('Input.insertText', { text }, { sessionId: page.sessionId });
}

/**
 * Type a stored login into the page's sign-in form: the username into the
 * first visible email/username field, the password into every visible
 * password field (a sign-up form repeats it). The values go from the server to the page, never through
 * the model. Returns which fields were filled.
 */
export async function fillLogin(page: Page, login: { username?: string; password?: string }, submit: boolean): Promise<{ username: boolean; password: boolean } & PageInfo> {
  const fields = await evaluate<{ user: boolean; passes: number }>(
    page,
    `(() => {
      const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      for (const el of document.querySelectorAll('[data-kx-fill]')) el.removeAttribute('data-kx-fill');
      // A sign-up form repeats the password ("confirm"): every visible one is filled.
      const passes = [...document.querySelectorAll('input[type=password]')].filter(shown);
      const userSel = 'input[autocomplete=username],input[type=email],input[autocomplete=email],input[name*=user i],input[name*=email i],input[name*=login i],input[id*=user i],input[id*=email i],input[type=text],input:not([type])';
      const user = [...document.querySelectorAll(userSel)].find((e) => shown(e) && !passes.includes(e));
      if (user) user.setAttribute('data-kx-fill', 'user');
      passes.forEach((e, i) => e.setAttribute('data-kx-fill', 'pass' + i));
      return { user: !!user, passes: passes.length };
    })()`,
  );
  const filled = { username: false, password: false };
  if (login.username && fields.user) {
    await type(page, '[data-kx-fill=user]', login.username, { clear: true });
    filled.username = true;
  }
  if (login.password) {
    for (let i = 0; i < fields.passes; i++) await type(page, `[data-kx-fill=pass${i}]`, login.password, { clear: true });
    filled.password = fields.passes > 0;
  }
  if (!filled.username && !filled.password) throw new ToolInputError('no sign-in field on this page: no visible username, email or password input');
  const info = submit ? await press(page, 'Enter') : await pageInfo(page);
  return { ...filled, ...info };
}
