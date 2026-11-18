import type { HeroRun } from './hero-runs';

/**
 * Example sessions for the hero reel. Every panel replays without end: when a
 * session finishes, the panel picks another one of its agent's sessions at
 * random. All of them are labelled examples: the steps each loop runs, with
 * made-up inputs.
 */
type Session = Pick<HeroRun, 'source' | 'ask' | 'context' | 'work' | 'answer' | 'rows' | 'result'>;

const AGENTS: Record<string, { caption: string; sessions: Session[] }> = {
  factory: {
    caption: 'Fixes what breaks',
    sessions: [
      {
        source: 'Sentry alert',
        ask: 'TypeError in checkout: cannot read "total" of undefined',
        context: 'checkout-service',
        work: [{ text: 'Pulled the stack trace' }, { text: 'git log -p src/cart.ts', cmd: true }, { text: 'Wrote a failing test' }, { text: 'Guarded the empty cart' }],
        answer: 'An empty cart had no totals. Added the guard and a test that fails on main.',
        result: { kind: 'Pull request #212 · +14 −2', title: 'fix: handle an empty cart at checkout', status: 'Waiting for you to merge' },
      },
      {
        source: 'Issue #48',
        ask: 'Dependabot: bump next from 15.2 to 15.3',
        context: 'your-org/your-repo',
        work: [{ text: 'npm install next@15.3', cmd: true }, { text: 'npm run build', cmd: true }, { text: 'Read the release notes' }],
        answer: 'The build and every test pass on 15.3. No breaking change touches this app.',
        rows: [
          { label: 'build', text: 'passed in 48 s', done: true },
          { label: 'tests', text: '212 pass, 0 fail', done: true },
        ],
      },
      {
        source: 'Schedule · 02:00',
        ask: 'Find flaky tests from the last 50 runs.',
        context: 'CI history',
        work: [{ text: 'Read 50 CI runs' }, { text: 'Ranked tests by failure rate' }, { text: 'Filed two issues' }],
        answer: 'Two tests fail without a code change. Both wait on a real clock.',
        rows: [
          { label: '#61', text: 'auth.test.ts · sleeps 2 s' },
          { label: '#62', text: 'upload.test.ts · races the server' },
        ],
      },
    ],
  },
  marketing: {
    caption: 'Ships the changelog',
    sessions: [
      {
        source: 'Release v2.4',
        ask: 'Write the launch post for v2.4.',
        context: '14 merged pull requests',
        work: [{ text: 'Read the merged pull requests' }, { text: 'Loaded the brand skill' }, { text: 'Drafted the post and three images' }],
        answer: 'Grouped 14 changes into three stories and wrote the post in the brand voice.',
        result: { kind: 'Draft', title: 'v2.4: faster search, shared drafts, SSO', status: 'Waiting for you to publish' },
      },
      {
        source: 'Every Monday',
        ask: 'Report last week on the blog.',
        context: 'Analytics',
        work: [{ text: 'Pulled page views' }, { text: 'Compared with the week before' }],
        answer: 'Traffic rose 18%. One post brought half of the new visitors.',
        rows: [
          { label: '+18%', text: 'visitors, week on week' },
          { label: '52%', text: 'from "Ship on Fridays"' },
        ],
      },
    ],
  },
  support: {
    caption: 'Answers every ticket',
    sessions: [
      {
        source: 'Email',
        ask: 'How do I add a teammate to my workspace?',
        context: 'Ticket from a customer',
        work: [{ text: 'Searched the docs' }, { text: 'Checked the customer plan' }, { text: 'Drafted the answer' }],
        answer: 'Their plan allows five seats and they use three. The answer links the invite page.',
        result: { kind: 'Draft', title: 'Reply with the invite steps', status: 'Waiting for you to send' },
      },
      {
        source: 'Intercom',
        ask: 'I was charged twice this month.',
        context: 'Ticket from a customer',
        work: [{ text: 'Found both charges in Stripe' }, { text: 'Matched them to one invoice' }],
        answer: 'The card was charged twice for one invoice. A refund for one charge waits for you.',
        result: { kind: 'Refund', title: 'Refund the duplicate charge', status: 'Waiting for your approval' },
      },
    ],
  },
  sales: {
    caption: 'Works every lead',
    sessions: [
      {
        source: 'New sign-up',
        ask: 'A team of 40 signed up from a demo request.',
        context: 'CRM',
        work: [{ text: 'Looked up the company' }, { text: 'Scored the lead' }, { text: 'Drafted the first email' }],
        answer: 'A strong fit: 40 seats, an engineering team, and a demo request.',
        result: { kind: 'Draft', title: 'First email with three demo times', status: 'Waiting for you to send' },
      },
      {
        source: 'Every Friday',
        ask: 'Which deals went quiet this week?',
        context: 'Pipeline',
        work: [{ text: 'Read the pipeline' }, { text: 'Found deals with no reply in 7 days' }],
        answer: 'Three deals went quiet. A follow-up for each is drafted.',
        rows: [
          { label: '$24k', text: 'no reply in 9 days' },
          { label: '$12k', text: 'no reply in 7 days' },
          { label: '$8k', text: 'no reply in 8 days' },
        ],
      },
    ],
  },
  security: {
    caption: 'Watches every change',
    sessions: [
      {
        source: 'Pull request #219',
        ask: 'Check pull request #219 for secrets and risky code.',
        context: 'feat/billing-webhooks',
        work: [{ text: 'Scanned the diff for secrets' }, { text: 'npm audit', cmd: true }, { text: 'Read the new routes' }],
        answer: 'The new webhook route does not check the signature. A fix is suggested on the pull request.',
        rows: [
          { label: 'secrets', text: 'none found', done: true },
          { label: 'audit', text: '0 high, 0 critical', done: true },
          { label: 'route', text: 'signature not checked' },
        ],
      },
      {
        source: 'CVE feed',
        ask: 'A new CVE was published for a package you use.',
        context: 'package-lock.json',
        work: [{ text: 'Found the package in 2 services' }, { text: 'Upgraded to the fixed version' }, { text: 'npm test', cmd: true }],
        answer: 'Both services now use the fixed version, and every test passes.',
        result: { kind: 'Pull request #220 · +6 −6', title: 'chore: upgrade to the patched version', status: 'Waiting for you to merge' },
      },
    ],
  },
  ops: {
    caption: 'Keeps production up',
    sessions: [
      {
        source: 'PagerDuty',
        ask: 'API latency p95 above 800 ms',
        context: 'api-production',
        work: [{ text: 'Read the latency graph' }, { text: 'Found a slow query' }, { text: 'Added the missing index' }],
        answer: 'One query scanned the full orders table. The index brings p95 back to 120 ms.',
        result: { kind: 'Migration', title: 'Add an index on orders.customer_id', status: 'Waiting for your approval' },
      },
      {
        source: 'Every night',
        ask: 'Check the backups.',
        context: 'production database',
        work: [{ text: 'Restored last night to a test database' }, { text: 'Counted the rows' }],
        answer: 'Last night restores in 4 minutes. The row counts match production.',
        rows: [{ label: 'restore', text: '4 min, rows match', done: true }],
      },
    ],
  },
  data: {
    caption: 'Answers with numbers',
    sessions: [
      {
        source: 'Slack',
        ask: 'Why did sign-ups drop on Tuesday?',
        context: '#growth',
        work: [{ text: 'Queried sign-ups by hour' }, { text: 'Compared by source' }],
        answer: 'Sign-ups from Google fell 60% at 14:00. The ad campaign ended at that hour.',
        rows: [
          { label: '−60%', text: 'Google, from 14:00' },
          { label: '±2%', text: 'every other source' },
        ],
      },
      {
        source: 'Every month',
        ask: 'Build the monthly revenue report.',
        context: 'Stripe',
        work: [{ text: 'Pulled the invoices' }, { text: 'Built the report' }],
        answer: 'Revenue grew 11%. Churn fell to 2.1%.',
        result: { kind: 'Report', title: 'Revenue, October', status: 'Shared in #finance' },
      },
    ],
  },
  recruiting: {
    caption: 'Screens every applicant',
    sessions: [
      {
        source: 'New applicant',
        ask: 'Screen the new applicants for the backend role.',
        context: '12 applications',
        work: [{ text: 'Read 12 applications' }, { text: 'Matched them to the job' }],
        answer: 'Four applicants match the must-haves. Their summaries are in the tracker.',
        result: { kind: 'Shortlist', title: '4 applicants for Backend Engineer', status: 'Waiting for your review' },
      },
      {
        source: 'Calendar',
        ask: 'Schedule the final interviews for this week.',
        context: '3 applicants',
        work: [{ text: 'Read 4 calendars' }, { text: 'Found shared times' }],
        answer: 'Found times for all three. The invites are drafted.',
        result: { kind: 'Draft', title: '3 interview invites', status: 'Waiting for you to send' },
      },
    ],
  },
  finance: {
    caption: 'Closes the books',
    sessions: [
      {
        source: 'Every month',
        ask: 'Match last month’s bank lines to invoices.',
        context: 'Bank and Stripe',
        work: [{ text: 'Read 312 bank lines' }, { text: 'Matched 309 of them' }],
        answer: 'Three lines have no invoice. Each one is listed with its amount.',
        rows: [
          { label: '$1,200', text: 'no invoice' },
          { label: '$89', text: 'no invoice' },
          { label: '$40', text: 'no invoice' },
        ],
      },
    ],
  },
};

