/**
 * What `kortix_browser` does inside a page, over CDP (./cdp.ts): open a URL,
 * list the interactive elements with refs, click and type with real mouse
 * and keyboard events, read, screenshot, and fill a stored login without the
 * password passing through the model.
 *
 * Refs are `data-kx-ref` attributes a snapshot writes on the elements it
 * lists. They stay valid until the next snapshot or navigation. Elements in
 * iframes and shadow roots are not listed.
 */
import { CdpError, type CdpConnection } from './cdp';
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
export const SNAPSHOT_MAX_ELEMENTS = 300;
export const READ_MAX_CHARS = 40_000;
export const SCREENSHOT_MAX_BYTES = 1_000_000;
const FULL_PAGE_MAX_HEIGHT = 8_000;

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

export async function newTab(conn: CdpConnection, url = 'about:blank'): Promise<string> {
  return (await conn.send<{ targetId: string }>('Target.createTarget', { url })).targetId;
}

export async function closeTab(conn: CdpConnection, targetId: string): Promise<void> {
  await conn.send('Target.closeTarget', { targetId });
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

export async function navigate(page: Page, url: string): Promise<PageInfo> {
  const before = (await docState(page))?.origin ?? null;
  const r = await page.conn.send<{ errorText?: string; loaderId?: string }>('Page.navigate', { url }, { sessionId: page.sessionId, timeoutMs: NAVIGATION_TIMEOUT_MS });
  if (r.errorText) throw new ToolInputError(`could not open ${url}: ${r.errorText}`);
  if (r.loaderId) await waitForNewDocument(page, before, Date.now() + NAVIGATION_TIMEOUT_MS);
  return pageInfo(page);
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

export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  type?: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  href?: string;
}

const SNAPSHOT = `(() => {
  const MAX = ${SNAPSHOT_MAX_ELEMENTS};
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=combobox],[role=textbox],[contenteditable=""],[contenteditable=true],[onclick]';
  for (const el of document.querySelectorAll('[data-kx-ref]')) el.removeAttribute('data-kx-ref');
  const clip = (s, n) => (s || '').replace(/\\s+/g, ' ').trim().slice(0, n);
  const roles = { A: 'link', BUTTON: 'button', SELECT: 'combobox', TEXTAREA: 'textbox', SUMMARY: 'button' };
  const inputRoles = { checkbox: 'checkbox', radio: 'radio', submit: 'button', button: 'button', reset: 'button', image: 'button', range: 'slider', file: 'file' };
  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || st.visibility === 'hidden' || st.display === 'none') continue;
    if (n >= MAX) break;
    const ref = 'e' + (++n);
    el.setAttribute('data-kx-ref', ref);
    const tag = el.tagName;
    const type = tag === 'INPUT' ? (el.type || 'text') : undefined;
    const role = el.getAttribute('role') || roles[tag] || (type ? (inputRoles[type] || 'textbox') : 'generic');
    const label = el.labels && el.labels[0] ? el.labels[0].innerText : '';
    const name = clip(el.getAttribute('aria-label') || label || el.getAttribute('placeholder') || el.innerText || (type === 'submit' || type === 'button' ? el.value : '') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('name'), 120);
    const item = { ref, role, name };
    if (type) item.type = type;
    if (type === 'password') { if (el.value) item.value = '(filled)'; }
    else if ('value' in el && typeof el.value === 'string' && el.value && role !== 'button') item.value = clip(el.value, 120);
    if (type === 'checkbox' || type === 'radio') item.checked = el.checked;
    if (el.disabled) item.disabled = true;
    if (tag === 'A') item.href = clip(el.href, 200);
    out.push(item);
  }
  return { url: location.href, title: document.title, elements: out, truncated: n >= MAX };
})()`;

export function snapshot(page: Page): Promise<{ url: string; title: string; elements: SnapshotElement[]; truncated: boolean }> {
  return evaluate(page, SNAPSHOT);
}

export interface Target {
  ref?: string;
  selector?: string;
  text?: string;
}

/** The page script that finds the element `target` names, or null. */
function finder(target: Target): string {
  if (target.ref) return `document.querySelector('[data-kx-ref=' + ${JSON.stringify(JSON.stringify(target.ref))} + ']')`;
  if (target.selector) return `document.querySelector(${JSON.stringify(target.selector)})`;
  if (target.text) {
    return `(() => {
      const want = ${JSON.stringify(target.text.toLowerCase())};
      const all = [...document.querySelectorAll('a,button,[role=button],[role=link],input[type=submit],input[type=button],label,summary,[onclick]')];
      const visible = all.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const text = (e) => (e.innerText || e.value || e.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().toLowerCase();
      return visible.find((e) => text(e) === want) || visible.find((e) => text(e).includes(want)) || null;
    })()`;
  }
  throw new ToolInputError('name the element: ref (from snapshot), selector, or text');
}

function describe(target: Target): string {
  return target.ref ? `ref ${target.ref}` : target.selector ? `selector ${target.selector}` : `text "${target.text}"`;
}

/** Scroll the element into view and return the centre of its box. */
async function locate(page: Page, target: Target): Promise<{ x: number; y: number }> {
  const point = await evaluate<{ x: number; y: number } | null>(
    page,
    `(() => {
      const el = ${finder(target)};
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`,
  );
  if (!point) throw new ToolInputError(`no element matches ${describe(target)}; take a new snapshot`);
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

export async function click(page: Page, target: Target): Promise<PageInfo> {
  const before = (await docState(page))?.origin ?? null;
  const { x, y } = await locate(page, target);
  await mouseClick(page, x, y);
  await settle(page, before);
  return pageInfo(page);
}

const KEYS: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  Tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  Backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  Delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  PageUp: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  Home: { key: 'Home', code: 'Home', keyCode: 36 },
  End: { key: 'End', code: 'End', keyCode: 35 },
};
export const KEY_NAMES = Object.keys(KEYS);

async function keyStroke(page: Page, name: string): Promise<void> {
  const k = KEYS[name];
  if (!k) throw new ToolInputError(`unknown key ${name}; one of ${KEY_NAMES.join(', ')}`);
  const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode };
  const opts = { sessionId: page.sessionId };
  await page.conn.send('Input.dispatchKeyEvent', { type: k.text ? 'keyDown' : 'rawKeyDown', ...base, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) }, opts);
  await page.conn.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }, opts);
}

