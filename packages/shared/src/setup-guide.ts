/**
 * The one-prompt setup. A developer pastes a prompt into the coding agent on
 * their own computer (Claude Code, Codex, any agent with a shell). That agent
 * fetches the guide from \`<origin>/setup.md\` and does every step with them:
 * sign in, models, a template, the dev environment, secrets, push, webhooks,
 * and one real run.
 *
 * Every prompt and the guide are built for one deployment (\`SetupTarget\`):
 * kortix.com serves the production prompt; dev.kortix.com and a local stack
 * serve prompts and a guide that point at themselves and their own API, so a
 * copied prompt is always testable where it was copied.
 */

/** The Kortix deployment a prompt and the guide point at. */
export interface SetupTarget {
  /** The web origin that serves the guide and the installer, without a trailing slash. */
  origin: string;
  /** The API base the CLI signs in to, without \`/v1\`. */
  apiBase: string;
}

export const PROD_TARGET: SetupTarget = { origin: 'https://kortix.com', apiBase: 'https://api.kortix.com' };

const trim = (url: string) => url.trim().replace(/\/+$/, '');

/**
 * The target of one deployment from its web origin and its backend URL
 * (\`NEXT_PUBLIC_BACKEND_URL\`: absolute or root-relative, with or without \`/v1\`).
 * Missing values fall back to production.
 */
export function setupTarget(origin?: string | null, backendUrl?: string | null): SetupTarget {
  const web = origin ? trim(origin) : PROD_TARGET.origin;
  if (web === PROD_TARGET.origin) return PROD_TARGET;
  const backend = backendUrl?.trim() ? trim(backendUrl) : '';
  const absolute = /^https?:\/\//.test(backend) ? backend : backend ? `${web}${backend.startsWith('/') ? '' : '/'}${backend}` : '';
  return { origin: web, apiBase: absolute ? absolute.replace(/\/v1$/, '') : PROD_TARGET.apiBase };
}

const isProd = (target: SetupTarget) => target.origin === PROD_TARGET.origin && target.apiBase === PROD_TARGET.apiBase;

