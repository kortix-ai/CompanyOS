import { afterEach, expect, mock, test } from 'bun:test';
import type { SessionPromptPart } from '@kortix/sdk';
import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { Window } from 'happy-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComposerChatInput } from '@kortix/ui/composer';
import type { FirstChat } from '@kortix/ui/workspace/home/first-chat';
import { fileURLToPath } from 'node:url';
import type { WorkspaceOnboardingWizard } from '../../../../../../packages/ui/src/workspace/home/workspace-onboarding-wizard';

let composer!: ComponentProps<typeof ComposerChatInput>;
let firstChat: ComponentProps<typeof FirstChat> | undefined;
let wizard: ComponentProps<typeof WorkspaceOnboardingWizard> | undefined;
let firstChatPending = false;
/** Whether the address carries `?chat=first` (the sidebar row, onboarding). */
let firstChatRequested = true;
/** `metadata.onboarding_completed_at` on the project row; `null` = not onboarded. */
let onboardedAt: string | null = '2026-10-01T00:00:00Z';
/** The onboarding leaves: `project.settings.write` (the wizard's writes) and `project.session.start` (the first chat). */
let canWrite = true;
let canStart = true;
/** The permission probe has not answered yet. */
let cansLoading = false;
const stamp = mock(async () => ({}));
const replaced: string[] = [];
// `mock.module` is process-wide: every shared module keeps its real exports and
// overrides only what this test needs, so other suites in the same run still link.
const realComposerInput = await import('@kortix/ui/session/composer/composer-chat-input');
const realTranslations = await import('@/i18n/use-translations');
const realQuery = await import('@tanstack/react-query');
const realProjectCan = await import('@kortix/ui/internal/lib/use-project-can');
const realAccountPanel = await import('@kortix/ui/internal/stores/account-panel-store');
const realSdk = await import('@kortix/sdk');
const realSdkReact = await import('@kortix/sdk/react');
const realFirstChatStore = await import('@kortix/ui/internal/stores/first-chat-store');
const realUiProvider = { ...(await import('@kortix/ui/providers/ui-provider')) };
mock.module('@kortix/ui/providers/ui-provider', () => ({
  ...realUiProvider,
  useUiSearchParams: () => new URLSearchParams(firstChatRequested ? 'chat=first' : ''),
  useUiRouter: () => ({
    push: () => {},
    replace: (href: string) => replaced.push(href),
    prefetch: () => {},
    back: () => {},
  }),
}));
mock.module('@kortix/ui/session/composer/composer-chat-input', () => ({
  ...realComposerInput,
  ComposerChatInput: (props: typeof composer) => {
    composer = props;
    return null;
  },
}));
const translationsMock = () => ({
  ...realTranslations,
  // Callable for the first chat's keys (`firstChat.placeholder`), `.raw` for
  // the home placeholder. Both return something a test can tell apart.
  useTranslations: (namespace: string) =>
    Object.assign((key: string) => `${namespace}.${key}`, { raw: () => 'Message' }),
});
mock.module('@/i18n/use-translations', translationsMock);
mock.module('@kortix/ui/i18n', translationsMock);
// Zustand hooks read the store's initial state under `renderToStaticMarkup`, so
// the pending flag is set here rather than through the store.
mock.module('@kortix/ui/internal/stores/first-chat-store', () => ({
  ...realFirstChatStore,
  useFirstChatPending: () => firstChatPending,
}));
mock.module('@tanstack/react-query', () => ({
  ...realQuery,
  // One answer fits every query: the bare project row (its metadata decides
  // onboarding), an empty sandbox list and no access requests.
  useQuery: () => ({
    isSuccess: true,
    data: {
      account_id: 'a1',
      metadata: onboardedAt ? { onboarding_completed_at: onboardedAt } : {},
      items: [],
      requests: [],
    },
  }),
  useQueryClient: () => new realQuery.QueryClient(),
}));
mock.module('@kortix/ui/internal/lib/use-project-can', () => ({
  ...realProjectCan,
  useProjectCan: () => ({ allowed: false }),
  useProjectCans: (_projectId: string, actions: readonly string[]) =>
    Object.fromEntries(
      actions.map((action) => [
        action,
        {
          isLoading: cansLoading,
          allowed:
            !cansLoading &&
            (action === realSdk.PROJECT_ACTIONS.PROJECT_SETTINGS_WRITE
              ? canWrite
              : action === realSdk.PROJECT_ACTIONS.PROJECT_SESSION_START
                ? canStart
                : false),
        },
      ]),
    ),
}));
mock.module('@kortix/ui/internal/stores/account-panel-store', () => ({ ...realAccountPanel, hubTarget: () => null }));
mock.module('@kortix/sdk', () => ({
  ...realSdk,
  getProject: mock(),
  getProjectDetail: mock(),
  listProjectAccessRequests: mock(),
  listProjectSandboxes: mock(),
  setProjectOnboardingComplete: stamp,
}));
mock.module('@kortix/sdk/react', () => ({
  ...realSdkReact,
  contract: () => ({}),
  invalidateProject: async () => {},
  // A pending roster blocks nothing; the no-agent state has its own tests.
  useRuntimeAgents: () => ({ data: undefined }),
  qk: {
    ...realSdkReact.qk,
    project: {
      ...realSdkReact.qk.project,
      sandboxes: () => [],
      accessRequests: () => [],
      detail: () => [],
      summary: () => [],
    },
  },
}));
mock.module('@kortix/ui/internal/layout/sidebar-toggle', () => ({
  SidebarToggle: () => null,
}));
mock.module('@kortix/ui/workspace/home/access-requests-bell', () => ({ AccessRequestsBell: () => null }));
mock.module('@kortix/ui/workspace/home/sandbox-picker', () => ({ SandboxPicker: () => null }));
mock.module('@kortix/ui/workspace/home/first-chat', () => ({
  FirstChat: (props: ComponentProps<typeof FirstChat>) => {
    firstChat = props;
    return props.composer;
  },
}));
// Not a package export: ProjectHome imports it by path, so it is mocked by path.
mock.module(
  fileURLToPath(
    new URL('../../../../../../packages/ui/src/workspace/home/workspace-onboarding-wizard.tsx', import.meta.url),
  ),
  () => ({
    WorkspaceOnboardingWizard: (props: ComponentProps<typeof WorkspaceOnboardingWizard>) => {
      wizard = props;
      return null;
    },
  }),
);
mock.module('@kortix/ui/workspace/home/welcome-body', () => ({
  ProjectHomeWallpaper: () => null,
  ProjectHomeWelcomeBody: ({ composer: input }: { composer: ReactNode }) => input,
}));
const { ProjectHome } = await import('@kortix/ui/workspace/layout/project-home');

