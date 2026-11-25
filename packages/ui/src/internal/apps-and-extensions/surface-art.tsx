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
import { BagIcon, CheckCircleIcon, CoffeeIcon, HeadphonesIcon, LaptopIcon, TShirtIcon } from '@phosphor-icons/react';
import { useReducedMotion } from 'motion/react';
import { createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { useTranslations } from '../../i18n';
import { lazyClient } from '../../lib/lazy-client';
import { ShaderSafe, supportsWebGL2 } from '../../primitives/shader-safe';
import { UiImage } from '../../providers/ui-provider';
import { ChromeOnlineDot } from '../chrome/chrome-connect';
import { AppleCursor } from '../icons/apple-cursor';
import { Claude } from '../icons/claude';
import { Codex } from '../icons/codex';
import { Cursor } from '../icons/cursor';
import { Kortix } from '../icons/kortix';
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

/** The dither is texture on the light, not a picture: 20% at full hover. */
const DITHER_OPACITY = 0.2;

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
          className="pointer-events-none absolute inset-0 transition-opacity duration-(--duration-moderate) ease-in-out"
          style={{ opacity: hovered ? DITHER_OPACITY : 0, maskImage: mask, WebkitMaskImage: mask }}
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
 * A window anchored top-left inside the pane, with air above and to its
 * left, running off the pane's right and bottom edges: a product shot, not a
 * screenshot shrunk into a box.
 */
function BleedWindow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('bg-card absolute top-6 -right-px -bottom-px left-6 overflow-hidden rounded-tl-md border', className)}>
      {children}
    </div>
  );
}

