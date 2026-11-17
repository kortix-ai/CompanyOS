import { DEMO } from './factory-content';
import type { LoopView } from './loops-content';

/**
 * One agent session in the hero reel. A message starts it, the agent works,
 * and the result waits for a person.
 */
export interface HeroRun {
  id: string;
  /** The line under the reel while this session plays. The reel adds "example" to example sessions. */
  caption: string;
  /** `real`: every line is from the demo run (2026-11-10). `example`: the steps the loop runs, with example inputs. */
  kind: 'real' | 'example';
  /** Who runs it: the coding agent that runs the setup prompt, or a Kortix agent. */
  host: { kind: 'claude-code' } | { kind: 'agent'; slug: string; name: string };
  /** What started the session, shown beside the name. */
  source: string;
  /** The message that starts the session. */
  ask: string;
  /** The item the session took as context. */
  context?: string;
  /** How many steps the agent took, shown as "Worked through N steps". */
  steps: number;
  answer: string;
  /** Rows the agent produced: issues, checks, files. */
  rows?: Array<{ label: string; text: string; done?: boolean }>;
  /** The one thing that waits for a person. */
  result?: { kind: string; title: string; status: string };
}

/**
 * The sessions the hero plays: the prompt sets the factory up, then the
 * factory works. The engineering sessions use the real demo run; the last two
 * are labelled examples.
 */
export function heroRuns(loop: LoopView | undefined, prompt: string): HeroRun[] {
  const agent = { kind: 'agent' as const, slug: loop?.agent ?? 'factory', name: loop?.agent ?? 'factory' };
  const issue = DEMO.tickets[0]!;
  return [
    {
      id: 'setup',
      caption: 'One prompt sets it up',
      kind: 'real',
      host: { kind: 'claude-code' },
      source: 'Your terminal',
      ask: prompt,
      context: 'your-org/your-repo',
      steps: 5,
      answer: 'Found your tools, connected them and set the signals. Then it ran the factory once to prove it works.',
      result: {
        kind: 'kortix.yaml',
        title: `${loop?.name ?? 'Software Factory'} · 1 agent · ${loop?.triggers ?? 3} triggers`,
        status: 'Added to your repo',
      },
    },
    {
      id: 'nightly',
      caption: 'Tests every night',
      kind: 'real',
      host: agent,
      source: 'Schedule · 02:00',
      ask: 'Run the tests. File what fails.',
      context: 'nightly-tests',
      steps: DEMO.tickets.length + 1,
      answer: `Found ${DEMO.tickets.length} bugs and filed each one with the request that reproduces it.`,
      rows: DEMO.tickets.map((ticket) => ({ label: `#${ticket.number}`, text: ticket.title })),
    },
    {
      id: 'fix',
      caption: 'Fixes what breaks',
      kind: 'real',
      host: agent,
      source: `Issue #${issue.number}`,
      ask: issue.title,
      context: `${DEMO.repo} #${issue.number}`,
      steps: DEMO.worker.length,
      answer: 'Reproduced the crash on main, fixed the parser and proved the fix. The pull request waits for your review.',
      result: {
        kind: `Pull request #${DEMO.pr.number} · +${DEMO.pr.additions} −${DEMO.pr.deletions}`,
        title: DEMO.pr.title,
        status: 'Waiting for you to merge',
      },
    },
    {
      id: 'review',
      caption: 'Proves every change',
      kind: 'real',
      host: agent,
      source: `Pull request #${DEMO.pr.number}`,
      ask: `Review pull request #${DEMO.pr.number} before a person sees it.`,
      context: DEMO.pr.branch,
      steps: DEMO.pr.checks.length,
      answer: 'Ran every check on main and on the branch.',
      rows: DEMO.pr.checks.map((check) => {
        const [label, text] = check.split(' · ');
        return { label: label ?? check, text: text ?? '', done: true };
      }),
    },
    {
      id: 'changelog',
      caption: 'Ships the changelog',
      kind: 'example',
      host: { kind: 'agent', slug: 'marketing', name: 'marketing' },
      source: 'Pull request merged',
      ask: `Merged: ${DEMO.pr.title}`,
      context: `Pull request #${DEMO.pr.number}`,
      steps: 4,
      answer: 'Wrote the changelog entry and the post, recorded the change in a browser and rendered a captioned video.',
      result: { kind: 'Draft', title: 'Changelog entry, post and video', status: 'Waiting for you to publish' },
    },
    {
      id: 'support',
      caption: 'Answers every ticket',
      kind: 'example',
      host: { kind: 'agent', slug: 'support', name: 'support' },
      source: 'In-app feedback',
      ask: 'CSV export fails on large tables',
      context: 'Ticket from a customer',
      steps: 4,
      answer: 'Searched the docs and the code, drafted the answer and filed the bug for engineering.',
      result: { kind: 'Draft', title: 'Reply to the customer, bug ticket linked', status: 'Waiting for you to send' },
    },
  ];
}