const handle: SessionPromptPart = {
  type: 'file',
  attachment_id: '11111111-1111-4111-8111-111111111111',
  filename: 'brief.pdf',
  mime: 'application/pdf',
};

function mount(onSend: ComponentProps<typeof ProjectHome>['onSend'], onboarding = false) {
  firstChat = undefined;
  wizard = undefined;
  renderToStaticMarkup(
    createElement(ProjectHome, { projectId: 'project-1', onSend, busy: false, onboarding }),
  );
}

afterEach(() => {
  firstChatRequested = true;
  firstChatPending = false;
  onboardedAt = '2026-10-01T00:00:00Z';
  canWrite = true;
  canStart = true;
  cansLoading = false;
  stamp.mockClear();
  replaced.length = 0;
});

test('composer Send forwards attachment handles and propagates a failed create', async () => {
  const failure = new Error('Session creation failed');
  const onSend = mock(async () => {
    throw failure;
  });
  mount(onSend);

  const attachments = {
    submittedIds: ['local-1'],
    readyAtSend: true,
    whenReady: async () => [handle],
    retry: () => {},
    resubmit: () => {},
    release: () => {},
  };
  // The composer keeps its selection only when it observes the rejection.
  await expect(composer.onSend('read this', undefined, {}, attachments)).rejects.toBe(failure);
  expect(onSend).toHaveBeenCalledWith('read this', undefined, {}, attachments);
});

