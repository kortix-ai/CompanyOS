'use client';

/**
 * Every way to use Kortix outside this tab: Desktop app, Mobile app, Kortix
 * in Chrome, This computer, Terminal (CLI) and MCP. The public `/download`
 * page and the in-app "Apps and extensions" page both render THIS, so the two
 * surfaces are one design.
 *
 * The desktop app leads, in one wide card. Mobile and Chrome follow as a
 * pair, then the computer and the two developer surfaces as a row of three.
 * Each card is text and actions over (or beside) its art pane
 * (`surface-art.tsx`), which holds the only colour on the page.
 *
 * Without `inApp` every action is public: an installer, a store, a link. With
 * it, Chrome, This computer and MCP show their live state and open the flows
 * that already own them: Settings → Kortix in Chrome, the computer dialog,
 * the MCP dialog. Nothing here pairs or connects by itself.
 */

import { useChromeConnections } from '@kortix/sdk/react';
import { useRef, useState, type ComponentType, type ReactNode } from 'react';

import { useTranslations } from '../../i18n';
import { Button } from '../../primitives/button';
import { errorToast } from '../../primitives/toast';
import { UiImage, UiLink as Link, useUiHostConfig } from '../../providers/ui-provider';
import { ChromeCopyLink, ChromeInstallActions, ChromeOnlineDot, useChromeConnect } from '../chrome/chrome-connect';
import { chromeCardState } from '../chrome/chrome-card-state';
import { chromeCounts } from '../chrome/chrome-names';
import { KORTIX_EXTENSION_STORE_URL } from '../chrome/extension';
import { MobileStoreQr } from '../components/mobile-store-qr';
import { DESKTOP_ORDER, isMobilePlatform, type DesktopOs, type Platform } from '../lib/detect-os';
import { desktopDownloadUrl, isDesktop } from '../lib/desktop';
import { cn } from '../lib/utils';
import { APP_STORE_URL, GOOGLE_PLAY_URL } from '../lib/mobile-store-urls';
import { useCopy } from '../hooks/use-copy';
import { SolidCheckIcon } from '../icons/solid-check-icon';
import { useDeploymentCliInstallCommand } from '../lib/use-deployment-cli-install-command';
import { useSettingsPanelStore } from '../stores/settings-panel-store';
import { useOwnsPairedComputer } from '../tunnel/computer-connect';
import { AppleMark } from '../icons/apple';
import { YouCursor } from './chrome-demo';
import { PlayStoreMark } from '../icons/playstore';
import {
  type SurfaceId,
  useSurfaceChalk,
  ChromeArt,
  ComputerArt,
  DesktopArt,
  McpArt,
  MobileArt,
  SurfaceHoverContext,
  TerminalArt,
} from './surface-art';

type Mark = ComponentType<{ className?: string }>;

/**
 * The official Windows and Linux (Tux) marks, in their own colours: static
 * files the web host serves from `apps/web/public/images/platforms`.
 */
const platformMark = (src: string): Mark =>
  function PlatformMark({ className }) {
    return <UiImage src={src} alt="" width={20} height={20} unoptimized className={cn('object-contain', className)} />;
  };
const WindowsMark = platformMark('/images/platforms/windows.svg');
const LinuxMark = platformMark('/images/platforms/linux.svg');

/** Operating system and device names are product names: never translated. */
/**
 * `meta` says what the installer is. macOS ships one universal build; Linux
 * ships x86_64 only, so an ARM visitor reads that before downloading a binary
 * that will not run.
 */
const DESKTOP_ROWS: Record<DesktopOs, { name: string; meta: string; Mark: Mark }> = {
  macos: { name: 'macOS', meta: 'Universal', Mark: AppleMark },
  windows: { name: 'Windows', meta: '64-bit', Mark: WindowsMark },
  linux: { name: 'Linux', meta: 'AppImage · x86_64', Mark: LinuxMark },
};