/** The desktop app: a real session page, running off the pane's right and bottom edges. */
export function DesktopArt() {
  return (
    <SurfaceArt surface="desktop" className="min-h-64 lg:min-h-0">
      <BleedWindow className="top-8 left-8">
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

/** Two orders on the made-up shop's page. Synthetic data, never a real shop. */
const ORDERS = [
  { name: 'Wireless headphones', meta: 'Order #8294 · Delivered Jan 28', price: '$79.99', Glyph: HeadphonesIcon },
  { name: 'Linen overshirt', meta: 'Order #8231 · Delivered Jan 12', price: '$48.00', Glyph: TShirtIcon },
  { name: 'Ceramic mug set', meta: 'Order #8190 · Delivered Dec 30', price: '$32.00', Glyph: CoffeeIcon },
] as const;

/**
 * Kortix at work in the visitor's own Chrome: its tab group, a shop's orders
 * page, the agent's hand on "Start return", and the bar that hands control
 * back. Every word is one a real page would show.
 */
export function ChromeArt() {
  const t = useTranslations('appsModal.mock');
  return (
    <SurfaceArt surface="chrome" className="min-h-80">
      <BleedWindow>
        <div className="bg-muted/40 flex items-end gap-2 border-b px-3 pt-2">
          <span className="bg-kortix-base/15 text-foreground mb-1.5 flex min-w-0 items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs">
            <span className="bg-kortix-base size-1.5 shrink-0 rounded-full" />
            <span className="truncate">{t('group')}</span>
          </span>
          <span className="bg-card -mb-px flex items-center gap-1.5 rounded-t-sm border border-b-0 px-2.5 py-1.5 text-xs">
            <BagIcon weight="fill" className="text-muted-foreground size-3 shrink-0" />
            Orders
          </span>
        </div>
        <div className="border-b px-3 py-2">
          <span className="bg-muted text-muted-foreground block w-fit max-w-full truncate rounded-full px-3 py-1 font-mono text-xs">
            {MOCK_URL}
          </span>
        </div>
        <div className="space-y-2.5 p-4">
          <p className="text-sm font-medium">Your orders</p>
          {ORDERS.map((order, index) => (
            <div key={order.name} className="bg-muted/40 flex items-center gap-3 rounded-md px-3 py-2.5">
              <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-sm">
                <order.Glyph weight="fill" className="text-muted-foreground size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{order.name}</span>
                <span className="text-muted-foreground block truncate text-xs">{order.meta}</span>
              </span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{order.price}</span>
              {index === 0 ? (
                <span className="relative shrink-0">
                  <span className="ring-kortix-base bg-card block rounded-sm px-2.5 py-1 text-xs ring-2">
                    {t('button')}
                  </span>
                  {/* The agent's hand, named, as every Kortix film draws it. */}
                  {/* The name sits left of the hand, so it never leaves the window. */}
                  <span className="absolute top-4 right-3 flex items-end gap-0.5">
                    <span className="bg-kortix-base text-foreground rounded-sm px-1.5 py-0.5 text-xs">Kortix</span>
                    <AppleCursor className="size-8" />
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground shrink-0 rounded-sm border px-2.5 py-1 text-xs">Buy again</span>
              )}
            </div>
          ))}
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
    <SurfaceArt surface="computer" className="flex min-h-60 items-center justify-center px-5">
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

/** One prompt, told by the terminal and the MCP card alike. Synthetic data. */
const PROMPT = 'Draft the Q4 launch plan';
const SESSION = { short: '8f2c41a0', branch: 'kortix/q4-launch-plan' };
const MCP_REQUEST = 'Ask Kortix to draft the Q4 launch plan';

/**
 * `kortix sessions new`, with the output the CLI prints
 * (`apps/cli/src/commands/sessions.ts`): the green check, then the dim
 * field names. The CLI speaks English, so the art does too.
 */
export function TerminalArt() {
  return (
    <SurfaceArt surface="terminal" className="min-h-60">
      <BleedWindow className="top-5 left-5">
        <TitleBar>
          <span className="text-muted-foreground ml-2 font-mono text-xs">~/acme</span>
        </TitleBar>
        <div className="space-y-1 px-3 py-3 font-mono text-xs whitespace-nowrap">
          <p>
            <span className="text-muted-foreground">$ </span>
            kortix sessions new --prompt <span className="text-kortix-green">&quot;{PROMPT}&quot;</span>
          </p>
          <p className="pt-1">
            <span className="text-kortix-green">✓</span> Session started{' '}
            <span className="font-medium">{SESSION.short}</span>
          </p>
          <p>
            <span className="text-muted-foreground">status{'     '}</span>running
          </p>
          <p>
            <span className="text-muted-foreground">branch{'     '}</span>
            {SESSION.branch}
          </p>
          <p className="text-muted-foreground pt-1">
            Chat: <span className="text-kortix-base">kortix sessions chat {SESSION.short}</span>
          </p>
        </div>
      </BleedWindow>
    </SurfaceArt>
  );
}

/** The clients the card's description names, each with its official mark. */
const MCP_CLIENTS = [
  { name: 'Claude', Mark: Claude },
  { name: 'Cursor', Mark: Cursor },
  { name: 'Codex', Mark: Codex },
] as const;

/**
 * An MCP client handing the same prompt to Kortix: the client tabs with their
 * marks, the request, and the `start_session` call with its result.
 */
export function McpArt() {
  return (
    <SurfaceArt surface="mcp" className="min-h-60">
      <BleedWindow className="top-5 left-5">
        <div className="flex items-center gap-1 border-b px-2 py-1.5 text-xs">
          {MCP_CLIENTS.map((client, index) => (
            <span
              key={client.name}
              className={cn(
                'flex items-center gap-1.5 rounded-sm px-2 py-0.5',
                index === 0 ? 'bg-muted text-foreground' : 'text-muted-foreground',
              )}
            >
              <client.Mark className="size-3.5" />
              {client.name}
            </span>
          ))}
        </div>
        <div className="space-y-2.5 p-3 text-xs">
          <p className="bg-muted ml-auto w-fit max-w-[80%] rounded-md px-2.5 py-1.5">
            {MCP_REQUEST}
          </p>
          <div className="rounded-md border">
            <p className="flex items-center gap-2 border-b px-2.5 py-1.5">
              <Kortix className="size-3.5 shrink-0" />
              <span className="font-mono">start_session</span>
              <CheckCircleIcon weight="fill" className="text-kortix-green ml-auto size-3.5" />
            </p>
            <p className="text-muted-foreground px-2.5 py-1.5 font-mono">
              Session started <span className="text-foreground">{SESSION.short}</span>
            </p>
          </div>
        </div>
      </BleedWindow>
    </SurfaceArt>
  );
}
