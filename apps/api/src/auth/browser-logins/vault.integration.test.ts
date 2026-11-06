import { test, expect, afterAll } from "bun:test";
import { resolve } from "node:path";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../../shared/db";
import { browserLoginRouter } from "./routes";
import { config } from "../../config";
import {
  createBrowserCredentialCodec,
  createBrowserHandle,
  hashBrowserHandle,
} from "./credentials";
import { browserLoginConfig } from "./config";
const app = new Hono().route("/v1/auth/browser-logins", browserLoginRouter);
const server = Bun.serve({ port: 0, fetch: app.fetch });
const base = `http://localhost:${server.port}/v1/auth/browser-logins`;
let cookie = "";
const users: string[] = [];
async function request(path: string, body: unknown = {}) {
  return fetch(base + path, {
    method: "POST",
    headers: {
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
test("real HTTP: independent A/B, failed add, foreign slot, scoped removal", async () => {
  const init = await request("/initialize");
  expect(init.status).toBe(200);
  cookie = init.headers.get("set-cookie")!.split(";")[0]!;
  const a = await user("a");
  const b = await user("b");
  const slotA = await add(a);
  const { gotrue } = await import("../gotrue");
  const otherDevice = await gotrue("/token", {
    body: b,
    query: { grant_type: "password" },
  });
  expect(otherDevice.ok).toBe(true);
  const slotB = await add(b);
  const savedCookie = cookie;
  cookie = "";
  const other = await request("/initialize");
  cookie = other.headers.get("set-cookie")!.split(";")[0]!;
  expect((await request(`/slots/${slotA}/token`)).status).toBe(404);
  cookie = savedCookie;
  const privateRoster = await fetch(base, { headers: { cookie } });
  expect(privateRoster.headers.get("cache-control")).toBe("private, no-store");
  const csrf = await fetch(base + "/begin", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ method: "password" }),
  });
  expect(csrf.status).toBe(403);
  const codec = browserLoginConfig(config).codec!;
  const h = hashBrowserHandle(cookie.split("=")[1]!);
  const saved = await db.execute(
    sql`select * from kortix.browser_login_slots where handle_hash=${h} and slot=${slotA}`,
  );
  const row = saved[0]!;
  const binding = { handleHash: h, slot: slotA, userId: String(row.user_id) };
  const expired = JSON.parse(codec.open(String(row.credential), binding));
  expired.expires_at = 1;
  await db.execute(
    sql`update kortix.browser_login_slots set credential=${createBrowserCredentialCodec("old", { old: Buffer.alloc(32, 8) }).seal(JSON.stringify(expired), binding)} where handle_hash=${h} and slot=${slotA}`,
  );
  const child = Bun.spawn(
    [
      "bun",
      "--no-env-file",
      import.meta.dir + "/../../__tests__/helpers/browser-login-replica.ts",
    ],
    {
      cwd: resolve(import.meta.dir, "../../../../.."),
      env: { ...process.env, KORTIX_BROWSER_LOGINS_ENABLED: "false" },
      stdout: "pipe",
      stderr: "ignore",
    },
  );
  try {
    const reader = child.stdout.getReader();
    let text = "";
    let port = 0;
    while (!port) {
      const part = await reader.read();
      if (part.done) throw Error("Replica exited");
      text += new TextDecoder().decode(part.value);
      for (const line of text.split("\n")) {
        try {
          port = JSON.parse(line).port ?? 0;
        } catch {}
      }
    }
    const disabled = await fetch(
      `http://localhost:${port}/v1/auth/browser-logins/begin`,
      {
        method: "POST",
        headers: {
          origin: config.FRONTEND_URL,
          "x-kortix-browser-login": "1",
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ method: "password" }),
      },
    );
    expect(disabled.status).toBe(503);
    const responses = await Promise.all([
      request(`/slots/${slotA}/token`),
      fetch(
        `http://localhost:${port}/v1/auth/browser-logins/slots/${slotA}/token`,
        {
          method: "POST",
          headers: {
            origin: config.FRONTEND_URL,
            "x-kortix-browser-login": "1",
            cookie,
          },
        },
      ),
    ]);
    expect(responses.map((r) => r.status)).toEqual([200, 200]);
    const revisions = await db.execute(
      sql`select revision,credential from kortix.browser_login_slots where handle_hash=${h} and slot=${slotA}`,
    );
    expect(Number(revisions[0]?.revision)).toBe(2);
    expect(String(revisions[0]?.credential).startsWith("v1.test.")).toBe(true);
  } finally {
    child.kill();
    await child.exited;
  }
  const attempt = (await (
    await request("/begin", { method: "password" })
  ).json()) as any;
  expect(
    (
      await request(`/attempts/${attempt.attempt}/complete`, {
        ...b,
        password: "invalid",
      })
    ).status,
  ).toBe(409);
  expect((await request(`/slots/${slotA}/token`)).status).toBe(200);
  expect((await request("/slots/foreign/token")).status).toBe(404);
  expect((await request(`/slots/${slotB}/remove`)).status).toBe(200);
  expect((await request(`/slots/${slotB}/token`)).status).toBe(404);
  expect(
    (await gotrue("/user", { bearer: String(otherDevice.body.access_token) }))
      .ok,
  ).toBe(true);
  expect((await request(`/slots/${slotA}/token`)).status).toBe(200);
});
test("PostgreSQL denies client roles for all vault tables", async () => {
  const rows = await db.execute(
    sql`select has_table_privilege('anon','kortix.browser_login_slots','SELECT') as anon,has_table_privilege('authenticated','kortix.browser_login_attempts','SELECT') as authenticated`,
  );
  expect(rows[0]?.anon).toBe(false);
  expect(rows[0]?.authenticated).toBe(false);
});