/** The MCP setup guide, for a visitor who is not signed in. */
export const MCP_GUIDE_HREF = '/docs/guide#other-ai-tools-mcp';

/** Where a signed-out visitor pairs a computer: the app routes them through sign-in. */
const COMPUTER_SETTINGS_HREF = '/settings/computer';

export interface GetKortixInApp {
  /** The project's `chrome` flag: the Chrome card shows only with it on. */
  chrome: boolean;
  onOpenComputer: () => void;
  onOpenMcp: () => void;
  /** Closes the page before another dialog opens. */
  onClose: () => void;
}

export function GetKortixGrid({
  platform,
  inApp,
  className,
}: {
  /** The visitor's platform: picks the one solid download button. */
  platform: Platform;
  inApp?: GetKortixInApp;
  className?: string;
}) {
  const showChrome = inApp ? inApp.chrome : true;
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      <DesktopCard platform={platform} inApp={Boolean(inApp)} />
      <div className="grid gap-6 md:grid-cols-2">
        <MobileCard platform={platform} />
        {showChrome ? inApp ? <ChromeLiveCard onClose={inApp.onClose} /> : <ChromePublicCard /> : null}
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {inApp ? <ComputerLiveCard onOpen={inApp.onOpenComputer} /> : <ComputerPublicCard />}
        <TerminalCard />
        <McpCard onOpen={inApp?.onOpenMcp} />
      </div>
    </div>
  );
}

/**
 * One card. In flow, so a hairline and no shadow. `overflow-hidden` clips the
 * art pane to the card's corners, so the pane rounds nothing itself. `wide`
 * puts the art beside the text from `lg`, under it below that.
 */
function SurfaceCard({
  surface,
  name,
  description,
  children,
  art,
  wide = false,
  presence = false,
}: {
  surface: SurfaceId;
  name: string;
  description: ReactNode;
  children: ReactNode;
  art: ReactNode;
  wide?: boolean;
  /** Draws the visitor's pointer as a "You" hand over the card. */
  presence?: boolean;
}) {
  const card = useRef<HTMLElement>(null);
  const chalk = useSurfaceChalk(surface);
  // The art pane wakes its dither field while the pointer is over the card.
  const [hovered, setHovered] = useState(false);
  return (
    <section
      ref={card}
      aria-label={name}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      // The input's focus look, in the surface's own chalk hue, at all times.
      style={{ borderColor: chalk.border, boxShadow: `0 0 0 3px ${chalk.ring}` }}
      className={cn(
        'bg-popover relative flex min-w-0 flex-col overflow-hidden rounded-lg border',
        wide && 'lg:grid lg:grid-cols-2',
      )}
    >
      <div className="flex flex-col gap-5 p-5 lg:p-6">
        <div className="space-y-1.5">
          <h3 className="text-foreground text-base font-medium">{name}</h3>
          <div className="text-muted-foreground text-sm text-pretty">{description}</div>
        </div>
        {/* Actions size to their label: a link button never stretches. */}
        <div className="flex flex-wrap items-center gap-2 [&>ul]:w-full">{children}</div>
      </div>
      {/* The art takes the height the grid row leaves over, so a short card in
          a tall row grows its picture, never a gap above its button. */}
      <div className={cn('flex flex-1 flex-col border-t [&>*]:flex-1', wide && 'lg:border-t-0 lg:border-l')}>
        <SurfaceHoverContext.Provider value={hovered}>{art}</SurfaceHoverContext.Provider>
      </div>
      {presence ? <YouCursor area={card} /> : null}
    </section>
  );
}

/** A named row with its mark and one action, divided by hairlines. */
function ActionRow({
  Mark,
  name,
  meta,
  children,
}: {
  Mark: Mark;
  name: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <li className="flex min-h-12 items-center gap-3 py-2">
      <span className="flex size-5 shrink-0 items-center justify-center">
        <Mark className="text-foreground size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground block truncate text-sm">{name}</span>
        {meta ? <span className="text-muted-foreground block truncate text-xs">{meta}</span> : null}
      </span>
      {children}
    </li>
  );
}

