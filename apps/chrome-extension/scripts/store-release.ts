// Releases the extension version in src/manifest.json to the Chrome Web Store.
//
//   bun apps/chrome-extension/scripts/store-release.ts [--dry-run]
//
// .github/workflows/chrome-store.yml runs it after every Deploy Prod, on the
// released `prod` commit. The product side of that commit is live before the
// upload starts, so an approved version never reaches users ahead of it.
// One run does what the store state asks (plan() below):
//   - version above every store version: build, upload, submit for review.
//     The store publishes it automatically after approval.
//   - a submission in review: wait. The first run after the review uploads.
//   - version equal to the live one, extension files changed after it was set:
//     fail, the change needs a version bump.
//   - rejected, taken down, or a store version above the repo: fail.
// A run with nothing to do changes nothing. --dry-run reads and builds only.
//
// Auth: a Google service account that the publisher added in the Developer
// Dashboard (Account → Service accounts). CI reads both values from AWS Secrets
// Manager kortix-ci-env; store them with scripts/store-credentials.sh.
//   CHROME_WEB_STORE_SERVICE_ACCOUNT_KEY  the service account JSON key
//   CHROME_WEB_STORE_PUBLISHER_ID         Developer Dashboard → Publisher → Settings
// API: https://developer.chrome.com/docs/webstore/using-api (V2).
import { execFileSync } from 'node:child_process';
import { sign } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const ITEM_ID = 'gefbbnjgoiljpbnalgafbhbfdhikgjek';
const API = 'https://chromewebstore.googleapis.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const UPLOAD_TIMEOUT_MS = 10 * 60_000;

const APP = join(import.meta.dir, '..');
const REPO = join(APP, '../..');
const MANIFEST = 'apps/chrome-extension/src/manifest.json';
// Every input of scripts/build.ts. Keep this list in step with it: a change
// here without a version bump fails the release run.
const INPUTS = [
  'apps/chrome-extension/src',
  'apps/chrome-extension/icons',
  'apps/chrome-extension/scripts/build.ts',
  'apps/chrome-extension/scripts/package.ts',
  '.agents/skills/kortix-brand/references/visual/tokens.css',
  ':(exclude)*.test.ts',
];

export type Level = 'notice' | 'warning' | 'error';
export type Revision = { state: string; version: string | null };
export type StoreState = { published: Revision | null; submitted: Revision | null; takenDown: boolean; warned: boolean };
export type Plan = { upload: boolean; level: Level; text: string };

/** -1, 0 or 1 for two Chrome versions (1 to 4 dot-separated integers). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

const newest = (versions: (string | null | undefined)[]): string | null =>
  versions.filter((v): v is string => !!v).reduce<string | null>((a, v) => (a && compareVersions(a, v) >= 0 ? a : v), null);

/** The fetchStatus response as the two revisions the run compares. */
export function readStatus(body: {
  publishedItemRevisionStatus?: { state?: string; distributionChannels?: { crxVersion?: string }[] };
  submittedItemRevisionStatus?: { state?: string; distributionChannels?: { crxVersion?: string }[] };
  takenDown?: boolean;
  warned?: boolean;
}): StoreState {
  const revision = (r: typeof body.publishedItemRevisionStatus): Revision | null =>
    r ? { state: r.state ?? 'ITEM_STATE_UNSPECIFIED', version: newest((r.distributionChannels ?? []).map((c) => c.crxVersion)) } : null;
  return {
    published: revision(body.publishedItemRevisionStatus),
    submitted: revision(body.submittedItemRevisionStatus),
    takenDown: body.takenDown === true,
    warned: body.warned === true,
  };
}

const stay = (level: Level, text: string): Plan => ({ upload: false, level, text });

/**
 * What the run does for repo version `version` in store state `store`.
 * `changed`: extension files changed after the commit that set `version`.
 * Never cancels a review: releases come faster than reviews, and a new upload
 * would restart the review every time.
 */
