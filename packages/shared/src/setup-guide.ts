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

You are a coding agent on the person's own computer. You set up Kortix with them:
agents that run 24/7 in Kortix cloud sandboxes, on their own Claude or ChatGPT
plan or an API key, started by schedules and GitHub events. The whole setup is
one \`kortix.yaml\` and one \`.kortix/\` folder in their repository.

Rules for the whole guide:

1. Ask the person before each step marked **Ask**. Do the rest yourself.
2. Never print, echo, log or commit a secret value. Pass values through pipes and
   \`KEY=-\` (stdin), never as command arguments.
3. Run every command yourself and read its exit code. When one fails, read the
   message, fix the cause and run it again. Stop and tell the person only when
   the fix needs them.
4. Keep the person's existing \`kortix.yaml\`, agents and comments. Add to them.

## 1. The Kortix CLI

1. Run \`kortix --version\`. If the command is missing, install it:
   \`curl -fsSL https://kortix.com/install | bash\`, then open a new shell or add
   the printed path to \`PATH\`.
2. Run \`kortix templates ls --json\`. If the command is unknown, run
   \`kortix update\` (or install again) and repeat.

## 2. Where the config lives

1. Run \`git rev-parse --show-toplevel\` and \`git remote get-url origin\`. The code
   must be on GitHub: the agents clone it and open pull requests there.
2. **Ask** where the Kortix config lives. Offer two choices:
   - **In this repository** (recommended for a monorepo): one \`kortix.yaml\` and
     one \`.kortix/\` folder at its root. Nothing else changes.
   - **Its own repository**: a new private \`<owner>/kortix\` holds every Kortix
     file, and the code repository gets no file at all. Choose it when the person
     wants nothing added to their code, or the agents work on several repositories.
3. In this repository: \`cd\` to its root. Make sure the working tree is clean or
   that the person agrees to commit the setup on top of their changes.
4. Its own repository: run \`gh repo create <owner>/kortix --private --clone\` next
   to the code checkout and \`cd\` into it. From now on, pass the code repository to
   every \`kortix templates add\` as \`--repo <owner>/<code-repo> --branch <default>\`,
   and read the code (step 5) from the original checkout. The GitHub webhooks
   (step 10) still go on the code repository.

## 3. Sign in

1. Run \`kortix whoami\`. If it is not signed in, run \`kortix login\`. It opens the
   person's browser: they click once. On a machine with no browser, run
   \`kortix login --device\` and give them the link and the code it prints.
2. With no workspace yet, \`kortix ship\` creates one in step 8. Continue.

## 4. Pick templates

1. Show the person the templates from \`kortix templates ls --json\`: name and
   summary, one line each.
2. **Ask** which ones to add. More than one is fine.
3. For each one: \`kortix templates add <id> --json\`. Keep the JSON: its \`next\`
   lists the secrets and GitHub webhooks this template needs.
4. Read every file the command wrote under \`.kortix/<id>/\`. If an agent name or
   a trigger slug collides with one the repository already has, rename the new
   one in its file and in every trigger that names it.
5. Keep the agent setup the repository already has. Do not move or edit it.
   - For each \`.claude/agents/<name>.md\`, add an agent \`<name>\` to
     \`kortix.yaml\` with \`prompt_file: .claude/agents/<name>.md\`, the
     \`description\` from its frontmatter, \`mode: primary\` and \`tools: "*"\`.
   - For each folder that holds a \`SKILL.md\` (\`.agents/skills/<name>\`,
     \`.claude/skills/<name>\`, \`skills/<name>\`), add \`<name>: <folder>\` under
     \`skills:\`. Skip a name that starts with \`kortix-\`.

## 5. The dev environment

The agents work on the code in their own cloud sandbox, so the sandbox needs the
repository's tools. Skip this step when no chosen template has
\`needs_dev_sandbox: true\`.

1. Read the repository: package managers and lockfiles, language versions
   (\`.nvmrc\`, \`.tool-versions\`, \`engines\`, \`pyproject.toml\`, \`go.mod\`),
   services (\`docker-compose.yml\`, databases), the dev, test and end-to-end
   commands, and the README.
2. Write \`.kortix/sandbox/Dockerfile\`: a Debian-family base image, the language
   runtimes at the repository's versions, the system packages, \`git\` and \`gh\`.
   Do not \`COPY\` from the repository and do not use a \`RUN\` heredoc:
   \`kortix validate\` refuses both. The agents clone the code at run time.
3. Set \`container_runtime: true\` on the template when the dev environment runs
   Docker (a database in a container, \`docker compose\`).
4. Add the template to the root \`kortix.yaml\`:

   \`\`\`yaml
   sandbox:
     default: dev
     templates:
       - slug: dev
         dockerfile: .kortix/sandbox/Dockerfile
   \`\`\`
5. Write the \`dev-environment\` skill, the page every agent loads before it
   works: \`.kortix/skills/dev-environment/SKILL.md\`, with a frontmatter
   \`name: dev-environment\` and a one-line \`description\`, then exact commands
   only: install, start each service and the app, the type check, the linter,
   the tests, the end-to-end tests, the URLs and ports. Register it in
   \`kortix.yaml\`:

   \`\`\`yaml
   skills:
     dev-environment: .kortix/skills/dev-environment
   \`\`\`
6. Build the image once to prove it: \`kortix sandboxes build --local dev\` when
   Docker runs here. Otherwise \`kortix ship\` starts its cloud build in step 8.

## 6. Secrets

1. Find the dotenv files: \`.env\`, \`.env.local\`, \`.env.development\` and the
   same names under each app folder. Never \`cat\` one.
2. For each file run \`kortix env push --from <file> --names --json\`. It prints
   names only.
3. **Ask**: show the names, grouped by file. Recommend the ones the dev
   environment needs. Never upload a name marked \`remote\`: its value points
   at a shared backend (a staging or production database, a hosted API), and
   agents that test against it change real data. The dev environment runs
   locally and throwaway in the sandbox: point those names at local services
   in the \`dev-environment\` skill instead (for example a local database the
   skill starts). Flag every name that looks like production (\`PROD\`,
   \`LIVE\`, \`sk_live\`) and recommend leaving it out. Files named for a
   shared environment (\`.env.staging\`, \`.env.production\`) are never a
   source.
4. After the person approves, the workspace must exist: run step 8's
   \`kortix ship\` first if it has not run. Then
   \`kortix env push --from <file> --only <A,B,C>\`. Names it marks
   \`encrypted\` (dotenvx) need a decrypted copy: ask the person.
5. Add every approved name under \`env.required\` in \`kortix.yaml\`, so the next
   person who sets up the workspace is asked for it.

## 7. Models

**Ask** which plan the agents run on. Then:

- **Claude Pro or Max:** run \`kortix providers login claude --start --share workspace --json\`.
  Give the person the \`authorize_url\`. They approve on claude.com and paste the
  code to you. Run \`kortix providers login claude --flow <flow_id> --code <code> --share workspace\`.
- **ChatGPT Plus or Pro:** run \`kortix providers login openai\` in the
  background. Give the person the link and the code it prints. It finishes
  when they approve.
- **An API key:** run \`kortix providers set <provider>\` and let the person type
  the key there, or ask them to run it themselves. Providers:
  \`kortix providers --help\`.

Then run \`kortix models ls\` and confirm that a model of that plan is listed.

## 8. Validate and push

1. Run \`kortix validate\`. Fix every error and warning in the files you wrote.
2. Commit only the Kortix files: \`kortix.yaml\` and \`.kortix/\` (in its own
   repository: everything). Message:
   \`chore: add Kortix agents (<template names>)\`.
3. **Ask** how the setup reaches the default branch, which Kortix reads:
   - **Push it** (recommended for the config's own repository): \`kortix ship\`.
   - **A pull request** (recommended when other people work on the code): push a
     branch \`kortix/setup\`, open the pull request with \`gh pr create\`, wait until
     the person merges it, then pull the default branch and run \`kortix ship\`.
4. \`kortix ship -y\` stages every change before it commits: run it only on a
   clean tree. It creates the workspace on the first run, links the GitHub
   repository and pushes. Give the person the workspace link it prints.
5. When \`ship\` stops with "Kortix GitHub App not installed", give the person the
   install link it printed: one click on GitHub. Wait until they say it is done,
   then run \`kortix ship -y\` again. Where the App cannot be installed, **Ask**
   whether you may link with their GitHub login instead:
   \`gh auth token | kortix ship -y --github-token -\` (the token never sits in a
   command line).
6. When kortix.yaml declares a sandbox template, \`ship\` starts its cloud build
   after the push and prints one line per template. Run
   \`kortix sandboxes build <slug> --wait\` before step 11: a session that starts
   before the image is ready boots the platform default image. On a failed
   build, read the error it prints, fix the Dockerfile, \`kortix ship\` again.

## 9. Template secrets

For each secret in each template's \`next.secrets\`:

- \`generate: true\`: make a random value and store it without printing it:
  \`openssl rand -hex 32 | kortix secrets set <NAME>=- --scope connector\` when
  \`delivery\` is \`connector\`, without \`--scope\` when it is \`sandbox\`.
  Keep the value for step 10 in a shell variable or a file under \`/tmp\` with
  mode 600, and delete the file after step 10.
- \`GH_TOKEN\`: the agents' own GitHub access. Open this page for the person
  (it pre-fills a fine-grained token):
  \`https://github.com/settings/personal-access-tokens/new?name=Kortix%20agents&description=Kortix%20cloud%20agents&target_name=<owner>&expires_in=366&contents=write&pull_requests=write&issues=write&metadata=read&workflows=write\`,
  with \`<owner>\` the repository's owner. They select the repository and create it. Then run
  \`kortix secrets request GH_TOKEN --scope runtime\` and give them the link: they
  paste the token there, so it never passes through you. A token of the person
  makes the agents' reviews plain comments: GitHub refuses an approval of a
  pull request the same account opened. For approving reviews, recommend a
  token of a machine user that has write access.
- Any other secret: \`kortix secrets request <NAME> --scope runtime\` and give the
  person the link.

## 10. GitHub webhooks

For each entry in each template's \`next.github_webhooks\`:

1. Read the trigger's URL: \`kortix triggers info <trigger> --json\` (\`webhook_url\`).
2. Create the webhook with the person's own \`gh\` (run \`gh auth status\` first):

   \`\`\`sh
   gh api repos/<owner>/<repo>/hooks --method POST \\
     -f name=web -F active=true \\
     -f 'config[url]=<webhook_url>' -f 'config[content_type]=json' \\
     -f "config[secret]=$SECRET" -f 'events[]=<event>'
   \`\`\`

   \`$SECRET\` is the value you generated for the trigger's webhook secret.
3. GitHub sends a \`ping\` at once. \`kortix triggers runs <trigger>\` shows it as
   skipped by the filter: that proves the signature works.
4. Create the template's label when it names one: \`gh label create <label>\`.

## 11. Prove one run

1. Pick the cheapest trigger of the chosen templates, such as a nightly
   schedule. Run \`kortix triggers fire <slug> --wait 300s\`.
2. On failure, read the output and \`kortix triggers runs <slug>\`, fix the
   cause and fire again.
3. When it passes, give the person the session link and one line on what the
   agent did.

## 12. Doctor: every line green

Run \`kortix templates doctor <id> --json\` for each template you added (from the
config checkout; pass \`--repo <owner>/<code-repo>\` when the config lives in
its own repository). It checks the template, the workspace, the secrets, the
triggers, the dev image, the model and the GitHub webhooks. Fix every \`fail\`
line with its \`fix\` and run it again. Setup is not done while one line is red.

## 13. Done

Tell the person, in a short list:

- the templates, agents and triggers now running, with the schedule of each;
- how to start work by hand: label a GitHub issue with \`kortix\`, or
  \`kortix triggers fire <slug>\`;
- where to watch: the workspace link;
- what is still open, such as a secret request they have not filled in.
`;
