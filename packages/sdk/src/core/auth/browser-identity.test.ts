import { test, expect } from "bun:test";
import { createBrowserIdentity } from "../../index";
test("slot switch discards pending token and preserves one identity snapshot", async () => {
  let finish!: (value: Response) => void;
  const identity = createBrowserIdentity({
    fetch: async () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  identity.select("a");
  const pending = identity.getToken();
  identity.select("b");
  finish(
    Response.json({
      access_token: "a-token",
      expires_at: 9999999999,
      user_id: "a-user",
    }),
  );
  expect(await pending).toBeNull();
  expect(await identity.getUserId()).toBeNull();
});
test("broker is credentialed, no-store, same-origin and tokens remain memory-only", async () => {
  const calls: RequestInit[] = [];
  const identity = createBrowserIdentity({
    fetch: async (url, init) => {
      expect(String(url)).toBe("/v1/auth/browser-logins/slots/a/token");
      calls.push(init!);
      return Response.json({
        access_token: "token",
        expires_at: 9999999999,
        user_id: "user",
      });
    },
  });
  identity.select("a");
  expect(await identity.getToken()).toBe("token");
  expect(await identity.getUserId()).toBe("user");
  expect(await identity.getToken()).toBe("token");
  expect(calls.length).toBe(1);
  expect(calls[0]?.credentials).toBe("same-origin");
  expect(calls[0]?.cache).toBe("no-store");
  identity.invalidateRoster();
  expect(await identity.getUserId()).toBeNull();
});

test("public broker preserves 429 and sends typed cookie requests without a bearer", async () => {
  const { browserLogins, HeadlessAuthError } = await import("../../index");
  let calls = 0;
  const fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).get("authorization")).toBeNull();
    expect(new Headers(init?.headers).get("x-kortix-browser-login")).toBe("1");
    return calls === 1
      ? Response.json({ attempt: "attempt" })
      : Response.json({ error: "browser_login_limit" }, { status: 429 });
  };
  expect(await browserLogins.begin({ method: "google" }, { fetch })).toEqual({
    attempt: "attempt",
  });
  try {
    await browserLogins.initialize({ fetch });
    throw Error("expected rejection");
  } catch (error) {
    expect(error).toBeInstanceOf(HeadlessAuthError);
    expect((error as InstanceType<typeof HeadlessAuthError>).status).toBe(429);
  }
});

test("typed broker MFA verify returns only verification receipt", async () => {
  const { browserLogins } = await import("../../index");
  const result = await browserLogins.verifyMfa(
    { kind: "attempt", id: "candidate" },
    { factor_id: "factor", challenge_id: "challenge", code: "123456" },
    {
      fetch: async (url, init) => {
        expect(String(url)).toBe(
          "/v1/auth/browser-logins/attempts/candidate/mfa/verify",
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          factor_id: "factor",
          challenge_id: "challenge",
          code: "123456",
        });
        return Response.json({ verified: true });
      },
    },
  );
  expect(result).toEqual({ verified: true });
});

test("broker lists factor identifiers without requiring a browser access token", async () => {
  const { browserLogins } = await import("../../index");
  expect(
    await browserLogins.mfaFactors(
      { kind: "slot", id: "saved" },
      {
        fetch: async (url) => {
          expect(String(url)).toBe(
            "/v1/auth/browser-logins/slots/saved/mfa/factors",
          );
          return Response.json({
            factors: [
              { id: "factor", factor_type: "totp", status: "verified" },
            ],
          });
        },
      },
    ),
  ).toEqual({
    factors: [{ id: "factor", factor_type: "totp", status: "verified" }],
  });
});

test("broker capabilities use no-store cookie discovery without bearer", async () => {
  const { browserLogins } = await import("../../index");
  expect(await browserLogins.capabilities({ fetch: async (url, init) => {
    expect(String(url)).toBe("/v1/auth/browser-logins/capabilities");
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    return Response.json({ enabled: false });
  } })).toEqual({ enabled: false });
});