test("controlled Google authorize boundary keeps PKCE server-side and requests account choice", async () => {
  const { __setGoTrueFetch } = await import("../gotrue");
  let authorize: URL | undefined;
  __setGoTrueFetch(async (input) => {
    authorize = new URL(input);
    return new Response(null, {
      status: 302,
      headers: { location: "https://accounts.example.test/authorize" },
    });
  });
  try {
    const response = await request("/begin", { method: "google" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.code_verifier).toBeUndefined();
    expect(authorize?.searchParams.get("prompt")).toBe("select_account");
    expect(authorize?.searchParams.get("code_challenge_method")).toBe("s256");
    expect(authorize?.searchParams.get("code_challenge")).toHaveLength(43);
    const redirect = new URL(authorize!.searchParams.get("redirect_to")!);
    expect(redirect.origin).toBe(config.FRONTEND_URL);
    expect(redirect.searchParams.get("attempt")).toBe(body.attempt);
    expect((await request(`/attempts/${body.attempt}/cancel`)).status).toBe(
      200,
    );
    expect(
      (
        await request(`/attempts/${body.attempt}/complete`, {
          code: "synthetic",
        })
      ).status,
    ).toBe(409);
  } finally {
    __setGoTrueFetch(null);
  }
});

test("PostgreSQL enforces all client-role denials, with RLS enabled", async () => {
  for (const role of ["anon", "authenticated"])
    for (const table of [
      "browser_login_handles",
      "browser_login_slots",
      "browser_login_attempts",
    ]) {
      let code: string | undefined;
      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql.raw(`set local role ${role}`));
          await tx.execute(sql.raw(`select * from kortix.${table} limit 1`));
        });
      } catch (error) {
        code =
          (error as { code?: string; cause?: { code?: string } }).cause?.code ??
          (error as { code?: string }).code;
      }
      expect(code).toBe("42501");
    }
  const rls = await db.execute(
    sql`select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kortix' and c.relname in ('browser_login_handles','browser_login_slots','browser_login_attempts')`,
  );
  expect(rls.length).toBe(3);
  expect(rls.every((row) => row.relrowsecurity)).toBe(true);
});

test("real email OTP candidate requires explicit confirmation", async () => {
  const identity = await user("otp");
  const begin = await request("/begin", { method: "email" });
  expect(begin.status).toBe(200);
  const { attempt } = (await begin.json()) as any;
  const generated = await fetch(
    config.SUPABASE_URL + "/auth/v1/admin/generate_link",
    {
      method: "POST",
      headers: {
        apikey: config.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ type: "magiclink", email: identity.email }),
    },
  );
  expect(generated.status).toBe(200);
  const code = (await generated.json()) as any;
  const complete = await request(`/attempts/${attempt}/complete`, {
    email: identity.email,
    token: code.email_otp,
  });
  expect(complete.status).toBe(200);
  const before = await fetch(base, { headers: { cookie } });
  const roster = (await before.json()) as any;
  expect(roster.slots.some((s: any) => s.email === identity.email)).toBe(false);
  const confirm = await request(`/attempts/${attempt}/confirm`);
  expect(confirm.status).toBe(200);
  const { slot } = (await confirm.json()) as any;
  expect((await request(`/slots/${slot}/token`)).status).toBe(200);
  expect((await request(`/attempts/${attempt}/confirm`)).status).toBe(409);
});

test("refresh ownership commits before upstream; ambiguous failure is never retried", async () => {
  const identity = await user("refresh-failure");
  const slot = await add(identity);
  const h = hashBrowserHandle(cookie.split("=")[1]!);
  const codec = browserLoginConfig(config).codec!;
  const rows = await db.execute(
    sql`select * from kortix.browser_login_slots where handle_hash=${h} and slot=${slot}`,
  );
  const row = rows[0]!;
  const binding = { handleHash: h, slot, userId: String(row.user_id) };
  const session = JSON.parse(codec.open(String(row.credential), binding));
  session.expires_at = 1;
  await db.execute(
    sql`update kortix.browser_login_slots set credential=${codec.seal(JSON.stringify(session), binding)} where handle_hash=${h} and slot=${slot}`,
  );
  const { __setGoTrueFetch } = await import("../gotrue");
  let calls = 0;
  __setGoTrueFetch(async () => {
    calls++;
    const committed = await db.execute(
      sql`select credential from kortix.browser_login_slots where handle_hash=${h} and slot=${slot}`,
    );
    expect(
      typeof JSON.parse(codec.open(String(committed[0]!.credential), binding))
        .refresh_owner,
    ).toBe("string");
    return Response.json({ error: "synthetic_failure" }, { status: 502 });
  });
  try {
    expect((await request(`/slots/${slot}/token`)).status).toBe(503);
    expect((await request(`/slots/${slot}/token`)).status).toBe(503);
    expect(calls).toBe(1);
  } finally {
    __setGoTrueFetch(null);
  }
});
