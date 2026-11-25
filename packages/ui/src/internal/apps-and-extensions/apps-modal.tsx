'use client';

/**
 * "Apps and extensions": every way to use Kortix outside this tab, as a
 * full-window page over the app. Its columns are the `/download` page's
 * (`GetKortixGrid`), plus the signed-in state: Chrome, This computer and MCP
 * open the dialogs that already own those flows. Every "Download app" entry
 * opens this page too.
 *
 * It is mounted once, in the project sidebar, next to its only triggers: the
 * workspace menu row, the sidebar row and `?apps=1`. Outside a project there is
 * no workspace menu and no sidebar, so `?apps=1` there does nothing.
 */

import { ArrowLeftIcon } from '@phosphor-icons/react';
import { useEffect } from 'react';

import { Button } from '../../primitives/button';
import { Modal, ModalContent, ModalDescription, ModalTitle } from '../../primitives/modal';
import { useTranslations } from '../../i18n';
import { detectPlatform } from '../lib/detect-os';
import {
  useUiPathname,
  useUiRouter,
  useUiSearchParams,
} from '../../providers/ui-provider';
import { useAppsModalStore } from '../stores/apps-modal-store';
import { GetKortixGrid } from './get-kortix-grid';

/** Opens the dialog from `?apps=1` and removes the parameter. */
export function useAppsDeepLink() {
  const params = useUiSearchParams();
  const pathname = useUiPathname();
  const router = useUiRouter();
  const wanted = params.get('apps') === '1';
  useEffect(() => {
    if (!wanted) return;
    useAppsModalStore.getState().setOpen(true);
    const next = new URLSearchParams(params.toString());
    next.delete('apps');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [wanted, params, pathname, router]);
}

export function AppsModal({
  chrome,
  onOpenComputer,
  onOpenMcp,
}: {
  /** The project's `chrome` flag: the Kortix in Chrome row shows only with it on. */
  chrome: boolean;
  onOpenComputer: () => void;
  onOpenMcp: () => void;
}) {
  const t = useTranslations('appsModal');
  const tCommon = useTranslations('common');
  const open = useAppsModalStore((state) => state.open);
  const setOpen = useAppsModalStore((state) => state.setOpen);
  useAppsDeepLink();
  // Close first, then hand over: one dialog on screen at a time.
  const hand = (next: () => void) => () => {
    setOpen(false);
    next();
  };

  return (
    <Modal open={open} onOpenChange={setOpen}>
      {/* A page, not a box: three columns with their art need the window's width.
          It fades only; a zoom on a surface the size of the viewport reads as
          the whole app lurching. */}
      <ModalContent
        side="fullscreen"
        variant="base"
        animation="none"
        showCloseButton={false}
        overlayClassName="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 duration-(--duration-moderate)"
        className="bg-background data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 inset-0 flex h-dvh max-h-none w-screen max-w-none flex-col space-y-0 rounded-none! border-0 p-0 duration-(--duration-moderate) lg:top-0 lg:left-0 lg:h-dvh lg:max-w-none lg:translate-x-0 lg:translate-y-0"
      >
        {/* The page covers the sidebar, so the desktop app's window controls
            sit over this row: `data-sidebar-collapsed` takes their indent. */}
        <header
          data-sidebar-collapsed=""
          className="kx-titlebar-row kx-titlebar-band-height flex h-12 shrink-0 items-center gap-1 border-b px-3"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={tCommon('back')}
            onClick={() => setOpen(false)}
          >
            <ArrowLeftIcon className="cn-rtl-flip size-4" />
          </Button>
          <ModalTitle className="text-sm font-medium">{t('title')}</ModalTitle>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-5 py-10 lg:py-14">
            {/* Rendered only while open, so `navigator` is never read on the server. */}
            {open ? (
              <GetKortixGrid
                platform={detectPlatform(navigator.userAgent)}
                header={
                  <ModalDescription className="text-foreground text-2xl font-medium text-balance">
                    {t('subtitle')}
                  </ModalDescription>
                }
                inApp={{
                  chrome,
                  onOpenComputer: hand(onOpenComputer),
                  onOpenMcp: hand(onOpenMcp),
                  onClose: () => setOpen(false),
                }}
              />
            ) : null}
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
