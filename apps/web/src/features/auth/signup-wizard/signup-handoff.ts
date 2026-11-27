/**
 * The one contract between `/signup` and `/auth`.
 *
 * `/signup` explains Kortix; it never asks for an email, a password or a
 * provider. Every way out of it is a plain link to `/auth` carrying every
 * key and value of the query `/signup` arrived with, in order
 * (`URLSearchParams` may re-encode, never change, a value). `/auth` stays the only reader of
 * `returnUrl` / `redirect` (in that order) and the only place that sanitizes
 * them (`sanitizeAuthReturnUrl`), so the wizard cannot change where a person
 * lands after they sign in.
 */

/**
 * Query keys that mean an auth flow is already in progress: an OAuth or email
 * callback bounced back (`pkce_code`, `error`, `expired`), a native app is
 * waiting for its session (`mobile_callback`, `sso`), or a session just ended
 * (`reason`). Such a visit skips the explanation and goes straight to `/auth`.
 */
export const AUTH_FLOW_PARAMS = [
  'pkce_code',
  'code',
  'token_hash',
  'error',
  'error_code',
  'error_description',
  'expired',
  'mobile_callback',
  'sso',
  'reason',
] as const;

/** `/auth` with the same query `/signup` was opened with. */
export function signupAuthHref(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `/auth?${query}` : '/auth';
}

/** Whether this visit belongs to an auth flow in progress, not to a new visitor. */
export function bypassesSignupIntro(params: URLSearchParams): boolean {
  return AUTH_FLOW_PARAMS.some((key) => params.has(key));
}
