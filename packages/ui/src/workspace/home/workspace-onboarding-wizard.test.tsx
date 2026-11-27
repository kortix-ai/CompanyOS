import { afterAll, afterEach, expect, mock, test } from "bun:test";
import type {
  AdminConnector,
  DiscoverConnector,
  KortixProject,
  OnboardingProfile,
} from "@kortix/sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Window } from "happy-dom";
import { act } from "react";

/**
 * The workspace setup wizard: every answer is a real write the wizard waits
 * for, a refused write keeps the step with its reason, and a skipped step
 * reads "Not connected" / "Skip for now", never "Connected".
 */

const browser = new Window({ url: "http://localhost" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  HTMLElement: browser.HTMLElement,
  HTMLInputElement: browser.HTMLInputElement,
  Element: browser.Element,
  Node: browser.Node,
  Event: browser.Event,
  MouseEvent: browser.MouseEvent,
  PointerEvent: browser.PointerEvent,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, key, { configurable: true, value });
}

// After the globals: react-dom decides at load whether the DOM has `input` events.
const { createRoot } = await import("react-dom/client");

const PROJECT = "synthetic-workspace";
let models: Array<{ enabled: boolean; available: boolean }> = [];
let connectors: AdminConnector[] = [];
const saveProfile = mock(async (_id: string, profile: OnboardingProfile) =>
  project({ onboarding: profile }),
);
const stamp = mock(async (_id: string, _completed: boolean) =>
  project({ onboarding_completed_at: "2026-11-27T00:00:00Z" }),
);
const connectApp = mock(
  async (_input: unknown, _deps?: unknown, _onCreated?: () => void) => {},
);

function project(metadata: Record<string, unknown>): KortixProject {
  return {
    id: PROJECT,
    account_id: "synthetic-account",
    metadata,
  } as unknown as KortixProject;
}

const sdk = await import("@kortix/sdk");
mock.module("@kortix/sdk", () => ({
  ...sdk,
  setWorkspaceOnboardingProfile: saveProfile,
  setWorkspaceOnboardingComplete: stamp,
  getWorkspaceModelPicker: async () => ({ models }),
  listConnectors: async () => ({ connectors }),
  listDiscoverConnectors: async () => ({ items: ["GitHub", "Gmail", "Notion", "Figma"].map((name): DiscoverConnector => ({ id: name.toLowerCase(), slug: name.toLowerCase(), name, kind: "composio", description: null, url: null, icon: null, domain: "example.test", categories: [], feeds: [], popularity: null })), hasMore: false }),
  listDiscoverSections: async () => ({ popular: [], categories: [], sections: [] }),
  listConnectToolkits: async (_id: string, query: { q?: string }) => ({ provider: 'composio', toolkits: query.q === 'Slack' ? [{ slug: 'Slack', name: 'Slack', connected: false, isNoAuth: false, logo: null }] : query.q === 'Figma' ? [{ slug: 'figma', name: 'Figma', connected: false, isNoAuth: false, logo: null }] : [], hasMore: false }),
  getSlackInstallation: async () => null,
  getSlackMode: async () => ({
    oauth_available: true,
    install_url: "https://slack.test/install",
  }),
}));
const gate = await import("../../session/models/use-workspace-model-gate");
mock.module("../../session/models/use-workspace-model-gate", () => ({
  ...gate,
  flattenCatalog: (catalog: { models: typeof models }) => catalog.models,
}));
const connection =
  await import("../../session/models/use-model-connection-gate");
mock.module("../../session/models/use-model-connection-gate", () => ({
  ...connection,
  useModelConnectionGate: () => ({
    openConnectProvider: () => {},
    modal: null,
  }),
}));
const offer = await import("../../session/models/subscription-offer");
mock.module("../../session/models/subscription-offer", () => ({
  ...offer,
  ConnectPlanRows: () => null,
}));
const connect = await import("../projects/onboarding/connect-app");
mock.module("../projects/onboarding/connect-app", () => ({
  ...connect,
  connectApp,
}));

