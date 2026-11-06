import { HeadlessAuthError } from "./auth";
export interface BrowserBrokerOptions {
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}
export interface BrowserLoginSlot {
  slot: string;
  user_id: string;
  email: string | null;
  expires_at: string;
}
export type BrowserLoginCompletion =
  | { email: string; password: string }
  | { email: string; token: string }
  | { code: string };
async function call<T>(
  path: string,
  body: object | undefined,
  options?: BrowserBrokerOptions,
): Promise<T> {
  const response = await (options?.fetch ?? globalThis.fetch)(
    `/v1/auth/browser-logins${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal: options?.signal,
      headers: {
        "content-type": "application/json",
        "x-kortix-browser-login": "1",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new HeadlessAuthError(
      error.error ?? "browser_login_unavailable",
      "Browser login request failed",
      response.status,
    );
  }
  return response.json() as Promise<T>;
}
const id = encodeURIComponent;
/** Same-origin browser cookie broker. Never returns refresh credentials. */
export const browserLogins = {
  capabilities: (options?: BrowserBrokerOptions) => call<{ enabled: boolean }>("/capabilities", undefined, options),
  mfaFactors: (
    target: { kind: "attempt" | "slot"; id: string },
    options?: BrowserBrokerOptions,
  ) =>
    call<{ factors: { id: string; factor_type: string; status: string }[] }>(
      `/${target.kind === "attempt" ? "attempts" : "slots"}/${id(target.id)}/mfa/factors`,
      {},
      options,
    ),
  challengeMfa: (
    target: { kind: "attempt" | "slot"; id: string },
    body: { factor_id: string },
    options?: BrowserBrokerOptions,
  ) =>
    call<{ id: string; expires_at: number }>(
      `/${target.kind === "attempt" ? "attempts" : "slots"}/${id(target.id)}/mfa/challenge`,
      body,
      options,
    ),
  verifyMfa: (
    target: { kind: "attempt" | "slot"; id: string },
    body: { factor_id: string; challenge_id: string; code: string },
    options?: BrowserBrokerOptions,
  ) =>
    call<{ verified: true }>(
      `/${target.kind === "attempt" ? "attempts" : "slots"}/${id(target.id)}/mfa/verify`,
      body,
      options,
    ),
  initialize: (options?: BrowserBrokerOptions) =>
    call<{ ok: true }>("/initialize", {}, options),
  roster: (options?: BrowserBrokerOptions) =>
    call<{ slots: BrowserLoginSlot[] }>("", undefined, options),
  begin: (
    body: { method: "password" | "email" | "google" },
    options?: BrowserBrokerOptions,
  ) => call<{ attempt: string; url?: string }>("/begin", body, options),
  sendEmail: (
    attempt: string,
    body: { email: string },
    options?: BrowserBrokerOptions,
  ) => call<{ ok: true }>(`/attempts/${id(attempt)}/email`, body, options),
  complete: (
    attempt: string,
    body: BrowserLoginCompletion,
    options?: BrowserBrokerOptions,
  ) =>
    call<{ candidate: string; user: { id: string; email?: string } }>(
      `/attempts/${id(attempt)}/complete`,
      body,
      options,
    ),
  confirm: (attempt: string, options?: BrowserBrokerOptions) =>
    call<{ slot: string; duplicate_candidate?: string }>(
      `/attempts/${id(attempt)}/confirm`,
      {},
      options,
    ),
  cancel: (attempt: string, options?: BrowserBrokerOptions) =>
    call<{ removed: true; revocation_pending: boolean }>(
      `/attempts/${id(attempt)}/cancel`,
      {},
      options,
    ),
  token: (slot: string, options?: BrowserBrokerOptions) =>
    call<import("../../auth/browser-identity").BrowserLoginToken>(
      `/slots/${id(slot)}/token`,
      {},
      options,
    ),
  remove: (slot: string, options?: BrowserBrokerOptions) =>
    call<{ removed: true; revocation_pending: boolean }>(
      `/slots/${id(slot)}/remove`,
      {},
      options,
    ),
  removeAll: (options?: BrowserBrokerOptions) =>
    call<{ removed: true; revocation_pending: boolean }>(
      "/remove-all",
      {},
      options,
    ),
};
