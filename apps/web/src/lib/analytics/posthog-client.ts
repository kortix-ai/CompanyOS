/**
 * The one PostHog client in the web app. `PostHogHost` starts it once per page
 * with the signed-in user (or none); every other caller (`lib/track`) awaits
 * `getPostHog()`, which resolves after that start. On a host with no project
 * (`posthogProjectForHost`) it resolves to null and the library is never
 * fetched.
 *
 * No remote code. The `no-external` build never injects a script from
 * PostHog: not the remote-config `config.js`, not site apps. The one
 * extension we use, surveys, ships in our own bundle. Whoever administers the
 * PostHog project cannot run code on kortix.com (GTM stays off signed-in
 * pages for the same reason).
 *
 * Consent decides storage, not collection. Until the CookieYes banner grants
 * analytics, ids live in memory only: nothing in cookies or local storage.
 * - An anonymous visitor then gets a new id on every full page load.
 * - A signed-in user starts with their own user id (`bootstrap`), so there is
 *   no anonymous id to merge on each page load.
 * A grant moves the client to `localStorage+cookie`, which is what links an ad
 * click on a landing page to the sign-up minutes later.
 *
 * Session replay (decision 2026-11-19, rule 4 in `posthog-config.ts`). The
 * recorder is our own chunk, downloaded only for a session that is recorded.
 * Every session decides once, from its id: `syncReplay` runs at start, on a
 * new session id, on a consent change and on sign-in or sign-out. A
 * signed-in person's recording, and any recording of a private or sign-in
 * page, hides all text, inputs and text-bearing attributes (`replayMasked`).
 * Autocapture keeps element text on public pages and masks it on private
 * ones; the `before_send` scrubber removes what masking does not cover.
 */

import { isDesktop } from '@kortix/ui/internal/lib/desktop';

import {
  type AnalyticsConsent,
  isPrivatePath,
  maskReplayText,
  POSTHOG_API_HOST,
  POSTHOG_UI_HOST,
  type PostHogProject,
  posthogProjectForHost,
  readAnalyticsConsent,
  REPLAY_BLOCK_SELECTOR,
  replayAttribute,
  replayMasksPage,
  replayTier,
  sanitizeUrl,
  scrubEvent,
  shouldRecordSession,
} from './posthog-config';

type PostHog = (typeof import('posthog-js/dist/module.no-external'))['default'];

let resolveClient: (client: PostHog | null) => void = () => {};
const clientReady = new Promise<PostHog | null>((resolve) => {
  resolveClient = resolve;
});
let started = false;
let consent: AnalyticsConsent = 'unknown';
let project: PostHogProject | null = null;
/** The signed-in person (`created_at` of the Supabase user), or null. */
let replayUser: { signedUpAt: string } | null = null;
let recorder: Promise<unknown> | null = null;

/** The signed-in Supabase user the page starts with. */
export interface PostHogUser {
  id: string;
  /** Supabase `created_at`: decides the replay tier. */
  createdAt: string;
}

/** The client once `startPostHog` ran, or null on hosts that do not report. */
export function getPostHog(): Promise<PostHog | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return clientReady;
}

/** Initialize once. `user`: the signed-in Supabase user at page load, if any. */
export function startPostHog(user: PostHogUser | null): Promise<PostHog | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!started) {
    started = true;
    void start(user)
      .catch(() => null)
      .then(resolveClient);
  }
  return clientReady;
}

function persistenceFor(value: AnalyticsConsent) {
  return value === 'granted' ? ('localStorage+cookie' as const) : ('memory' as const);
}

