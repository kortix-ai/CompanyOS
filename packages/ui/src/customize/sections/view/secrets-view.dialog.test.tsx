import { afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import type { Root } from 'react-dom/client';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
const win = new Window();
for (const name of ['HTMLTextAreaElement', 'window', 'document', 'navigator', 'location', 'history', 'localStorage', 'Event', 'CustomEvent', 'FocusEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent']) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? win : Reflect.get(win, name) });
}
Object.defineProperty(globalThis, 'getComputedStyle', { configurable: true, value: win.getComputedStyle.bind(win) });
const { createRoot } = await import('react-dom/client');
const sdk = await import('@kortix/sdk');
const writes: Parameters<typeof sdk.setProjectSecretStrategy>[] = [];
let policy: NonNullable<import('./secrets-view').SecretRow['egressPolicy']>;
mock.module('@kortix/sdk', () => ({
  ...sdk,
  listConnectors: async () => ({ connectors: [] }),
  getProjectDetail: async () => ({ project: { name: 'Synthetic project' } }),
  setProjectSecretStrategy: async (...args: Parameters<typeof sdk.setProjectSecretStrategy>) => {
    writes.push(args);
    if (args[3]?.egress_policy) policy = args[3].egress_policy;
    return undefined;
  },
}));
const sdkReact = await import('@kortix/sdk/react');
mock.module('@kortix/sdk/react', () => ({
  ...sdkReact,
  useProjectConfig: () => ({ agents: [] }),
  useProjectAccountId: () => null,
  refreshProjectProviderState: () => undefined,
}));
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const { IntlTestProvider } = await import('../../../test-utils/intl');
const { ProjectSecretDialog, SecretTableRow } = await import('./secrets-view');
const { renderToStaticMarkup } = await import('react-dom/server');

function row(): import('./secrets-view').SecretRow {
  return {
    identifier: 'EXAMPLE_API_KEY', key: 'EXAMPLE_API_KEY', requirement: 'optional',
    configured: true, system: false, readonly: false, purpose: null, canRotate: false,
    updatedAt: null, strategy: 'egress', consumer: 'network', deliveryStatus: 'available',
    egressPolicy: policy, requiresRotation: false, deliveryBlockedReason: null,
    sharedWith: [], usable: true, undecryptable: false, mineUndecryptable: false,
  };
}
let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <IntlTestProvider><ProjectSecretDialog projectId="synthetic-project" row={row()} open onOpenChange={() => {}} /></IntlTestProvider>
    </QueryClientProvider>);
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  writes.length = 0;
});
function field(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLTextAreaElement)) throw new Error(`Missing textarea ${id}`);
  return element;
}
function saveButton() {
  const button = [...document.querySelectorAll('button')].find((element) => element.type === 'submit');
  if (!button) throw new Error('Missing Save button');
  return button;
}

test('host-only editor change saves through the SDK adapter and reopens with the stored policy', async () => {
  policy = { rules: [{ host: 'original.example.test' }], tls: 'terminate', on_no_match: 'deny' };
  await mount();
  expect(field('secret-dialog-hosts').value).toBe('original.example.test');
  const value = document.getElementById('secret-dialog-value');
  expect(value).toBeInstanceOf(win.HTMLInputElement);
  expect(Reflect.get(value ?? {}, 'value')).toBe('');
  expect(saveButton().disabled).toBe(true);
  await act(async () => {
    const input = field('secret-dialog-hosts');
    Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value')?.set?.call(input, 'first.example.test\nsecond.example.test');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(saveButton().disabled).toBe(false);
  await act(async () => saveButton().click());
  expect(writes).toHaveLength(1);
  expect(writes[0]).toEqual(['synthetic-project', 'EXAMPLE_API_KEY', 'egress', {
    consumer: 'network', egress_policy: { rules: [{ host: 'first.example.test' }, { host: 'second.example.test' }], tls: 'terminate', on_no_match: 'deny' },
  }]);
  await act(async () => root?.unmount());
  root = undefined;
  host?.remove();
  await mount();
  expect(field('secret-dialog-hosts').value).toBe('first.example.test\nsecond.example.test');
  expect(saveButton().disabled).toBe(true);
});

test('an unauthorized member has no edit or delete action for an enforced secret', () => {
  policy = { rules: [{ host: 'original.example.test' }], tls: 'terminate', on_no_match: 'deny' };
  const noop = () => {};
  const html = renderToStaticMarkup(<table><tbody><SecretTableRow row={row()} canManage={false}
    viewerId={null} busy={false} deletingMine={false} onEdit={noop} onDelete={noop} onDeleteMine={noop} />
  </tbody></table>);
  expect(html).toContain('EXAMPLE_API_KEY');
  expect(html).not.toContain('<button');
});
