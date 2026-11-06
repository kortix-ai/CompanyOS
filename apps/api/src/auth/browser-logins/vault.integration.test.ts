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
  const { __setGoTrueFetch, gotrue } = await import("../gotrue");
  const login = await gotrue("/token", {
    body: await user("pkce"),
    query: { grant_type: "password" },
  });
  expect(login.ok).toBe(true);
  let authorize: URL | undefined;
  let exchanges = 0;
  __setGoTrueFetch(async (input, init) => {
    if (input.includes("/token")) {
      exchanges++;
      const body = JSON.parse(String(init.body));
      const { createHash } = await import("node:crypto");
      expect(
        createHash("sha256").update(body.code_verifier).digest("base64url"),
      ).toBe(authorize!.searchParams.get("code_challenge")!);
      return Response.json(login.body);
    }
    if (input.includes("/user")) return fetch(input, init);
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
    expect(
      (
        await request(`/attempts/${body.attempt}/complete`, {
          code: "controlled-code",
          code_verifier: "attacker-override",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/attempts/${body.attempt}/complete`, {
          code: "controlled-code",
        })
      ).status,
    ).toBe(409);
    expect(exchanges).toBe(1);
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

test("malformed JSON is invalid input and initialization replaces stale cookies", async () => {
  const response = await fetch(base + "/begin", {
    method: "POST",
    headers: {
      origin: config.FRONTEND_URL,
      "x-kortix-browser-login": "1",
      "content-type": "application/json",
      cookie,
    },
    body: "{",
  });
  expect(response.status).toBe(400);
  const previous = cookie;
  for (const value of ["malformed", createBrowserHandle()]) {
    cookie = previous.split("=")[0] + "=" + value;
    const recovered = await request("/initialize");
    expect(recovered.status).toBe(200);
    expect(recovered.headers.get("set-cookie")).toContain("HttpOnly");
  }
  cookie = previous;
});

test("failed revocation persists backoff and does not starve another expired attempt", async () => {
  const h = hashBrowserHandle(cookie.split("=")[1]!);
  const { sweepBrowserLogins } = await import("./service");
  const rows = await db.execute(
    sql`select attempt from kortix.browser_login_attempts where handle_hash=${h}`,
  );
  for (const row of rows) await request(`/attempts/${row.attempt}/cancel`);
  const begin = await request("/begin", { method: "password" });
  const { attempt } = (await begin.json()) as any;
  const identity = await user("retry");
  expect(
    (await request(`/attempts/${attempt}/complete`, identity)).status,
  ).toBe(200);
  await db.execute(
    sql`update kortix.browser_login_attempts set expires_at=now()-interval '1 minute' where handle_hash=${h} and attempt=${attempt}`,
  );
  const { __setGoTrueFetch } = await import("../gotrue");
  __setGoTrueFetch(async () =>
    Response.json({ error: "synthetic" }, { status: 502 }),
  );
  try {
    await sweepBrowserLogins();
    const retained = await db.execute(
      sql`select revoke_attempts,revoke_after>now() as delayed,candidate from kortix.browser_login_attempts where handle_hash=${h} and attempt=${attempt}`,
    );
    expect(retained[0]?.delayed).toBe(true);
    expect(Number(retained[0]?.revoke_attempts)).toBe(1);
    expect(typeof retained[0]?.candidate).toBe("string");
    const restarted = Bun.spawn(
      [
        "bun",
        "--no-env-file",
        import.meta.dir + "/../../__tests__/helpers/browser-login-replica.ts",
      ],
      {
        cwd: resolve(import.meta.dir, "../../../../.."),
        env: { ...process.env, BROWSER_LOGIN_SWEEP_ONCE: "1" },
        stdout: "ignore",
        stderr: "ignore",
      },
    );
    expect(await restarted.exited).toBe(0);
    const afterRestart = await db.execute(
      sql`select revoke_attempts from kortix.browser_login_attempts where handle_hash=${h} and attempt=${attempt}`,
    );
    expect(Number(afterRestart[0]?.revoke_attempts)).toBe(1);

    const later = await request("/begin", { method: "password" });
    const next = (await later.json()) as any;
    await db.execute(
      sql`update kortix.browser_login_attempts set expires_at=now()-interval '1 minute' where handle_hash=${h} and attempt=${next.attempt}`,
    );
    await sweepBrowserLogins();
    const remaining = await db.execute(
      sql`select attempt from kortix.browser_login_attempts where handle_hash=${h} and attempt=${next.attempt}`,
    );
    expect(remaining.length).toBe(0);
  } finally {
    __setGoTrueFetch(null);
  }
});

test("public SDK broker and identity adapter use real cookie HTTP boundaries", async () => {
  const { browserLogins, createBrowserIdentity } =
    await import("../../../../../packages/sdk/src/index");
  const fetchWithCookie = (input: RequestInfo | URL, init?: RequestInit) =>
    fetch(base + String(input).replace("/v1/auth/browser-logins", ""), {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init?.headers)),
        origin: config.FRONTEND_URL,
        cookie,
      },
    });
  const identity = await user("sdk");
  const options = { fetch: fetchWithCookie };
  const { attempt } = await browserLogins.begin(
    { method: "password" },
    options,
  );
  const candidate = await browserLogins.complete(attempt, identity, options);
  const { slot } = await browserLogins.confirm(attempt, options);
  const adapter = createBrowserIdentity(options);
  adapter.select(slot);
  expect(typeof (await adapter.getToken())).toBe("string");
  expect(await adapter.getUserId()).toBe(candidate.user.id);
  expect(
    (await browserLogins.roster(options)).slots.some((s) => s.slot === slot),
  ).toBe(true);
  expect((await browserLogins.remove(slot, options)).removed).toBe(true);
  adapter.invalidateRoster();
  expect(await adapter.getUserId()).toBeNull();
  await expect(adapter.getToken()).rejects.toMatchObject({ status: 404 });
});


test("candidate MFA challenge is browser-bound and verification never exposes credentials", async () => {
  const identity = await user("mfa");
  const { attempt } = (await (
    await request("/begin", { method: "password" })
  ).json()) as any;
  expect(
    (await request(`/attempts/${attempt}/complete`, identity)).status,
  ).toBe(200);
  const { __setGoTrueFetch } = await import("../gotrue");
  __setGoTrueFetch(async (input) => {
    expect(String(input)).toContain("/factors/synthetic-factor/challenge");
    return Response.json({ id: "synthetic-challenge", expires_at: 9999999999 });
  });
  try {
    const challenge = await request(`/attempts/${attempt}/mfa/challenge`, {
      factor_id: "synthetic-factor",
    });
    expect(challenge.status).toBe(200);
    expect(await challenge.json()).toEqual({
      id: "synthetic-challenge",
      expires_at: 9999999999,
    });
  } finally {
    __setGoTrueFetch(null);
  }
});

test("enforced SSO cannot be bypassed by controlled Google completion", async () => {
  fixtureProxyChain = "192.0.2.3, 192.0.2.254";
  const identity = await user("sso");
  const { gotrue, __setGoTrueFetch } = await import("../gotrue");
  const session = await gotrue("/token", {
    body: identity,
    query: { grant_type: "password" },
  });
  expect(session.ok).toBe(true);
  const account = crypto.randomUUID();
  await db.execute(
    sql`insert into kortix.accounts(account_id,name) values(${account}::uuid,'Synthetic broker policy')`,
  );
  try {
    await db.execute(
      sql`insert into kortix.account_sso_providers(account_id,supabase_sso_provider_id,name,primary_domain,enforce_sso,domain_verified_at) values(${account}::uuid,${crypto.randomUUID()}::uuid,'Synthetic SSO','example.test',true,now())`,
    );
    const denied = await request("/begin", { method: "password" });
    const passwordAttempt = (await denied.json()) as any;
    expect(
      (await request(`/attempts/${passwordAttempt.attempt}/complete`, identity))
        .status,
    ).toBe(409);
    __setGoTrueFetch(async (input, init) =>
      String(input).includes("/authorize")
        ? new Response(null, {
            status: 302,
            headers: { location: "https://accounts.example.test/authorize" },
          })
        : String(input).includes("/token")
          ? Response.json(session.body)
          : fetch(input, init),
    );
    const { attempt } = (await (
      await request("/begin", { method: "google" })
    ).json()) as any;
    expect(
      (
        await request(`/attempts/${attempt}/complete`, {
          code: "synthetic-code",
        })
      ).status,
    ).toBe(403);
  } finally {
    __setGoTrueFetch(null);
    await db.execute(
      sql`delete from kortix.accounts where account_id=${account}::uuid`,
    );
  }
});

test("SIGKILL at refresh boundary leaves durable owner and restart never reuses token", async () => {
  fixtureProxyChain = "192.0.2.4, 192.0.2.254";
  const slot = await add(await user("kill"));
  const h = hashBrowserHandle(cookie.split("=")[1]!);
  const codec = browserLoginConfig(config).codec!;
  const [row] = await db.execute(
    sql`select * from kortix.browser_login_slots where handle_hash=${h} and slot=${slot}`,
  );
  const binding = { handleHash: h, slot, userId: String(row!.user_id) };
  const session = JSON.parse(codec.open(String(row!.credential), binding));
  session.expires_at = 1;
  await db.execute(
    sql`update kortix.browser_login_slots set credential=${codec.seal(JSON.stringify(session), binding)} where handle_hash=${h} and slot=${slot}`,
  );
  const child = Bun.spawn(
    [
      "bun",
      "--no-env-file",
      import.meta.dir + "/../../__tests__/helpers/browser-login-replica.ts",
    ],
    {
      cwd: resolve(import.meta.dir, "../../../../.."),
      env: { ...process.env, BROWSER_LOGIN_KILL_DRILL: "1" },
      stdout: "pipe",
      stderr: "ignore",
    },
  );
  const reader = child.stdout.getReader();
  let buffer = "";
  async function line() {
    while (!buffer.includes("\n")) {
      const next = await reader.read();
      if (next.done) throw Error("Replica exited");
      buffer += new TextDecoder().decode(next.value);
    }
    const i = buffer.indexOf("\n");
    const raw = buffer.slice(0, i);
    buffer = buffer.slice(i + 1);
    try {
      return JSON.parse(raw);
    } catch {
      return line();
    }
  }
  try {
    const { port } = await line();
    const pending = fetch(
      `http://localhost:${port}/v1/auth/browser-logins/slots/${slot}/token`,
      {
        method: "POST",
        headers: {
          origin: config.FRONTEND_URL,
          "x-kortix-browser-login": "1",
          cookie,
        },
      },
    ).catch(() => null);
    expect((await line()).refreshEntered).toBe(true);
    child.kill("SIGKILL");
    await child.exited;
    await pending;
    const { __setGoTrueFetch } = await import("../gotrue");
    let calls = 0;
    __setGoTrueFetch(async () => {
      calls++;
      return Response.json({}, { status: 502 });
    });
    try {
      expect((await request(`/slots/${slot}/token`)).status).toBe(503);
      expect(calls).toBe(0);
    } finally {
      __setGoTrueFetch(null);
    }
  } finally {
    child.kill();
    await child.exited;
  }
});

test("real TOTP broker upgrades candidate before AAL2-required confirmation", async () => {
  fixtureProxyChain = "192.0.2.5, 192.0.2.254";
  const identity = await user("totp");
  const { attempt } = (await (
    await request("/begin", { method: "password" })
  ).json()) as any;
  const completed = (await (
    await request(`/attempts/${attempt}/complete`, identity)
  ).json()) as any;
  const uid = completed.user.id;
  const account = crypto.randomUUID();
  await db.execute(
    sql`insert into kortix.accounts(account_id,name,mfa_required) values(${account}::uuid,'Synthetic MFA',true)`,
  );
  await db.execute(
    sql`insert into kortix.account_memberships(user_id,account_id) values(${uid}::uuid,${account}::uuid)`,
  );
  try {
    expect((await request(`/attempts/${attempt}/confirm`)).status).toBe(403);
    const h = hashBrowserHandle(cookie.split("=")[1]!);
    const [row] = await db.execute(
      sql`select candidate from kortix.browser_login_attempts where handle_hash=${h} and attempt=${attempt}`,
    );
    const session = JSON.parse(
      browserLoginConfig(config).codec!.open(String(row!.candidate), {
        handleHash: h,
        slot: attempt,
        userId: uid,
      }),
    );
    const { gotrue } = await import("../gotrue");
    const enrolled = await gotrue("/factors", {
      method: "POST",
      bearer: session.access_token,
      body: { factor_type: "totp", friendly_name: "Synthetic test factor" },
    });
    expect(enrolled.ok).toBe(true);
    const factor = enrolled.body as any;
    const factors = await request(`/attempts/${attempt}/mfa/factors`);
    expect(factors.status).toBe(200);
    expect((await factors.json() as any).factors.some((f:any)=>f.id===factor.id)).toBe(true);

    const challenge = await request(`/attempts/${attempt}/mfa/challenge`, {
      factor_id: factor.id,
    });
    expect(challenge.status).toBe(200);
    const { id } = (await challenge.json()) as any;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const char of factor.totp.secret.replace(/=+$/, ""))
      bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
    const key = Buffer.from(
      bits.match(/.{8}/g)!.map((b: string) => parseInt(b, 2)),
    );
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
    const { createHmac } = await import("node:crypto");
    const digest = createHmac("sha1", key).update(counter).digest();
    const offset = digest[19]! & 15;
    const code = String(
      (digest.readUInt32BE(offset) & 0x7fffffff) % 1000000,
    ).padStart(6, "0");
    const verified = await request(`/attempts/${attempt}/mfa/verify`, {
      factor_id: factor.id,
      challenge_id: id,
      code,
    });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ verified: true });
    expect((await request(`/attempts/${attempt}/confirm`)).status).toBe(200);
  } finally {
    await db.execute(
      sql`delete from kortix.accounts where account_id=${account}::uuid`,
    );
  }
});
