'use client';

/**
 * The art module of "Apps and extensions": one pane per surface, lit
 * from below by that surface's chalk hue, holding a still of the surface at
 * work. Raw colour lives here and nowhere else in the feature.
 *
 * Every pane follows the page's theme: its tokens, its screenshots and its
 * chalk light all have a light and a dark form. Each mock is one window or
 * device, running off the pane's right or bottom edge.
 *
 * Hovering a column wakes a dither field in its pane, in the column's chalk
 * hue and masked to its glow. The shader mounts on the first hover only (most
 * visits never hover every column), fades with the hover, and holds still under
 * reduced motion. Panes are decoration: `aria-hidden`, no controls.
 */

import { chalkColorsForHue } from '@kortix/shared';
import { useReducedMotion } from 'motion/react';
import { createContext, useContext, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { lazyClient } from '../../lib/lazy-client';
import { ShaderSafe, supportsWebGL2 } from '../../primitives/shader-safe';
import { UiImage } from '../../providers/ui-provider';
import { useIsDark } from '../../hooks/use-is-dark';
import { cn } from '../lib/utils';

export type SurfaceId = 'desktop' | 'mobile' | 'terminal';

/** Three hues a third of the wheel apart, so no two columns share a light. */
const SURFACE_HUES: Record<SurfaceId, number> = {
  desktop: 215,
  mobile: 150,
  terminal: 350,
};

/** Shots the web host serves from `apps/web/public/images`. */
const DESKTOP_SHOT = { light: '/images/desktop-app/session-top-light.webp', dark: '/images/desktop-app/session-top-dark.webp' };
const PHONE_SHOTS = [
  { light: '/images/mobile-app/start-light.webp', dark: '/images/mobile-app/start-dark.webp' },
  { light: '/images/mobile-app/review-light.webp', dark: '/images/mobile-app/review-dark.webp' },
];

/**
 * A surface's chalk edge in this theme, for its pane: a 1px border and a
 * 3px ring at 15%, the input's focus look in the surface's own hue.
 */
export function useSurfaceChalk(surface: SurfaceId) {
  const isDark = useIsDark();
  const { light, dark } = chalkColorsForHue(SURFACE_HUES[surface]);
  const ink = isDark ? dark.foreground : light.foreground;
  return { border: ink.replace(')', ' / 0.6)'), ring: ink.replace(')', ' / 0.15)') };
}

/** Whether the pointer is over the column that holds the pane. */
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
 * The pane: a quiet tint with the surface's chalk light rising from its foot, and
 * the dither field over the light while the column is hovered.
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
  const isDark = useIsDark();
  const { light, dark } = chalkColorsForHue(SURFACE_HUES[surface]);
  // The light's hue in this theme: the dark form's bright ink on a dark
  // pane, the light form's deep ink on a light one.
  const lightInk = isDark ? dark.foreground : light.foreground;
  // Armed on the first hover and never disarmed: the shader mounts once and
  // stays mounted so its fade-out can run. Set during render, the React way
  // to follow a prop, so no effect runs on cards nobody hovers.
  const [armed, setArmed] = useState(false);
  if (hovered && !armed) setArmed(true);
  // Only after a hover, so only in a browser.
  const ink = useMemo(
    () => (armed && supportsWebGL2() ? toRgb(lightInk) : null),
    [armed, lightInk],
  );

  const glow: CSSProperties = {
    backgroundImage: `radial-gradient(${LIGHT_SHAPE}, ${lightInk.replace(')', isDark ? ' / 0.4)' : ' / 0.26)')}, transparent 72%)`,
  };
  const mask = `radial-gradient(${LIGHT_SHAPE}, #000 25%, transparent 75%)`;

  return (
    <div aria-hidden="true" style={glow} className="bg-muted/40 text-foreground relative flex flex-col overflow-hidden">
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
    <SurfaceArt surface="desktop">
      <BleedWindow className="top-8 left-8">
        <TitleBar />
        <UiImage
          src={DESKTOP_SHOT.light}
          alt=""
          width={1440}
          height={900}
          sizes="(min-width: 1024px) 720px, 150vw"
          className="h-auto w-[150%] max-w-none dark:hidden"
        />
        <UiImage
          src={DESKTOP_SHOT.dark}
          alt=""
          width={1440}
          height={900}
          sizes="(min-width: 1024px) 720px, 150vw"
          className="hidden h-auto w-[150%] max-w-none dark:block"
        />
      </BleedWindow>
    </SurfaceArt>
  );
}

/** Two phones, the second lower, both cut by the pane's foot. Sized to the pane, so a narrow column still fits both. */
export function MobileArt() {
  return (
    <SurfaceArt surface="mobile">
      <div className="absolute inset-x-0 top-8 flex justify-center gap-4">
        {PHONE_SHOTS.map((shot, index) => (
          <div
            key={shot.light}
            className={cn(
              'bg-card relative aspect-[640/1385] w-[38%] max-w-40 shrink-0 overflow-hidden rounded-xl border',
              index === 1 && 'translate-y-10',
            )}
          >
            <UiImage src={shot.light} alt="" fill sizes="(min-width: 768px) 160px, 38vw" className="object-cover dark:hidden" />
            <UiImage src={shot.dark} alt="" fill sizes="(min-width: 768px) 160px, 38vw" className="hidden object-cover dark:block" />
          </div>
        ))}
      </div>
    </SurfaceArt>
  );
}

/** One prompt, synthetic data. */
const PROMPT = 'Draft the Q4 launch plan';
const SESSION = { short: '8f2c41a0', branch: 'kortix/q4-launch-plan' };

/**
 * `kortix sessions new`, with the output the CLI prints
 * (`apps/cli/src/commands/sessions.ts`): the green check, then the dim
 * field names. The CLI speaks English, so the art does too.
 */
export function TerminalArt() {
  return (
    <SurfaceArt surface="terminal">
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
