import { captureProductEvent } from "../../shared/product-analytics";
import { z, OpenAPIHono } from "@hono/zod-openapi";
import { logger } from "../../lib/logger";
import { recordAuditEvent } from "../../shared/audit";
import { timeout } from "hono/timeout";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { TokenBucketRateLimiter } from "../../shared/rate-limit";
import { requestClientKey } from "../../middleware/client-ip";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { createHash } from "node:crypto";
import { config } from "../../config";
import { browserPassword, browserEmail, browserOtp } from "../headless";
import { gotrue, gotrueAuthorizeUrl } from "../gotrue";
import { browserHandleCookieName, browserLoginWriteAllowed } from "./ingress";
import { createBrowserHandle, hashBrowserHandle } from "./credentials";
import {
  rememberBrowserBudgetHandle,
  forgetBrowserBudgetHandle,
} from "./budget";
import { VaultError } from "./store";
import {
  vault,
  settings,
  removeBrowserLogin,
  checkEmailAttempt,
  cancelAllCandidates,
} from "./service";

export const browserLoginRouter = new OpenAPIHono();
const limiter = new TokenBucketRateLimiter("browser-logins");
const cookie = browserHandleCookieName(config.FRONTEND_URL);
function registerIngress() {
  browserLoginRouter.onError((error, c) =>
    error instanceof SyntaxError || error instanceof z.ZodError
      ? c.json({ error: "invalid_request" }, 400)
      : error instanceof VaultError
        ? c.json({ error: error.code }, error.status)
        : c.json({ error: "browser_login_unavailable" }, 503),
  );
  browserLoginRouter.use("*", async (c, next) => {
    await next();
    const operation = c.req.routePath.replace(/:[A-Za-z]+/g, "id");
    if (c.req.path.endsWith("/capabilities")) return;
    const raw = getCookie(c, cookie);
    if (
      c.res.status < 400 &&
      raw &&
      /^[A-Za-z0-9_-]{43}$/.test(raw) &&
      /\/(?:token|resolve|complete)$/.test(c.req.path)
    )
      rememberBrowserBudgetHandle(hashBrowserHandle(raw));
    void recordAuditEvent({
      action: "auth.browser_login.operation",
      resourceType: "browser_login",
      actorType: "anonymous",
      httpStatus: c.res.status,
      outcome: c.res.status < 400 ? "success" : "failure",
      metadata: { operation, method: c.req.method },
    }).catch(() => logger.warn("[browser-logins] audit unavailable"));
  });

  browserLoginRouter.use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    if (
      c.req.method !== "GET" &&
      !browserLoginWriteAllowed(c.req.raw, config.FRONTEND_URL)
    )
      return c.json({ error: "browser_login_forbidden" }, 403);
    if (
      c.req.method === "POST" &&
      !limiter.check(
        /\/slots\/[^/]+\/(?:token|resolve)$/.test(c.req.path)
          ? `handle:${handle(c)}`
          : requestClientKey(c),
        { limit: 60, windowMs: 60_000 },
      ).allowed
    )
      return c.json({ error: "browser_login_limit" }, 429, {
        "Retry-After": "60",
      });
    if (Number(c.req.header("content-length") ?? 0) > 16384)
      return c.json({ error: "invalid_request" }, 400);
    if (c.req.method === "GET" && c.req.path.endsWith("/capabilities"))
      return c.json({
        enabled: Boolean(vault && settings.enabled),
        has_handle: Boolean(getCookie(c, cookie)),
      });
    if (!vault) return c.json({ error: "browser_login_unavailable" }, 503);
    try {
      await next();
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError)
        return c.json({ error: "invalid_request" }, 400);
      if (error instanceof VaultError)
        return c.json({ error: error.code }, error.status);
      return c.json({ error: "browser_login_unavailable" }, 503);
    }
  });
  browserLoginRouter.use(
    "*",
    bodyLimit({
      maxSize: 16384,
      onError: (c) => c.json({ error: "invalid_request" }, 400),
    }),
  );
  browserLoginRouter.use(
    "*",
    timeout(
      25_000,
      () => new HTTPException(503, { message: "browser_login_unavailable" }),
    ),
  );
}
function handle(c: Parameters<typeof getCookie>[0]) {
  const raw = getCookie(c, cookie);
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
    throw new VaultError(401, "browser_login_required");
  return hashBrowserHandle(raw);
}
const enabled = () => {
  if (!settings.enabled) throw new VaultError(503, "browser_logins_disabled");
};
function registerFlowRoutes() {
  browserLoginRouter.post("/initialize", async (c) => {
    enabled();
    if (getCookie(c, cookie)) {
      try {
        await vault!.roster(handle(c));
        return c.json({ ok: true });
      } catch (error) {
        if (!(error instanceof VaultError) || error.status !== 401) throw error;
      }
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
    const body = z
      .object({ method: z.enum(["password", "email", "google"]) })
      .parse(await c.req.json());
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
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
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
    const body = z
      .object({ email: z.string().email().max(320) })
      .parse(await c.req.json());
    await checkEmailAttempt(h, c.req.param("attempt"));
    const response = await browserEmail(
      c,
      { email: body.email, create_user: false },
      true,
    );
    if (!response.ok) {
      if (response.status === 429) {
        const retry = response.headers.get("retry-after");
        if (retry && /^\d+$/.test(retry)) c.header("Retry-After", retry);
        return c.json({ error: "browser_login_limit" }, 429);
      }
      return c.json(
        { error: "browser_login_authentication_failed" },
        response.status >= 500 ? 503 : 400,
      );
    }
    return c.json({ ok: true });
  });
  browserLoginRouter.post("/attempts/:attempt/complete", async (c) => {
    enabled();
    const body = z
      .object({
        email: z.string().email().max(320).optional(),
        password: z.string().max(4096).optional(),
        token: z.string().max(4096).optional(),
        code: z.string().max(4096).optional(),
      })
      .parse(await c.req.json());
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
        const response =
          method === "password"
            ? await browserPassword(
                c,
                z
                  .object({
                    email: z.string().email().max(320),
                    password: z.string().min(1).max(256),
                  })
                  .parse(body),
                true,
              )
            : await browserOtp(
                c,
                {
                  ...z
                    .object({
                      email: z.string().email().max(320),
                      token: z.string().min(4).max(64),
                    })
                    .parse(body),
                  type: "email",
                },
                true,
              );
        if (!response.ok) {
          if (response.status === 429) {
            const retry = response.headers.get("retry-after");
            if (retry && /^\d+$/.test(retry)) c.header("Retry-After", retry);
            throw new VaultError(429, "browser_login_limit");
          }
          if (response.status >= 500)
            throw new VaultError(503, "browser_login_unavailable");
          throw new VaultError(409, "browser_login_authentication_failed");
        }
        const data = (await response.json()) as {
          session: Record<string, unknown>;
          user: unknown;
        };
        return { ...data.session, user: data.user };
      },
    );
    if (!("error" in result))
      captureProductEvent({
        userId: result.user.id,
        event: "auth_identity_operation",
        properties: {
          operation: "authenticate",
          outcome: "success",
          surface: "browser",
        },
      });
    return "error" in result
      ? c.json({ error: result.error }, 403)
      : c.json(result);
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
    forgetBrowserBudgetHandle(h);
    deleteCookie(c, cookie, {
      path: "/",
      secure: cookie.startsWith("__Host-"),
    });
    return c.json(result);
  });
}
function registerMfaRoutes() {
  for (const [path, kind] of [
    ["attempts", "attempt"],
    ["slots", "slot"],
  ] as const) {
    browserLoginRouter.post(`/${path}/:id/mfa/factors`, async (c) =>
      c.json(await vault!.mfa(handle(c), kind, c.req.param("id"))),
    );
    for (const operation of ["challenge", "verify"] as const) {
      browserLoginRouter.post(`/${path}/:id/mfa/${operation}`, async (c) => {
        const body = z
          .object({
            factor_id: z.string().min(1).max(128),
            challenge_id: z.string().max(128).optional(),
            code: z
              .string()
              .regex(/^\d{6}$/)
              .optional(),
          })
          .parse(await c.req.json());
        const verify =
          operation === "verify"
            ? z
                .object({
                  challenge_id: z.string().min(1),
                  code: z.string().regex(/^\d{6}$/),
                })
                .parse(body)
            : undefined;
        return c.json(
          await vault!.mfa(
            handle(c),
            kind,
            c.req.param("id"),
            body.factor_id,
            verify,
          ),
        );
      });
    }
  }
}
function registerDescriptions() {
  const apiError = z.object({ error: z.string() });
  const ok = z.object({ ok: z.literal(true) });
  const removed = z.object({
    removed: z.literal(true),
    revocation_pending: z.boolean(),
  });
  const tokenResponse = z.object({
    access_token: z.string(),
    expires_at: z.number(),
    user_id: z.string(),
  });
  const factorRequest = z.object({ factor_id: z.string().min(1).max(128) });
  const completionRequest = z.union([
    z.object({
      email: z.string().email(),
      password: z.string().min(1).max(256),
    }),
    z.object({ email: z.string().email(), token: z.string().min(4).max(64) }),
    z.object({ code: z.string().max(4096) }),
  ]);
  const descriptions = [
    [
      "get",
      "/capabilities",
      undefined,
      z.object({ enabled: z.boolean(), has_handle: z.boolean() }),
      "Discover browser sign-in additions without credentials or key material",
    ],
    [
      "post",
      "/initialize",
      z.object({}),
      ok,
      "Initialize or recover the HttpOnly browser handle",
    ],
    [
      "get",
      "/",
      undefined,
      z.object({
        slots: z.array(
          z.object({
            slot: z.string(),
            user_id: z.string(),
            email: z.string().nullable(),
            expires_at: z.string(),
            needs_sign_in: z.boolean(),
          }),
        ),
      }),
      "List saved identities without credentials",
    ],
    [
      "post",
      "/begin",
      z.object({ method: z.enum(["password", "email", "google"]) }),
      z.object({ attempt: z.string(), url: z.string().optional() }),
      "Begin a browser-bound five-minute authentication attempt",
    ],
    [
      "post",
      "/attempts/{attempt}/email",
      z.object({ email: z.string().email() }),
      ok,
      "Send a code for an existing identity",
    ],
    [
      "post",
      "/attempts/{attempt}/complete",
      completionRequest,
      z.object({
        candidate: z.string(),
        user: z.object({ id: z.string(), email: z.string().optional() }),
      }),
      "Authenticate a provisional candidate; never returns credentials",
    ],
    [
      "post",
      "/attempts/{attempt}/confirm",
      z.object({}),
      z.object({
        slot: z.string(),
        duplicate_candidate: z.string().optional(),
      }),
      "Confirm a candidate after assurance enforcement",
    ],
    [
      "post",
      "/attempts/{attempt}/cancel",
      z.object({}),
      removed,
      "Cancel and revoke a provisional candidate",
    ],
    [
      "post",
      "/slots/{slot}/token",
      z.object({}),
      tokenResponse,
      "Resolve a short-lived token; available after feature disable",
    ],
    [
      "post",
      "/slots/{slot}/resolve",
      z.object({}),
      tokenResponse,
      "Resolve a saved slot; available after feature disable",
    ],
    [
      "post",
      "/slots/{slot}/remove",
      z.object({}),
      removed,
      "Tombstone a slot before local-session revocation",
    ],
    [
      "post",
      "/remove-all",
      z.object({}),
      removed,
      "Remove this browser roster and expire its cookie",
    ],
  ] as const;
  for (const [method, path, request, response, summary] of descriptions)
    browserLoginRouter.openAPIRegistry.registerPath({
      method,
      path,
      tags: ["auth"],
      summary,
      request: request
        ? { body: { content: { "application/json": { schema: request } } } }
        : undefined,
      responses: {
        200: {
          description: "Private, no-store response",
          content: { "application/json": { schema: response } },
        },
        ...Object.fromEntries(
          [400, 401, 403, 404, 409, 429, 503].map((status) => [
            status,
            {
              description: "Redacted broker error",
              content: { "application/json": { schema: apiError } },
            },
          ]),
        ),
      },
    });
  for (const target of ["attempts", "slots"])
    browserLoginRouter.openAPIRegistry.registerPath({
      method: "post",
      path: `/${target}/{id}/mfa/factors`,
      tags: ["auth"],
      summary: "List factor identifiers for a browser-bound session",
      responses: {
        200: {
          description: "Factor metadata without credentials",
          content: {
            "application/json": {
              schema: z.object({
                factors: z.array(
                  z.object({
                    id: z.string(),
                    factor_type: z.string(),
                    status: z.string(),
                  }),
                ),
              }),
            },
          },
        },
      },
    });
  for (const target of ["attempts", "slots"])
    for (const operation of ["challenge", "verify"])
      browserLoginRouter.openAPIRegistry.registerPath({
        method: "post",
        path: `/${target}/{id}/mfa/${operation}`,
        tags: ["auth"],
        summary: `${operation} MFA for a browser-bound ${target === "slots" ? "saved session" : "candidate"}`,
        request: {
          body: {
            content: {
              "application/json": {
                schema:
                  operation === "verify"
                    ? factorRequest.extend({
                        challenge_id: z.string(),
                        code: z.string().regex(/^\d{6}$/),
                      })
                    : factorRequest,
              },
            },
          },
        },
        responses: {
          200: {
            description: "No credentials leave the broker",
            content: {
              "application/json": {
                schema:
                  operation === "verify"
                    ? z.object({ verified: z.literal(true) })
                    : z.object({ id: z.string(), expires_at: z.number() }),
              },
            },
          },
        },
      });
}

let registered = false;
export function registerBrowserLoginRoutes() {
  if (registered) return;
  registered = true;
  registerIngress();
  registerFlowRoutes();
  registerMfaRoutes();
  registerDescriptions();
}
