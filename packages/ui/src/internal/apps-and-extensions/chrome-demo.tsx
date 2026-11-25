'use client';

/**
 * The Kortix in Chrome art, playing: Kortix returns an order in a shop's tab.
 *
 *   1. Orders     Kortix's hand moves to "Start return" and presses it.
 *   2. Reason     it picks "Defective or damaged".
 *   3. Label      the shop shows the return label. Then the loop starts over.
 *
 * Each step is a real page state (its URL, its stepper), so a still frame at
 * any moment reads as a product, not a slide. The shop, the person and the
 * order are synthetic. The visitor's own pointer gets a "You" hand that trails
 * it over the card, so the picture reads as two people sharing one browser.
 *
 * It plays only while the card is on screen. Under reduced motion it holds
 * the first step, with Kortix's hand already on the button: the poster frame.
 */

import { CheckIcon, CoffeeIcon, HeadphonesIcon, ShoppingBagIcon, TShirtIcon } from '@phosphor-icons/react';
import { AVATAR_FILLS, AVATAR_INK } from '@kortix/shared';
import { useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { useTranslations } from '../../i18n';
import { AppleCursor } from '../icons/apple-cursor';
import { cn } from '../lib/utils';

type Step = 'orders' | 'reason' | 'label';

const URLS: Record<Step, string> = {
  orders: 'shop.example.com/orders',
  reason: 'shop.example.com/orders/returns',
  label: 'shop.example.com/orders/returns/label',
};

const STEPS: { id: Step; label: string }[] = [
  { id: 'orders', label: 'Start a return' },
  { id: 'reason', label: 'Select reason' },
  { id: 'label', label: 'Confirmation' },
];

const ORDERS = [
  { name: 'Wireless headphones', meta: 'Order #8294 · Delivered Jan 28', price: '$79.99', Glyph: HeadphonesIcon },
  { name: 'Linen overshirt', meta: 'Order #8231 · Delivered Jan 12', price: '$48.00', Glyph: TShirtIcon },
  { name: 'Ceramic mug set', meta: 'Order #8190 · Delivered Dec 30', price: '$32.00', Glyph: CoffeeIcon },
] as const;

const REASONS = ['Changed my mind', 'Defective or damaged', "Didn't meet expectations"] as const;
const PICKED_REASON = 1;

/** Bar widths of the label's barcode, in px: a fixed pattern, not a real code. */
const BARCODE = [2, 1, 3, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 2, 3, 1, 2, 1, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 1, 2, 3];

/**
 * One loop, as [delay before the beat in ms, beat]. Cursor moves take 700 ms
 * (the `transition` on the hand), so a press waits for the hand to arrive.
 */
type Beat =
  | { kind: 'step'; step: Step }
  | { kind: 'move'; to: 'rest' | 'start' | 'reason' }
  | { kind: 'press' }
  | { kind: 'pick' };
const SCRIPT: [number, Beat][] = [
  [900, { kind: 'move', to: 'start' }],
  [900, { kind: 'press' }],
  [350, { kind: 'step', step: 'reason' }],
  [200, { kind: 'move', to: 'reason' }],
  [900, { kind: 'press' }],
  [0, { kind: 'pick' }],
  [900, { kind: 'step', step: 'label' }],
  // The hand steps back so the label reads whole, then the loop restarts.
  [200, { kind: 'move', to: 'rest' }],
  [3600, { kind: 'step', step: 'orders' }],
];

const MOVE_MS = 700;
const PRESS_MS = 450;

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
  const startButton = useRef<HTMLSpanElement>(null);
  const reasonRow = useRef<HTMLSpanElement>(null);
  const onScreen = useOnScreen(frame);

  const [step, setStep] = useState<Step>('orders');
  const [picked, setPicked] = useState(false);
  const [target, setTarget] = useState<'rest' | 'start' | 'reason'>(reduceMotion ? 'start' : 'rest');
  const [pressing, setPressing] = useState(false);
  const [hand, setHand] = useState<{ x: number; y: number } | null>(null);

  // The hand follows its target. Measured after every layout, because each
  // step lays out its own page.
  useLayoutEffect(() => {
    const node = frame.current;
    if (!node) return;
    const rest = { x: node.clientWidth * 0.62, y: node.clientHeight - 40 };
    const at =
      target === 'start'
        ? centreIn(node, startButton.current)
        : target === 'reason'
          ? centreIn(node, reasonRow.current)
          : rest;
    // The hand's tip, not its middle, lands on the target.
    if (at) setHand({ x: at.x - 6, y: at.y - 4 });
  }, [target, step]);

  // The loop. Runs only on screen, never under reduced motion.
  useEffect(() => {
    if (reduceMotion || !onScreen) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const play = (index: number) => {
      if (cancelled) return;
      const [delay, beat] = SCRIPT[index];
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          if (beat.kind === 'step') {
            setStep(beat.step);
            if (beat.step === 'orders') setPicked(false);
          } else if (beat.kind === 'move') {
            setTarget(beat.to);
          } else if (beat.kind === 'press') {
            setPressing(true);
            timers.push(setTimeout(() => setPressing(false), PRESS_MS));
          } else {
            setPicked(true);
          }
          play((index + 1) % SCRIPT.length);
        }, delay),
      );
    };
    play(0);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [onScreen, reduceMotion]);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div ref={frame} className="relative size-full">
      {/* Tab strip: the Kortix tab group, then the tab it works in. */}
      <div className="bg-muted/40 flex items-end gap-2 border-b px-3 pt-2">
        <span className="bg-kortix-base/15 text-foreground mb-1.5 flex min-w-0 items-center gap-1.5 rounded-sm px-2 py-0.5 text-xs">
          <span className="bg-kortix-base size-1.5 shrink-0 rounded-full" />
          <span className="truncate">{t('group')}</span>
        </span>
        <span className="bg-card -mb-px flex items-center gap-1.5 rounded-t-sm border border-b-0 px-2.5 py-1.5 text-xs">
          <ShoppingBagIcon weight="fill" className="text-muted-foreground size-3 shrink-0" />
          Returns
        </span>
      </div>
      <div className="border-b px-3 py-2">
        <span className="bg-muted text-muted-foreground block w-fit max-w-full truncate rounded-full px-3 py-1 font-mono text-xs">
          {URLS[step]}
        </span>
      </div>

      {/* The shop's own stepper: where the return is. */}
      <ol className="flex items-center gap-2 px-4 pt-4 text-xs">
        {STEPS.map((s, index) => (
          <li key={s.id} className="flex items-center gap-2">
            {index > 0 ? (
              <span className={cn('h-px w-6', index <= stepIndex ? 'bg-foreground' : 'bg-border')} />
            ) : null}
            <span className={cn('flex items-center gap-1.5', index > stepIndex && 'text-muted-foreground')}>
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded-full text-xs',
                  index <= stepIndex ? 'bg-foreground text-background' : 'bg-muted',
                )}
              >
                {index < stepIndex || step === 'label' ? <CheckIcon weight="bold" className="size-2.5" /> : index + 1}
              </span>
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      <div className="p-4">
        {step === 'orders' ? (
          <Page key="orders">
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
                  <span
                    ref={startButton}
                    className={cn(
                      'bg-foreground text-background shrink-0 rounded-sm px-2.5 py-1 text-xs transition-transform duration-(--duration-fast) ease-out',
                      pressing && step === 'orders' && 'scale-95',
                    )}
                  >
                    {t('button')}
                  </span>
                ) : (
                  <span className="text-muted-foreground shrink-0 rounded-sm border px-2.5 py-1 text-xs">Buy again</span>
                )}
              </div>
            ))}
          </Page>
        ) : null}

        {step === 'reason' ? (
          <Page key="reason">
            {REASONS.map((reason, index) => {
              const on = picked && index === PICKED_REASON;
              return (
                <span
                  key={reason}
                  ref={index === PICKED_REASON ? reasonRow : undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-xs transition-colors duration-(--duration-fast) ease-out',
                    on ? 'border-foreground' : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-3.5 items-center justify-center rounded-full border',
                      on && 'border-foreground',
                    )}
                  >
                    {on ? <span className="bg-foreground size-1.5 rounded-full" /> : null}
                  </span>
                  {reason}
                </span>
              );
            })}
          </Page>
        ) : null}

        {step === 'label' ? (
          <Page key="label">
            <div className="rounded-md border p-3 text-xs">
              <p className="flex items-center justify-between">
                <span className="font-medium">Return label created</span>
                <span className="text-muted-foreground">Feb 7 deadline</span>
              </p>
              <div className="mt-3 flex justify-between gap-4">
                <p className="text-muted-foreground">
                  From
                  <span className="text-foreground block">Alex Morgan</span>
                  <span className="block">12 Pine St, Portland OR</span>
                </p>
                <p className="text-muted-foreground text-right">
                  To
                  <span className="text-foreground block">Returns Center</span>
                  <span className="block">PO Box 4820, Memphis TN</span>
                </p>
              </div>
              <div className="mt-3 flex h-8 items-stretch justify-center gap-px">
                {BARCODE.map((width, index) => (
                  <span key={index} className="bg-foreground" style={{ width }} />
                ))}
              </div>
              <p className="text-muted-foreground mt-1 text-center font-mono">1Z 999 AA1 01 2345 6784</p>
            </div>
          </Page>
        ) : null}
      </div>

      {/* Kortix's hand: the Apple hand with its name, as every Kortix film draws it. */}
      {hand ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 z-10 flex items-end gap-0.5 ease-in-out"
          style={{
            transform: `translate(${hand.x}px, ${hand.y}px)`,
            transition: reduceMotion ? undefined : `transform ${MOVE_MS}ms`,
          }}
        >
          <span className="relative">
            {/* The press: a ring that opens from the fingertip. */}
            <span
              className={cn(
                'border-kortix-base absolute top-1 left-1 size-6 rounded-full border-2 transition-[opacity,scale] duration-(--duration-moderate) ease-out',
                pressing ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
              )}
            />
            <AppleCursor className={cn('size-8 transition-transform duration-(--duration-fast) ease-out', pressing && 'scale-90')} />
          </span>
          <span className="bg-kortix-base text-foreground rounded-sm px-1.5 py-0.5 text-xs">Kortix</span>
        </span>
      ) : null}
    </div>
  );
}

/** One page of the shop. Each step's page fades in where the last one stood. */
function Page({ children }: { children: ReactNode }) {
  return (
    <div className="animate-in fade-in-0 space-y-2.5 duration-(--duration-moderate)">{children}</div>
  );
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
