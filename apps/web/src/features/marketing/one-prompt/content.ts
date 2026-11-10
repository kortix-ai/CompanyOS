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
    id: 'marketing',
    line: 'What ships becomes a changelog, a post, a video.',
    phrase: 'your marketing loop',
    name: 'Marketing Loop',
    summary:
      'One marketing agent with a skill library turns merged pull requests into changelog entries, blog posts, social drafts, on-brand videos and images, AEO and SEO fixes. A person publishes.',
    triggers: ['Pull request merged', 'Weekdays 10:00', 'Tuesdays 09:00', 'Mondays 06:00'],
    agents: [
      { name: 'changelog', role: 'Writes each merged change into your changelog.' },
      { name: 'blog and social', role: 'Draft the post and the X and LinkedIn copy, on brand.' },
      { name: 'video', role: 'Records the real feature and renders a captioned MP4.' },
      { name: 'aeo and seo', role: 'Finds where AI answers miss you and fixes the site.' },
    ],
    file: '.kortix/marketing/marketing.yaml',
    excerpt: [
      '  - slug: marketing-changelog-github',
      '    on:',
      '      webhook: { secret: MARKETING_GITHUB_WEBHOOK_SECRET }',
      '    filter:',
      '      headers.github_event: pull_request',
      '      body.pull_request.merged: "true"',
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
