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
test("concurrent confirmations enforce five identities and removal wins against refresh", async () => {
  fixtureProxyChain = "192.0.2.2, 192.0.2.254";
  const previous = cookie;
  cookie = "";
  const initialized = await request("/initialize");
  cookie = initialized.headers.get("set-cookie")!.split(";")[0]!;
  try {
    const attempts: string[] = [];
    for (let i = 0; i < 6; i++) {
      const identity = await user("cap-" + i);
      const { attempt } = (await (
        await request("/begin", { method: "password" })
      ).json()) as any;
      expect(
        (await request(`/attempts/${attempt}/complete`, identity)).status,
      ).toBe(200);
      attempts.push(attempt);
    }
    const confirmations = await Promise.all(
      attempts.map((a) => request(`/attempts/${a}/confirm`)),
    );
    expect(confirmations.filter((r) => r.status === 200).length).toBe(5);
    expect(confirmations.filter((r) => r.status === 429).length).toBe(1);
    const confirmed = confirmations.find((r) => r.status === 200)!;
    const { slot } = (await confirmed.json()) as any;
    const hRace = hashBrowserHandle(cookie.split("=")[1]!);
    const [raceRow] = await db.execute(
      sql`select * from kortix.browser_login_slots where handle_hash=${hRace} and slot=${slot}`,
    );
    const raceBinding = {
      handleHash: hRace,
      slot,
      userId: String(raceRow!.user_id),
    };
    const raceCodec = browserLoginConfig(config).codec!;
    const raceSession = JSON.parse(
      raceCodec.open(String(raceRow!.credential), raceBinding),
    );
    raceSession.expires_at = 1;
    await db.execute(
      sql`update kortix.browser_login_slots set credential=${raceCodec.seal(JSON.stringify(raceSession), raceBinding)} where handle_hash=${hRace} and slot=${slot}`,
    );
    const results = await Promise.all([
      request(`/slots/${slot}/token`),
      request(`/slots/${slot}/remove`),
    ]);
    expect([200, 404]).toContain(results[0]!.status);
    expect(results[1]!.status).toBe(200);
    expect((await request(`/slots/${slot}/token`)).status).toBe(404);
    const h = hashBrowserHandle(cookie.split("=")[1]!);
    await db.execute(
      sql`update kortix.browser_login_handles set idle_expires_at=now()-interval '1 minute' where handle_hash=${h}`,
    );
    expect((await request("/begin", { method: "password" })).status).toBe(401);
    expect((await request("/initialize")).status).toBe(200);
  } finally {
    cookie = previous;
  }
});

