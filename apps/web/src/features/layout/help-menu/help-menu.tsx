'use client';

/**
 * The help button at the foot of the project sidebar, and its menu: the
 * places a person goes to get unstuck (Docs, Support, Keyboard shortcuts,
 * Status), the two app-level actions people look for next to them (Download
 * apps, Preferences), the community, and the newest changelog weeks.
 *
 * Docs and Support come from `HELP_LINKS`, the list the workspace menu's Help
 * submenu reads, so the two entry points cannot drift apart.
 *
 * Every navigating row is a real `<a target="_blank">`, like the Help
 * submenu (see `HelpSubmenu` for why). In the desktop shell
 * `openExternalRoute` hands the URL to the system browser first.
 */

import { useQuery } from '@tanstack/react-query';
import {
  DiscordLogoIcon,
  KeyboardIcon,
  LaptopIcon,
  PulseIcon,
  QuestionIcon,
  SlidersHorizontalIcon,
} from '@phosphor-icons/react';
import * as React from 'react';
import { useState } from 'react';

import { Button } from '@kortix/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@kortix/ui/dropdown-menu';
import Hint from '@kortix/ui/hint';
import { SidebarContext } from '@kortix/ui/sidebar';
import { useLocalizedUiCatalog } from '@kortix/ui/i18n';
import { openExternalRoute } from '@kortix/ui/internal/lib/desktop';
import { cn, useIsMobile } from '@kortix/ui';
import { useSettingsPanelStore } from '@kortix/ui/internal/stores/settings-panel-store';
import { type SettingsTab } from '@kortix/ui/customize/settings/settings-tabs';

import { HELP_LINKS } from '@/features/layout/user-menu-shared';
import { getEnv } from '@/lib/env-config';
import { settingsShortcutLabel } from '@/features/workspace/settings/settings-shortcut';
import { useTranslations } from '@/i18n/use-translations';

import { CHANGELOG_PATH, WHATS_NEW_PATH, parseWhatsNew, type WhatsNew } from './whats-new';

export const STATUS_URL = 'https://status.kortix.com';
export const COMMUNITY_URL = 'https://discord.com/invite/RvFhXUdZ9H';

/** The changelog changes at most a few times a week; the route caches for an hour. */
const WHATS_NEW_STALE_MS = 30 * 60 * 1000;

