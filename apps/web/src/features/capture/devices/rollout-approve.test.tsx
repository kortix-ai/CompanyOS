import { afterEach, expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import type { Container, Root } from 'react-dom/client';
import type { CaptureEnrollment } from '@kortix/sdk';

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
const win = new Window();
const globals = globalThis as Record<string, unknown>;
globals.window = win;
globals.document = win.document;
globals.navigator = win.navigator;
globals.location = win.location;
globals.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
globals.cancelAnimationFrame = (id: number) => clearTimeout(id);
globals.getComputedStyle = win.getComputedStyle.bind(win);
for (const key of Object.getOwnPropertyNames(win)) {
  if (/^[A-Z]/.test(key) && (!(key in globals) || key.endsWith('Event'))) {
    globals[key] = Reflect.get(win, key);
  }
}
const { createRoot } = await import('react-dom/client');

const approved = mock((_args: unknown) => {});
const denied = mock((_args: unknown) => {});
const enrollment = {
  enrollment_id: 'enr-1', user_id: 'user-2', principal_name: 'Person Two', account_name: null,
  token_name: 'Setup token', last_seen_at: '2026-11-10T10:00:00.000Z',
  device: { name: 'Work laptop' },
} as unknown as CaptureEnrollment;

const realSdkReact = await import('@kortix/sdk/react');
mock.module('@kortix/sdk/react', () => ({
  ...realSdkReact,
  useCaptureEnrollments: () => ({ data: { enrollments: [enrollment] } }),
  useApproveCaptureEnrollment: () => ({ mutate: approved, isPending: false }),
  useDenyCaptureEnrollment: () => ({ mutate: denied, isPending: false }),
}));
const realCaptureArea = await import('@kortix/ui/internal/capture/use-capture-area');
mock.module('@kortix/ui/internal/capture/use-capture-area', () => ({
  ...realCaptureArea,
  useCaptureDirectory: () => ({ members: [{ user_id: 'user-2', email: 'two@example.test' }] }),
}));
const { WaitingComputers } = await import('./rollout');

const container = win.document.createElement('div');
win.document.body.append(container);
let root: Root = createRoot(container as unknown as Container);

afterEach(async () => {
  await act(async () => root.unmount());
  container.replaceChildren();
  root = createRoot(container as unknown as Container);
  approved.mockClear();
  denied.mockClear();
});
const buttons = (label: string) =>
  [...win.document.body.querySelectorAll('button')].filter((b) => b.textContent?.trim() === label);

test('a pending enrollment shows above the device list and approves with its preselected person', async () => {
  await act(() => root.render(<WaitingComputers accountId="account-1" />));
  expect(win.document.body.textContent).toContain('Person Two');
  expect(win.document.body.textContent).toContain('Work laptop');
  const rowApprove = buttons('Approve')[0];
  if (!rowApprove) throw new Error('missing the row approve button');
  await act(() => rowApprove.click());
  // The modal is open: its footer carries the second Approve.
  const modalApprove = buttons('Approve')[1];
  if (!modalApprove) throw new Error('missing the modal approve button');
  await act(() => modalApprove.click());
  expect(approved).toHaveBeenCalledTimes(1);
  expect(approved.mock.calls[0]?.[0]).toEqual({ enrollmentId: 'enr-1', userId: 'user-2' });
  expect(denied).not.toHaveBeenCalled();
});

test('deny asks first: the row button opens a confirm, not a mutation', async () => {
  await act(() => root.render(<WaitingComputers accountId="account-1" />));
  const deny = buttons('Deny')[0];
  if (!deny) throw new Error('missing the deny button');
  await act(() => deny.click());
  expect(denied).not.toHaveBeenCalled();
  const confirm = buttons('Deny')[1];
  if (!confirm) throw new Error('missing the deny confirm button');
  await act(() => confirm.click());
  expect(denied).toHaveBeenCalledTimes(1);
  expect(denied.mock.calls[0]?.[0]).toBe('enr-1');
  expect(approved).not.toHaveBeenCalled();
});
