import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, mock, test } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Only replace the portal transport: render the actual modal children in SSR.
mock.module('@kortix/ui/modal', () => {
  const Box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    Modal: Box,
    ModalContent: Box,
    ModalBody: Box,
    ModalHeader: Box,
    ModalTitle: Box,
    ModalDescription: Box,
    ModalClose: Box,
    ModalFooter: Box,
    ModalTrigger: Box,
    ModalPortal: Box,
    ModalOverlay: Box,
    ModalContentInner: Box,
  };
});
mock.module('@/features/providers/auth-provider', () => ({ useAuth: () => ({ user: null }) }));
mock.module('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));
const { UpgradePlansModal } = await import('./global-upgrade-modal');

describe('open pricing dialog computer explanation', () => {
  for (const [name, props] of [
    ['plans', { hasSubscription: false }],
    ['plan-first', { hasSubscription: true }],
    ['topup-first', { reason: 'insufficient_credits' }],
    ['payment-failed', { billingState: 'payment_failed' as const }],
  ] as const) {
    test(`${name} renders a concise computer rate and separate charges`, () => {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={new QueryClient()}>
          <UpgradePlansModal open onOpenChange={() => {}} {...props} />
        </QueryClientProvider>,
      )
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ');
      expect(html).toContain('Each session runs a computer');
      expect(html).toContain('$0.11');
      expect(html).toContain('Models and storage billed separately');
      expect(html).toContain('How billing works');
      expect(html).not.toContain('including idle time');
      if (name === 'plans') expect(html).toContain('Continue on Free');
      if (name === 'payment-failed') expect(html).toContain('Update payment method');
    });
  }
});
