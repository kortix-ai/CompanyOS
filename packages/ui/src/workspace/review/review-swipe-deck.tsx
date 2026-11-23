'use client';

/**
 * The Review page's card deck: the Needs you items, one card at a time.
 *
 * Drag a card right for its yes (Merge, Approve), left for its no (Close,
 * Deny, Dismiss), or use the buttons under the stack. Skip moves the card to
 * the back. A click on the card opens the item's detail. A decision has no
 * swipe: it needs a chosen option, so its card offers Open only.
 *
 * Keyboard, while focus is in the deck: → yes, ← no, S skip, Enter open.
 * A verdict waits `UNDO_MS` behind an Undo toast before `onDecide` sends it.
 * Unmounting the deck sends what waits.
 */

import type { ReviewVerdict } from '@kortix/sdk';
import {
  ArrowCounterClockwiseIcon,
  ArrowsOutSimpleIcon,
  CheckIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useTranslations } from '../../i18n';
import { cn } from '../../internal/lib/utils';
import { approvalIdentity } from '../../markdown/setup-links/approval-decision';
import { ConnectorAppMark } from '../../markdown/setup-links/connector-handshake';
import { Button } from '../../primitives/button';
import { EmptyState } from '../../primitives/empty-state';
import { Kbd } from '../../primitives/kbd';
import { undoToast } from '../../primitives/toast';
import { reviewApprovalDetails } from './approval-modal';
import { formatItemAge } from './review-actions';
import { ROW_TILE, reviewKindLabel } from './review-meta';
import { reviewSwipeVerdicts } from './review-swipe';
import type { ReviewItem } from './types';

/** How long a verdict waits for Undo before it is sent. */
const UNDO_MS = 5_000;
/** How far a card moves before a release decides it. */
const SWIPE_PX = 110;
/** A pointer that moves less than this is a click, not a drag. */
const CLICK_SLOP_PX = 6;
/** The fly-off after a decision. */
const EXIT_MS = 220;
/** The cards drawn under the top one. */
const STACK_DEPTH = 2;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

type Direction = 'left' | 'right';

interface Staged {
  item: ReviewItem;
  verdict: ReviewVerdict;
  timer: ReturnType<typeof setTimeout>;
}

export interface ReviewSwipeDeckProps {
  /** The Needs you items, in list order. */
  items: ReviewItem[];
  /** Whether this viewer may give `verdict` on `item` (KRTX-1720). */
  allows: (item: ReviewItem, verdict: ReviewVerdict) => boolean;
  /** Sends a verdict. Runs after the Undo window. */
  onDecide: (item: ReviewItem, verdict: ReviewVerdict) => void;
  /** Opens one item's detail. */
  onOpen: (item: ReviewItem) => void;
  /** True while an item's detail covers the deck: its keys are off. */
  paused?: boolean;
}

