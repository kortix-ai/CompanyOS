import { afterAll, expect, test, spyOn } from "bun:test";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../../shared/db";
import { config } from "../../config";
import { browserLoginRouter, registerBrowserLoginRoutes } from "./routes";
import { createPublicEdgeRateLimitMiddleware } from "../../middleware/public-edge-rate-limit";
import { browserHandleCookieName } from "./ingress";
import { hashBrowserHandle } from "./credentials";
registerBrowserLoginRoutes();
const server = Bun.serve({
  port: 0,
  fetch: new Hono()
    .use(
      "*",
      createPublicEdgeRateLimitMiddleware({
        browserLoginCookieName: browserHandleCookieName(config.FRONTEND_URL),
      }),
    )
    .route("/v1/auth/browser-logins", browserLoginRouter).fetch,
});
const base = `http://localhost:${server.port}/v1/auth/browser-logins`;
const cookies: string[] = [];
const headers = (cookie = "") => ({
  "X-Forwarded-For": "192.0.2.55",
  cookie,
  origin: config.FRONTEND_URL,
  "content-type": "application/json",
  "x-kortix-browser-login": "1",
});
async function post(path: string, cookie = "") {
  return fetch(base + path, {
    method: "POST",
    headers: headers(cookie),
    body: "{}",
  });
}
async function initialize() {
  const response = await post("/initialize");
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  cookies.push(cookie);
  return cookie;
}
afterAll(async () => {
  server.stop(true);
  for (const cookie of cookies)
    await db.execute(
      sql`delete from kortix.browser_login_handles where handle_hash=${hashBrowserHandle(cookie.split("=")[1]!)}`,
    );
});
test("HTTPS remove-all clears its host cookie and returns a successful receipt", async () => {
  expect(config.FRONTEND_URL.startsWith("https:")).toBe(true);
  const cookie = await initialize();
  expect(cookie.startsWith("__Host-")).toBe(true);
  const response = await post("/remove-all", cookie);
  expect(response.status).toBe(200);
  expect((await response.json()).removed).toBe(true);
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
});
test("token rate budgets isolate handles behind the same web egress", async () => {
  const a = await initialize(),
    b = await initialize();
  const clock = spyOn(Date, "now").mockReturnValue(Date.now());
  try {
    for (let i = 0; i < 60; i++)
      expect((await post("/slots/missing/token", a)).status).toBe(404);
    expect((await post("/slots/missing/token", a)).status).toBe(429);
    expect((await post("/slots/missing/token", b)).status).toBe(404);
  } finally {
    clock.mockRestore();
  }
});
test("expired handle returns authoritative 401; capability discovery reports handle presence", async () => {
  const cookie = await initialize();
  expect((await (await fetch(base + "/capabilities")).json()).has_handle).toBe(
    false,
  );
  expect(
    (
      await (
        await fetch(base + "/capabilities", { headers: { cookie } })
      ).json()
    ).has_handle,
  ).toBe(true);
  await db.execute(
    sql`update kortix.browser_login_handles set idle_expires_at=now()-interval '1 second' where handle_hash=${hashBrowserHandle(cookie.split("=")[1]!)}`,
  );
  expect((await fetch(base, { headers: { cookie } })).status).toBe(401);
});
