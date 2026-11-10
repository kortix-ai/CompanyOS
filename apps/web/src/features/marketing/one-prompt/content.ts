/**
 * The one-prompt home. The prompt is the one people copy everywhere
 * (`SETUP_PROMPT`); the templates mirror `packages/starter/templates/<id>/`:
 * name and summary from `template.json`, the excerpt copied from the
 * template's own YAML (`{{defaultBranch}}` shown as `main`). `content.test.ts`
 * fails when a name, summary or excerpt line drifts from those files.
 */
import { SETUP_PROMPT, templatePrompt } from '@kortix/shared/setup-guide';

export const PROMPT = SETUP_PROMPT;

export interface HomeTemplate {
  id: string;
  name: string;
  /** Completes the headline "…to run ___". */
  phrase: string;
  /** The whole pitch of the template in one short line. */
  line: string;
  summary: string;
  /** What starts the agents, in the reader's words. */
  triggers: string[];
  agents: Array<{ name: string; role: string }>;
  /** The template's file and a few real lines of it. */
  file: string;
  excerpt: string[];
}

export const TEMPLATES: HomeTemplate[] = [
  {
    id: 'software-factory',
    line: 'Signals in. Verified pull requests out.',
    phrase: 'a software factory',
    name: 'Software Factory',
    summary:
      'One agent that turns GitHub issues, failing tests, errors, logs, Slack reports and security findings into tickets, then builds each into a reviewed pull request with a demo.',
    triggers: ['Issue labeled kortix', 'Every night 03:00', 'Every 5 minutes', 'Review on a pull request'],
    agents: [
      { name: 'sources', role: 'File one ticket per signal into your tracker.' },
      { name: 'intake', role: 'Starts one worker per ticket, up to the cap.' },
      { name: 'worker', role: 'Verifies the change and opens a pull request with a demo.' },
      { name: 'merge gate', role: 'Runs every gate. A person merges until you allow it.' },
    ],
    file: '.kortix/software-factory/factory.yaml',
    excerpt: [
      '  - slug: source-github-issues',
      '    on:',
      '      webhook: { secret: FACTORY_GITHUB_WEBHOOK_SECRET }',
      '    filter:',
      '      headers.github_event: issues',
      '      body.label.name: kortix',
    ],
  },
  {
    id: 'aeo-loop',
    line: 'Get cited by AI answers and search.',
    phrase: 'your AEO and SEO loop',
    name: 'AEO Loop',
    summary:
      'Agents that measure every week whether AI assistants and search cite your site, write the missing answers into your website as pull requests, and fix technical SEO.',
    triggers: ['Mondays 06:00', 'Every day 09:00', 'Every day 04:00'],
    agents: [
      { name: 'aeo-auditor', role: 'Checks who gets cited for the questions buyers ask.' },
      { name: 'aeo-writer', role: 'Writes the missing answer into your site.' },
      { name: 'seo-fixer', role: 'Fixes broken links, metadata, sitemaps and schema.' },
    ],
    file: '.kortix/aeo-loop/aeo.yaml',
    excerpt: [
      '  - slug: aeo-weekly-audit',
      '    on:',
      '      cron: "0 0 6 * * 1"',
      '    run:',
      '      agent: aeo-auditor',
      '      session: keyed',
    ],
  },
  {
    id: 'changelog',
    line: 'Every merge becomes a changelog, a post and a video.',
    phrase: 'your changelog and launch content',
    name: 'Automated Changelog',
    summary:
      'Agents that turn every merged change into a changelog entry, then draft the weekly blog post, social posts and a captioned product video from it.',
    triggers: ['Push to main', 'Every day 06:00', 'Mondays 09:00'],
    agents: [
      { name: 'changelog-writer', role: 'Writes each user-visible change into your changelog.' },
      { name: 'content-studio', role: 'Drafts the blog post, social posts and a product video.' },
    ],
    file: '.kortix/changelog/changelog.yaml',
    excerpt: [
      '  - slug: changelog-push',
      '    on:',
      '      webhook: { secret: CHANGELOG_GITHUB_WEBHOOK_SECRET }',
      '    filter:',
      '      headers.github_event: push',
      '      body.ref: refs/heads/main',
    ],
  },
  {
    id: 'sales',
    line: 'Every lead researched, scored and drafted. You send.',
    phrase: 'your sales loop',
    name: 'Sales Loop',
    summary:
      'One agent that researches every signup and inbound lead, scores it against your ICP, drafts outreach and meeting briefs, and keeps your CRM clean. A person sends every message.',
    triggers: ['New signup in your product', 'Inbound form', 'Mondays 07:00'],
    agents: [
      { name: 'research', role: 'Reads public sources only and cites every fact.' },
      { name: 'qualify', role: 'Scores each lead against the ICP you wrote.' },
      { name: 'draft', role: 'Writes the next message. A person sends it.' },
      { name: 'hygiene', role: 'Finds stale deals and missing next steps every week.' },
    ],
    file: '.kortix/sales/sales.yaml',
    excerpt: [
      '  - slug: sales-signup',
      '    on:',
      '      webhook: { secret: SALES_WEBHOOK_SECRET }',
      '    filter:',
      '      body.kind: signup',
    ],
  },
  {
    id: 'recruiting',
    line: 'Every applicant screened on one rubric. A person decides.',
    phrase: 'your recruiting loop',
    name: 'Recruiting Loop',
    summary:
      'One agent that screens every applicant and referral against a structured role rubric, drafts interview kits and candidate updates, and keeps your ATS pipeline clean. A person decides every step.',
    triggers: ['New application', 'New referral', 'Weekdays, every hour 08:00-18:00', 'Mondays 07:00'],
    agents: [
      { name: 'screen', role: 'Scores each applicant on the role rubric, with evidence.' },
      { name: 'decide', role: 'A person advances or rejects on the Review page.' },
      { name: 'draft', role: 'Interview kits, scheduling and candidate updates. A person sends.' },
      { name: 'hygiene', role: 'Finds candidates who wait too long, every week.' },
    ],
    file: '.kortix/recruiting/recruiting.yaml',
    excerpt: [
      '  - slug: recruiting-referral',
      '    on:',
      '      webhook: { secret: RECRUITING_WEBHOOK_SECRET }',
      '    filter:',
      '      body.kind: referral',
    ],
  },
  {
    id: 'support',
    line: 'Every conversation triaged. Bugs go to engineering.',
    phrase: 'your support loop',
    name: 'Support Loop',
    summary:
      'One agent that triages support conversations, drafts answers from your docs and code, hands bugs to engineering, clusters feedback and proposes help-center fixes. Replies stay drafts until you allow sending.',
    triggers: ['In-app feedback', 'Help desk every 15 minutes', 'Mondays 08:00'],
    agents: [
      { name: 'triage', role: 'Sets the category and the priority of each conversation.' },
      { name: 'answer', role: 'Drafts the reply from your docs and code, with sources.' },
      { name: 'handoff', role: 'Files each bug into the Software Factory or a GitHub issue.' },
      { name: 'cluster', role: 'Groups the week’s feedback into themes with counts.' },
    ],
    file: '.kortix/support/support.yaml',
    excerpt: [
      '  - slug: support-feedback',
      '    on:',
      '      webhook: { secret: SUPPORT_WEBHOOK_SECRET }',
      '    filter:',
      '      body.kind: feedback',
    ],
  },
];