export function ReviewSwipeDeck({ items, allows, onDecide, onOpen, paused }: ReviewSwipeDeckProps) {
  const t = useTranslations('hardcodedUi.reviewDeck');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [staged, setStaged] = useState<ReadonlyMap<string, Staged>>(() => new Map());
  const [leaving, setLeaving] = useState<{ id: string; dir: Direction } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  const onDecideRef = useRef(onDecide);
  onDecideRef.current = onDecide;

  // The deck takes focus when it shows, so its keys work at once.
  useEffect(() => {
    if (!paused) rootRef.current?.focus({ preventScroll: true });
  }, [paused]);

  // Leaving the page sends what waits: Undo is a short grace, not a draft.
  useEffect(
    () => () => {
      for (const entry of stagedRef.current.values()) {
        clearTimeout(entry.timer);
        onDecideRef.current(entry.item, entry.verdict);
      }
    },
    [],
  );

  // Skipped cards go to the back, in the order they were skipped.
  const deck = useMemo(() => {
    const open = items.filter((item) => !staged.has(item.id));
    const rank = (id: string) => skipped.indexOf(id);
    return [...open].sort((a, b) => rank(a.id) - rank(b.id));
  }, [items, staged, skipped]);

  const top = deck[0] ?? null;
  const swipe = top ? reviewSwipeVerdicts(top.kind) : null;
  const yes = top && swipe?.right && allows(top, swipe.right) ? swipe.right : null;
  const no = top && swipe?.left && allows(top, swipe.left) ? swipe.left : null;

  const verdictLabel = useCallback(
    (item: ReviewItem, verdict: ReviewVerdict) => {
      if (item.kind === 'change') return verdict === 'approve' ? t('merge') : t('close');
      if (item.kind === 'approval') return verdict === 'approve' ? t('approve') : t('deny');
      return verdict === 'approve' ? t('approve') : t('dismiss');
    },
    [t],
  );

  const stage = useCallback(
    (item: ReviewItem, verdict: ReviewVerdict) => {
      const timer = setTimeout(() => {
        setStaged((prev) => {
          const next = new Map(prev);
          next.delete(item.id);
          return next;
        });
        onDecideRef.current(item, verdict);
      }, UNDO_MS);
      setStaged((prev) => new Map(prev).set(item.id, { item, verdict, timer }));
      undoToast(t('staged', { verdict: verdictLabel(item, verdict), title: item.title }), {
        duration: UNDO_MS,
        undoLabel: t('undo'),
        onUndo: () => {
          const entry = stagedRef.current.get(item.id);
          if (!entry) return;
          clearTimeout(entry.timer);
          setStaged((prev) => {
            const next = new Map(prev);
            next.delete(item.id);
            return next;
          });
          // The card comes back on top.
          setSkipped((prev) => prev.filter((id) => id !== item.id));
        },
      });
    },
    [t, verdictLabel],
  );

  const decide = useCallback(
    (dir: Direction) => {
      if (!top || leaving) return;
      const verdict = dir === 'right' ? yes : no;
      if (!verdict) return;
      setLeaving({ id: top.id, dir });
      setTimeout(() => {
        setLeaving(null);
        stage(top, verdict);
      }, EXIT_MS);
    },
    [top, leaving, yes, no, stage],
  );

  const skip = useCallback(() => {
    if (!top || deck.length < 2) return;
    setSkipped((prev) => [...prev.filter((id) => id !== top.id), top.id]);
  }, [top, deck.length]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (paused || !top || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'arrowright') decide('right');
    else if (key === 'arrowleft') decide('left');
    else if (key === 's') skip();
    else if (key === 'enter') onOpen(top);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  if (!top) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
      </div>
    );
  }

  const below = deck.slice(1, 1 + STACK_DEPTH);

  return (
    <div
      ref={rootRef}
      // The deck takes focus on mount so its keys work at once.
      tabIndex={-1}
      onKeyDown={onKeyDown}
      aria-label={t('label')}
      role="region"
      className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 py-6 outline-none"
    >
      <p className="text-muted-foreground text-center text-xs tabular-nums" aria-live="polite">
        {t('remaining', { count: deck.length })}
      </p>

      <div className="relative">
        {/* The cards under the top one: smaller and lower, no content to read. */}
        {below
          .map((item, index) => (
            <div
              key={item.id}
              aria-hidden
              className="bg-card border-border absolute inset-0 rounded-xl border"
              style={{
                transform: `translateY(${(index + 1) * 10}px) scale(${1 - (index + 1) * 0.04})`,
                opacity: 1 - (index + 1) * 0.3,
                transition: `transform 220ms ${EASE_OUT}, opacity 220ms ${EASE_OUT}`,
              }}
            />
          ))
          .reverse()}
        <SwipeCard
          key={top.id}
          item={top}
          leaving={leaving?.id === top.id ? leaving.dir : null}
          canRight={!!yes}
          canLeft={!!no}
          rightLabel={yes ? verdictLabel(top, yes) : ''}
          leftLabel={no ? verdictLabel(top, no) : ''}
          onSwipe={decide}
          onOpen={() => onOpen(top)}
        />
      </div>

      <div className="flex items-center justify-center gap-3">
        <DeckButton label={no ? verdictLabel(top, no) : t('no')} kbd="←" disabled={!no} onClick={() => decide('left')}>
          <XIcon weight="bold" className="size-5" />
        </DeckButton>
        <DeckButton label={t('skip')} kbd="S" size="sm" disabled={deck.length < 2} onClick={skip}>
          <ArrowCounterClockwiseIcon className="size-4" />
        </DeckButton>
        <DeckButton label={t('open')} kbd="↵" size="sm" onClick={() => onOpen(top)}>
          <ArrowsOutSimpleIcon className="size-4" />
        </DeckButton>
        <DeckButton
          label={yes ? verdictLabel(top, yes) : t('yes')}
          kbd="→"
          tone="primary"
          disabled={!yes}
          onClick={() => decide('right')}
        >
          <CheckIcon weight="bold" className="size-5" />
        </DeckButton>
      </div>
      {!yes && !no ? (
        <p className="text-muted-foreground -mt-2 text-center text-xs">
          {top.kind === 'decision' ? t('needsChoice') : t('noVerdict')}
        </p>
      ) : null}
    </div>
  );
}