function DesktopCard({ platform, inApp }: { platform: Platform; inApp: boolean }) {
  const t = useTranslations('appsModal');
  const name = t('computer.desktop');
  const description = t('computer.desktopDescription');
  // In the desktop app itself there is nothing to download.
  if (inApp && typeof window !== 'undefined' && isDesktop()) {
    return (
      <SurfaceCard surface="desktop" wide name={name} description={description} art={<DesktopArt />}>
        <p className="text-muted-foreground text-sm">{t('computer.desktopRunning')}</p>
      </SurfaceCard>
    );
  }
  // A desktop visitor's own system gets the one solid button.
  const own = isMobilePlatform(platform) ? null : platform;
  return (
    <SurfaceCard surface="desktop" wide name={name} description={description} art={<DesktopArt />}>
      <ul className="divide-border divide-y">
        {DESKTOP_ORDER.map((os) => (
          <ActionRow key={os} Mark={DESKTOP_ROWS[os].Mark} name={DESKTOP_ROWS[os].name} meta={DESKTOP_ROWS[os].meta}>
            <Button asChild size="sm" variant={os === own ? 'default' : 'secondary'}>
              <a
                href={desktopDownloadUrl(os)}
                aria-label={t('desktop.downloadFor', { os: DESKTOP_ROWS[os].name })}
              >
                {t('computer.download')}
              </a>
            </Button>
          </ActionRow>
        ))}
      </ul>
    </SurfaceCard>
  );
}

function MobileCard({ platform }: { platform: Platform }) {
  const t = useTranslations('appsModal.mobile');
  const tStore = useTranslations('mobileAppPromo');
  const stores = [
    { id: 'ios', device: 'iPhone', Mark: AppleMark, label: tStore('appStore'), href: APP_STORE_URL },
    { id: 'android', device: 'Android', Mark: PlayStoreMark, label: tStore('googlePlay'), href: GOOGLE_PLAY_URL },
  ] as const;
  const onPhone = isMobilePlatform(platform);
  return (
    <SurfaceCard surface="mobile" name={t('name')} description={t('description')} art={<MobileArt />}>
      {/* A desktop visitor is not on the phone a store link is for: the QR
          code carries the link to it. */}
      {onPhone ? null : (
        <div className="flex w-full items-center gap-3">
          <MobileStoreQr className="size-16 p-1.5" />
          <p className="text-muted-foreground text-xs text-pretty">{tStore('scanDescription')}</p>
        </div>
      )}
      <ul className="divide-border divide-y">
        {stores.map((store) => (
          <ActionRow key={store.id} Mark={store.Mark} name={store.device}>
            <Button asChild size="sm" variant={store.id === platform ? 'default' : 'secondary'}>
              <a href={store.href} target="_blank" rel="noopener noreferrer">
                {store.label}
              </a>
            </Button>
          </ActionRow>
        ))}
      </ul>
    </SurfaceCard>
  );
}