export const STEPS: Array<{ title: string; body: string }> = [
  { title: 'Sign in', body: 'kortix login opens your browser. One click.' },
  { title: 'Pick templates', body: 'Each one is a folder under .kortix/ and one import line.' },
  { title: 'Build the dev environment', body: 'A sandbox image and the install, start and test commands, read from your repo.' },
  { title: 'Approve secrets', body: 'You see the names in your .env files, never a value. You choose.' },
  { title: 'Connect your plan', body: 'Your Claude or ChatGPT subscription, or any API key.' },
  { title: 'Push and run once', body: 'It creates the GitHub webhooks and fires one trigger, so you see it work.' },
];

export const FILE_TREE = [
  'your-repo/',
  '├── kortix.yaml',
  '└── .kortix/',
  '    ├── software-factory/',
  '    │   ├── factory.yaml',
  '    │   ├── factory.json',
  '    │   ├── agents/factory.md',
  '    │   └── skills/software-factory/',
  '    │       ├── SKILL.md',
  '    │       └── references/',
  '    ├── skills/dev-environment/SKILL.md',
  '    └── sandbox/Dockerfile',
];

export const PLANS = ['Claude Pro or Max', 'ChatGPT Plus or Pro', 'Any API key'];

export const promptFor = (template: HomeTemplate) => templatePrompt(template);

/**
 * One real Software Factory run on a demo repository
 * (github.com/markokraemer/kortix-factory-demo): the nightly test source filed
 * the issue, a worker opened the pull request, a reviewer ran it.
 */
export const FACTORY_RUN = {
  repo: 'kortix-factory-demo',
  events: [
    { who: 'tester', what: 'opened issue #1', title: 'POST /todos with malformed JSON crashes the whole server', at: '15:16 UTC' },
    { who: 'builder', what: 'opened pull request #6', title: 'fix: return 400 on malformed JSON instead of crashing the server', at: '15:18 UTC' },
    { who: 'reviewer', what: 'reviewed #6', title: 'npm test, 3 consecutive runs: 4 pass, 0 fail each. Bug reproduced on main, fixed on the branch.', at: '15:21 UTC' },
  ],
};