// The entrance animation is motion's; happy-dom cancels it with an AbortError.
const primitives = await import("../../internal/auth/auth-primitives");
mock.module("../../internal/auth/auth-primitives", () => ({
  ...primitives,
  Rise: ({ children }: { children: React.ReactNode }) => children,
}));

const { WorkspaceOnboardingWizard } =
  await import("./workspace-onboarding-wizard");
const { TestUiHost } = await import("../../test-utils/ui-host");
const { IntlTestProvider } = await import("../../test-utils/intl");
const { defaultUiMessages } = await import("../../i18n");

const host = document.createElement("div");
document.body.append(host);
const root = createRoot(host);
const onFinished = mock(() => {});

async function render(saved: OnboardingProfile = {}) {
  await act(async () =>
    root.render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <IntlTestProvider
          locale="en"
          messages={defaultUiMessages}
          onError={() => {}}
        >
          <TestUiHost viewerId="synthetic-user">
            <WorkspaceOnboardingWizard
              projectId={PROJECT}
              project={project({ onboarding: saved })}
              onFinished={onFinished}
            />
          </TestUiHost>
        </IntlTestProvider>
      </QueryClientProvider>,
    ),
  );
  await settle();
}

const settle = () =>
  act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const heading = () => host.querySelector("h1")?.textContent;
const text = () => host.textContent ?? "";
const button = (name: string) =>
  Array.from(host.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") ?? document.getElementById(b.getAttribute("aria-labelledby") ?? "")?.textContent ?? b.textContent) === name,
  );
const click = async (name: string) => {
  const target = button(name);
  if (!target)
    throw new Error(
      `no button "${name}" in: ${Array.from(host.querySelectorAll("button"))
        .map((b) => b.textContent)
        .join(" | ")}`,
    );
  await act(async () => target.click());
  await settle();
};
async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    // React tracks the last value it saw; the prototype setter bypasses that
    // tracker, so the input event reads as a change.
    const setter = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(input),
      "value",
    )!.set!;
    setter.call(input, value);
    input.dispatchEvent(
      new browser.Event("input", { bubbles: true }) as unknown as Event,
    );
    input.dispatchEvent(
      new browser.Event("change", { bubbles: true }) as unknown as Event,
    );
  });
}