function ChromePublicCard() {
  const t = useTranslations('appsModal.chrome');
  const tChrome = useTranslations('chrome');
  return (
    <SurfaceCard surface="chrome" presence name={t('name')} description={t('description')} art={<ChromeArt />}>
      <Button asChild size="sm">
        <a href={KORTIX_EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
          {tChrome('addToChrome')}
        </a>
      </Button>
    </SurfaceCard>
  );
}

/** This browser decides the card. Other browsers are one count plus Manage. */
function ChromeLiveCard({ onClose }: { onClose: () => void }) {
  const t = useTranslations('appsModal.chrome');
  const state = useChromeConnect();
  const { environment, checking, installed, signedIn, connected } = state;
  const connections = useChromeConnections();
  const { count, online } = chromeCounts(connections.data ?? []);
  const cardState = chromeCardState({
    thisBrowserConnected: Boolean(connected),
    environment,
    checking,
    installed: installed || signedIn,
  });
  const manage = (
    <Button
      size="sm"
      variant="secondary"
      aria-label={t('manageLabel')}
      onClick={() => {
        onClose();
        useSettingsPanelStore.getState().openSettings('chrome');
      }}
    >
      {t('manage')}
    </Button>
  );

  if (cardState === 'connected' && connected) {
    return (
      <SurfaceCard surface="chrome" presence name={t('name')} description={t('description')} art={<ChromeArt />}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {manage}
          <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
            <ChromeOnlineDot online={connected.online} />
            <span className="truncate">{connected.name}</span>
            {count > 1 ? <span className="shrink-0">· {t('summary', { count, online })}</span> : null}
          </span>
        </div>
      </SurfaceCard>
    );
  }
  return (
    <SurfaceCard
      surface="chrome"
      presence
      name={t('name')}
      description={cardState === 'unsupported' ? t('unsupported') : t('description')}
      art={<ChromeArt />}
    >
      <div className="flex flex-wrap items-center gap-2">
        {cardState === 'unsupported' ? <ChromeCopyLink /> : <ChromeInstallActions state={state} />}
        {count > 0 ? (
          <>
            {manage}
            <span className="text-muted-foreground text-xs">{t('summary', { count, online })}</span>
          </>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

function ComputerPublicCard() {
  const t = useTranslations('appsModal.computer');
  return (
    <SurfaceCard surface="computer" name={t('thisComputer')} description={t('thisComputerDescription')} art={<ComputerArt />}>
      <Button asChild size="sm" variant="secondary">
        <Link href={COMPUTER_SETTINGS_HREF}>{t('connect')}</Link>
      </Button>
    </SurfaceCard>
  );
}

function ComputerLiveCard({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('appsModal.computer');
  const { owned } = useOwnsPairedComputer();
  const live = owned.some((machine) => machine.isLive);
  return (
    <SurfaceCard
      surface="computer"
      name={t('thisComputer')}
      description={
        live ? (
          <span className="flex items-center gap-1.5">
            <ChromeOnlineDot online />
            {t('connected')}
          </span>
        ) : (
          t('thisComputerDescription')
        )
      }
      art={<ComputerArt />}
    >
      <Button
        size="sm"
        variant="secondary"
        aria-label={t(live ? 'manageLabel' : 'connectLabel')}
        onClick={onOpen}
      >
        {live ? t('manage') : t('connect')}
      </Button>
    </SurfaceCard>
  );
}

/**
 * The install command for THIS deployment, behind one Copy command button.
 */
function TerminalCard() {
  const t = useTranslations('appsModal.developers');
  const command = useDeploymentCliInstallCommand(useUiHostConfig().deploymentVersion);
  const { copy, copied } = useCopy({ toast: false });
  const copyCommand = async () => {
    if (!(await copy(command))) errorToast(t('copyFailed'));
  };
  return (
    <SurfaceCard surface="terminal" name={t('cli')} description={t('cliDescription')} art={<TerminalArt />}>
      <Button size="sm" variant="secondary" className="gap-1.5" onClick={copyCommand}>
        {copied ? <SolidCheckIcon className="size-3.5" /> : null}
        {copied ? t('copied') : t('copy')}
      </Button>
    </SurfaceCard>
  );
}

function McpCard({ onOpen }: { onOpen?: () => void }) {
  const t = useTranslations('appsModal.developers');
  return (
    <SurfaceCard surface="mcp" name={t('mcp')} description={t('mcpDescription')} art={<McpArt />}>
      {onOpen ? (
        <Button size="sm" variant="secondary" aria-label={t('connectLabel')} onClick={onOpen}>
          {t('connect')}
        </Button>
      ) : (
        <Button asChild size="sm" variant="secondary">
          <Link href={MCP_GUIDE_HREF}>{t('guide')}</Link>
        </Button>
      )}
    </SurfaceCard>
  );
}
