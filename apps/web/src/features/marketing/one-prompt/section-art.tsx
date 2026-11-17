import { AgentMarkGlyph, agentMarkTileClass, agentMarkVars } from '@kortix/ui/internal/components/agent-mark';
import { Claude } from '@kortix/ui/internal/icons/claude';
import { cn } from '@kortix/ui';
import { ArrowUpIcon, CaretDownIcon, PaperclipIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { DEMO } from './factory-content';

/**
 * The small product views the sections show. Static, drawn from tokens, with
 * the data of the demo run where there is one. They are art: hidden from
 * assistive tech, the cell's title and text carry the meaning.
 */

/** One window in an art cell: a card on the page surface, faded where the cell crops it. */
function Pane({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('border-border bg-card w-full max-w-sm min-w-0 rounded-xl border p-2 shadow-xl shadow-black/15', className)}>{children}</div>;
}

function Row({ lead, text, meta, dim }: { lead: ReactNode; text: string; meta?: ReactNode; dim?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-md px-2.5 py-2 text-sm', dim && 'opacity-50')}>
      <span className="flex size-5 shrink-0 items-center justify-center">{lead}</span>
      <span className="text-foreground min-w-0 flex-1 truncate">{text}</span>
      {meta ? <span className="text-muted-foreground shrink-0 text-xs">{meta}</span> : null}
    </div>
  );
}

const dot = (on: boolean) => <span className={cn('size-1.5 rounded-full', on ? 'bg-kortix-base' : 'bg-muted-foreground')} />;

/** A tool's official mark: the same tiles the connector screens use (`public/connector-icons/`). */
function ToolIcon({ slug }: { slug: 'github' | 'slack' | 'sentry' }) {
  // eslint-disable-next-line @next/next/no-img-element -- a 20px static SVG tile; next/image adds nothing here
  return <img src={`/connector-icons/${slug}.svg`} alt="" width={20} height={20} className="size-5 rounded-sm" />;
}

/** An agent's pixel mark in its tile, without the hover hint: art carries no tooltip. */
export function AgentTile({ slug, size = 14 }: { slug: string; size?: 14 | 21 }) {
  const tile = size === 21 ? 28 : 20;
  return (
    <span
      aria-hidden
      style={{ ...agentMarkVars(slug), width: tile, height: tile }}
      className={cn('inline-flex shrink-0 items-center justify-center bg-(--mark-tile)', size === 21 ? 'rounded-md' : 'rounded-sm', agentMarkTileClass(slug))}
    >
      <AgentMarkGlyph slug={slug} size={size} />
    </span>
  );
}

/** Step 1: the scan names every tool it finds, and where it found it. */
export function FindArt() {
  return (
    <Pane>
      <div className="text-muted-foreground px-2.5 pt-1.5 pb-2 text-xs">Found in your repo</div>
      <Row lead={<ToolIcon slug="github" />} text="GitHub" meta={<span className="font-mono">.github/workflows</span>} />
      <Row lead={<ToolIcon slug="sentry" />} text="Sentry" meta={<span className="font-mono">@sentry/node</span>} />
      <Row lead={<ToolIcon slug="slack" />} text="Slack" meta={<span className="font-mono">SLACK_WEBHOOK_URL</span>} />
      <Row lead={dot(false)} text="Your helpdesk" meta="Asked you" dim />
    </Pane>
  );
}

/** Step 2: each tool connected; a secret shows by name only. */
export function ConnectArt() {
  const state = (text: string) => <span className="border-border rounded-sm border px-1.5">{text}</span>;
  return (
    <Pane>
      <Row lead={<ToolIcon slug="github" />} text="GitHub" meta={state('Connected')} />
      <Row lead={<ToolIcon slug="slack" />} text="Slack" meta={state('Connected')} />
      <Row lead={<ToolIcon slug="sentry" />} text="Sentry" meta={state('Connected')} />
      <div className="border-border mx-2.5 my-1.5 border-t" />
      <Row lead={dot(true)} text="SENTRY_DSN" meta="Value encrypted" />
    </Pane>
  );
}

/** Step 3: the signals the agents listen to, each one a switch. */
export function SignalArt() {
  const toggle = (on: boolean) => (
    <span className={cn('flex h-4 w-7 items-center rounded-full p-0.5', on ? 'bg-foreground justify-end' : 'bg-muted justify-start')}>
      <span className={cn('size-3 rounded-full', on ? 'bg-background' : 'bg-muted-foreground')} />
    </span>
  );
  return (
    <Pane>
      <Row lead={<ToolIcon slug="github" />} text="Issue opened" meta={toggle(true)} />
      <Row lead={dot(true)} text="Every night at 02:00" meta={toggle(true)} />
      <Row lead={<ToolIcon slug="github" />} text="Pull request merged" meta={toggle(true)} />
      <Row lead={<ToolIcon slug="sentry" />} text="New error in Sentry" meta={toggle(false)} dim />
    </Pane>
  );
}

/** Step 4: the first real run, then the Kortix MCP server added to the coding agent. */
export function ProveArt() {
  return (
    <div className="flex w-full max-w-sm min-w-0 flex-col gap-3">
      <Pane>
        <div className="flex items-center justify-between px-2.5 pt-1.5 pb-2 text-xs">
          <span className="text-muted-foreground">First run · nightly-tests</span>
          <span className="text-foreground inline-flex items-center gap-1.5">
            {dot(true)}
            Finished
          </span>
        </div>
        {DEMO.tickets.map((ticket) => (
          <Row key={ticket.number} lead={<span className="text-muted-foreground font-mono text-xs">#{ticket.number}</span>} text={ticket.title} />
        ))}
      </Pane>
      <div className="border-border bg-card text-muted-foreground ml-8 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs">
        <Claude className="size-3.5 shrink-0" />
        <span className="truncate">Kortix MCP server added to Claude Code</span>
      </div>
    </div>
  );
}

/**
 * The Kortix chat input: the message, then one row of attach, the agent
 * picker, space, send. `light` is the input on a light card.
 */
export function ChatComposer({
  text,
  agent,
  tone = 'dark',
  busy = false,
  className,
}: {
  /** The typed message; empty shows the "Reply…" placeholder. */
  text?: string;
  agent: string;
  tone?: 'dark' | 'light';
  /** The agent is working: send turns into stop. */
  busy?: boolean;
  className?: string;
}) {
  const light = tone === 'light';
  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-3 rounded-xl border p-2.5',
        light ? 'border-background/10 bg-background/5 text-background' : 'border-border bg-card text-foreground',
        className,
      )}
    >
      <span className={cn('min-h-10 px-1 pt-0.5 text-sm', !text && (light ? 'text-background/50' : 'text-muted-foreground'))}>{text || 'Reply…'}</span>
      <div className={cn('flex items-center gap-1', light ? 'text-background/60' : 'text-muted-foreground')}>
        <span className="inline-flex size-7 items-center justify-center rounded-md">
          <PaperclipIcon className="size-4" />
        </span>
        <span className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs', light ? 'bg-background/5' : 'bg-muted/60')}>
          <AgentTile slug={agent} />
          <span className={light ? 'text-background' : 'text-foreground'}>{agent}</span>
          <CaretDownIcon className="size-3" />
        </span>
        <span
          className={cn(
            'ml-auto inline-flex size-7 items-center justify-center rounded-full',
            light ? 'bg-background text-foreground' : busy ? 'bg-foreground text-background' : 'bg-accent text-muted-foreground',
          )}
        >
          {busy ? <span className="size-2 rounded-xs bg-current" /> : <ArrowUpIcon className="size-3.5" />}
        </span>
      </div>
    </div>
  );
}

