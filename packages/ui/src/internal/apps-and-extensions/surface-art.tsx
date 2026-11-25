'use client';

/**
 * The art module of "Apps and extensions": one dark pane per surface, lit
 * from below by that surface's chalk hue, holding a still of the surface at
 * work. Raw colour lives here and nowhere else in the feature.
 *
 * Every pane is dark in both themes (`className="dark"` scopes the dark
 * tokens to it). Each mock is one window or device, running off the pane's
 * right or bottom edge, with real words only on what the picture is about.
 *
 * Hovering a card wakes a dither field in the pane, in the card's chalk hue
 * and masked to its glow. The shader mounts on the first hover only (most
 * visits never hover every card), fades with the hover, and holds still under
 * reduced motion. Panes are decoration: `aria-hidden`, no controls.
 */

import { chalkColorsForHue } from '@kortix/shared';
import { CursorIcon, LaptopIcon, PlugsConnectedIcon } from '@phosphor-icons/react';
import { useReducedMotion } from 'motion/react';
import { createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { useTranslations } from '../../i18n';
import { lazyClient } from '../../lib/lazy-client';
import { ShaderSafe, supportsWebGL2 } from '../../primitives/shader-safe';
import { UiImage } from '../../providers/ui-provider';
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

/** The page the Chrome mock works on: a made-up shop, never a real one. */
const MOCK_URL = 'shop.example.com/orders';

/** The MCP clients the card's description names. Product names: never translated. */
const MCP_CLIENTS = ['Claude', 'Cursor', 'Codex'];

/** Whether the pointer is over the card that holds the pane. */
export const SurfaceHoverContext = createContext(false);

const Dithering = lazyClient(() => import('@paper-design/shaders-react').then((m) => m.Dithering));

/** Any CSS colour as `rgb()`: the shader parses hex and rgb only. */
function toRgb(color: string): string | null {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return null;
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/** The shader's backing: clear, so the pane and its glow show through. */
const SHADER_CLEAR = 'rgba(0, 0, 0, 0)';

/** Where the light sits: the glow and the dither share this one shape. */
const LIGHT_SHAPE = '120% 90% at 50% 120%';

/**
 * The pane: dark, with the surface's chalk light rising from its foot, and
 * the dither field over the light while the card is hovered.
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
  const hovered = useContext(SurfaceHoverContext);
  const reduceMotion = useReducedMotion() ?? false;
  const { dark } = chalkColorsForHue(SURFACE_HUES[surface]);
  // Armed on the first hover and never disarmed: the shader mounts once and
  // stays mounted so its fade-out can run. Set during render, the React way
  // to follow a prop, so no effect runs on cards nobody hovers.
  const [armed, setArmed] = useState(false);
  if (hovered && !armed) setArmed(true);
  // Only after a hover, so only in a browser.
  const ink = useMemo(
    () => (armed && supportsWebGL2() ? toRgb(dark.foreground) : null),
    [armed, dark.foreground],
  );

  const glow: CSSProperties = {
    backgroundImage: `radial-gradient(${LIGHT_SHAPE}, ${dark.foreground.replace(')', ' / 0.4)')}, transparent 72%)`,
  };
  const mask = `radial-gradient(${LIGHT_SHAPE}, #000 25%, transparent 75%)`;

  return (
    <div aria-hidden="true" style={glow} className="dark bg-background text-foreground relative flex flex-col overflow-hidden">
      {ink ? (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-(--duration-moderate) ease-out"
          style={{ opacity: hovered ? 1 : 0, maskImage: mask, WebkitMaskImage: mask }}
        >
          <ShaderSafe>
            <Dithering
              colorBack={SHADER_CLEAR}
              colorFront={ink}
              shape="warp"
              type="4x4"
              size={2}
              scale={0.7}
              speed={hovered && !reduceMotion ? 0.3 : 0}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </ShaderSafe>
        </div>
      ) : null}
      <div className={cn('relative flex-1', className)}>{children}</div>
    </div>
  );
}

/** A window's title bar: three neutral dots and, when given, a title. */
function TitleBar({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 border-b px-3 py-2">
      <span className="bg-muted-foreground/40 size-2 rounded-full" />
      <span className="bg-muted-foreground/40 size-2 rounded-full" />
      <span className="bg-muted-foreground/40 size-2 rounded-full" />
      {children}
    </div>
  );
}

/**
 * A window anchored top-left inside the pane and running off its right edge:
 * a product shot, not a screenshot shrunk into a box. `bleed` also runs it
 * off the foot; without it the window stops short and leaves the lit band
 * at the foot clear, where the glow and the hover dither show.
 */
function BleedWindow({
  children,
  className,
  bleed = false,
}: {
  children: ReactNode;
  className?: string;
  bleed?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-card absolute top-6 -right-px left-6 overflow-hidden border',
        bleed ? '-bottom-px rounded-tl-md' : 'bottom-14 rounded-l-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A grey line standing in for text the picture is not about. */
function Line({ className }: { className?: string }) {
  return <span className={cn('bg-muted-foreground/25 block h-1.5 rounded-full', className)} />;
}

/** The desktop app: a real session page, running off the pane's right and bottom edges. */
export function DesktopArt() {
  return (
    <SurfaceArt surface="desktop" className="min-h-64 lg:min-h-0">
      <BleedWindow bleed className="top-8 left-8">
        <TitleBar />
        <UiImage
          src={DESKTOP_SHOT}
          alt=""
          width={1440}
          height={900}
          sizes="(min-width: 1024px) 720px, 150vw"
          className="h-auto w-[150%] max-w-none"
        />
      </BleedWindow>
    </SurfaceArt>
  );
}

/** Two phones at a readable size, the second lower, both cut by the pane's foot. */
export function MobileArt() {
  return (
    <SurfaceArt surface="mobile" className="min-h-80">
      <div className="absolute inset-x-0 top-8 flex justify-center gap-5">
        {PHONE_SHOTS.map((src, index) => (
          <div
            key={src}
            className={cn(
              'bg-card relative aspect-[640/1385] w-40 shrink-0 overflow-hidden rounded-xl border',
              index === 1 && 'translate-y-10',
            )}
          >
            <UiImage src={src} alt="" fill sizes="160px" className="object-cover" />
          </div>
        ))}
      </div>
    </SurfaceArt>
  );
}

/**
 * Kortix at work in the visitor's own Chrome: its tab group, the page, the
 * agent's cursor on the button it is about to press, and the bar that hands
 * control back.
 */
export function ChromeArt() {
  const t = useTranslations('appsModal.mock');
  return (
    <SurfaceArt surface="chrome" className="min-h-72">
      <BleedWindow>
        {/* Tab strip: the Kortix tab group, then the tab it works in. */}
        <div className="bg-muted/40 flex items-end gap-2 border-b px-3 pt-2">
          <span className="bg-kortix-base/15 text-foreground mb-1.5 flex min-w-0 items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs">
            <span className="bg-kortix-base size-1.5 shrink-0 rounded-full" />
            <span className="truncate">{t('group')}</span>
          </span>
          <span className="bg-card -mb-px flex w-28 items-center gap-1.5 rounded-t-sm border border-b-0 px-2.5 py-1.5">
            <span className="bg-muted-foreground/40 size-2.5 shrink-0 rounded-full" />
            <Line className="flex-1" />
          </span>
        </div>
        <div className="border-b px-3 py-2">
          <span className="bg-muted text-muted-foreground block w-fit max-w-full truncate rounded-full px-3 py-1 font-mono text-xs">
            {MOCK_URL}
          </span>
        </div>
        <div className="space-y-3 p-4">
          <Line className="w-24" />
          <div className="flex items-center gap-3 rounded-md border p-3">
            <span className="bg-muted size-9 shrink-0 rounded-sm" />
            <span className="min-w-0 flex-1 space-y-2">
              <Line className="w-3/5" />
              <Line className="w-2/5" />
            </span>
            <span className="relative shrink-0">
              <span className="ring-kortix-base bg-card block rounded-sm border px-2.5 py-1 text-xs ring-2">
                {t('button')}
              </span>
              <span className="absolute top-full right-1 flex items-start">
                <CursorIcon weight="fill" className="text-kortix-base size-4 -translate-y-1" />
                <span className="bg-kortix-base mt-2 rounded-sm px-1.5 py-0.5 text-xs text-foreground">Kortix</span>
              </span>
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-md border p-3 opacity-60">
            <span className="bg-muted size-9 shrink-0 rounded-sm" />
            <span className="min-w-0 flex-1 space-y-2">
              <Line className="w-1/2" />
              <Line className="w-1/3" />
            </span>
          </div>
        </div>
      </BleedWindow>
      {/* The hand-back bar floats over the page, as the extension draws it. */}
      <div className="bg-popover absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap shadow-md">
        <span className="flex items-center gap-1.5">
          <span className="bg-kortix-base size-1.5 rounded-full" />
          {t('working')}
        </span>
        <span className="text-muted-foreground">{t('takeOver')}</span>
        <span className="text-muted-foreground">{t('stop')}</span>
      </div>
    </SurfaceArt>
  );
}

/** One paired machine, online: the state the card leads to. */
export function ComputerArt() {
  const t = useTranslations('appsModal.computer');
  return (
    <SurfaceArt surface="computer" className="flex min-h-56 items-center justify-center px-5">
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

/**
 * A terminal session: sign in, start a session, the session running. The
 * commands are the CLI's own; its output is English, as the CLI prints it.
 */
export function TerminalArt() {
  return (
    <SurfaceArt surface="terminal" className="min-h-56">
      <BleedWindow className="top-5 bottom-10 left-5">
        <TitleBar>
          <span className="text-muted-foreground ml-2 font-mono text-xs">kortix</span>
        </TitleBar>
        <div className="space-y-1 px-3 py-3 font-mono text-xs whitespace-nowrap">
          <p>
            <span className="text-muted-foreground">~ $ </span>kortix login
          </p>
          <p className="text-muted-foreground">
            <span className="text-kortix-green">✓</span> Signed in
          </p>
          <p>
            <span className="text-muted-foreground">~ $ </span>kortix sessions new
          </p>
          <p className="flex items-center gap-1.5">
            <span className="bg-kortix-base size-1.5 rounded-full" />
            <span className="text-muted-foreground">Session running</span>
          </p>
          <p className="flex items-center gap-1">
            <span className="text-muted-foreground">~ $</span>
            <span className="bg-foreground/70 h-3.5 w-1.5" />
          </p>
        </div>
      </BleedWindow>
    </SurfaceArt>
  );
}

/**
 * An MCP client calling Kortix: the clients as tabs, then two tool calls,
 * the second the one that matters.
 */
export function McpArt() {
  return (
    <SurfaceArt surface="mcp" className="min-h-56">
      <BleedWindow className="top-5 bottom-10 left-5">
        <div className="flex items-center gap-1 border-b px-2 py-1.5 text-xs">
          {MCP_CLIENTS.map((client, index) => (
            <span
              key={client}
              className={cn(
                'rounded-sm px-2 py-0.5',
                index === 0 ? 'bg-muted text-foreground' : 'text-muted-foreground',
              )}
            >
              {client}
            </span>
          ))}
        </div>
        <div className="space-y-2 p-3 font-mono text-xs">
          <p className="text-muted-foreground flex items-center gap-2">
            <PlugsConnectedIcon className="size-3.5 shrink-0" />
            kortix.list_projects
            <span className="text-kortix-green">✓</span>
          </p>
          <div className="bg-muted/50 rounded-sm border px-2.5 py-2">
            <p className="flex items-center gap-2">
              <PlugsConnectedIcon className="size-3.5 shrink-0" />
              kortix.start_session
              <span className="text-kortix-green">✓</span>
            </p>
            <Line className="mt-2 w-32" />
          </div>
        </div>
      </BleedWindow>
    </SurfaceArt>
  );
}
