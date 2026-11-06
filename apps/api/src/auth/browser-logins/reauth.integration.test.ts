import { test, expect, afterAll } from "bun:test";
import { resolve } from "node:path";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../../shared/db";
import { browserLoginRouter, registerBrowserLoginRoutes } from "./routes";
import { config } from "../../config";
import {
  createBrowserCredentialCodec,
  createBrowserHandle,
  hashBrowserHandle,
} from "./credentials";
import { browserLoginConfig } from "./config";
registerBrowserLoginRoutes();
const app = new Hono().route("/v1/auth/browser-logins", browserLoginRouter);
const server = Bun.serve({ port: 0, fetch: app.fetch });
const base = `http://localhost:${server.port}/v1/auth/browser-logins`;
let cookie = "";
let fixtureProxyChain = "192.0.2.1, 192.0.2.254";
const users: string[] = [];
async function request(path: string, body: unknown = {}) {
  return fetch(base + path, {
    method: "POST",
    headers: {
      "x-forwarded-for": fixtureProxyChain,
      origin: config.FRONTEND_URL,
      "x-kortix-browser-login": "1",
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify(body),
  });
}
async function user(label: string) {
  const email = `vault-${label}-${createBrowserHandle().slice(0, 10)}@example.test`;
  const password = createBrowserHandle();
  const response = await fetch(config.SUPABASE_URL + "/auth/v1/admin/users", {
    method: "POST",
    headers: {
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = (await response.json()) as any;
  if (!response.ok) throw Error("Synthetic fixture creation failed");
  users.push(body.id);
  return { email, password };
}
async function add(identity: unknown) {
  const begin = await request("/begin", { method: "password" });
  expect(begin.status).toBe(200);
  const a = (await begin.json()) as any;
  const complete = await request(`/attempts/${a.attempt}/complete`, identity);
  expect(complete.status).toBe(200);
  const confirm = await request(`/attempts/${a.attempt}/confirm`);
  expect(confirm.status).toBe(200);
  return ((await confirm.json()) as any).slot;
}
afterAll(async () => {
  server.stop(true);
  for (const id of users)
    await fetch(config.SUPABASE_URL + "/auth/v1/admin/users/" + id, {
      method: "DELETE",
      headers: {
        apikey: config.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
});
test("reauthentication replaces uncertain credentials and retains the old session for cleanup", async () => {
  cookie = "";
  const init = await request("/initialize");
  cookie = init.headers.get("set-cookie")!.split(";")[0]!;
  const identity = await user("reauth");
  const slot = await add(identity);
  const h = hashBrowserHandle(cookie.split("=")[1]!);
  const [old] = await db.execute(
    sql`select * from kortix.browser_login_slots where handle_hash=${h} and slot=${slot}`,
  );
  const codec = browserLoginConfig(config).codec!;
  const binding = { handleHash: h, slot, userId: String(old!.user_id) };
  const credential = JSON.parse(codec.open(String(old!.credential), binding));
  credential.refresh_uncertain = true;
  credential.expires_at = 1;
  await db.execute(
    sql`update kortix.browser_login_slots set credential=${codec.seal(JSON.stringify(credential), binding)} where handle_hash=${h} and slot=${slot}`,
  );
  expect((await request(`/slots/${slot}/token`)).status).toBe(503);
  const roster = await (await fetch(base, { headers: { cookie } })).json();
  expect(roster.slots[0].needs_sign_in).toBe(true);
  expect(roster.slots[0].credential).toBeUndefined();
  const { attempt } = (await (
    await request("/begin", { method: "password" })
  ).json()) as any;
  expect(
    (await request(`/attempts/${attempt}/complete`, identity)).status,
  ).toBe(200);
  const confirmed = (await (
    await request(`/attempts/${attempt}/confirm`)
  ).json()) as any;
  expect(confirmed.slot).toBe(slot);
  expect(confirmed.duplicate_candidate).toBeUndefined();
  expect((await request(`/slots/${slot}/token`)).status).toBe(200);
  const retained = await db.execute(
    sql`select session_id from kortix.browser_login_attempts where handle_hash=${h} and attempt=${attempt} and expires_at<=now()`,
  );
  expect(retained[0]!.session_id).toBe(old!.session_id);
  const { sweepBrowserLogins } = await import("./service");
  await sweepBrowserLogins();
  expect((await request(`/slots/${slot}/token`)).status).toBe(200);
  const { gotrue } = await import("../gotrue");
  expect(
    (
      await gotrue("/token", {
        body: { refresh_token: credential.refresh_token },
        query: { grant_type: "refresh_token" },
      })
    ).ok,
  ).toBe(false);
});

test("uncertain expired removal revokes only its exact session and permits signing in again", async () => {
  cookie = "";
  const init = await request("/initialize");
  cookie = init.headers.get("set-cookie")!.split(";")[0]!;
  const identity = await user("uncertain-remove");
  const slot = await add(identity);
  const { gotrue } = await import("../gotrue");
  const other = await gotrue("/token", {
    body: identity,
    query: { grant_type: "password" },
  });
  expect(other.ok).toBe(true);
  const h = hashBrowserHandle(cookie.split("=")[1]!);
  const [row] = await db.execute(
    sql`select * from kortix.browser_login_slots where handle_hash=${h} and slot=${slot}`,
  );
  const codec = browserLoginConfig(config).codec!;
  const binding = { handleHash: h, slot, userId: String(row!.user_id) };
  const credential = JSON.parse(codec.open(String(row!.credential), binding));
  credential.refresh_uncertain = true;
  credential.expires_at = 1;
  await db.execute(
    sql`update kortix.browser_login_slots set credential=${codec.seal(JSON.stringify(credential), binding)} where handle_hash=${h} and slot=${slot}`,
  );
  const removed = await request(`/slots/${slot}/remove`);
  expect(removed.status).toBe(200);
  expect(((await removed.json()) as any).revocation_pending).toBe(false);
  expect(
    (
      await gotrue("/token", {
        body: { refresh_token: credential.refresh_token },
        query: { grant_type: "refresh_token" },
      })
    ).ok,
  ).toBe(false);
  expect(
    (await gotrue("/user", { bearer: other.body.access_token as string })).ok,
  ).toBe(true);
  expect(await add(identity)).toBeString();
});