/** A card-sized composer with a message in it. */
export function ComposerArt({ text, agent, tone = 'dark' }: { text: string; agent: string; tone?: 'dark' | 'light' }) {
  return <ChatComposer text={text} agent={agent} tone={tone} className={cn('max-w-sm', tone === 'dark' && 'shadow-xl shadow-black/15')} />;
}

function Approval({ slug, title, status, time, className }: { slug: string; title: string; status: string; time: string; className?: string }) {
  return (
    <div className={cn('border-border bg-card flex items-center gap-3 rounded-xl border p-3 shadow-xl shadow-black/15', className)}>
      <AgentTile slug={slug} size={21} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-foreground truncate text-sm font-medium">{title}</span>
        <span className="text-muted-foreground truncate text-xs">{status}</span>
      </div>
      <span className="text-muted-foreground shrink-0 text-xs">{time}</span>
    </div>
  );
}

/** What waits for a person: the pull request from the demo run, and a deploy as an example. */
export function ApprovalArt() {
  return (
    <div className="flex w-full max-w-sm min-w-0 flex-col gap-2">
      <Approval slug="factory" title={`Pull request #${DEMO.pr.number}`} status="Waiting for you to merge" time="now" />
      <Approval slug="factory" title="Deploy to production" status="Waiting for your approval" time="2m" className="opacity-70" />
    </div>
  );
}
