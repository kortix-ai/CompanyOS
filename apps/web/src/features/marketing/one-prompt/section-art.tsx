import { AgentMark } from '@kortix/ui/internal/components/agent-mark';
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
  return <div className={cn('border-border bg-card w-full max-w-sm min-w-0 rounded-xl border p-2 shadow-2xl shadow-black/40', className)}>{children}</div>;
}

function Row({ lead, text, meta, dim }: { lead: ReactNode; text: string; meta?: ReactNode; dim?: boolean }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-md px-2.5 py-2 text-sm', dim && 'opacity-50')}>
      <span className="flex size-4 shrink-0 items-center justify-center">{lead}</span>
      <span className="text-foreground min-w-0 flex-1 truncate">{text}</span>
      {meta ? <span className="text-muted-foreground shrink-0 text-xs">{meta}</span> : null}
    </div>
  );
}

const dot = (on: boolean) => <span className={cn('size-1.5 rounded-full', on ? 'bg-kortix-base' : 'bg-muted-foreground')} />;

/** Step 1: the scan names every tool it finds, and where it found it. */
export function FindArt() {
  return (
    <Pane>
      <div className="text-muted-foreground px-2.5 pt-1.5 pb-2 text-xs">Found in your repo</div>
      <Row lead={dot(true)} text="GitHub" meta={<span className="font-mono">.github/workflows</span>} />
      <Row lead={dot(true)} text="Sentry" meta={<span className="font-mono">@sentry/node</span>} />
      <Row lead={dot(true)} text="Slack" meta={<span className="font-mono">SLACK_WEBHOOK_URL</span>} />
      <Row lead={dot(false)} text="Your helpdesk" meta="Asked you" dim />
    </Pane>
  );
}

/** Step 2: each tool connected; a secret shows by name only. */
export function ConnectArt() {
  const state = (text: string) => <span className="border-border rounded-sm border px-1.5">{text}</span>;
  return (
    <Pane>
      <Row lead={dot(true)} text="GitHub" meta={state('Connected')} />
      <Row lead={dot(true)} text="Slack" meta={state('Connected')} />
      <Row lead={dot(true)} text="Sentry" meta={state('Connected')} />
      <div className="border-border mx-2.5 my-1.5 border-t" />
      <Row lead={dot(true)} text="SENTRY_DSN" meta="Name only, value encrypted" />
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
      <Row lead={dot(true)} text="Issue opened" meta={toggle(true)} />
      <Row lead={dot(true)} text="Every night at 02:00" meta={toggle(true)} />
      <Row lead={dot(true)} text="Pull request merged" meta={toggle(true)} />
      <Row lead={dot(false)} text="New error in Sentry" meta={toggle(false)} dim />
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

/** A reply box with a message in it, as the composer draws it. */
export function ComposerArt({ text, tone = 'dark' }: { text: string; tone?: 'dark' | 'light' }) {
  return (
    <div
      className={cn(
        'flex w-full max-w-sm min-w-0 flex-col gap-6 rounded-xl border p-3 shadow-2xl',
        tone === 'light' ? 'border-background/10 bg-background/5 text-background shadow-black/10' : 'border-border bg-card text-foreground shadow-black/40',
      )}
    >
      <span className="text-sm">{text}</span>
      <div className={cn('flex items-center justify-between', tone === 'light' ? 'text-background/60' : 'text-muted-foreground')}>
        <span className="inline-flex items-center gap-1 text-xs">
          Skills
          <CaretDownIcon className="size-3" />
        </span>
        <span className="flex items-center gap-2.5">
          <PaperclipIcon className="size-3.5" />
          <span className={cn('inline-flex size-6 items-center justify-center rounded-full', tone === 'light' ? 'bg-background text-foreground' : 'bg-foreground text-background')}>
            <ArrowUpIcon className="size-3" />
          </span>
        </span>
      </div>
    </div>
  );
}

/** The one thing that waits for a person: the pull request from the demo run. */
export function ApprovalArt() {
  return (
    <div className="flex w-full max-w-sm min-w-0 flex-col">
      <div className="border-border bg-card relative z-10 flex items-center gap-3 rounded-xl border p-3 shadow-2xl shadow-black/40">
        <AgentMark slug="factory" size={21} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-foreground truncate text-sm font-medium">Pull request #{DEMO.pr.number}</span>
          <span className="text-muted-foreground truncate text-xs">Waiting for you to merge</span>
        </div>
        <span className="text-muted-foreground shrink-0 text-xs">now</span>
      </div>
      <div className="border-border bg-card mx-3 -mt-1.5 h-3 rounded-b-xl border border-t-0 opacity-60" />
    </div>
  );
}
