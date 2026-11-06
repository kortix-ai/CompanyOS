import { Hono } from "hono";
import { timeout } from "hono/timeout";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { TokenBucketRateLimiter } from "../../shared/rate-limit";
import { requestClientKey } from "../../middleware/client-ip";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createHash } from "node:crypto";
import { config } from "../../config";
import { headlessAuthRouter } from "../headless";
import { gotrue, gotrueAuthorizeUrl } from "../gotrue";
import { browserHandleCookieName, browserLoginWriteAllowed } from "./ingress";
import { createBrowserHandle, hashBrowserHandle } from "./credentials";
import { VaultError } from "./store";
import {
  vault,
  settings,
  removeBrowserLogin,
  checkEmailAttempt,
  cancelAllCandidates,
} from "./service";

export const browserLoginRouter = new Hono();
browserLoginRouter.onError((error, c) =>
  error instanceof VaultError
    ? c.json({ error: error.code }, error.status)
    : c.json({ error: "browser_login_unavailable" }, 503),
);
const limiter = new TokenBucketRateLimiter("browser-logins");
const cookie = browserHandleCookieName(config.FRONTEND_URL);
browserLoginRouter.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  if (
    c.req.method !== "GET" &&
    !browserLoginWriteAllowed(c.req.raw, config.FRONTEND_URL)
  )
    return c.json({ error: "browser_login_forbidden" }, 403);
  if (
    c.req.method === "POST" &&
    !limiter.check(requestClientKey(c), { limit: 60, windowMs: 60_000 }).allowed
  )
    return c.json({ error: "browser_login_limit" }, 429);
  if (Number(c.req.header("content-length") ?? 0) > 16384)
    return c.json({ error: "invalid_request" }, 400);
  if (!vault) return c.json({ error: "browser_login_unavailable" }, 503);
  try {
    await next();
  } catch (error) {
    if (error instanceof VaultError)
      return c.json({ error: error.code }, error.status);
    return c.json({ error: "browser_login_unavailable" }, 503);
  }
});
browserLoginRouter.use('*',bodyLimit({maxSize:16384,onError:c=>c.json({error:'invalid_request'},400)}));
browserLoginRouter.use('*',timeout(25_000,()=>new HTTPException(503,{message:'browser_login_unavailable'})));
function handle(c: Parameters<typeof getCookie>[0]) {
  const raw = getCookie(c, cookie);
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
    throw new VaultError(401, "browser_login_required");
  return hashBrowserHandle(raw);
}
const enabled = () => {
  if (!settings.enabled) throw new VaultError(503, "browser_logins_disabled");
};
browserLoginRouter.post("/initialize", async (c) => {
  enabled();
  if (getCookie(c, cookie)) {
    await vault!.roster(handle(c));
    return c.json({ ok: true });
  }
  const raw = createBrowserHandle();
  await vault!.init(hashBrowserHandle(raw));
  setCookie(c, cookie, raw, {
    httpOnly: true,
    secure: new URL(config.FRONTEND_URL).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 90 * 86400,
  });
  return c.json({ ok: true });
});
browserLoginRouter.get("/", async (c) =>
  c.json({ slots: await vault!.roster(handle(c)) }),
);
browserLoginRouter.post("/begin", async (c) => {
  enabled();
  const h = handle(c);
  const body = await c.req.json();
  if (!["password", "email", "google"].includes(body.method))
    return c.json({ error: "invalid_request" }, 400);
  const { attempt, verifier } = await vault!.begin(h, body.method);
  if (body.method === "google") {
    const redirect = new URL(
      "/auth/browser-logins/callback",
      config.FRONTEND_URL,
    );
    redirect.searchParams.set("attempt", attempt);
    const result = await gotrueAuthorizeUrl({
      provider: "google",
      redirect_to: redirect.toString(),
      prompt: "select_account",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "s256",
    });
    if (!result.ok) throw new VaultError(503, "browser_login_unavailable");
    return c.json({ attempt, url: result.body.url });
  }
  return c.json({ attempt });
});
browserLoginRouter.post("/attempts/:attempt/email", async (c) => {
  enabled();
  const h = handle(c);
  const body = await c.req.json();
  await checkEmailAttempt(h, c.req.param("attempt"));
  const response = await headlessAuthRouter.request("/sign-in/magic-link", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: body.email, create_user: false }),
  });
  if (!response.ok)
    return c.json({ error: "browser_login_authentication_failed" }, 400);
  return c.json({ ok: true });
});
browserLoginRouter.post("/attempts/:attempt/complete", async (c) => {
  enabled();
  const body = await c.req.json();
  const result = await vault!.complete(
    handle(c),
    c.req.param("attempt"),
    async (method, verifier) => {
      if (method === "google") {
        if (typeof body.code !== "string" || body.code.length > 4096)
          throw new VaultError(409, "browser_login_attempt_unavailable");
        const result = await gotrue("/token", {
          body: { auth_code: body.code, code_verifier: verifier },
          query: { grant_type: "pkce" },
        });
        if (!result.ok)
          throw new VaultError(409, "browser_login_authentication_failed");
        return result.body;
      }
      const path = method === "password" ? "/sign-in/password" : "/verify-otp";
      const payload =
        method === "password"
          ? { email: body.email, password: body.password }
          : { email: body.email, token: body.token, type: "email" };
      const response = await headlessAuthRouter.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok)
        throw new VaultError(409, "browser_login_authentication_failed");
      const data = (await response.json()) as {
        session: Record<string, unknown>;
        user: unknown;
      };
      return { ...data.session, user: data.user };
    },
  );
  return c.json(result);
});
browserLoginRouter.post("/attempts/:attempt/confirm", async (c) => {
  enabled();
  return c.json(await vault!.confirm(handle(c), c.req.param("attempt")));
});
browserLoginRouter.post("/slots/:slot/token", async (c) =>
  c.json(await vault!.token(handle(c), c.req.param("slot"))),
);
browserLoginRouter.post("/slots/:slot/resolve", async (c) =>
  c.json(await vault!.token(handle(c), c.req.param("slot"))),
);

browserLoginRouter.post("/attempts/:attempt/cancel", async (c) =>
  c.json(
    await removeBrowserLogin(handle(c), undefined, c.req.param("attempt")),
  ),
);
browserLoginRouter.post("/slots/:slot/remove", async (c) =>
  c.json(await removeBrowserLogin(handle(c), c.req.param("slot"))),
);
browserLoginRouter.post("/remove-all", async (c) => {
  const h = handle(c);
  await cancelAllCandidates(h);
  const result = await removeBrowserLogin(h);
  deleteCookie(c, cookie, { path: "/" });
  return c.json(result);
});
