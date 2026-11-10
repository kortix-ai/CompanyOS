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
    line: 'Issues in. Pull requests out.',
    phrase: 'a software factory',
    name: 'Software Factory',
    summary:
      'Agents that build labeled issues into pull requests, review every pull request, fix production errors and run your end-to-end tests every night.',
    triggers: ['Issue labeled kortix', 'Pull request opened', 'Error tracker webhook', 'Every night 03:00'],
    agents: [
      { name: 'builder', role: 'Builds the issue into a tested pull request.' },
      { name: 'reviewer', role: 'Runs the pull request and reviews what breaks.' },
      { name: 'fixer', role: 'Reproduces a production error and fixes its cause.' },
      { name: 'tester', role: 'Runs the end-to-end tests and files new failures.' },
    ],
    file: '.kortix/software-factory/factory.yaml',
    excerpt: [
      '  - slug: factory-issues',
      '    on:',
      '      webhook: { secret: FACTORY_GITHUB_WEBHOOK_SECRET }',
      '    filter:',
      '      headers.github_event: issues',
      '      body.label.name: kortix',
    ],
  },
  {
    id: 'security-loop',
    line: 'A red team attacks your app every night.',
    phrase: 'a 24/7 security red team',
    name: 'Auto-Security Loop',
    summary:
      'Agents that pentest your app around the clock: a nightly red team attacks a fresh dev sandbox, scans every pull request, patches confirmed findings and audits dependencies weekly.',
    triggers: ['Every night 02:00', 'Pull request opened', 'Finding labeled security-fix', 'Mondays 04:00'],
    agents: [
      { name: 'red-team', role: 'Attacks the app in its own sandbox. Proves every finding.' },
      { name: 'pr-scan', role: 'Reviews each pull request for security holes.' },
      { name: 'patcher', role: 'Turns a confirmed finding into a fix with a test.' },
      { name: 'dependency-watch', role: 'Audits the lockfiles for known vulnerabilities.' },
    ],
    file: '.kortix/security-loop/security.yaml',
    excerpt: [
      '  - slug: security-nightly',
      '    on:',
      '      cron: "0 0 2 * * *"',
      '    run:',
      '      agent: red-team',
      '      session: fresh',
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
  '    │   └── prompts/',
  '    │       ├── builder.md',
  '    │       ├── reviewer.md',
  '    │       ├── fixer.md',
  '    │       └── tester.md',
  '    ├── skills/dev-environment/SKILL.md',
  '    └── sandbox/Dockerfile',
];

export const PLANS = ['Claude Pro or Max', 'ChatGPT Plus or Pro', 'Any API key'];

export const promptFor = (template: HomeTemplate) => templatePrompt(template);

/**
 * One real Software Factory run on a demo repository
 * (github.com/markokraemer/kortix-factory-demo): the nightly tester filed the
 * issue, the builder opened the pull request, the reviewer ran it.
 */
export const FACTORY_RUN = {
  repo: 'kortix-factory-demo',
  events: [
    { who: 'tester', what: 'opened issue #1', title: 'POST /todos with malformed JSON crashes the whole server', at: '15:16 UTC' },
    { who: 'builder', what: 'opened pull request #6', title: 'fix: return 400 on malformed JSON instead of crashing the server', at: '15:18 UTC' },
    { who: 'reviewer', what: 'reviewed #6', title: 'npm test — 7/7 pass, 3 consecutive runs, no flakes.', at: '15:21 UTC' },
  ],
};
