'use client';

/**
 * The art module of "Apps and extensions": one dark pane per surface, lit
 * from below by that surface's chalk hue, holding a still picture of the
 * surface at work. Raw colour lives here and nowhere else in the feature.
 *
 * Every pane is dark in both themes (`className="dark"` scopes the dark
 * tokens to it), so a mock built from tokens, such as `ChromeMock`, renders
 * as it does in dark mode. Panes are decoration: `aria-hidden`, no controls.
 */

import { chalkColorsForHue } from '@kortix/shared';
import { LaptopIcon, PlugsConnectedIcon } from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';

import { useTranslations } from '../../i18n';
import { UiImage } from '../../providers/ui-provider';
import { ChromeMock } from '../chrome/chrome-mock';
import { ChromeOnlineDot } from '../chrome/chrome-connect';
import { cn } from '../lib/utils';

export type SurfaceId = 'desktop' | 'mobile' | 'chrome' | 'computer' | 'terminal' | 'mcp';

/** Six hues spread round the wheel, so no two cards share a light. */
const SURFACE_HUES: Record<SurfaceId, number> = {
  desktop: 215,
  mobile: 150,
  chrome: 38,
  computer: 268,
  terminal: 350,
  mcp: 188,
};

/** Shots the web host serves from `apps/web/public/images`. */
const DESKTOP_SHOT = '/images/desktop-app/session-top-dark.webp';
const PHONE_SHOTS = ['/images/mobile-app/start-dark.webp', '/images/mobile-app/review-dark.webp'];

/** The clients the MCP description names. Product names: never translated. */
const MCP_CLIENTS = ['Claude', 'Cursor', 'Codex'];

/**
 * The pane: dark, with the surface's chalk light rising from its foot. The
 * light is the chalk foreground of the dark variant, so it is the same hue
 * the light-theme tile used.
 */
export function SurfaceArt({
  surface,
  className,
  children,
}: {
  surface: SurfaceId;
  className?: string;
  children: ReactNode;
}) {
  const { dark } = chalkColorsForHue(SURFACE_HUES[surface]);
  const glow = dark.foreground.replace(')', ' / 0.4)');
  const style: CSSProperties = {
    backgroundImage: `radial-gradient(120% 90% at 50% 120%, ${glow}, transparent 72%)`,
  };
  return (
    <div
      aria-hidden="true"
      style={style}
      className={cn('dark bg-background text-foreground relative overflow-hidden', className)}
    >
      {children}
    </div>
  );
}

/** A window's title bar: three neutral dots, as every mock frame on the page. */
function WindowFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-card overflow-hidden rounded-md border', className)}>
      <div className="flex gap-1.5 border-b px-3 py-2">
        <span className="bg-muted-foreground/40 size-2 rounded-full" />
        <span className="bg-muted-foreground/40 size-2 rounded-full" />
        <span className="bg-muted-foreground/40 size-2 rounded-full" />
      </div>
      {children}
    </div>
  );
}

/** The desktop app: a real session page, running off the pane's right and bottom edges. */
export function DesktopArt() {
  return (
    <SurfaceArt surface="desktop" className="min-h-64 lg:min-h-0">
      <WindowFrame className="absolute top-8 -right-6 -bottom-6 left-8 rounded-b-none">
        <UiImage
          src={DESKTOP_SHOT}
          alt=""
          width={1440}
          height={900}
          sizes="(min-width: 1024px) 720px, 150vw"
          className="h-auto w-[150%] max-w-none"
        />
      </WindowFrame>
    </SurfaceArt>
  );
}

/** Two phones, the second lower, both cut by the pane's foot. */
export function MobileArt() {
  return (
    <SurfaceArt surface="mobile" className="min-h-56">
      <div className="absolute inset-x-0 top-6 flex justify-center gap-4">
        {PHONE_SHOTS.map((src, index) => (
          <div
            key={src}
            className={cn(
              'bg-card relative aspect-[640/1385] w-28 overflow-hidden rounded-lg border',
              index === 1 && 'translate-y-6',
            )}
          >
            <UiImage src={src} alt="" fill sizes="112px" className="object-cover" />
          </div>
        ))}
      </div>
    </SurfaceArt>
  );
}

export function ChromeArt() {
  return (
    <SurfaceArt surface="chrome" className="min-h-56 px-6 pt-6">
      <ChromeMock className="bg-transparent p-0 sm:p-0" />
    </SurfaceArt>
  );
}

/** One paired machine, online: the state the card leads to. */
export function ComputerArt() {
  const t = useTranslations('appsModal.computer');
  return (
    <SurfaceArt surface="computer" className="flex min-h-32 items-center justify-center px-5">
      <div className="bg-card flex items-center gap-3 rounded-md border px-3 py-2.5">
        <LaptopIcon className="size-5 shrink-0" />
        <span className="text-sm whitespace-nowrap">{t('thisComputer')}</span>
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ChromeOnlineDot online />
          {t('connected')}
        </span>
      </div>
    </SurfaceArt>
  );
}

/** The install command, typed into a terminal. */
export function TerminalArt({ command }: { command: string }) {
  return (
    <SurfaceArt surface="terminal" className="min-h-32 px-5 pt-5 [&_p]:line-clamp-3">
      <WindowFrame className="rounded-b-none border-b-0">
        <p className="px-3 py-3 font-mono text-xs break-all">
          <span className="text-muted-foreground">$ </span>
          {command}
        </p>
      </WindowFrame>
    </SurfaceArt>
  );
}

/** The clients that reach Kortix over MCP, each wired to it. */
export function McpArt() {
  return (
    <SurfaceArt surface="mcp" className="flex min-h-32 flex-col justify-center gap-1.5 px-5 py-4">
      {MCP_CLIENTS.map((client) => (
        <div key={client} className="bg-card flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs">
          <PlugsConnectedIcon className="text-muted-foreground size-3.5 shrink-0" />
          <span className="flex-1">{client}</span>
          <span className="text-muted-foreground font-mono">kortix</span>
        </div>
      ))}
    </SurfaceArt>
  );
}
