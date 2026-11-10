/**
 * The one-prompt setup. A developer pastes `SETUP_PROMPT` into the coding
 * agent on their own computer (Claude Code, Codex, any agent with a shell).
 * That agent fetches `SETUP_GUIDE` from https://kortix.com/setup.md and does
 * every step with them: sign in, models, a template, the dev environment,
 * secrets, push, webhooks, and one real run.
 *
 * One source: the web serves this text (`apps/web/src/app/setup.md`), the
 * landing page and the workspace setup page copy `SETUP_PROMPT`.
 */

export const SETUP_GUIDE_URL = 'https://kortix.com/setup.md';

export const FACTORY_GUIDE_URL = 'https://kortix.com/factory.md';

/** The one prompt of the Software Factory: a URL, nothing to install first. */
export const FACTORY_PROMPT = `Add a Kortix software factory to this repository with me.
Follow ${FACTORY_GUIDE_URL} (curl -fsSL ${FACTORY_GUIDE_URL}) step by step.
Ask me before each decision it names. Never print a secret value.`;

/**
 * The public reference repository of each factory: a complete kortix.yaml a
 * setup agent reads and adapts. Onboarding is custom per repository; these are
 * the examples, never copied as is.
 */
export const REFERENCE_REPOS: Record<string, string> = {
  'software-factory': 'https://github.com/kortix-ai/software-factory',
  marketing: 'https://github.com/kortix-ai/marketing-factory',
};

/** Kept for links to a loop's guide; the reference repository is the source an agent adapts. */
export const loopGuideUrl = (id: string) => `https://kortix.com/loops/${id}.md`;

/** The one prompt of one factory: read its reference repository, adapt it, follow the setup guide. */
export function loopPrompt(loop: { id: string; name: string }): string {
  const reference = REFERENCE_REPOS[loop.id];
  const read = reference ? `Read ${reference} and adapt it to this repository.\n` : '';
  return `Add a Kortix ${loop.name.toLowerCase()} to this repository with me.
${read}Set it up with the Kortix CLI, following ${SETUP_GUIDE_URL} step by step.
Ask me before each decision. Never print a secret value.`;
}

/** What a person copies. Short on purpose: the guide it points to is versioned and served. */
export const SETUP_PROMPT = `Set up Kortix cloud agents on this repository with me.
Read ${SETUP_GUIDE_URL} (curl -fsSL ${SETUP_GUIDE_URL}) and follow it step by step.
Ask me before each decision it names. Never print a secret value.`;

/**
 * The prompt for one template. The CLI carries the template's onboarding
 * (`kortix templates onboard <id>`), so it always matches the installed version.
 */
export function templatePrompt(template: { id: string; name: string }): string {
  return `Set up the Kortix ${template.name} on this repository with me.
Install the Kortix CLI if it is missing (curl -fsSL https://kortix.com/install | bash), then run \`kortix templates onboard ${template.id}\` and follow what it prints, step by step.
Ask me before each decision it names. Never print a secret value.`;
}

/**
 * The prompt for a workspace that exists already and reads `kortix.yaml`
 * from `repository` on `branch`: the setup must push there.
 */
export function setupPrompt(workspace?: { repository?: string | null; branch?: string | null }): string {
  const repository = workspace?.repository?.trim();
  if (!repository) return SETUP_PROMPT;
  const branch = workspace?.branch?.trim() || 'its default branch';
  return `${SETUP_PROMPT}
The Kortix workspace exists already: it reads kortix.yaml from ${repository} on ${branch}. Push the setup there.`;
}

