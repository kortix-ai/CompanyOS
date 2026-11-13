'use client';

import {
  CheckCircleIcon,
  CloudSlashIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  KeyIcon,
  LinkSimpleIcon,
  LockSimpleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  WarningIcon,
  type Icon,
} from '@phosphor-icons/react';
import type { CSSProperties, ReactNode } from 'react';

import { AgentMarkGlyph, agentMarkVars } from '../internal/components/agent-mark';
import { cn } from '../lib/utils';

/**
 * The artwork above every empty, error and "done" view (D49). One family of
 * cards in a 100 × 56 box: toned cards behind (`bg-muted`, the far pair
 * `bg-accent`), one lifted `bg-popover` card in front on the ring shadow, all
 * at 4px corners, mirrored around the front card's centre line. Pick the `kind`
 * that names the situation; pass `icon` alone for any other noun (it lands
 * on the fan).
 *
 *   <EmptyArt kind="search" />            no results for a query
 *   <EmptyArt icon={TargetIcon} />        any other empty list: the fan + its icon
 *
 * The catalogue, with when to use each kind, is in
 * .agents/skills/kortix-design-system/references/empty-states.md.
 */
export type EmptyArtKind =
  | 'fan'
  | 'document'
  | 'error'
  | 'search'
  | 'connect'
  | 'folder'
  | 'chat'
  | 'locked'
  | 'list'
  | 'image'
  | 'offline'
  | 'key'
  | 'agent'
  | 'done';

/** Every kind, in catalogue order: the design system and tests read it. */
export const EMPTY_ART_KINDS: readonly EmptyArtKind[] = [
  'fan',
  'document',
  'error',
  'search',
  'connect',
  'folder',
  'chat',
  'locked',
  'list',
  'image',
  'offline',
  'key',
  'agent',
  'done',
];

// Card geometry is a drawing, not layout: literal px in `style`, so every
// kind keeps its proportions on the 0.23rem spacing scale. Drawn at 100 × 56
// (half the Paper source, 2026-11-12) with 1px hairlines kept whole.
const BOX = { width: 100, height: 56 } as const;
// 4px corners (founder 2026-11-12: "less rounded"), the smallest control radius.
const CARD = 'absolute rounded-(--control-xs-radius)';
// Back cards are toned, not near-black: `muted` behind the front card, and the
// far pair of a wide fan one tone lighter (`accent`), so every layer reads.
const BACK = cn(CARD, 'bg-muted border border-border');
const BACK_FAR = cn(CARD, 'bg-accent border border-border');
const BACK_DASHED = cn(CARD, 'bg-popover border border-dashed border-border');
const FRONT = cn(CARD, 'bg-popover shadow-ring-sm flex items-center justify-center');
const LINE = 'bg-muted rounded-full';
const CHIP = 'bg-popover shadow-ring-sm absolute flex items-center justify-center rounded-full';

const at = (left: number, top: number, width: number, height: number, rotate = 0): CSSProperties => ({
  left,
  top,
  width,
  height,
  transform: rotate ? `rotate(${rotate}deg)` : undefined,
});

const box = (width: number, height = width): CSSProperties => ({ width, height });

/** Two back cards at ±10° behind a 36 × 46 front card: the base picture. */
function Fan({
  children,
  dashed = false,
  frontClassName,
  frontStyle,
}: {
  children: ReactNode;
  dashed?: boolean;
  frontClassName?: string;
  frontStyle?: CSSProperties;
}) {
  const back = dashed ? BACK_DASHED : BACK;
  return (
    <>
      <div className={back} style={at(23, 8, 32, 42, -10)} />
      <div className={back} style={at(45, 8, 32, 42, 10)} />
      <div className={cn(FRONT, frontClassName)} style={{ ...at(32, 4, 36, 46), ...frontStyle }}>
        {children}
      </div>
    </>
  );
}

function Lines({ widths, height = 3 }: { widths: number[]; height?: number }) {
  return (
    <>
      {widths.map((w, i) => (
        <div key={i} className={LINE} style={{ width: w, height }} />
      ))}
    </>
  );
}

/** The noun on the front card. */
const GLYPH = 16;
const STACK = (gap: number, padding: string): CSSProperties => ({ gap, padding });

