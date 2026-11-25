'use client';

/**
 * The Kortix in Chrome art, playing: Kortix files an expense in a web app the
 * visitor is signed in to. It clicks, types and submits, which is what the
 * card's copy promises.
 *
 *   1. It focuses Merchant and types it, then the amount.
 *   2. It picks the category and presses Submit.
 *   3. The expense lands at the top of the list, marked Submitted.
 *   Then the tab returns to a blank form and the loop starts over.
 *
 * The window is Chrome as people know it: the tab strip with a Kortix tab
 * group, the toolbar with the address and the Kortix extension. The expense
 * app, its URL and its rows are synthetic. Every line of the page sits on
 * one 20px left edge.
 *
 * It plays only while on screen. Under reduced motion it holds the filled
 * form with Kortix's hand on Submit: the poster frame.
 */

import { AVATAR_FILLS, AVATAR_INK } from '@kortix/shared';
import {
  ArrowClockwiseIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  LockSimpleIcon,
  ReceiptIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { useTranslations } from '../../i18n';
import { AppleCursor } from '../icons/apple-cursor';
import { Kortix } from '../icons/kortix';
import { cn } from '../lib/utils';

const MERCHANT = 'Blue Bottle Coffee';
const AMOUNT = '18.40';
const CATEGORIES = ['Meals', 'Travel', 'Software'] as const;
const PICKED = 0;
/** The rows already in the list. Synthetic. */
const HISTORY = [
  { merchant: 'Figma', category: 'Software', amount: '$15.00' },
  { merchant: 'Lyft', category: 'Travel', amount: '$24.10' },
] as const;

type Field = 'merchant' | 'amount' | null;
type Target = 'rest' | 'merchant' | 'amount' | 'category' | 'submit';

interface Scene {
  page: 'form' | 'list';
  focus: Field;
  merchant: number;
  amount: number;
  picked: boolean;
}

const BLANK: Scene = { page: 'form', focus: null, merchant: 0, amount: 0, picked: false };
const FILLED: Scene = { page: 'form', focus: null, merchant: MERCHANT.length, amount: AMOUNT.length, picked: true };

const MOVE_MS = 650;
const PRESS_MS = 420;
const KEY_MS = 45;

type Beat =
  | { wait: number; move: Target }
  | { wait: number; press: true; then?: Partial<Scene> }
  | { wait: number; type: 'merchant' | 'amount' }
  | { wait: number; set: Partial<Scene> };

const SCRIPT: Beat[] = [
  { wait: 700, move: 'merchant' },
  { wait: MOVE_MS + 100, press: true, then: { focus: 'merchant' } },
  { wait: 250, type: 'merchant' },
  { wait: 300, move: 'amount' },
  { wait: MOVE_MS + 100, press: true, then: { focus: 'amount' } },
  { wait: 250, type: 'amount' },
  { wait: 300, move: 'category' },
  { wait: MOVE_MS + 100, press: true, then: { focus: null, picked: true } },
  { wait: 400, move: 'submit' },
  { wait: MOVE_MS + 100, press: true },
  { wait: 300, set: { page: 'list' } },
  { wait: 300, move: 'rest' },
  { wait: 3400, set: BLANK },
];

/** Where a target's centre sits inside `frame`, in px. */
function centreIn(frame: HTMLElement, target: HTMLElement | null) {
  if (!target) return null;
  const f = frame.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  return { x: t.left - f.left + t.width / 2, y: t.top - f.top + t.height / 2 };
}

/** True while `ref` is at least partly on screen. */
function useOnScreen(ref: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setOn(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return on;
}

export function ChromeDemo() {
  const t = useTranslations('appsModal.mock');
  const reduceMotion = useReducedMotion() ?? false;
  const frame = useRef<HTMLDivElement>(null);
  const merchantRef = useRef<HTMLSpanElement>(null);
  const amountRef = useRef<HTMLSpanElement>(null);
  const categoryRef = useRef<HTMLSpanElement>(null);
  const submitRef = useRef<HTMLSpanElement>(null);
  const onScreen = useOnScreen(frame);

  const [scene, setScene] = useState<Scene>(reduceMotion ? FILLED : BLANK);
  const [target, setTarget] = useState<Target>(reduceMotion ? 'submit' : 'rest');
  const [pressing, setPressing] = useState(false);
  const [hand, setHand] = useState<{ x: number; y: number; flip: boolean } | null>(null);

  // The hand follows its target, measured after every layout.
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const at =
      target === 'rest'
        ? { x: node.clientWidth * 0.72, y: node.clientHeight * 0.62 }
        : centreIn(
            node,
            { merchant: merchantRef, amount: amountRef, category: categoryRef, submit: submitRef }[target].current,
          );
    // Its name goes on the left near the right edge, so it never leaves the window.
    if (at) setHand({ x: at.x - 6, y: at.y - 4, flip: at.x > node.clientWidth * 0.6 });
  }, [target, scene.page]);

  // The loop. Runs only on screen, never under reduced motion.
  useEffect(() => {
    if (reduceMotion || !onScreen) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(() => !cancelled && fn(), ms));
    const play = (index: number) => {
      const beat = SCRIPT[index];
      later(beat.wait, () => {
        let next = 0;
        if ('move' in beat) setTarget(beat.move);
        else if ('press' in beat) {
          setPressing(true);
          later(PRESS_MS, () => setPressing(false));
          if (beat.then) setScene((s) => ({ ...s, ...beat.then }));
        } else if ('type' in beat) {
          const field = beat.type;
          const total = field === 'merchant' ? MERCHANT.length : AMOUNT.length;
          for (let i = 1; i <= total; i += 1) later(i * KEY_MS, () => setScene((s) => ({ ...s, [field]: i })));
          next = total * KEY_MS;
        } else setScene((s) => ({ ...s, ...beat.set }));
        later(next, () => play((index + 1) % SCRIPT.length));
      });
    };
    play(0);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [onScreen, reduceMotion]);

  const url = scene.page === 'form' ? 'expenses.example.com/new' : 'expenses.example.com';
  const tabTitle = scene.page === 'form' ? 'New expense' : 'Expenses';

  return (
    <div ref={frame} className="relative flex size-full flex-col">
      {/* Tab strip: window dots, the Kortix tab group, its tab. */}
      <div className="bg-muted flex h-10 shrink-0 items-end gap-2 px-3">
        <span className="flex gap-1.5 self-center pr-2">
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
          <span className="bg-muted-foreground/30 size-2.5 rounded-full" />
        </span>
        <span className="bg-kortix-base mb-2 rounded-sm px-1.5 py-0.5 text-xs" style={{ color: AVATAR_INK }}>
          Kortix
        </span>
        {/* The grouped tab: the group's line runs along its top. */}
        <span className="bg-card relative flex h-8 w-44 items-center gap-2 rounded-t-md px-3 text-xs">
          <span className="bg-kortix-base absolute inset-x-2 top-0 h-0.5 rounded-full" />
          <ReceiptIcon weight="fill" className="text-muted-foreground size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{tabTitle}</span>
          <XIcon className="text-muted-foreground size-3 shrink-0" />
        </span>
      </div>

      {/* Toolbar: navigation, the address, the Kortix extension. */}
      <div className="bg-card flex h-10 shrink-0 items-center gap-3 border-b px-3">
        <span className="text-muted-foreground flex items-center gap-2.5">
          <ArrowLeftIcon className="size-3.5" />
          <ArrowRightIcon className="size-3.5 opacity-50" />
          <ArrowClockwiseIcon className="size-3.5" />
        </span>
        <span className="bg-muted text-muted-foreground flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-full px-3 text-xs">
          <LockSimpleIcon weight="fill" className="size-3 shrink-0" />
          <span className="truncate">{url}</span>
        </span>
        <span className="bg-kortix-base/15 flex size-6 shrink-0 items-center justify-center rounded-sm">
          <Kortix className="size-3.5" />
        </span>
      </div>

      {/* The page. One 20px left edge for every line. */}
      <div className="bg-background relative flex-1 px-5 py-5">
        {scene.page === 'form' ? (
          <Page key="form">
            <p className="text-sm font-medium">New expense</p>
            <div className="mt-4 grid grid-cols-[1fr_7rem] gap-3">
              <Input
                label="Merchant"
                value={MERCHANT.slice(0, scene.merchant)}
                focused={scene.focus === 'merchant'}
                field={merchantRef}
              />
              <Input
                label="Amount"
                prefix="$"
                value={AMOUNT.slice(0, scene.amount)}
                focused={scene.focus === 'amount'}
                field={amountRef}
              />
            </div>
            <p className="text-muted-foreground mt-3 text-xs">Category</p>
            <div className="mt-1.5 flex gap-1.5">
              {CATEGORIES.map((category, index) => {
                const on = scene.picked && index === PICKED;
                return (
                  <span
                    key={category}
                    ref={index === PICKED ? categoryRef : undefined}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs transition-colors duration-(--duration-fast) ease-out',
                      on ? 'border-foreground bg-foreground text-background' : 'text-muted-foreground',
                    )}
                  >
                    {category}
                  </span>
                );
              })}
            </div>
            <span
              ref={submitRef}
              className={cn(
                'bg-foreground text-background mt-4 inline-flex rounded-md px-3 py-1.5 text-xs transition-transform duration-(--duration-fast) ease-out',
                pressing && target === 'submit' && 'scale-95',
              )}
            >
              Submit
            </span>
          </Page>
        ) : (
          <Page key="list">
            <p className="text-sm font-medium">Expenses</p>
            <ul className="divide-border mt-3 divide-y">
              <ExpenseRow merchant={MERCHANT} category={CATEGORIES[PICKED]} amount={`$${AMOUNT}`} fresh />
              {HISTORY.map((row) => (
                <ExpenseRow key={row.merchant} {...row} />
              ))}
            </ul>
          </Page>
        )}
      </div>

      {/* The hand-back bar, as the extension draws it over the page. */}
      <div className="bg-popover absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap shadow-md">
        <span className="flex items-center gap-1.5">
          <span className="bg-kortix-base size-1.5 rounded-full" />
          {t('working')}
        </span>
        <span className="text-muted-foreground">{t('takeOver')}</span>
        <span className="text-muted-foreground">{t('stop')}</span>
      </div>

      {/* Kortix's hand: the Apple hand with its name, as every Kortix film draws it. */}
      {hand ? (
        <span
          aria-hidden
          className={cn('pointer-events-none absolute top-0 left-0 z-20 flex items-end gap-0.5', hand.flip && 'flex-row-reverse')}
          style={{
            transform: `translate(${hand.flip ? hand.x - 62 : hand.x}px, ${hand.y}px)`,
            transition: reduceMotion ? undefined : `transform ${MOVE_MS}ms ease-in-out`,
          }}
        >
          <span className="relative">
            <span
              className={cn(
                'border-kortix-base absolute top-1 left-1 size-6 rounded-full border-2 transition-[opacity,scale] duration-(--duration-moderate) ease-out',
                pressing ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
              )}
            />
            <AppleCursor className={cn('size-8 transition-transform duration-(--duration-fast) ease-out', pressing && 'scale-90')} />
          </span>
          <span className="bg-kortix-base rounded-sm px-1.5 py-0.5 text-xs" style={{ color: AVATAR_INK }}>
            Kortix
          </span>
        </span>
      ) : null}
    </div>
  );
}