/** One round control under the stack, its name in the caption under it. */
function DeckButton({
  label,
  kbd,
  size = 'lg',
  tone = 'secondary',
  disabled,
  onClick,
  children,
}: {
  label: string;
  kbd: string;
  size?: 'sm' | 'lg';
  tone?: 'primary' | 'secondary';
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button
        type="button"
        variant={tone === 'primary' ? 'default' : 'secondary'}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'rounded-full p-0 transition-transform duration-150 ease-out active:scale-95',
          size === 'lg' ? 'size-14' : 'size-11',
        )}
      >
        {children}
      </Button>
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        <span className="max-w-20 truncate">{label}</span>
        <Kbd className="hidden @3xl/inbox:inline-flex">{kbd}</Kbd>
      </span>
    </div>
  );
}

function SwipeCard({
  item,
  leaving,
  canRight,
  canLeft,
  rightLabel,
  leftLabel,
  onSwipe,
  onOpen,
}: {
  item: ReviewItem;
  leaving: Direction | null;
  canRight: boolean;
  canLeft: boolean;
  rightLabel: string;
  leftLabel: string;
  onSwipe: (dir: Direction) => void;
  onOpen: () => void;
}) {
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; moved: boolean } | null>(null);

  // A side with no verdict resists: the card moves a third as far.
  const resisted = (dx: number) => ((dx > 0 && !canRight) || (dx < 0 && !canLeft) ? dx / 3 : dx);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || leaving) return;
    start.current = { x: event.clientX, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = event.clientX - s.x;
    if (!s.moved && Math.abs(dx) < CLICK_SLOP_PX) return;
    s.moved = true;
    setDragging(true);
    setDrag(resisted(dx));
  };
  const onPointerUp = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s) return;
    if (!s.moved) {
      onOpen();
      return;
    }
    if (drag > SWIPE_PX && canRight) onSwipe('right');
    else if (drag < -SWIPE_PX && canLeft) onSwipe('left');
    setDrag(0);
  };

  const x = leaving ? (leaving === 'right' ? 1 : -1) * 640 : drag;
  const progress = Math.min(1, Math.abs(drag) / SWIPE_PX);
  const transform = `translateX(${x}px) rotate(${x / 24}deg)`;

  return (
    <article
      data-testid="review-swipe-card"
      aria-label={item.title}
      className={cn(
        'bg-card border-border relative flex min-h-80 cursor-grab touch-pan-y flex-col overflow-hidden rounded-xl border shadow-sm select-none',
        dragging && 'cursor-grabbing',
      )}
      style={{
        transform,
        opacity: leaving ? 0 : 1,
        // No transition while the pointer drives the card: it follows the finger.
        transition: dragging ? 'none' : `transform ${EXIT_MS}ms ${EASE_OUT}, opacity ${EXIT_MS}ms ${EASE_OUT}`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
        setDrag(0);
      }}
    >
      {/* The verdict a release gives, stamped on the side it leaves by. */}
      <Stamp label={rightLabel} side="left" tone="yes" opacity={drag > 0 && canRight ? progress : 0} />
      <Stamp label={leftLabel} side="right" tone="no" opacity={drag < 0 && canLeft ? progress : 0} />
      <CardBody item={item} />
    </article>
  );
}

function Stamp({
  label,
  side,
  tone,
  opacity,
}: {
  label: string;
  side: 'left' | 'right';
  tone: 'yes' | 'no';
  opacity: number;
}) {
  if (!label) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-4 z-10 rounded-md border-2 px-2 py-0.5 text-sm font-semibold tracking-wide uppercase',
        side === 'left' ? 'left-4 -rotate-12' : 'right-4 rotate-12',
        tone === 'yes' ? 'border-kortix-green text-kortix-green' : 'border-kortix-red text-kortix-red',
      )}
      style={{ opacity }}
    >
      {label}
    </span>
  );
}

