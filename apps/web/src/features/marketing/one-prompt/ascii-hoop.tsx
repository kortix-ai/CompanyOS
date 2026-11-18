'use client';

import { cn } from '@kortix/ui';
import { useEffect, useRef } from 'react';

import { hoopColorAt } from './hoop';
import { HOOP_PALETTE } from './hoop-palette';

/**
 * The hula hoop as the classic ASCII spinning donut (donut.c): a thin, wide
 * torus, tilted like a hoop on a hip and spinning on its own axis. Every glyph
 * takes the color of the hoop segment it belongs to, so the segments travel
 * round as it spins. Light picks the glyph from a ramp; the color is never
 * dimmed, because a dimmed hoop color turns muddy. Reduced motion draws one
 * still frame. The loop stops when the component unmounts.
 */

/** From least to most light. */
const RAMP = '.,-~:;=!*#$@';
/** The hoop: the ring's radius and the tube's, in object units. A thin tube reads as a hoop, not a donut. */
const RING = 2;
const TUBE = 0.22;
/** How far the hoop sits from the eye. */
const DISTANCE = 5;
/** The grid: columns across, and a glyph cell twice as tall as it is wide. */
const COLUMNS = 92;
const CELL_ASPECT = 2;
/** The hoop fills this share of the width. */
const FILL = 0.84;
/** The tilt toward the reader from lying flat (radians), and how far it sways either way. */
const TILT = 0.42;
const SWAY = 0.1;
/** Radians per second: the spin round its axis, and the sway's pace. */
const SPIN_SPEED = 0.9;
const SWAY_SPEED = 1.3;
/** Steps round the ring and round the tube: about 28k points a frame. */
const RING_STEP = 0.02;
const TUBE_STEP = 0.07;
const FRAME_MS = 1000 / 30;
/** Light from the top left, toward the hoop. */
const LIGHT = normalize([-1, 1.4, -1]);

function normalize([x, y, z]: number[]): [number, number, number] {
  const length = Math.hypot(x!, y!, z!);
  return [x! / length, y! / length, z! / length];
}

const still = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function AsciiHoop({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const node = canvas.current;
    const context = node?.getContext('2d');
    if (!node || !context) return;
    let width = 0;
    let rows = 0;
    let cell = 0;
    const size = () => {
      const box = node.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      width = box.width;
      cell = width / COLUMNS;
      rows = Math.max(1, Math.floor(box.height / (cell * CELL_ASPECT)));
      node.width = Math.round(box.width * ratio);
      node.height = Math.round(box.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.font = `${(cell * 1.7).toFixed(2)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
    };
    size();
    const observer = new ResizeObserver(size);
    observer.observe(node);

    const draw = (seconds: number) => {
      const glyph = new Int8Array(COLUMNS * rows).fill(-1);
      const color = new Int8Array(COLUMNS * rows);
      const depth = new Float32Array(COLUMNS * rows);
      const spin = seconds * SPIN_SPEED;
      const tilt = TILT + SWAY * Math.sin(seconds * SWAY_SPEED);
      const roll = SWAY * 0.6 * Math.sin(seconds * SWAY_SPEED * 0.7);
      const [sinTilt, cosTilt, sinRoll, cosRoll] = [Math.sin(tilt), Math.cos(tilt), Math.sin(roll), Math.cos(roll)];
      // Scale: the hoop's outer edge reaches FILL of the half-width, unless its height at the widest lean would
      // leave the rows: then the rows decide, one row clear at the top and the bottom.
      const lean = (RING + TUBE) * Math.sin(TILT + SWAY);
      const across = (FILL * COLUMNS * DISTANCE) / (2 * (RING + TUBE));
      const down = ((rows / 2 - 1) * CELL_ASPECT * (DISTANCE - lean)) / (lean + TUBE);
      const scale = Math.min(across, down);
      for (let ring = 0; ring < Math.PI * 2; ring += RING_STEP) {
        const turned = ring + spin;
        const [sinTurn, cosTurn] = [Math.sin(turned), Math.cos(turned)];
        const segment = hoopColorAt(ring / (Math.PI * 2));
        for (let tube = 0; tube < Math.PI * 2; tube += TUBE_STEP) {
          const [sinTube, cosTube] = [Math.sin(tube), Math.cos(tube)];
          // A point on the hoop and its normal, the hoop lying flat (its axis is y).
          const reach = RING + TUBE * cosTube;
          let x = reach * cosTurn;
          let y = TUBE * sinTube;
          let z = reach * sinTurn;
          let nx = cosTube * cosTurn;
          let ny = sinTube;
          let nz = cosTube * sinTurn;
          // Tilt toward the reader (round x), then roll (round z): the hoop on a hip.
          [y, z] = [y * cosTilt - z * sinTilt, y * sinTilt + z * cosTilt];
          [ny, nz] = [ny * cosTilt - nz * sinTilt, ny * sinTilt + nz * cosTilt];
          [x, y] = [x * cosRoll - y * sinRoll, x * sinRoll + y * cosRoll];
          [nx, ny] = [nx * cosRoll - ny * sinRoll, nx * sinRoll + ny * cosRoll];
          const near = 1 / (z + DISTANCE);
          const column = Math.round(COLUMNS / 2 + scale * near * x);
          const row = Math.round(rows / 2 - (scale * near * y) / CELL_ASPECT);
          if (column < 0 || column >= COLUMNS || row < 0 || row >= rows) continue;
          const at = row * COLUMNS + column;
          if (near <= depth[at]!) continue;
          depth[at] = near;
          const light = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
          glyph[at] = Math.max(0, Math.min(RAMP.length - 1, Math.floor(((light + 1) / 2) * RAMP.length)));
          color[at] = segment;
        }
      }
      context.clearRect(0, 0, width, rows * cell * CELL_ASPECT + cell * CELL_ASPECT);
      const top = (node.getBoundingClientRect().height - rows * cell * CELL_ASPECT) / 2;
      for (let at = 0; at < glyph.length; at += 1) {
        if (glyph[at]! < 0) continue;
        context.fillStyle = HOOP_PALETTE[color[at]!]!;
        context.fillText(RAMP[glyph[at]!]!, (at % COLUMNS) * cell + cell / 2, top + Math.floor(at / COLUMNS) * cell * CELL_ASPECT + cell);
      }
    };

    if (still()) {
      draw(0);
      return () => observer.disconnect();
    }
    let frame = 0;
    let last = 0;
    const start = performance.now();
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      draw((now - start) / 1000);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  return <canvas ref={canvas} aria-hidden className={cn('block', className)} />;
}