/** A field with the product's input look: hairline at rest, the focus ring while Kortix types. */
function Input({
  label,
  value,
  focused,
  prefix,
  field,
}: {
  label: string;
  value: string;
  focused: boolean;
  prefix?: string;
  field: RefObject<HTMLSpanElement | null>;
}) {
  return (
    <span className="block min-w-0">
      <span className="text-muted-foreground block text-xs">{label}</span>
      <span
        ref={field}
        className={cn(
          'bg-card mt-1.5 flex h-8 items-center gap-1 rounded-md border px-2.5 text-xs transition-[border-color,box-shadow] duration-(--duration-fast) ease-out',
          focused && 'border-kortix-base ring-kortix-base/15 ring-3',
        )}
      >
        {prefix ? <span className="text-muted-foreground">{prefix}</span> : null}
        <span className="truncate">{value}</span>
        {focused ? <span className="bg-foreground h-3.5 w-px" /> : null}
      </span>
    </span>
  );
}

function ExpenseRow({
  merchant,
  category,
  amount,
  fresh = false,
}: {
  merchant: string;
  category: string;
  amount: string;
  fresh?: boolean;
}) {
  return (
    <li className={cn('flex items-center gap-3 py-2.5 text-xs', !fresh && 'text-muted-foreground')}>
      <span className="min-w-0 flex-1 truncate">{merchant}</span>
      <span className="text-muted-foreground w-16 shrink-0">{category}</span>
      {fresh ? (
        <span className="text-kortix-green flex w-20 shrink-0 items-center gap-1.5">
          <span className="bg-kortix-green size-1.5 rounded-full" />
          Submitted
        </span>
      ) : (
        <span className="w-20 shrink-0">Approved</span>
      )}
      <span className="w-14 shrink-0 text-right tabular-nums">{amount}</span>
    </li>
  );
}