function CardBody({ item }: { item: ReviewItem }) {
  const tI18nComplete = useTranslations('hardcodedUi.i18nComplete');
  const t = useTranslations('hardcodedUi.reviewDeck');
  const [age, setAge] = useState('');
  // Relative time is client-only: it differs between server and hydration.
  useEffect(() => setAge(formatItemAge(item.createdAt)), [item.createdAt]);
  const connector = item.kind === 'approval' ? reviewApprovalDetails(item) : null;
  const who = connector ? approvalIdentity(connector) : null;
  const tile = ROW_TILE[item.kind];

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        {who ? (
          <ConnectorAppMark name={who.connector ?? item.title} slug={who.slug} iconUrl={who.iconUrl} size="md" />
        ) : (
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md', tile.tint)}>
            <tile.icon className="size-4" />
          </span>
        )}
        <div className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          {reviewKindLabel(item.kind, tI18nComplete)}
          {item.kind === 'change' && item.detail.number != null ? ` #${item.detail.number}` : ''}
          {' · '}
          {item.agent}
          {age ? ` · ${age}` : ''}
        </div>
        {item.risk === 'high' ? (
          <WarningIcon weight="fill" aria-label={t('highRisk')} className="text-kortix-orange size-4 shrink-0" />
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-foreground line-clamp-3 text-lg leading-snug font-medium text-pretty">{item.title}</h3>
        {item.summary ? (
          <p className="text-muted-foreground line-clamp-3 text-sm text-pretty">{item.summary}</p>
        ) : null}
      </div>

      <KindDetail item={item} />
    </div>
  );
}

/** What each kind adds under the title: the facts a verdict rests on. */
function KindDetail({ item }: { item: ReviewItem }) {
  const t = useTranslations('hardcodedUi.reviewDeck');
  if (item.kind === 'change') {
    const { additions, deletions, files } = item.detail.advanced;
    const conflicts = item.detail.conflicts?.length ?? 0;
    return (
      <div className="mt-auto flex flex-col gap-3">
        {item.detail.whatChanged.length > 0 ? (
          <ul className="text-foreground flex flex-col gap-1 text-sm">
            {item.detail.whatChanged.slice(0, 3).map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="text-muted-foreground">·</span>
                <span className="line-clamp-1">{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="border-border flex items-center gap-3 border-t pt-3 text-xs tabular-nums">
          <span className="text-muted-foreground">{t('files', { count: files.length })}</span>
          <span className="text-kortix-green">+{additions}</span>
          <span className="text-kortix-red">−{deletions}</span>
          {conflicts > 0 ? (
            <span className="text-muted-foreground ml-auto flex items-center gap-1">
              <WarningIcon weight="fill" className="text-kortix-orange size-3.5" />
              {t('conflicts', { count: conflicts })}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  if (item.kind === 'approval') {
    const call = item.detail.actions[0];
    if (!call) return null;
    const args = call.argsPreview.slice(0, 4);
    return (
      <div className="mt-auto flex flex-col gap-3">
        {call.consequence ? <p className="text-foreground text-sm">{call.consequence}</p> : null}
        {args.length > 0 ? (
          <dl className="bg-muted/50 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg p-3 font-mono text-xs">
            {args.map((arg) => (
              <div key={arg.key} className="contents">
                <dt className="text-muted-foreground">{arg.key}</dt>
                <dd className="text-foreground truncate">{arg.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    );
  }
  if (item.kind === 'output') {
    return item.detail.note ? (
      <p className="text-foreground mt-auto line-clamp-4 text-sm">{item.detail.note}</p>
    ) : null;
  }
  if (item.kind === 'decision') {
    return (
      <div className="mt-auto flex flex-col gap-2">
        <p className="text-foreground text-sm font-medium">{item.detail.question}</p>
        <ul className="flex flex-col gap-1">
          {item.detail.options.slice(0, 4).map((option) => (
            <li key={option.id} className="border-border text-foreground truncate rounded-md border px-2.5 py-1.5 text-sm">
              {option.label}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return item.detail.note ? (
    <p className="text-foreground mt-auto line-clamp-4 text-sm">
      {item.detail.note}
      <span className="text-muted-foreground"> · {t('items', { count: item.detail.children.length })}</span>
    </p>
  ) : null;
}
