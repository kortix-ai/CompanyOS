'use client';

/**
 * Every way to use Kortix outside this tab, in three columns: Desktop app,
 * Mobile app and Developers. The public `/download` page and the in-app "Apps
 * and extensions" page both render THIS, so the two surfaces are one design.
 *
 * Each column is a square art pane (`surface-art.tsx`, the only colour on the
 * page), a name and a list of text links. The page has one solid button: the
 * download for the visitor's own system, beside the page's heading.
 *
 * Without `inApp` every action is public: an installer, a store, a link. With
 * it, Kortix in Chrome, This computer and MCP show their live state and open
 * the flows that already own them: Settings → Kortix in Chrome, the computer
 * dialog, the MCP dialog. Nothing here pairs or connects by itself.
 */

import { useChromeConnections } from '@kortix/sdk/react';
import { useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';

import { useTranslations } from '../../i18n';
import { Button } from '../../primitives/button';
import { errorToast } from '../../primitives/toast';
import { UiLink as Link, useUiHostConfig } from '../../providers/ui-provider';
import { ChromeOnlineDot } from '../chrome/chrome-connect';
import { chromeCounts } from '../chrome/chrome-names';
import { KORTIX_EXTENSION_STORE_URL } from '../chrome/extension';
import { useCopy } from '../hooks/use-copy';
import { AppleMark } from '../icons/apple';
import { PlayStoreMark } from '../icons/playstore';
import { DESKTOP_ORDER, isMobilePlatform, type DesktopOs, type Platform } from '../lib/detect-os';
import { desktopDownloadUrl, isDesktop } from '../lib/desktop';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '../lib/mobile-store-urls';
import { useDeploymentCliInstallCommand } from '../lib/use-deployment-cli-install-command';
import { cn } from '../lib/utils';
import { useSettingsPanelStore } from '../stores/settings-panel-store';
import { useOwnsPairedComputer } from '../tunnel/computer-connect';
import {
  DesktopArt,
  MobileArt,
  SurfaceHoverContext,
  TerminalArt,
  useSurfaceChalk,
  type SurfaceId,
} from './surface-art';

/**
 * Operating system and device names are product names: never translated.
 * `meta` says what the installer is. Linux ships x86_64 only, so an ARM
 * visitor reads that before downloading a binary that will not run.
 */
const DESKTOP_ROWS: Record<DesktopOs, { name: string; meta: string }> = {
  macos: { name: 'macOS', meta: 'Universal' },
  windows: { name: 'Windows', meta: '64-bit' },
  linux: { name: 'Linux', meta: 'AppImage · x86_64' },
};

/** The MCP setup guide, for a visitor who is not signed in. */
export const MCP_GUIDE_HREF = '/docs/guide#other-ai-tools-mcp';

/** Where a signed-out visitor pairs a computer: the app routes them through sign-in. */
const COMPUTER_SETTINGS_HREF = '/settings/computer';

export interface GetKortixInApp {
  /** The project's `chrome` flag: the Kortix in Chrome row shows only with it on. */
  chrome: boolean;
  onOpenComputer: () => void;
  onOpenMcp: () => void;
  /** Closes the page before another dialog opens. */
  onClose: () => void;
}

export function GetKortixGrid({
  platform,
  inApp,
  header,
  className,
}: {
  /** The visitor's platform: picks the one solid download button. */
  platform: Platform;
  inApp?: GetKortixInApp;
  /** The page's heading, set beside the download button. */
  header: ReactNode;
  className?: string;
}) {
  const t = useTranslations('appsModal');
  // In the desktop app itself there is nothing to download.
  const inDesktopApp = Boolean(inApp) && typeof window !== 'undefined' && isDesktop();
  const showChrome = inApp ? inApp.chrome : true;
  return (
    <div className={cn('flex flex-col gap-10 lg:gap-12', className)}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">{header}</div>
        {inDesktopApp ? null : <PrimaryDownload platform={platform} />}
      </div>
      <div className="grid gap-x-6 gap-y-12 md:grid-cols-3">
        <Column surface="desktop" name={t('computer.desktop')} art={<DesktopArt />}>
          {inDesktopApp ? (
            <li className="text-muted-foreground text-sm">{t('computer.desktopRunning')}</li>
          ) : (
            <DesktopLinks />
          )}
        </Column>
        <Column surface="mobile" name={t('mobile.name')} art={<MobileArt />}>
          <MobileLinks />
        </Column>
        <Column surface="terminal" name={t('developers.title')} art={<TerminalArt />}>
          <TerminalLink />
          {inApp ? <McpLiveLink onOpen={inApp.onOpenMcp} /> : <McpPublicLink />}
          {showChrome ? inApp ? <ChromeLiveLink onClose={inApp.onClose} /> : <ChromePublicLink /> : null}
          {inApp ? <ComputerLiveLink onOpen={inApp.onOpenComputer} /> : <ComputerPublicLink />}
        </Column>
      </div>
    </div>
  );
}

/**
 * The page's one solid button: the installer for the visitor's own desktop
 * system, or the store for their phone.
 */
function PrimaryDownload({ platform }: { platform: Platform }) {
  const t = useTranslations('appsModal.desktop');
  const tStore = useTranslations('mobileAppPromo');
  if (isMobilePlatform(platform)) {
    const ios = platform === 'ios';
    const Mark = ios ? AppleMark : PlayStoreMark;
    return (
      <Button asChild className="shrink-0 self-start sm:self-auto">
        <a href={ios ? APP_STORE_URL : GOOGLE_PLAY_URL} target="_blank" rel="noopener noreferrer">
          <Mark className="size-4" />
          {tStore(ios ? 'appStore' : 'googlePlay')}
        </a>
      </Button>
    );
  }
  return (
    <Button asChild className="shrink-0 self-start sm:self-auto">
      <a href={desktopDownloadUrl(platform)}>
        {platform === 'macos' ? <AppleMark className="size-4" /> : null}
        {t('downloadFor', { os: DESKTOP_ROWS[platform].name })}
      </a>
    </Button>
  );
}

/**
 * One column: the art pane, square, edged in the surface's chalk hue at all
 * times; then the name and the links. The pane's dither wakes while the
 * pointer is anywhere over the column.
 */
function Column({
  surface,
  name,
  art,
  children,
}: {
  surface: SurfaceId;
  name: string;
  art: ReactNode;
  children: ReactNode;
}) {
  const chalk = useSurfaceChalk(surface);
  const [hovered, setHovered] = useState(false);
  return (
    <section
      aria-label={name}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className="flex min-w-0 flex-col"
    >
      <div
        style={{ borderColor: chalk.border, boxShadow: `0 0 0 3px ${chalk.ring}` }}
        className="flex aspect-square flex-col overflow-hidden rounded-lg border [&>*]:flex-1"
      >
        <SurfaceHoverContext.Provider value={hovered}>{art}</SurfaceHoverContext.Provider>
      </div>
      <h3 className="text-foreground mt-6 text-xl font-medium">{name}</h3>
      <ul className="mt-4 flex flex-col items-start gap-2.5">{children}</ul>
    </section>
  );
}

/** The underlined name, then what the row is or does, quiet. */
function RowLabel({ name, meta }: { name: string; meta?: ReactNode }) {
  return (
    <>
      <span className="text-foreground decoration-border group-hover:decoration-foreground underline underline-offset-4 transition-colors">
        {name}
      </span>
      {meta ? <span className="text-muted-foreground flex items-center gap-1.5">{meta}</span> : null}
    </>
  );
}

const ROW =
  'group focus-visible:ring-ring inline-flex items-center gap-2 rounded-sm text-left text-sm focus-visible:ring-2 focus-visible:outline-none';

type RowProps = { name: string; meta?: ReactNode };

function RowAnchor({ name, meta, ...props }: RowProps & ComponentPropsWithoutRef<'a'>) {
  return (
    <li>
      <a className={ROW} {...props}>
        <RowLabel name={name} meta={meta} />
      </a>
    </li>
  );
}

function RowButton({ name, meta, ...props }: RowProps & ComponentPropsWithoutRef<'button'>) {
  return (
    <li>
      <button type="button" className={ROW} {...props}>
        <RowLabel name={name} meta={meta} />
      </button>
    </li>
  );
}

function RowRoute({ name, meta, href }: RowProps & { href: string }) {
  return (
    <li>
      <Link href={href} className={ROW}>
        <RowLabel name={name} meta={meta} />
      </Link>
    </li>
  );
}

function DesktopLinks() {
  const t = useTranslations('appsModal.desktop');
  return DESKTOP_ORDER.map((os) => (
    <RowAnchor
      key={os}
      href={desktopDownloadUrl(os)}
      aria-label={t('downloadFor', { os: DESKTOP_ROWS[os].name })}
      name={DESKTOP_ROWS[os].name}
      meta={DESKTOP_ROWS[os].meta}
    />
  ));
}

function MobileLinks() {
  const tStore = useTranslations('mobileAppPromo');
  return (
    <>
      <RowAnchor
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        name="iPhone"
        meta={tStore('appStore')}
      />
      <RowAnchor
        href={GOOGLE_PLAY_URL}
        target="_blank"
        rel="noopener noreferrer"
        name="Android"
        meta={tStore('googlePlay')}
      />
    </>
  );
}

/** Copies the install command for THIS deployment. */
function TerminalLink() {
  const t = useTranslations('appsModal.developers');
  const command = useDeploymentCliInstallCommand(useUiHostConfig().deploymentVersion);
  const { copy, copied } = useCopy({ toast: false });
  return (
    <RowButton
      name={t('cli')}
      meta={copied ? t('copied') : t('copy')}
      onClick={async () => {
        if (!(await copy(command))) errorToast(t('copyFailed'));
      }}
    />
  );
}

function McpPublicLink() {
  const t = useTranslations('appsModal.developers');
  return <RowRoute href={MCP_GUIDE_HREF} name={t('mcp')} meta={t('guide')} />;
}

function McpLiveLink({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('appsModal.developers');
  return <RowButton name={t('mcp')} meta={t('connect')} aria-label={t('connectLabel')} onClick={onOpen} />;
}

function ChromePublicLink() {
  const t = useTranslations('appsModal.chrome');
  const tChrome = useTranslations('chrome');
  return (
    <RowAnchor
      href={KORTIX_EXTENSION_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      name={t('name')}
      meta={tChrome('addToChrome')}
    />
  );
}

/** Settings → Kortix in Chrome owns install, connect and every browser. */
function ChromeLiveLink({ onClose }: { onClose: () => void }) {
  const t = useTranslations('appsModal.chrome');
  const connections = useChromeConnections();
  const { count, online } = chromeCounts(connections.data ?? []);
  return (
    <RowButton
      name={t('name')}
      aria-label={count > 0 ? t('manageLabel') : undefined}
      meta={
        count > 0 ? (
          <>
            <ChromeOnlineDot online={online > 0} />
            {t('summary', { count, online })}
          </>
        ) : (
          t('connect')
        )
      }
      onClick={() => {
        onClose();
        useSettingsPanelStore.getState().openSettings('chrome');
      }}
    />
  );
}

function ComputerPublicLink() {
  const t = useTranslations('appsModal.computer');
  return <RowRoute href={COMPUTER_SETTINGS_HREF} name={t('thisComputer')} meta={t('connect')} />;
}

function ComputerLiveLink({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('appsModal.computer');
  const { owned } = useOwnsPairedComputer();
  const live = owned.some((machine) => machine.isLive);
  return (
    <RowButton
      name={t('thisComputer')}
      aria-label={t(live ? 'manageLabel' : 'connectLabel')}
      meta={
        live ? (
          <>
            <ChromeOnlineDot online />
            {t('connected')}
          </>
        ) : (
          t('connect')
        )
      }
      onClick={onOpen}
    />
  );
}