async function start(user: PostHogUser | null): Promise<PostHog | null> {
  project = posthogProjectForHost(window.location.hostname, process.env.NEXT_PUBLIC_POSTHOG_KEY);
  if (!project) return null;
  const environment = project.environment;
  const userId = user?.id ?? null;
  replayUser = user ? { signedUpAt: user.createdAt } : null;

  const [{ default: posthog }] = await Promise.all([
    import('posthog-js/dist/module.no-external'),
    // Registers itself on window.__PosthogExtensions__ before init reads it.
    import('posthog-js/dist/surveys'),
  ]);
  consent = readAnalyticsConsent(document.cookie);
  const privatePage = isPrivatePath(window.location.pathname);
  const origin = window.location.origin;

  posthog.init(project.key, {
    api_host: POSTHOG_API_HOST,
    ui_host: POSTHOG_UI_HOST,
    defaults: '2026-08-30',
    person_profiles: 'identified_only',
    persistence: persistenceFor(consent),
    ...(consent !== 'granted' && userId
      ? { bootstrap: { distinctID: userId, isIdentifiedID: true } }
      : {}),
    // kortix.com, dev. and staging. are separate audiences: one cookie on
    // .kortix.com would merge a developer's dev and prod visits.
    cross_subdomain_cookie: false,
    secure_cookie: window.location.protocol === 'https:',
    capture_pageview: 'history_change',
    capture_pageleave: 'if_capture_pageview',
    autocapture: true,
    mask_all_text: privatePage,
    mask_all_element_attributes: privatePage,
    // Sentry owns errors; Vercel Speed Insights owns web vitals.
    capture_exceptions: false,
    capture_performance: false,
    // Recording starts per session in `syncReplay`, never from remote config alone.
    disable_session_recording: true,
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      // Every text node goes through maskTextFn, which decides per page.
      maskTextSelector: '*',
      maskTextFn: (text) => (replayMasked() ? maskReplayText(text) : text),
      maskAttributeFn: (name, value) => replayAttribute(name, value, replayMasked(), origin),
      blockSelector: REPLAY_BLOCK_SELECTOR,
      // Page URLs in the recording follow the same reduction as event URLs.
      maskCapturedNetworkRequestFn: (request) => ({
        ...request,
        name: sanitizeUrl(request.name, origin) ?? '',
      }),
      recordHeaders: false,
      recordBody: false,
    },
    // Kortix hosts drop bot traffic. A local run keeps it, tagged
    // `$browser_type: bot`, so a scripted browser can verify events.
    opt_out_useragent_filter: project.environment === 'local',
    disable_external_dependency_loading: true,
    opt_in_site_apps: false,
    disable_web_experiments: true,
    disable_product_tours: true,
    disable_conversations: true,
    // The app decides when a survey may pop (`survey-gate.ts`): PostHog's own
    // loop popped the acquisition survey over the create-first-workspace
    // landing of a zero-workspace account.
    disable_surveys_automatic_display: true,
    before_send: (event) => (event ? scrubEvent(event, origin) : event),
    // Runs inside init, before the first event, so every event carries these.
    loaded: (client) =>
      client.register({
        environment,
        platform: isDesktop() ? 'desktop' : 'web',
        app_version: process.env.NEXT_PUBLIC_KORTIX_VERSION || 'unknown',
      }),
  });

  document.addEventListener('cookieyes_consent_update', () => {
    const next = readAnalyticsConsent(document.cookie);
    if (next === consent) return;
    consent = next;
    posthog.set_config({ persistence: persistenceFor(next) });
    syncPostHogPage(posthog, window.location.pathname);
    void syncReplay(posthog);
  });

  syncPostHogPage(posthog, window.location.pathname);
  // A new session id (30 min idle, reset) decides again.
  posthog.onSessionId(() => void syncReplay(posthog));
  void syncReplay(posthog);
  return posthog;
}

/** Whether the recording hides text right now: read per node, so a navigation applies at once. */
function replayMasked(): boolean {
  return replayMasksPage(window.location.pathname, replayUser !== null);
}

function wantsRecording(posthog: PostHog): boolean {
  if (!project) return false;
  return shouldRecordSession({
    replay: project.replay,
    consent,
    tier: replayTier(replayUser?.signedUpAt ?? null, Date.now()),
    sessionId: posthog.get_session_id(),
  });
}

/** Start or stop the recording for the current session. */
async function syncReplay(posthog: PostHog): Promise<void> {
  if (!wantsRecording(posthog)) {
    if (posthog.sessionRecordingStarted()) posthog.stopSessionRecording();
    return;
  }
  // Registers rrweb and the recorder on window.__PosthogExtensions__.
  recorder ??= import('posthog-js/dist/posthog-recorder');
  await recorder;
  // Consent or the session can change while the chunk downloads.
  if (wantsRecording(posthog)) posthog.startSessionRecording();
}

/**
 * Sign-in or sign-out on this page. Call it before `reset()` on sign-out, so
 * the next session decides as anonymous.
 */
export function setReplayUser(posthog: PostHog, user: PostHogUser | null): void {
  replayUser = user ? { signedUpAt: user.createdAt } : null;
  void syncReplay(posthog);
}

/** Apply the per-page rules after a navigation: text masking for autocapture. */
export function syncPostHogPage(posthog: PostHog, pathname: string): void {
  const privatePage = isPrivatePath(pathname);
  posthog.set_config({ mask_all_text: privatePage, mask_all_element_attributes: privatePage });
}
