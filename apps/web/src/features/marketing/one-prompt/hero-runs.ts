import { extraRuns } from './agent-sessions';
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
  /** `real`: from the demo run (2026-11-10); `your-org/your-repo` stands for the reader's repo. `example`: the steps the loop runs, with example inputs. */
  kind: 'real' | 'example';
  /** Who runs it: the coding agent that runs the setup prompt, or a Kortix agent. */
  host: { kind: 'claude-code' } | { kind: 'agent'; slug: string; name: string };
  /** What started the session, shown beside the name. */
  source: string;
  /** The message that starts the session. */
  ask: string;
  /** The item the session took as context. */
  context?: string;
  /** What the agent did, one line per step: the "Worked through N steps" fold opens to these. `cmd`: a shell command. */
  work: Array<{ text: string; cmd?: boolean }>;
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
      work: [
        { text: 'Read the setup guide' },
        { text: 'Found GitHub, Sentry and Slack in the repo' },
        { text: 'Connected GitHub, Slack and Sentry' },
        { text: 'Wrote kortix.yaml' },
        { text: 'Ran the factory once and watched it finish' },
      ],
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
      work: [{ text: 'npm test', cmd: true }, ...DEMO.tickets.map((ticket) => ({ text: `Filed issue #${ticket.number}` }))],
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
      work: DEMO.worker.map((line) => ({ text: line.text, cmd: line.kind === 'cmd' })),
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
      work: DEMO.pr.checks.map((check) => ({ text: check })),
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
      ask: DEMO.pr.title,
      context: `Pull request #${DEMO.pr.number}`,
      work: [{ text: 'Loaded the brand skill' }, { text: 'Wrote the changelog entry' }, { text: 'Recorded the change in a browser' }, { text: 'Rendered a captioned video' }],
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
      work: [{ text: 'Triaged it: bug, high priority' }, { text: 'Searched the docs and the code' }, { text: 'Drafted the answer' }, { text: 'Filed the bug for engineering' }],
      answer: 'Searched the docs and the code, drafted the answer and filed the bug for engineering.',
      result: { kind: 'Draft', title: 'Reply to the customer, bug ticket linked', status: 'Waiting for you to send' },
    },
    ...extraRuns(),
  ];
}