export function plan({ version, store, changed }: { version: string; store: StoreState; changed: string[] }): Plan {
  if (store.takenDown) return stay('error', 'The Chrome Web Store took the item down. Read the Developer Dashboard and the email from the store.');
  const sub = store.submitted;
  const above = (v: string | null) => !v || compareVersions(version, v) > 0;
  switch (sub?.state) {
    case 'PENDING_REVIEW':
      return stay('notice', above(sub.version)
        ? `${sub.version} is in review. ${version} waits: the first release after the review uploads it.`
        : `${sub.version} is in review. It goes live automatically after approval.`);
    case 'STAGED':
    case 'PUBLISHED_TO_TESTERS':
      return stay('warning', `${sub.version} is approved but held (${sub.state}). Publish it in the Developer Dashboard; the next release then uploads ${version} if it is newer.`);
    case 'REJECTED':
      if (!above(sub.version)) {
        return stay('error', `The store rejected ${sub.version}. Read the email from the store, fix the cause on dev and raise "version" in ${MANIFEST}.`);
      }
      break;
    case 'CANCELLED':
      if (!above(sub.version)) return stay('notice', `A person cancelled the review of ${sub.version}. Raise "version" in ${MANIFEST} to submit again.`);
      break;
  }
  const latest = newest([store.published?.version, sub?.version]);
  if (above(latest)) return { upload: true, level: 'notice', text: `${version} goes to review (the store has ${latest ?? 'no version'}).` };
  if (compareVersions(version, latest!) < 0) {
    return stay('error', `The store has ${latest}, above ${version} in ${MANIFEST}. Raise "version" above ${latest}.`);
  }
  if (changed.length) {
    return stay('error', `${changed.length} extension file(s) changed after ${version} went to the store (${changed.slice(0, 3).join(', ')}${changed.length > 3 ? ', …' : ''}). `
      + `Users get none of it: raise "version" in ${MANIFEST} on dev.`);
  }
  return stay('notice', `${version} is live. Nothing to upload.`);
}

const git = (args: string[]) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();

/** Extension inputs changed after the newest commit that changed the manifest "version" line. */
function changedSinceVersionSet(): string[] {
  const set = git(['log', '-1', '--format=%H', '-G', '"version"', '--', MANIFEST]);
  if (!set) return [];
  return git(['diff', '--name-only', `${set}..HEAD`, '--', ...INPUTS]).split('\n').filter(Boolean);
}

