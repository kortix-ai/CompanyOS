import { describe, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

// KRTX-4802: opening a CLI login link (`/cli/authorize?user_code=…`) must show
// the login code already in the field — the link carries it, so retyping it by
// hand is the bug. The field stays editable, and the prefilled value alone
// enables the Authorize button. A link with no code keeps rendering the
// start-from-CLI screen with no field at all.

// The page reads the signed-in user, the router's search params and the
// workspace directory. Mock the three at their module boundary the way
// `chat-identity-connect.test.tsx` does; `CliAuthorizeInner` then renders its
// device-approval form synchronously.
const auth = { user: { email: 'member@example.com' }, isLoading: false };
mock.module('@/features/providers/auth-provider', () => ({ useAuth: () => auth }));

const navigation = await import('next/navigation');
let params = new URLSearchParams();
mock.module('next/navigation', () => ({
  ...navigation,
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  useSearchParams: () => params,
}));

const syntheticRow = {
  workspaceId: 'w-synthetic',
  accountId: 'a-synthetic',
  project: { id: 'w-synthetic', name: 'Synthetic Workspace', icon: null, icon_glyph: null },
  accountName: 'Synthetic',
  role: 'owner',
  state: 'active',
};
mock.module('@kortix/ui/workspace/sidebar/use-workspace-directory', () => ({
  useWorkspaceDirectory: () => ({
    accounts: [],
    workspaces: [syntheticRow],
    openable: [syntheticRow],
    loading: false,
    failedAccountIds: [],
    reusableAccount: null,
    githubSourceAccount: null,
    retryFailed: () => {},
  }),
}));

mock.module('@kortix/sdk', () => ({
  approveCliDevice: async () => ({}),
  createAccountToken: async () => ({}),
  isNoWorkspaceError: () => false,
  revokeAccountToken: async () => ({}),
}));

const { default: CliAuthorizePage } = await import('./page');

/** The device-approval submit button, or undefined when the page is not on the approval form. */
function submitButton(html: string): string | undefined {
  return /<button[^>]*type="submit"[\s\S]*?<\/button>/.exec(html)?.[0];
}

/** React renders a disabled button as `disabled=""`; the Tailwind `disabled:*`
 *  classes in the class list never match the attribute form. */
const disabledAttribute = /\sdisabled="/;

describe('the CLI authorize page prefills the login code from its link', () => {
  test('a user_code link shows the code in the field and enables Authorize', () => {
    params = new URLSearchParams(`user_code=${encodeURIComponent('ab12-cd34-ef56-7890')}`);
    const html = renderToStaticMarkup(<CliAuthorizePage />);

    const field = /<input[^>]*id="cli-user-code"[^>]*>/.exec(html)?.[0];
    expect(field).toBeDefined();
    expect(field).toContain('value="ab12-cd34-ef56-7890"');

    const button = submitButton(html);
    expect(button).toBeDefined();
    expect(button).not.toMatch(disabledAttribute);
  });

  test('a code in any case or dash layout normalizes to the URL code', () => {
    // The page compares `normalizeCliCode(typed)` with `normalizeCliCode(user_code)`,
    // so a prefilled code also matches when the CLI sent a mixed-case form.
    params = new URLSearchParams(`user_code=${encodeURIComponent('AB12CD34EF567890')}`);
    const html = renderToStaticMarkup(<CliAuthorizePage />);

    const field = /<input[^>]*id="cli-user-code"[^>]*>/.exec(html)?.[0];
    expect(field).toBeDefined();
    expect(field).toContain('value="AB12CD34EF567890"');
    expect(submitButton(html)).not.toMatch(disabledAttribute);
  });

  test('a link with no user_code renders no login-code field at all', () => {
    params = new URLSearchParams();
    const html = renderToStaticMarkup(<CliAuthorizePage />);

    expect(html).not.toContain('cli-user-code');
    expect(submitButton(html)).toBeUndefined();
  });
});
