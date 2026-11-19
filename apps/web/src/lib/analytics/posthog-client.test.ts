/**
 * The init contract for what PostHog may do on its own. Session replay never
 * starts from remote config: the app decides per session, and a recording
 * hides text on private pages. Surveys never pop
 * automatically: the surveys extension still loads, and the app decides when
 * a survey may display (`survey-gate.ts`). PostHog's own automatic display
 * fired the acquisition survey over the create-first-workspace landing of a
 * zero-workspace account (dogfood signature
 * `dogfood:auth-signup-onboarding:survey-modal-blocks-first-landing`).
 */
import { describe, expect, mock, test } from 'bun:test';

type InitConfig = Record<string, unknown>;
const inits: InitConfig[] = [];

mock.module('posthog-js/dist/module.no-external', () => ({
  default: {
    init: (_key: string, config: InitConfig) => inits.push(config),
    set_config: (_config: InitConfig) => {},
    onSessionId: () => () => {},
    get_session_id: () => '019a9b2c-0000-7000-8000-000000000000',
    sessionRecordingStarted: () => false,
    startSessionRecording: () => {},
    stopSessionRecording: () => {},
  },
}));
mock.module('posthog-js/dist/surveys', () => ({}));
mock.module('posthog-js/dist/posthog-recorder', () => ({}));

// Browser-shaped globals as small as `start()` reads: a localhost run (which
// reports with the local key), no consent cookie, and a consent listener
// target. `start()` refuses a server window, so the shim comes first.
const windowStub = {
  location: {
    hostname: 'localhost',
    origin: 'http://localhost:3000',
    pathname: '/workspaces',
    protocol: 'http:',
  },
};
const documentStub = {
  cookie: '',
  addEventListener: (_listenerType: string, _listener: () => void) => {},
};
Object.assign(globalThis, { window: windowStub, document: documentStub });
process.env.NEXT_PUBLIC_POSTHOG_KEY = 'phc_client_test_key';

const { startPostHog } = await import('./posthog-client');

describe('startPostHog — the surveys display contract', () => {
  test('the init starts, with the local project', async () => {
    await expect(startPostHog(null)).resolves.toBeDefined();
    expect(inits).toHaveLength(1);
  });

  test('surveys never display automatically', () => {
    expect(inits[0]?.disable_surveys_automatic_display).toBe(true);
  });

  test('the surveys extension still loads, so the app can display one', () => {
    expect(inits[0]?.disable_surveys).toBeUndefined();
  });
});

describe('startPostHog — the session replay contract', () => {
  type Recording = {
    maskAllInputs?: boolean;
    maskTextFn?: (text: string) => string;
    maskAttributeFn?: (name: string, value: string) => string;
  };
  const recording = () => inits[0]?.session_recording as Recording;

  test('recording is off at init: the app starts it per session', () => {
    expect(inits[0]?.disable_session_recording).toBe(true);
    expect(recording().maskAllInputs).toBe(true);
  });

  test('on a private page the recording hides text and text-bearing attributes', () => {
    expect(recording().maskTextFn?.('Acme roadmap')).toBe('**** *******');
    expect(recording().maskAttributeFn?.('title', 'Acme roadmap')).toBe('***');
    expect(recording().maskAttributeFn?.('class', 'flex')).toBe('flex');
  });
});