test('a slash command whose send fails leaves no unhandled rejection', async () => {
  const unhandled: unknown[] = [];
  const record = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', record);
  try {
    const onSend = mock(async () => {
      throw new Error('Session creation failed');
    });
    mount(onSend);
    composer.onCommand?.({ name: 'plan', description: 'Plan', template: '', hints: [] }, 'x', {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onSend).toHaveBeenCalledWith('/plan x', undefined, {}, undefined);
    expect(unhandled).toEqual([]);
  } finally {
    process.off('unhandledRejection', record);
  }
});

test('a project without a first chat opens on the usual home and hero composer', () => {
  mount(mock(async () => {}));

  expect(firstChat).toBeUndefined();
  expect(composer.placeholder).toBe('Message');
  expect(composer.underbarPlacement).toBe('inline');
  expect(composer.slashMenuPlacement).toBe('below');
});

test('a pending first chat docks the composer under the welcome', () => {
  firstChatPending = true;
  mount(mock(async () => {}));

  expect(firstChat).toBeDefined();
  expect(composer.placeholder).toBe('firstChat.placeholder');
  expect(composer.underbarPlacement).toBe('below');
  expect(composer.slashMenuPlacement).toBe('above');
});

// "New session" opens plain project home. The first chat stays pending, but
// without `?chat=first` the page is the usual home, never the welcome again.
test('a pending first chat does not open without the explicit link', () => {
  firstChatPending = true;
  firstChatRequested = false;
  mount(mock(async () => {}));

  expect(firstChat).toBeUndefined();
  expect(composer.placeholder).toBe('Message');
});

test('a failed first-chat send still reaches the composer as a rejection', async () => {
  firstChatPending = true;
  const failure = new Error('Account cannot start a session');
  mount(
    mock(async () => {
      throw failure;
    }),
  );

  await expect(composer.onSend('hello', undefined, {})).rejects.toBe(failure);
});

// Onboarding (Kortix web passes `onboarding`): a project that is not onboarded
// opens on the setup wizard. Nothing is sent and nothing is stamped while it is
// open; the wizard owns the stamp and waits for it.
test('a project that is not onboarded opens on the setup wizard, with no kickoff and no redirect', () => {
  onboardedAt = null;
  firstChatRequested = false;
  mount(mock(async () => {}), true);

  expect(wizard).toBeDefined();
  expect(wizard!.projectId).toBe('project-1');
  expect(firstChat).toBeUndefined();
  expect(replaced).toEqual([]);
  expect(stamp).not.toHaveBeenCalled();
});

test('the wizard opens even when the address asks for the first chat', () => {
  onboardedAt = null;
  firstChatRequested = true;
  firstChatPending = true;
  mount(mock(async () => {}), true);

  expect(wizard).toBeDefined();
  expect(firstChat).toBeUndefined();
});

test('finishing the wizard opens the first chat, without sending anything', () => {
  onboardedAt = null;
  firstChatRequested = false;
  const onSend = mock(async () => {});
  mount(onSend, true);
  realFirstChatStore.useFirstChatStore.getState().finish('project-1');

  wizard!.onFinished();

  expect(replaced).toEqual([realFirstChatStore.firstChatHref('project-1')]);
  expect(realFirstChatStore.useFirstChatStore.getState().projectIds).toContain('project-1');
  expect(onSend).not.toHaveBeenCalled();
  expect(stamp).not.toHaveBeenCalled();
});

// The permission probe decides between the wizard and the usual home: until
// it answers, neither paints, so the usual home never flashes first.
test('an unstamped project paints neither home nor wizard until the permission probe answers', () => {
  onboardedAt = null;
  firstChatRequested = false;
  cansLoading = true;
  composer = undefined as unknown as typeof composer;
  mount(mock(async () => {}), true);

  expect(wizard).toBeUndefined();
  expect(firstChat).toBeUndefined();
  expect(composer).toBeUndefined();
});

test('a member who cannot set the project up never gets the onboarding', () => {
  onboardedAt = null;
  firstChatRequested = false;
  canWrite = false;
  mount(mock(async () => {}), true);

  expect(wizard).toBeUndefined();
  expect(firstChat).toBeUndefined();
});

// A custom role that can start sessions but not write settings would meet a
// wizard whose writes are refused, on every visit.
test('a role without project.settings.write never gets the onboarding', () => {
  onboardedAt = null;
  firstChatRequested = false;
  canWrite = false;
  canStart = true;
  mount(mock(async () => {}), true);

  expect(wizard).toBeUndefined();
});

test('a role that cannot start a session never gets the onboarding', () => {
  onboardedAt = null;
  firstChatRequested = false;
  canStart = false;
  mount(mock(async () => {}), true);

  expect(wizard).toBeUndefined();
});

// A white-label or SDK host renders the same home without the prop.
test('a host that does not opt in keeps the usual home on an unstamped project', () => {
  onboardedAt = null;
  firstChatRequested = false;
  mount(mock(async () => {}), false);

  expect(wizard).toBeUndefined();
  expect(firstChat).toBeUndefined();
});

test('an onboarded project never shows the wizard', () => {
  mount(mock(async () => {}), true);

  expect(wizard).toBeUndefined();
});

test('a send from the home stamps nothing: only the wizard finishes the onboarding', async () => {
  mount(mock(async () => {}), true);

  await composer.onSend('hello', undefined, {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(stamp).not.toHaveBeenCalled();
});


async function mountedHome(run: (rerender: () => Promise<void>, onSend: ReturnType<typeof mock>) => Promise<void>) {
  const browser = new Window({ url: 'http://localhost' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(browser.document.createElement('div'));
  const onSend = mock(async () => {});
  const rerender = async () => {
    firstChat = undefined;
    wizard = undefined;
    await act(async () => root.render(createElement(ProjectHome, { projectId: 'project-1', onSend, busy: false, onboarding: true })));
  };
  try {
    await rerender();
    await run(rerender, onSend);
  } finally {
    await act(async () => root.unmount());
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    await browser.happyDOM.close();
  }
}

test('mounted home releases the temporary first-chat bridge after the URL catches up', async () => {
  onboardedAt = null;
  firstChatRequested = false;
  firstChatPending = false;
  await mountedHome(async (rerender, onSend) => {
    await act(async () => wizard!.onFinished());
    expect(firstChat).toBeDefined();
    onboardedAt = '2026-11-27T00:00:00Z';
    firstChatRequested = true;
    firstChatPending = true;
    await rerender();
    expect(firstChat).toBeDefined();
    firstChatRequested = false;
    await rerender();
    expect(firstChat).toBeUndefined();
    expect(onSend).not.toHaveBeenCalled();
  });
});

test('mounted wizard keeps a queued incoming prompt in the first-chat composer without sending', async () => {
  onboardedAt = null;
  firstChatRequested = false;
  const { useComposerPrefillStore } = await import('@kortix/ui/internal/stores/composer-prefill-store');
  await mountedHome(async (_rerender, onSend) => {
    expect(wizard).toBeDefined();
    await act(async () => useComposerPrefillStore.getState().setPrefill('project-1', 'Review the original brief'));
    await act(async () => wizard!.onFinished());
    expect(firstChat).toBeDefined();
    expect(composer.prefill?.text).toBe('Review the original brief');
    expect(composer.prefill?.submit).toBeUndefined();
    expect(onSend).not.toHaveBeenCalled();
  });
});

test('mounted onboarding initially requested as first chat releases its bridge on finish', async () => {
  onboardedAt = null;
  firstChatRequested = true;
  firstChatPending = true;
  await mountedHome(async (rerender, onSend) => {
    expect(wizard).toBeDefined();
    await act(async () => wizard!.onFinished());
    onboardedAt = '2026-11-27T00:00:00Z';
    await rerender();
    expect(firstChat).toBeDefined();
    firstChatRequested = false;
    await rerender();
    expect(firstChat).toBeUndefined();
    expect(onSend).not.toHaveBeenCalled();
  });
});