/** An OAuth access token for the service account (JWT bearer grant, RFC 7523). */
async function accessToken(keyJson: string): Promise<string> {
  const key = JSON.parse(keyJson) as { client_email?: string; private_key?: string };
  if (!key.client_email || !key.private_key) throw new Error('CHROME_WEB_STORE_SERVICE_ACCOUNT_KEY is not a service account JSON key');
  const now = Math.floor(Date.now() / 1000);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${part({ alg: 'RS256', typ: 'JWT' })}.${part({ iss: key.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
  const assertion = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), key.private_key).toString('base64url')}`;
  const body = await call('POST', TOKEN_URL, {
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    retry: true,
  });
  return body.access_token as string;
}

/** One HTTP call; `retry` repeats a network error or a 5xx/429 up to 3 times (reads only). */
async function call(method: string, url: string, opts: { token?: string; body?: BodyInit; json?: object; retry?: boolean } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.json) headers['content-type'] = 'application/json';
  for (let attempt = 1; ; attempt++) {
    let res: Response | null = null;
    let failure = '';
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.json ? JSON.stringify(opts.json) : opts.body,
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) return (await res.json().catch(() => ({}))) as Record<string, any>;
      failure = `${res.status} ${(await res.text()).slice(0, 800)}`;
    } catch (error) {
      failure = (error as Error).message;
    }
    const transient = !res || res.status >= 500 || res.status === 429;
    if (!opts.retry || !transient || attempt === 3) throw new Error(`${method} ${url.replace(API, '')}: ${failure}`);
    await Bun.sleep(attempt * 5_000);
  }
}

const report: { level: Level; text: string; changed: boolean }[] = [];
function note(level: Level, text: string, changed = false) {
  report.push({ level, text, changed });
  console.log(`::${level}::Chrome Web Store: ${text}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- **${level}** ${text}\n`);
}

async function postToSlack() {
  const { SLACK_BOT_TOKEN: token, SLACK_RELEASE_CHANNEL: channel, GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  const changed = report.filter((r) => r.level !== 'notice' || r.changed);
  if (!token || !channel || changed.length === 0) return;
  const run = GITHUB_RUN_ID ? `\n<${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}|Chrome Web Store run>` : '';
  const icon = { notice: '🧩', warning: '⚠️', error: '🛑' };
  const text = changed.map((r) => `${icon[r.level]} Kortix in Chrome: ${r.text}`).join('\n') + run;
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  });
  const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!body.ok) console.log(`::warning::Slack post failed: ${body.error ?? res.status}`);
}

/** Builds release/kortix-chrome-<version>.zip (the store build, no manifest key). */
function buildPackage(version: string): Blob {
  const r = Bun.spawnSync(['bun', 'run', 'scripts/package.ts'], { cwd: APP, stdout: 'inherit', stderr: 'inherit', env: { ...process.env, KORTIX_EXTENSION_DEV: '' } });
  if (r.exitCode !== 0) throw new Error(`bun run package exited ${r.exitCode}`);
  return Bun.file(join(APP, 'release', `kortix-chrome-${version}.zip`));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const { CHROME_WEB_STORE_SERVICE_ACCOUNT_KEY: keyJson, CHROME_WEB_STORE_PUBLISHER_ID: publisher } = process.env;
  if (!keyJson || !publisher) throw new Error('CHROME_WEB_STORE_SERVICE_ACCOUNT_KEY and CHROME_WEB_STORE_PUBLISHER_ID must be set (scripts/store-credentials.sh)');
  const item = `${API}/v2/publishers/${publisher}/items/${ITEM_ID}`;
  const version = (JSON.parse(readFileSync(join(REPO, MANIFEST), 'utf8')) as { version: string }).version;

  const token = await accessToken(keyJson);
  const status = async () => readStatus(await call('GET', `${item}:fetchStatus`, { token, retry: true }));
  const store = await status();
  console.log(`repo ${version}; store published ${store.published?.version ?? '-'} (${store.published?.state ?? '-'}), `
    + `submitted ${store.submitted?.version ?? '-'} (${store.submitted?.state ?? '-'})`);
  if (store.warned) note('warning', 'The store flagged a policy warning on the item. Read the Developer Dashboard.');

  const next = plan({ version, store, changed: changedSinceVersionSet() });
  if (!next.upload) {
    note(next.level, next.text);
    return;
  }

  const zip = buildPackage(version);
  if (dryRun) {
    note('notice', `${next.text} Dry run: built kortix-chrome-${version}.zip (${Math.round(zip.size / 1024)} KB), uploaded nothing.`);
    return;
  }

  // POST the zip bytes to the media URI (the guide's `curl -X POST -T <zip>`).
  const upload = await call('POST', `${API}/upload/v2/publishers/${publisher}/items/${ITEM_ID}:upload`, { token, body: zip });
  let state = upload.uploadState as string;
  for (const deadline = Date.now() + UPLOAD_TIMEOUT_MS; state === 'IN_PROGRESS' && Date.now() < deadline;) {
    await Bun.sleep(5_000);
    const body = await call('GET', `${item}:fetchStatus`, { token, retry: true });
    state = body.lastAsyncUploadState ?? 'IN_PROGRESS';
  }
  if (state !== 'SUCCEEDED') throw new Error(`upload of ${version} ended ${state}: ${JSON.stringify(upload).slice(0, 800)}`);
  if (upload.crxVersion && upload.crxVersion !== version) throw new Error(`the store read version ${upload.crxVersion} from the package, not ${version}`);

  // DEFAULT_PUBLISH: the store publishes the version itself after approval.
  const submit = await call('POST', `${item}:publish`, { token, json: { publishType: 'DEFAULT_PUBLISH' } });
  for (const w of submit.warningInfo?.warnings ?? []) note('warning', `store warning on ${version}: ${w.reason}: ${w.description}`);
  const after = await status();
  note('notice', `${version} submitted for review (${submit.state ?? after.submitted?.state ?? 'state unknown'}). `
    + 'The store publishes it automatically after approval, usually within a few days.', true);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    note('error', (error as Error).message);
  }
  if (!process.argv.includes('--dry-run')) await postToSlack();
  if (report.some((r) => r.level === 'error')) process.exit(1);
}
