'use client';

import { useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { lazyClient } from '../../lib/lazy-client';
import { ShaderSafe, supportsWebGL2 } from '../../primitives/shader-safe';
import { cn } from '../lib/utils';

/** Tailwind's `lg`: the breakpoint at which the frame shows the pane. */
const WIDE = '(min-width: 64rem)';

const Dithering = lazyClient(() => import('@paper-design/shaders-react').then((m) => m.Dithering));

/**
 * A theme token as an `rgb()` string. The shader parses hex and rgb only, and
 * the tokens are oklch: a 1px 2D canvas resolves the token the same way the
 * page paints it.
 */
function resolveToken(scope: Element, name: string): [number, number, number] | null {
  const value = getComputedStyle(scope).getPropertyValue(name).trim();
  const probe = document.createElement('canvas').getContext('2d');
  if (!value || !probe) return null;
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** `a` moved `t` of the way to `b`, as an `rgb()` string. */
function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const [r, g, bl] = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${r}, ${g}, ${bl})`;
}

/**
 * The art half of the auth frame: a slow dither field, inset from the top,
 * right and bottom edges. An art pane is dark in both themes (brand D4d,
 * graphic-elements.md): the `dark` class scopes its tokens, so the solid dark
 * surface is also the fallback that paints before WebGL and without WebGL2.
 * Decorative only. Reduced motion freezes the field.
 */
export function AuthArt({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion() ?? false;
  const pane = useRef<HTMLDivElement>(null);
  const [colors, setColors] = useState<{ back: string; front: string } | null>(null);

  // Effect-only, so a render without a DOM never reads it. The pane's own
  // `dark` scope fixes the tokens, so a theme flip changes nothing here.
  useEffect(() => {
    if (!pane.current || !supportsWebGL2()) return;
    const back = resolveToken(pane.current, '--muted');
    const ink = resolveToken(pane.current, '--muted-foreground');
    // The ink sits part of the way to the surface: texture, not a picture
    // that competes with the form.
    if (!back || !ink) return;
    const resolved = { back: `rgb(${back.join(', ')})`, front: mix(back, ink, 0.4) };
    // The pane is `display: none` below `lg`, but a mounted shader still
    // loads and runs its frame loop: mount it only while the pane shows.
    const wide = window.matchMedia(WIDE);
    const sync = () => setColors(wide.matches ? resolved : null);
    sync();
    wide.addEventListener('change', sync);
    return () => wide.removeEventListener('change', sync);
  }, []);

  return (
    <div aria-hidden className={cn('p-3 pl-0', className)}>
      <div ref={pane} className="dark bg-muted relative size-full overflow-hidden rounded-md">
        {colors ? (
          <ShaderSafe>
            <Dithering
              colorBack={colors.back}
              colorFront={colors.front}
              shape="warp"
              type="4x4"
              size={2}
              scale={0.6}
              speed={reduceMotion ? 0 : 0.15}
              // The pane's clip does not reach a WebGL canvas: round it too.
              className="rounded-md"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          </ShaderSafe>
        ) : null}
      </div>
    </div>
  );
}