/** The CLI host name of a non-production deployment: \`dev.kortix.com\` → \`dev-kortix-com\`, \`localhost:3000\` → \`localhost-3000\`. */
export function setupHostName(target: SetupTarget): string {
  return target.origin.replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

export const guideUrl = (target: SetupTarget = PROD_TARGET) => `${target.origin}/setup.md`;
export const SETUP_GUIDE_URL = guideUrl();
export const FACTORY_GUIDE_URL = `${PROD_TARGET.origin}/factory.md`;

/** Step 0 of the guide: install the CLI and, off production, point it at this deployment. */
function installBlock(target: SetupTarget): string {
  if (isProd(target)) {
    return ['```bash', `command -v kortix || curl -fsSL ${target.origin}/install | bash`, 'kortix --version', '```'].join('\n');
  }
  const host = setupHostName(target);
  return [
    `This guide is served by the Kortix deployment at ${target.origin} (API ${target.apiBase}),`,
    'not production. Point the CLI at it before anything else; every later',
    'command then talks to this deployment.',
    '',
    '```bash',
    `command -v kortix || curl -fsSL ${target.origin}/install | KORTIX_CHANNEL=dev bash`,
    'kortix --version',
    `kortix hosts info ${host} >/dev/null 2>&1 || kortix hosts add ${host} --url ${target.apiBase}`,
    `kortix hosts use ${host}`,
    'kortix hosts current   # must print ' + host,
    '```',
  ].join('\n');
}

/** Step 8 of the guide: register this deployment's MCP server with the local coding agents and link the skills. */
function agentBlock(target: SetupTarget): string {
  const url = `${target.apiBase}/v1/mcp`;
  return [
    '```bash',
    `command -v claude >/dev/null && claude mcp add --transport http kortix ${url}`,
    `command -v codex >/dev/null && codex mcp add kortix --url ${url} && codex mcp login kortix`,
    'kortix init --force',
    '```',
  ].join('\n');
}

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
export const loopGuideUrl = (id: string, target: SetupTarget = PROD_TARGET) => `${target.origin}/loops/${id}.md`;

/** The one prompt of one factory: read its reference repository, adapt it, follow the setup guide. */
export function loopPrompt(loop: { id: string; name: string }, target: SetupTarget = PROD_TARGET): string {
  const reference = REFERENCE_REPOS[loop.id];
  const read = reference ? `Read ${reference} and adapt it to this repository.\n` : '';
  return `Add a Kortix ${loop.name.toLowerCase()} to this repository with me.
${read}Set it up with the Kortix CLI, following ${guideUrl(target)} step by step.
Ask me before each decision. Never print a secret value.`;
}

/** What a person copies. Short on purpose: the guide it points to is versioned and served. */
export function setupPromptFor(target: SetupTarget = PROD_TARGET): string {
  const url = guideUrl(target);
  return `Set up Kortix cloud agents on this repository with me.
Read ${url} (curl -fsSL ${url}) and follow it step by step.
Ask me before each decision it names. Never print a secret value.`;
}

/** The production prompt. */
export const SETUP_PROMPT = setupPromptFor();

/**
 * The prompt for one template. The CLI carries the template's onboarding
 * (\`kortix templates onboard <id>\`), so it always matches the installed version.
 */
export function templatePrompt(template: { id: string; name: string }, target: SetupTarget = PROD_TARGET): string {
  return `Set up the Kortix ${template.name} on this repository with me.
Install the Kortix CLI if it is missing (curl -fsSL ${target.origin}/install | bash), then run \`kortix templates onboard ${template.id}\` and follow what it prints, step by step.
Ask me before each decision it names. Never print a secret value.`;
}

/**
 * The prompt for a workspace that exists already and reads \`kortix.yaml\`
 * from \`repository\` on \`branch\`: the setup must push there.
 */
export function setupPrompt(
  workspace?: { repository?: string | null; branch?: string | null },
  target: SetupTarget = PROD_TARGET,
): string {
  const prompt = setupPromptFor(target);
  const repository = workspace?.repository?.trim();
  if (!repository) return prompt;
  const branch = workspace?.branch?.trim() || 'its default branch';
  return `${prompt}
The Kortix workspace exists already: it reads kortix.yaml from ${repository} on ${branch}. Push the setup there.`;
}

/** The guide for one deployment, served at \`<origin>/setup.md\`. */
export function setupGuide(target: SetupTarget = PROD_TARGET): string {
  return `# Set up Kortix on this repository

The person pasted a prompt like "Add a Kortix software factory to this
repository with me". You are the coding agent on their computer. From here you
do everything: install the Kortix CLI, sign them in (one click in their
browser), find every piece of software they use, agree with them what to
connect, which signals to listen to and which loops to run, write their
\`kortix.yaml\` by adapting a reference repository, loop until \`kortix doctor
--loops\` is green and one real run worked, and wire their local coding agents
to Kortix. Their part is the conversation about what to build, one "go"
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

${installBlock(target)}

## 1. Sign in and see the plan

\`\`\`bash
kortix whoami          # signed in? if not:
kortix login           # opens the browser: "click Authorize in the tab that just opened"
kortix plan --json     # the deterministic baseline, names only
\`\`\`

\`kortix plan\` reports the repository (GitHub origin, default branch, monorepo
layout, clean or dirty), the stack (runtimes, package managers, services, dev,
test and end-to-end commands, CI), every env key by class, the software it
found (\`integrations\`: each with a category and its evidence; about 90
products are known), the credentials it could not name
(\`unrecognized_services\`: a key prefix each), the MCP servers the repository's
coding tools already use (\`mcp_servers\`, names only), the Kortix state
(workspace, connectors, Slack, models), a dev-environment proposal and the
reference repositories.

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
4. **Inventory every piece of software, and go deep.** The plan's list is the
   floor, not the ceiling. Add what you find yourself: SDK imports, webhook
   handlers, secret names in CI workflows, links in the docs, deploy configs.
   For each \`unrecognized_services\` prefix, ask the person what it is. Then
   ask once what the company uses that the repository does not show: the
   tracker, the CRM, the support desk, the analytics, the docs, the calendar,
   the applicant tracker. Every loop is only as good as what it can reach.

## 3. Agree on what to build, then the plan

**What to build is a conversation**, in three lists. Go back and forth as long
as the person wants.

1. **Connect.** Every piece of software from the inventory, numbered, with
   your pre-selection: connect it as a Kortix connector (the agents can call
   it), leave it out, or decide later. Plus the env names to upload.
2. **Signals.** What the agents listen to, per connected tool: a labeled
   issue, a merged pull request, a failing test run, a new error, a Slack
   message or mention, a new signup, an inbound email, a schedule. Pre-select
   the ones the evidence supports.
3. **Loops.** What runs on each signal and what it ships: the reference
   factory's loops, adapted, plus any loop the person describes in their own
   words. A custom loop is a trigger, a prompt and the skills it needs; write
   it the same way. For each loop: who approves its output.

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
gh, no \`COPY\` from the repository), the template's \`cpu\`, \`memory\` and \`disk\`
from the plan's \`dev_environment.resources\` (a sandbox too small for the dev
stack crashes the tests), and the \`dev-environment\` skill. Then:

\`\`\`bash
kortix validate
\`\`\`

Fix every error and warning in the files you wrote. Two rules save a round:

- Give every agent you add a \`tools\` list (or \`"*"\`). An agent without one
  trips a deprecation warning.
- When \`kortix.yaml\` lives in its own repository, add
  \`body.repository.full_name: <owner>/<repo>\` to the \`filter\` of every
  GitHub webhook trigger. It names the code repository in code: \`onboard\`
  and \`doctor\` then put the webhooks and labels there, and an event from any
  other repository never starts a run.

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
  [--name "<workspace name>"] [--repo <owner/repo>] [--github-token -]
\`\`\`

The first run creates the workspace. \`--name\` is its display name (default:
\`project.name\` in \`kortix.yaml\`, else the folder name): agree it with the
person, for example "Acme Loops". \`--repo\` is the code repository for the
webhooks when \`kortix.yaml\` lives elsewhere and its triggers carry no
\`body.repository.full_name\` filter.

It runs in phases, each skipping what is done: \`validate\`, \`ship\` (link and
push; it refuses a dirty tree), \`secrets\` (approved names, generated webhook
secrets, one intake link for the rest), \`webhooks\` (the GitHub repository
webhooks and labels the triggers need, through the person's \`gh\`), \`slack\`
(connect link, the bot joins the channels), \`connectors\` (a sign-in link each),
\`sandbox\` (build every image and wait; a first build takes 5 to 10 minutes
and prints nothing in \`--json\` mode: tell the person before you start),
\`doctor\`.

A repository webhook that already sends the same event to another Kortix
workspace is left in place and reported in the \`webhooks\` detail. Tell the
person: two workspaces would act on the same event. They pick one; delete the
other hook with the command \`kortix doctor --loops\` prints.

A source that is off needs nothing: a disabled Slack trigger asks for no Slack
connection.

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

Pass the same \`--repo <owner/repo>\` you gave \`onboard\`, if any.

Loop until \`ready: true\`. Then one real run, the cheapest one the factory has:
for the Software Factory, file one tiny real ticket the analysis found, label
it, \`kortix triggers fire factory-intake --wait 300s\`, and wait for the pull
request. Show it to the person: the summary, the commands with their real
output, the demo when the change is visible. Nobody merges it but them.

## 8. Wire this computer's coding agents

So the person can run, change and add loops by talking to the agent they
already use. Tell them each thing you add.

${agentBlock(target)}

- The MCP server lets a coding agent start Kortix sessions, read their
  progress, run commands in a session's sandbox and call the workspace's
  connectors, as the person, with their permissions. The first call opens a
  consent page in the browser. A coding agent loads a new MCP server at its
  next start: say so.
- \`kortix init --force\` runs in the repository that holds \`kortix.yaml\`. It
  links every skill \`kortix.yaml\` registers where each local tool reads
  skills (never committed). An \`AGENTS.md\` the repository already has is
  kept: it gets one marked Kortix section at the end. A code repository
  without \`kortix.yaml\` gets the MCP server and the rule below, nothing else.
- With the person's yes, add this rule to the repository's \`AGENTS.md\` (and
  \`CLAUDE.md\` when it exists): "This repository runs Kortix loops, defined
  in \`kortix.yaml\`. To reach an outside tool, use the Kortix connectors
  (\`kortix connectors\` or the Kortix MCP server) before any local
  credential. To add or change a loop, edit \`kortix.yaml\`, run \`kortix
  validate\`, then \`kortix ship\`."
- Use the CLI for setup and scripts, the MCP server in conversation. Both
  reach the same workspace.

## 9. Hand over

A short report: the loops now running and what starts each, where tickets
land, who merges, how to start work by hand (label an issue, \`kortix triggers
fire <slug>\`), how to add the next loop (ask this agent: it edits
\`kortix.yaml\` and ships it), what you wired on this computer (the MCP
server, the skills), where to watch (the workspace link), and anything still
open.
`;
}

/** The production guide. */
export const SETUP_GUIDE = setupGuide();
