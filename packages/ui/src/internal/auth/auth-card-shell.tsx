'use client';

import { useTranslations } from '../../i18n';

/**
 * Shared quiet surface for the auth sub-flows (forgot / reset password).
 *
 * Mirrors the main `/auth` page: flat content on the plain background — no
 * card — with the Kortix mark above a left-aligned heading, and the legal
 * footer pinned to the bottom.
 */

import { CaretLeftIcon as ChevronLeft } from '@phosphor-icons/react';
import { UiLink as Link } from '../../providers/ui-provider';

import { useDesktopBackTarget } from '../desktop/desktop-back-button';
import { AuthArt } from './auth-art';
import { AuthFrameContext, AuthMobileLogo, Rise, StepHeader } from './auth-primitives';
import { openExternalRoute } from '../lib/desktop';
import { cn } from '../lib/utils';

// The phone-verification page builds its own frame around a sign-out control.
export { AuthArt };

/** Tiny legal line pinned to the bottom of every auth surface: one sentence on every page. */
export function AuthLegalFooter({ centered = false }: { centered?: boolean } = {}) {
  const t = useTranslations('auth');
  const onLegalClick = (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (openExternalRoute(href)) event.preventDefault();
  };
  const terms = (
    <Link
      href="/legal/terms"
      onClick={(event) => onLegalClick(event, '/legal/terms')}
      className="hover:text-foreground decoration-border whitespace-nowrap underline underline-offset-2 transition-colors"
    >
      {t('termsOfService')}
    </Link>
  );
  const privacy = (
    <Link
      href="/legal?tab=privacy"
      onClick={(event) => onLegalClick(event, '/legal?tab=privacy')}
      className="hover:text-foreground decoration-border whitespace-nowrap underline underline-offset-2 transition-colors"
    >
      {t('privacyPolicy')}
    </Link>
  );

  return (
    // The same 380px column as the form, so the legal line shares its left
    // edge. A link never breaks inside its name.
    <footer
      className={cn(
        'text-muted-foreground mx-auto w-full max-w-[380px] pb-8 text-xs text-balance',
        // 12px, one step under the 13px floor: the product owner asked for a quieter legal line on /auth.
        centered && 'text-center text-[0.75rem]', // audit:allow owner-requested 12px legal line
      )}
    >
      {t.rich('byContinuingYouAgree', {
        termsOfService: () => terms,
        privacyPolicy: () => privacy,
      })}
    </footer>
  );
}

/**
 * The quiet page frame every auth surface shares: mark, centered column, legal
 * footer. The frame has no sidebar and many of its screens have no in-page
 * exit; the root layout's `DesktopBackButton` is their exit on the desktop
 * shell. `backHref` tells that Back where this flow started.
 */
export function AuthFrame({
  children,
  footerVariant = 'default',
  backHref,
  // Off for now: the pane comes back by passing `art`.
  art = false,
  aside,
  centered = false,
  mark,
}: {
  children: React.ReactNode;
  /**
   * A pane left of the form on wide screens (`lg` and up), half the width.
   * The host supplies it: the Kortix sign-in page passes its story pane, a
   * branded or self-hosted frame passes nothing. Hidden below `lg`.
   */
  aside?: React.ReactNode;
  /** Centers the column: every step header, quiet-link row and the legal footer. */
  centered?: boolean;
  /** The mark every step header shows by default (the Kortix symbol on /auth). */
  mark?: React.ReactNode;
  /**
   * The dither pane beside the form on wide screens. Auth and consent screens
   * keep it; an in-app gate that only borrows this frame (a checkout, a
   * deleted-project notice, an approval card) passes `false`.
   */
  art?: boolean;
  /**
   * `none` drops the legal line. Reserve it for frames whose resolved screen is
   * not an auth surface — on a real auth flow the footer stays pinned so the
   * page does not jump when the column above it swaps.
   */
  footerVariant?: 'default' | 'none';
  /**
   * Where Back goes, when the page knows where its flow started. Without it,
   * Back returns to the previous in-app page, else the app home.
   */
  backHref?: string;
}) {
  useDesktopBackTarget(backHref);
  return (
    <div className="bg-background flex min-h-svh">
      {/* The pane stays put while a long form scrolls beside it. */}
      {aside ? <div className="sticky top-0 hidden h-svh w-1/2 shrink-0 lg:block">{aside}</div> : null}
      <div className="relative flex min-h-svh flex-1 flex-col px-6">
        <AuthMobileLogo />
        <main className="flex flex-1 flex-col items-center justify-center py-24">
          {/* The centered sign-in column is 340px wide. */}
          <div className={cn('w-full', centered ? 'max-w-[340px]' : 'max-w-[380px]')}>
            <AuthFrameContext.Provider value={{ centered, mark }}>{children}</AuthFrameContext.Provider>
          </div>
        </main>
        {footerVariant === 'none' ? null : centered ? (
          // Out of flow, so the form centres on the full height, level with
          // the story pane's headline. main's bottom padding clears it.
          <div className="absolute inset-x-0 bottom-0 px-6">
            <AuthLegalFooter centered />
          </div>
        ) : (
          <AuthLegalFooter />
        )}
      </div>
      {/* The art stays put while a long form scrolls beside it. */}
      {art ? <AuthArt className="sticky top-0 hidden h-svh w-1/2 shrink-0 lg:block" /> : null}
    </div>
  );
}

export function AuthCardShell({
  title,
  description,
  children,
  footer,
  frame,
}: {
  title: string;
  description: React.ReactNode;
  children?: React.ReactNode;
  /** Optional footer below the content (e.g. a "Back to sign in" link). */
  footer?: React.ReactNode;
  /**
   * The host's sign-in frame (story pane, centered column, app tile), so a
   * sub-flow matches the page it came from. A centered frame holds still.
   */
  frame?: {
    aside?: React.ReactNode;
    centered?: boolean;
    mark?: React.ReactNode;
  };
}) {
  const body = (
    <>
      {children}
      {footer ? <div className={cn('mt-6', frame?.centered && 'text-center')}>{footer}</div> : null}
    </>
  );
  return (
    <AuthFrame
      aside={frame?.aside}
      centered={frame?.centered}
      mark={frame?.mark}
    >
      {frame?.centered ? (
        <>
          <StepHeader title={title} description={description} />
          {body}
        </>
      ) : (
        <>
          <Rise>
            <StepHeader title={title} description={description} />
          </Rise>
          <Rise delay={0.06}>{body}</Rise>
        </>
      )}
    </AuthFrame>
  );
}

/** Consistent "Back to sign in" link used across the auth sub-flows. */
export function BackToSignIn() {
  const t = useTranslations('auth');
  return (
    <Link
      href="/auth"
      className="text-muted-foreground hover:text-foreground -m-2 inline-flex items-center gap-1 rounded-sm p-2 text-sm transition-colors"
    >
      <ChevronLeft className="size-4" />
      {t('backToSignIn')}
    </Link>
  );
}