export const SETUP_GUIDE = `# Set up Kortix on this repository

The person pasted a prompt like "Add a Kortix software factory to this
repository with me". You are the coding agent on their computer. From here you
do everything: install the Kortix CLI, sign them in (one click in their
browser), agree with them what to build, write their \`kortix.yaml\` by adapting a
reference repository, and loop until \`kortix doctor --loops\` is green and one
real run worked. Their part is the conversation about what to build, one "go"
for the plan, and a few clicks only a person can make.

When you are done, agents run 24/7 in Kortix cloud sandboxes on a copy of their
dev environment, on their Claude or Codex plan or an API key, started by the
signals the plan named (GitHub issues, failing tests, errors, Slack, schedules).

\`kortix\` is your only tool for the platform. Use \`--json\` for everything you
parse.

## Rules

1. **Talk about what to build, approve once.** Investigate first. Settle the
   factories and their sources with the person in as many turns as they want;
   then show the whole plan and get one "go". After the go, do not ask again
   unless something fails in a way only they can decide.
2. **Secrets.** Values move only through \`kortix\` (it reads them in-process).
   Never print a secret, never put one in a command argument, never paste one
   into a file. **Never open a file that may hold one**: no \`cat\`, \`head\`,
   \`grep\` with context, or your own file-read tool on \`.env*\`, \`*.keys\`,
   \`.envrc\` or credential files. Reading a file sends its values to your model
   provider. Use the names-only view: \`kortix plan --json\` (\`env\`: every key,
   classed \`local\`, \`remote\` or \`prod\`).
3. **Never point agents at a shared backend.** A name classed \`remote\` or
   \`prod\` is not uploaded. The agents' dev environment runs locally and
   throwaway in the sandbox.
4. **Adapt, never copy.** A reference repository is an example. The
   person's \`kortix.yaml\` fits their repository: their tracker, their
   commands, their channels.
5. **Verify, don't assume.** A step is done when \`kortix doctor --loops\` or a
   real run proves it.
6. **Be brief.** One line per step while you work; a short report at the end.

## 0. Install

\`\`\`bash
command -v kortix || curl -fsSL https://kortix.com/install | bash
kortix --version
\`\`\`

## 1. Sign in and see the plan

\`\`\`bash
kortix whoami          # signed in? if not:
kortix login           # opens the browser: "click Authorize in the tab that just opened"
kortix plan --json     # the deterministic baseline, names only
\`\`\`

\`kortix plan\` reports the repository (GitHub origin, default branch, monorepo
layout, clean or dirty), the stack (runtimes, package managers, services, dev,
test and end-to-end commands, CI), every env key by class, the integrations it
detected with evidence (Sentry, PostHog, Linear, Slack, Convex, Supabase…), the
Kortix state (workspace, connectors, Slack, models), a dev-environment proposal
and the reference repositories.

## 2. Read the reference and find what the baseline misses

1. Read the reference repository the prompt names (clone it into a temporary
   folder, or read it on GitHub): its \`README.md\`, its \`ADAPTING.md\` (what to
   ask and check for that factory), \`kortix.yaml\` and \`.kortix/\`.
2. Read this repository the way a new engineer would: \`AGENTS.md\`,
   \`CLAUDE.md\`, \`CONTRIBUTING.md\`, the README, CI workflows, the scripts the
   team runs. Note every rule that conflicts with the factory (for example
   "push to main"): the person decides which wins.
3. For a monorepo, decide which apps the agents work on and how each one
   starts and tests.

## 3. Agree on what to build, then the plan

**What to build is a conversation.** Show, numbered: the factories that fit
(from the prompt and the plan), and for each one its sources (what starts work:
issues, tests, errors, Slack, schedules) with your pre-selection from the
detected integrations, where tickets live, and who merges. Go back and forth as
long as the person wants.

**Then the plan, once**, on one screen:

- the files you will write: \`kortix.yaml\` and \`.kortix/<factory>/\`, adapted;
  where the config lives (this repository, or its own private repository so
  the code gets no file);
- the dev environment: the sandbox image and the \`dev-environment\` skill
  (install, start, test, end-to-end commands; local services only);
- the secrets: the env names to upload (only \`local\`), the ones a person
  pastes through a link (the factory's own GitHub token), the webhook secrets
  \`kortix\` generates;
- the integrations: each connector to connect (one sign-in link each) and the
  Slack channels the bot joins;
- the models: the person's Claude or ChatGPT plan, shared with the workspace,
  or an API key; the reviewer on the strongest model;
- what you skip and why.

One "go" approves it all.

## 4. Write the configuration

Adapt the reference into this repository (or the config repository): write
\`kortix.yaml\` with \`env.required\` and \`env.optional\` listing every secret the
loops use, the \`.kortix/<factory>/\` folder, the sandbox \`Dockerfile\` (a
Debian-family base, the repository's runtimes at their pinned versions, git and
gh, no \`COPY\` from the repository) and the \`dev-environment\` skill. Then:

\`\`\`bash
kortix validate
\`\`\`

Fix every error and warning in the files you wrote.

## 5. Connect the models

- **Claude Pro or Max:** \`kortix providers login claude --start --share workspace --json\`;
  give the person the \`authorize_url\`; they paste the code back;
  \`kortix providers login claude --flow <flow_id> --code <code> --share workspace\`.
- **ChatGPT Plus or Pro:** \`kortix providers login openai\` in the background;
  give the person the link and the code it prints.
- **An API key:** \`kortix providers set <provider>\`; the person types the key.

## 6. Do it

\`\`\`bash
kortix onboard --yes --json \\
  [--env-file <file> --only <A,B>]... \\
  [--channels <a,b>] [--connect <slug,...>] \\
  [--repo <owner/repo>] [--github-token -]
\`\`\`

It runs in phases, each skipping what is done: \`validate\`, \`ship\` (link and
push; it refuses a dirty tree), \`secrets\` (approved names, generated webhook
secrets, one intake link for the rest), \`webhooks\` (the GitHub repository
webhooks and labels the triggers need, through the person's \`gh\`), \`slack\`
(connect link, the bot joins the channels), \`connectors\` (a sign-in link each),
\`sandbox\` (build every image and wait), \`doctor\`.

Exit 0 is done and green. Exit 4 means \`user_actions\` are left: give the person
each one, exactly once, with its link (install the GitHub App, Allow in Slack,
sign in to a connector, paste a token, \`/invite\` the bot to a private channel).
When they say it is done, run \`kortix onboard --yes --json\` again. Exit 1: read
the failed phase's \`detail\`, fix it, run again.

## 7. Prove it, and loop until it works

\`\`\`bash
kortix doctor --loops --json        # every check of what kortix.yaml declares
kortix doctor --loops --fix --json  # re-runs the phase a red line names
\`\`\`

Loop until \`ready: true\`. Then one real run, the cheapest one the factory has:
for the Software Factory, file one tiny real ticket the analysis found, label
it, \`kortix triggers fire factory-intake --wait 300s\`, and wait for the pull
request. Show it to the person: the summary, the commands with their real
output, the demo when the change is visible. Nobody merges it but them.

## 8. Hand over

A short report: the loops now running and what starts each, where tickets
land, who merges, how to start work by hand (label an issue, \`kortix triggers
fire <slug>\`), where to watch (the workspace link), and anything still open.
`;