/** The agents the reel adds after the sessions of the demo run. */
const EXTRA = ['sales', 'security', 'ops', 'data', 'recruiting', 'finance'] as const;

function toRun(slug: string, session: Session, index: number): HeroRun {
  return {
    id: `${slug}-${index}`,
    caption: AGENTS[slug]!.caption,
    kind: 'example',
    host: { kind: 'agent', slug, name: slug },
    ...session,
  };
}

/** One panel per extra agent, showing its first session. */
export function extraRuns(): HeroRun[] {
  return EXTRA.map((slug) => toRun(slug, AGENTS[slug]!.sessions[0]!, 0));
}

/** The three factory panels of the demo run each take one factory session, so two never show the same one. */
const FACTORY_SESSION: Record<string, number> = { nightly: 2, fix: 0, review: 1 };

/** Every session a panel can play: its own first, then its agent's other sessions. */
export function sessionPool(run: HeroRun): HeroRun[] {
  if (run.host.kind !== 'agent') return [run];
  const own = FACTORY_SESSION[run.id];
  if (own !== undefined) return [run, toRun('factory', AGENTS.factory!.sessions[own]!, own)];
  const slug = run.host.slug;
  const sessions = AGENTS[slug]?.sessions ?? [];
  const others = sessions.map((session, index) => toRun(slug, session, index)).filter((other) => other.ask !== run.ask);
  return [run, ...others];
}