function art(kind: EmptyArtKind, Glyph: Icon | undefined, glyphClassName: string): ReactNode {
  switch (kind) {
    case 'document':
      return (
        <>
          <div className={BACK} style={at(21, 9, 34, 43, -8)} />
          <div className={BACK} style={at(45, 9, 34, 43, 8)} />
          <div className={cn(FRONT, 'flex-col items-start justify-start')} style={{ ...at(31, 3, 38, 48), ...STACK(4, '7px 6px') }}>
            <div className="bg-muted flex items-center justify-center rounded-(--control-xs-radius)" style={box(11)}>
              <FileTextIcon size={8} className="text-muted-foreground" />
            </div>
            <Lines widths={[25, 21, 15]} height={2.5} />
          </div>
        </>
      );
    case 'error':
      return (
        <Fan>
          <WarningIcon size={GLYPH} className="text-kortix-red" />
        </Fan>
      );
    case 'search':
      return (
        <>
          <Fan frontClassName="flex-col items-start justify-start" frontStyle={STACK(3, '7px 6px')}>
            <Lines widths={[14, 23, 19]} height={2.5} />
          </Fan>
          <div className={CHIP} style={at(56, 31, 20, 20)}>
            <MagnifyingGlassIcon size={11} className="text-foreground" />
          </div>
        </>
      );
    case 'connect':
      return (
        <>
          <div className="border-border absolute border-t border-dashed" style={at(40, 27, 20, 0)} />
          <div className={FRONT} style={at(12, 9, 32, 38, -6)}>
            <div className="bg-muted rounded-(--control-xs-radius)" style={box(14)} />
          </div>
          <div className={cn(BACK_DASHED, 'flex items-center justify-center')} style={at(56, 9, 32, 38, 6)}>
            <PlusIcon size={11} className="text-muted-foreground" />
          </div>
          <div className={CHIP} style={at(43, 20, 14, 14)}>
            <LinkSimpleIcon size={8} className="text-foreground" />
          </div>
        </>
      );
    case 'folder':
      return (
        <>
          <div className={BACK_FAR} style={at(15, 14, 28, 36, -16)} />
          <div className={BACK_FAR} style={at(57, 14, 28, 36, 16)} />
          <div className={BACK} style={at(25, 9, 30, 39, -8)} />
          <div className={BACK} style={at(45, 9, 30, 39, 8)} />
          <div className={FRONT} style={at(33, 4, 34, 44)}>
            <FolderIcon size={GLYPH} className="text-muted-foreground" />
          </div>
        </>
      );
    case 'chat':
      return (
        <>
          <div className="bg-muted absolute flex flex-col justify-center rounded-(--control-xs-radius)" style={{ ...at(42, 5, 46, 18), ...STACK(3, '0 6px') }}>
            <div className="bg-foreground/10 rounded-full" style={{ width: 28, height: 2.5 }} />
            <div className="bg-foreground/10 rounded-full" style={{ width: 18, height: 2.5 }} />
          </div>
          <div className={cn(FRONT, 'justify-start')} style={{ ...at(12, 27, 60, 25), ...STACK(5, '0 6px') }}>
            {/* The sender is a muted dot: a 14px mark (its smallest crisp size) overflows a 13px avatar. */}
            <div className="bg-muted shrink-0 rounded-full" style={box(12)} />
            <div className="flex flex-col" style={{ gap: 3 }}>
              <Lines widths={[30, 22]} height={2.5} />
            </div>
          </div>
        </>
      );
    case 'locked':
      return (
        <Fan>
          <div className="bg-muted flex items-center justify-center rounded-full" style={box(22)}>
            <LockSimpleIcon size={12} className="text-foreground" />
          </div>
        </Fan>
      );
    case 'list':
      return (
        <>
          <div className={BACK} style={at(22, 3, 56, 44, -4)} />
          <div className={cn(FRONT, 'flex-col items-stretch justify-center')} style={{ ...at(18, 8, 64, 44), ...STACK(5, '0 7px') }}>
            {[29, 36, 22].map((w) => (
              <div key={w} className="flex items-center" style={{ gap: 4 }}>
                <div className="bg-muted shrink-0 rounded-(--control-xs-radius)" style={box(8)} />
                <div className={LINE} style={{ width: w, height: 2.5 }} />
              </div>
            ))}
          </div>
        </>
      );
    case 'image':
      return (
        <>
          <div className={BACK} style={{ ...at(20, 7, 38, 42, -8), padding: 3 }}>
            <div className="bg-popover rounded-(--control-xs-radius)" style={{ height: 28 }} />
          </div>
          <div className={cn(FRONT, 'flex-col items-stretch justify-start')} style={{ ...at(42, 6, 38, 44, 6), padding: 3 }}>
            <div className="bg-muted flex items-center justify-center rounded-(--control-xs-radius)" style={{ height: 30 }}>
              <ImageIcon size={13} className="text-muted-foreground" />
            </div>
          </div>
        </>
      );
    case 'offline':
      return (
        <Fan dashed>
          <CloudSlashIcon size={GLYPH} className="text-muted-foreground" />
        </Fan>
      );
    case 'key':
      return (
        <>
          <div className={BACK} style={at(24, 7, 56, 32, -6)} />
          <div className={cn(FRONT, 'justify-start')} style={{ ...at(18, 17, 64, 32), ...STACK(5, '0 7px') }}>
            <div className="bg-muted flex shrink-0 items-center justify-center rounded-(--control-xs-radius)" style={box(15)}>
              <KeyIcon size={9} className="text-foreground" />
            </div>
            <div className="flex items-center" style={{ gap: 2 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-muted-foreground rounded-full" style={box(3)} />
              ))}
            </div>
          </div>
        </>
      );
    case 'agent':
      return (
        <Fan>
          <div style={agentMarkVars('kortix')}>
            <AgentMarkGlyph slug="kortix" size={14} />
          </div>
        </Fan>
      );
    case 'done':
      return (
        <Fan>
          <CheckCircleIcon size={GLYPH} weight="fill" className="text-kortix-green" />
        </Fan>
      );
    case 'fan':
    default:
      return <Fan>{Glyph ? <Glyph size={GLYPH} className={glyphClassName} /> : null}</Fan>;
  }
}

export interface EmptyArtProps {
  /** The picture. Default: `fan` with `icon`, or `document` with no icon. */
  kind?: EmptyArtKind;
  /** The noun on the front card of a `fan`. */
  icon?: Icon;
  /** Tint of that icon. Default muted; `text-kortix-red` only for an error. */
  glyphClassName?: string;
  className?: string;
}

export function EmptyArt({ kind, icon, glyphClassName = 'text-muted-foreground', className }: EmptyArtProps) {
  const resolved: EmptyArtKind = kind ?? (icon ? 'fan' : 'document');
  return (
    <div
      aria-hidden="true"
      data-slot="empty-art"
      data-kind={resolved}
      className={cn('relative shrink-0', className)}
      style={BOX}
    >
      {art(resolved, icon, glyphClassName)}
    </div>
  );
}