async function fetchWhatsNew(): Promise<WhatsNew> {
  const response = await fetch(WHATS_NEW_PATH, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${WHATS_NEW_PATH} responded ${response.status}`);
  return parseWhatsNew(await response.json());
}

/**
 * Read on first open, not on mount: the sidebar renders on every page, and
 * most visits never open this menu.
 */
function useWhatsNew(enabled: boolean) {
  return useQuery({
    queryKey: ['help-menu', 'whats-new'],
    queryFn: fetchWhatsNew,
    enabled,
    staleTime: WHATS_NEW_STALE_MS,
    retry: 1,
  });
}

/**
 * A row that leaves the app. A real anchor, so cmd-click and middle-click
 * work and no popup blocker can eat it.
 */
function LinkRow({
  href,
  onNavigate,
  className,
  children,
}: {
  href: string;
  onNavigate: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenuItem asChild className={className}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          if (openExternalRoute(href)) event.preventDefault();
          onNavigate();
        }}
      >
        {children}
      </a>
    </DropdownMenuItem>
  );
}

/**
 * One stop on the "What's new" line. The line runs through the centre of the
 * icon slot (`left-4` = the row's `px-2` + half the `size-4` slot), from the
 * row's top to its bottom, so adjacent rows join into one line. The first row
 * starts it at its dot and the last row ends it there.
 */
function TimelineMark({ position }: { position: 'first' | 'middle' | 'last' | 'only' }) {
  return (
    <>
      {position === 'only' ? null : (
        <span
          aria-hidden
          className={cn(
            'bg-border pointer-events-none absolute left-4 w-px -translate-x-1/2',
            position === 'first' && 'top-1/2 bottom-0',
            position === 'middle' && 'inset-y-0',
            position === 'last' && 'top-0 bottom-1/2',
          )}
        />
      )}
      <span aria-hidden className="relative flex size-4 shrink-0 items-center justify-center">
        <span className="bg-muted-foreground size-1.5 rounded-full" />
      </span>
    </>
  );
}

function timelinePosition(index: number, count: number) {
  if (count === 1) return 'only' as const;
  if (index === 0) return 'first' as const;
  if (index === count - 1) return 'last' as const;
  return 'middle' as const;
}

export function HelpMenu({ onOpenDownloadApp }: { onOpenDownloadApp?: () => void }) {
  const t = useTranslations('helpMenu');
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  // A self-host with the landing page off bounces /contact and /changelog to
  // the app, and status.kortix.com is not its status: those rows go.
  const [cloud] = useState(() => !getEnv().DISABLE_LANDING_PAGE);
  const helpLinks = useLocalizedUiCatalog(HELP_LINKS).filter(
    (link) => cloud || !link.href.startsWith('/contact'),
  );
  const whatsNew = useWhatsNew(cloud && requested);
  // A phone has no keyboard: no shortcuts row and no keycap (KRTX-2005).
  const isMobile = useIsMobile();
  const sidebar = React.useContext(SidebarContext);

  // The collapsed sidebar's hover flyout would retract when the pointer
  // enters this portaled menu. Pin it while the menu is open.
  React.useEffect(() => {
    if (!open) return;
    sidebar?.holdPeek(true);
    return () => sidebar?.holdPeek(false);
  }, [open, sidebar]);

  const close = () => setOpen(false);
  // Open a dialog after the menu has closed, so focus returns to the page
  // before the dialog takes it. On a phone the sidebar sheet closes first,
  // or closing the dialog would reveal it again.
  const afterClose = (fn: () => void) => {
    close();
    if (isMobile) sidebar?.setOpenMobile(false);
    requestAnimationFrame(() => fn());
  };
  const openSettings = (tab?: SettingsTab) =>
    afterClose(() => useSettingsPanelStore.getState().openSettings(tab));

  // The changelog rows, then "Full changelog" as the line's last stop.
  const showChangelog = cloud && whatsNew.data?.enabled !== false;
  const weeks = whatsNew.data?.weeks ?? [];
  const stops = weeks.length + 1;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setRequested(true);
      }}
    >
      <Hint side="top" label={t('trigger')}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('trigger')}
            // Warm the list on intent, so it is there when the menu opens.
            onPointerEnter={() => setRequested(true)}
            onFocus={() => setRequested(true)}
            className="text-muted-foreground hover:text-foreground data-[state=open]:text-foreground shrink-0"
          >
            <QuestionIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent side="top" align="start" sideOffset={6} className="max-h-(--available-height) w-[300px] overflow-y-auto">
        <DropdownMenuGroup>
          {helpLinks.map(({ label, href, Icon }) => (
            <LinkRow key={href} href={href} onNavigate={close}>
              <Icon />
              {label}
            </LinkRow>
          ))}
          {isMobile ? null : (
            <DropdownMenuItem onSelect={() => openSettings('preferences')}>
              <KeyboardIcon />
              {t('shortcuts')}
            </DropdownMenuItem>
          )}
          {cloud ? (
            <LinkRow href={STATUS_URL} onNavigate={close}>
              <PulseIcon />
              {t('status')}
            </LinkRow>
          ) : null}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {onOpenDownloadApp ? (
            <DropdownMenuItem onSelect={() => afterClose(onOpenDownloadApp)}>
              <LaptopIcon />
              {t('downloadApps')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => openSettings()}>
            <SlidersHorizontalIcon />
            {t('preferences')}
            {isMobile ? null : (
              <DropdownMenuShortcut>{settingsShortcutLabel()}</DropdownMenuShortcut>
            )}
          </DropdownMenuItem>
          <LinkRow href={COMMUNITY_URL} onNavigate={close}>
            <DiscordLogoIcon />
            {t('community')}
          </LinkRow>
        </DropdownMenuGroup>

        {showChangelog ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('whatsNew')}</DropdownMenuLabel>
              {weeks.map((week, index) => (
                <LinkRow key={week.slug} href={week.href} onNavigate={close}>
                  <TimelineMark position={timelinePosition(index, stops)} />
                  <span className="min-w-0 flex-1 truncate">{week.title}</span>
                </LinkRow>
              ))}
              <LinkRow href={CHANGELOG_PATH} onNavigate={close}>
                <TimelineMark position={timelinePosition(stops - 1, stops)} />
                {t('fullChangelog')}
              </LinkRow>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