afterEach(async () => {
  await act(async () => root.render(null));
  models = [];
  connectors = [];
  saveProfile.mockClear();
  stamp.mockClear();
  connectApp.mockClear();
  onFinished.mockClear();
});
afterAll(async () => {
  await act(async () => root.unmount());
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

test("a new workspace starts on the profile and moves on only after the answers are saved", async () => {
  await render();
  expect(heading()).toBe("Tell Kortix about your team");
  expect(button("Skip for now")).toBeDefined();
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-label")).toBe("Step 1 of 5");

  await click("Engineering");
  await click("11-50 people");
  await type(
    host.querySelector<HTMLInputElement>("#workspace-onboarding-domain")!,
    "https://www.Acme.com/about",
  );
  await click("Continue");

  expect(saveProfile).toHaveBeenCalledWith(PROJECT, {
    use_case: "engineering",
    company_size: "11-50",
    company_domain: "acme.com",
  });
  expect(heading()).toBe("Connect a model");
});

test("a refused profile save keeps the step and shows the reason", async () => {
  saveProfile.mockImplementationOnce(async () => {
    throw new Error("You cannot change this workspace.");
  });
  await render();
  await click("Sales");
  await click("Continue");

  expect(heading()).toBe("Tell Kortix about your team");
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(
    "Your answers were not saved. You cannot change this workspace.",
  );
});

test("a saved use case resumes on the model step; nothing connected reads as skipped, never connected", async () => {
  await render({ use_case: "founder" });
  expect(heading()).toBe("Connect a model");
  expect(text()).not.toContain("models ready");
  await click("Skip for now");

  expect(heading()).toBe("Bring your tools");
  expect(text()).not.toContain("Connected");
  await click("Skip for now");

  expect(heading()).toBe("Review and open your workspace");
  expect(text()).toContain("Team profile saved");
  expect(text()).toContain("No model connected");
  expect(text()).toContain("No apps connected");
  expect(text()).toContain("Sessions cannot run until a model is connected.");
  expect(stamp).not.toHaveBeenCalled();
});

test("a runnable model and a connected app read as connected, from the server lists", async () => {
  models = [
    { enabled: true, available: true },
    { enabled: true, available: true },
    { enabled: true, available: false },
  ];
  connectors = [
    {
      slug: "github-a1",
      name: "GitHub",
      provider: "composio",
      status: "active",
      state: "connected",
    } as AdminConnector,
  ];
  await render({ use_case: "founder" });
  expect(text()).toContain("2 models ready");
  await click("Continue");
  await click("GitHub");
  await click("Continue");
  expect(text()).toContain("Connected");
  await click("Continue");
  expect(text()).toContain("2 models ready");
  expect(text()).toContain("1 app connected");
});

test("finishing waits for the stamp: a refused stamp keeps the wizard open with the reason", async () => {
  stamp.mockImplementationOnce(async () => {
    throw new Error("Network error");
  });
  await render({ use_case: "founder" });
  await click("Skip for now");
  await click("Skip for now");
  await click("Open workspace");

  expect(stamp).toHaveBeenCalledWith(PROJECT, true);
  expect(onFinished).not.toHaveBeenCalled();
  const alerts = Array.from(host.querySelectorAll('[role="alert"]')).map(
    (alert) => alert.textContent,
  );
  expect(alerts).toContain("Setup could not be finished. Network error");

  await click("Open workspace");
  expect(stamp).toHaveBeenCalledTimes(2);
  expect(onFinished).toHaveBeenCalledTimes(1);
});

test("while the stamp is in flight Back is disabled, so a late answer cannot pull the person off another step", async () => {
  let resolveStamp!: (value: KortixProject) => void;
  stamp.mockImplementationOnce(
    () => new Promise<KortixProject>((resolve) => (resolveStamp = resolve)),
  );
  await render({ use_case: "founder" });
  await click("Skip for now");
  await click("Skip for now");
  await click("Open workspace");

  expect(button("Back")?.disabled).toBe(true);
  expect(button("Open workspace")?.getAttribute("aria-busy")).toBe("true");
  expect(onFinished).not.toHaveBeenCalled();

  await act(async () =>
    resolveStamp(project({ onboarding_completed_at: "2026-11-27T00:00:00Z" })),
  );
  await settle();
  expect(onFinished).toHaveBeenCalledTimes(1);
});

test("a profile saved with only a team size resumes past the profile and reads as saved", async () => {
  await render({ company_size: "51-200" });
  expect(heading()).toBe("Connect a model");
  await click("Skip for now");
  await click("Skip for now");
  expect(text()).toContain("Team profile saved");
});

test("selecting an app does not authorize it; setup contains only selected apps and Back preserves choices", async () => {
  await render({ use_case: "engineering" });
  await click("Skip for now");
  await click("GitHub");
  expect(connectApp).not.toHaveBeenCalled();
  await click("Continue");
  expect(heading()).toBe("Set up your selected apps");
  expect(button("Connect GitHub")).toBeDefined();
  expect(button("Connect Gmail")).toBeUndefined();
  await click("Connect GitHub");
  expect(connectApp).toHaveBeenCalledTimes(1);
  await click("Back");
  expect(host.querySelector('[aria-label="Select GitHub"]')?.getAttribute("data-state")).toBe("checked");
  await click("GitHub");
  await click("Skip for now");
  expect(heading()).toBe("Review and open your workspace");
});