/** One page of the app. Each fades in where the last one stood. */
function Page({ children }: { children: ReactNode }) {
  return <div className="animate-in fade-in-0 duration-(--duration-moderate)">{children}</div>;
}

/**
 * The visitor's own pointer, drawn as a second hand named "You" that trails it
 * over the card: the picture is two people in one browser. The native pointer
 * stays, so every link and button behaves as usual. Mouse only.
 */
export function YouCursor({ area }: { area: RefObject<HTMLElement | null> }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const node = area.current;
    if (!node || reduceMotion) return;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const box = node.getBoundingClientRect();
      setAt({ x: event.clientX - box.left, y: event.clientY - box.top });
    };
    const leave = () => setAt(null);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerleave', leave);
    return () => {
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerleave', leave);
    };
  }, [area, reduceMotion]);
  if (!at) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 z-20 flex items-end gap-0.5"
      // Offset down and right of the real pointer, and a beat behind it.
      style={{ transform: `translate(${at.x + 14}px, ${at.y + 12}px)`, transition: 'transform 160ms ease-out' }}
    >
      <AppleCursor className="size-7" />
      {/* A person's colour, from the avatar fills: warm, so it never reads as Kortix's blue. */}
      <span className="rounded-sm px-1.5 py-0.5 text-xs" style={{ backgroundColor: AVATAR_FILLS[2], color: AVATAR_INK }}>
        You
      </span>
    </span>
  );
}