export async function press(page: Page, name: string): Promise<PageInfo> {
  const before = (await docState(page))?.origin ?? null;
  await keyStroke(page, name);
  await settle(page, before);
  return pageInfo(page);
}

async function clearFocused(page: Page): Promise<void> {
  await evaluate(page, `(() => { const el = document.activeElement; if (el && typeof el.select === 'function') el.select(); else document.execCommand('selectAll'); })()`);
  await keyStroke(page, 'Backspace');
}

/** Click the element (or keep the focus), then type `text` as keyboard input. */
export async function type(page: Page, target: Target | null, text: string, options: { clear?: boolean; submit?: boolean } = {}): Promise<PageInfo> {
  if (target) {
    const { x, y } = await locate(page, target);
    await mouseClick(page, x, y);
  }
  if (options.clear) await clearFocused(page);
  await page.conn.send('Input.insertText', { text }, { sessionId: page.sessionId });
  if (options.submit) return press(page, 'Enter');
  return pageInfo(page);
}

export async function read(page: Page, mode: 'text' | 'links' | 'html', offset: number): Promise<Record<string, unknown>> {
  if (mode === 'links') {
    const links = await evaluate<Array<{ text: string; href: string }>>(
      page,
      `[...document.querySelectorAll('a[href]')].slice(0, 500).map((a) => ({ text: (a.innerText || a.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0, 120), href: a.href }))`,
    );
    return { ...(await pageInfo(page)), links };
  }
  const full = await evaluate<string>(page, mode === 'html' ? 'document.documentElement.outerHTML' : 'document.body ? document.body.innerText : ""', 20_000);
  const chunk = full.slice(offset, offset + READ_MAX_CHARS);
  const next = offset + chunk.length < full.length ? offset + chunk.length : null;
  return { ...(await pageInfo(page)), [mode]: chunk, total_chars: full.length, ...(next !== null ? { next_offset: next } : {}) };
}

export async function screenshot(page: Page, fullPage: boolean): Promise<{ mime_type: string; data_base64: string; bytes: number }> {
  const params: Record<string, unknown> = { format: 'jpeg', quality: 70 };
  if (fullPage) {
    const metrics = await page.conn.send<{ cssContentSize?: { width: number; height: number }; contentSize: { width: number; height: number } }>('Page.getLayoutMetrics', {}, { sessionId: page.sessionId });
    const size = metrics.cssContentSize ?? metrics.contentSize;
    params.clip = { x: 0, y: 0, width: size.width, height: Math.min(size.height, FULL_PAGE_MAX_HEIGHT), scale: 1 };
    params.captureBeyondViewport = true;
  }
  for (const quality of [70, 45, 25]) {
    params.quality = quality;
    const { data } = await page.conn.send<{ data: string }>('Page.captureScreenshot', params, { sessionId: page.sessionId, timeoutMs: 30_000 });
    const bytes = Math.floor((data.length * 3) / 4);
    if (bytes <= SCREENSHOT_MAX_BYTES) return { mime_type: 'image/jpeg', data_base64: data, bytes };
  }
  throw new ToolInputError('the screenshot is over 1 MB even at low quality; take the viewport only');
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
    await type(page, { selector: '[data-kx-fill=user]' }, login.username, { clear: true });
    filled.username = true;
  }
  if (login.password) {
    for (let i = 0; i < fields.passes; i++) await type(page, { selector: `[data-kx-fill=pass${i}]` }, login.password, { clear: true });
    filled.password = fields.passes > 0;
  }
  if (!filled.username && !filled.password) throw new ToolInputError('no sign-in field on this page: no visible username, email or password input');
  const info = submit ? await press(page, 'Enter') : await pageInfo(page);
  return { ...filled, ...info };
}

/** Any page script, for what the other actions cannot do. */
export async function runScript(page: Page, script: string): Promise<unknown> {
  try {
    return await evaluate(page, script, 20_000);
  } catch (error) {
    if (error instanceof CdpError) throw new ToolInputError(error.message);
    throw error;
  }
}
