import {
  claudeCodeMcpCommand,
  codexMcpCommand,
  mcpJsonConfig,
} from '@kortix/ui/internal/lib/mcp-install';

import {
  KORTIX_MCP_URL,
  KORTIX_WEB_ORIGIN,
  SETUP_PROMPT_PATH,
  SETUP_PROMPT_URL,
} from '@/lib/agent-discovery';

export { SETUP_PROMPT_PATH, SETUP_PROMPT_URL };

/**
 * `/setup-prompt.md`: the text a person pastes into their own coding agent to
 * connect it to Kortix. The route serves it, llms.txt and the MCP server card
 * link it, and the "Other AI tools (MCP)" docs section prints the same
 * commands (public-content.test.ts holds the docs to them).
 *
 * The install commands come from `@kortix/ui/internal/lib/mcp-install`, the
 * module the "Connect MCP" dialog reads, so the two never differ.
 */
/** One line for indexes: llms.txt and the docs. */
export const SETUP_PROMPT_SUMMARY =
  'A prompt to paste into Claude Code, Codex, Cursor or another MCP client. The agent adds the Kortix MCP server, signs you in through your browser, reads the Kortix guides and starts a first session.';

/** The install commands for the Kortix Cloud MCP server, per client. */
export const MCP_INSTALL = {
  url: KORTIX_MCP_URL,
  claudeCode: claudeCodeMcpCommand(KORTIX_MCP_URL),
  codex: codexMcpCommand(KORTIX_MCP_URL),
  json: mcpJsonConfig(KORTIX_MCP_URL),
} as const;

const fence = (lang: string, body: string) => `\`\`\`${lang}\n${body}\n\`\`\``;

export function renderSetupPrompt(): string {
  return `# Connect this coding agent to Kortix

> ${SETUP_PROMPT_SUMMARY}
>
> To use it, paste this whole file into your coding agent, or send it this line: "Read ${SETUP_PROMPT_URL} and follow it."

Kortix is the open-source CompanyOS: a company's agents, skills, memory and connectors in one git repo. Every Kortix session runs on its own cloud computer. The Kortix MCP server lets you, a coding agent, act as the person who signs in: list their workspaces, start sessions, read their progress and call their connectors.

You are the coding agent. Do the steps below in order. After each step, tell the person in one line what you did. When a step fails, stop and tell the person what failed and what they can do.

## Rules

- Never ask the person for a password, a token, an API key or any other secret in this chat. Sign-in happens in their browser.
- Never print, store or commit a token. Do not put one in a file, a URL, a log or a message.
- Change only the MCP configuration of the client you run in. Ask before you change another client's configuration.
- The server acts with the person's own permissions. Before you start a session or call a connector that writes, say what you will do.

## Step 1. Add the Kortix MCP server

The server URL is ${KORTIX_MCP_URL} (Streamable HTTP). On a self-hosted Kortix, use \`https://api.<their domain>/v1/mcp\`. Ask the person for their domain if they run their own Kortix.

Run the command for the client you run in.

Claude Code:

${fence('sh', MCP_INSTALL.claudeCode)}

Codex (the second command opens the browser sign-in):

${fence('sh', MCP_INSTALL.codex)}

Cursor and other MCP clients: add this server to the client's MCP configuration file (Cursor reads \`~/.cursor/mcp.json\`). Keep the servers the file already has.

${fence('json', MCP_INSTALL.json)}

Then reload the client's MCP servers. If the client cannot load a new server while it runs, ask the person to restart it and to paste this prompt again.

## Step 2. Sign in

The server answers the first call with an OAuth challenge. The client opens the Kortix sign-in in the person's browser.

1. In Claude Code, run \`/mcp\`, select \`kortix\` and select **Authenticate**. Codex signs in with \`codex mcp login kortix\`. Other clients start the sign-in on the first tool call or from their MCP settings.
2. Tell the person: "Your browser opens the Kortix consent screen. Sign in, check that the request comes from this tool, and approve it."
3. A person with no Kortix account creates one at ${KORTIX_WEB_ORIGIN}/auth, then approves.
4. Wait until the person confirms. Then call \`list_projects\` to check the connection.

If the client has no browser sign-in, stop. Send the person to ${KORTIX_WEB_ORIGIN}/docs/guide#other-ai-tools-mcp.

## Step 3. Read the Kortix guides

The Kortix guides tell you how Kortix works. Read them before you do work.

1. Call \`read_skill\` with no arguments. It lists the guides.
2. Call \`read_skill\` with \`name: "kortix-system"\`. It explains workspaces, sessions, agents, \`kortix.yaml\`, triggers, change requests and the \`kortix\` CLI.
3. Call \`read_skill\` with \`name: "kortix-connectors"\`. It explains how connectors reach apps and APIs, and how a person connects an account.
4. Read a guide's reference file (\`read_skill\` with \`name\` and \`file\`) only when the task needs it.

## Step 4. Do a first task

1. Call \`list_projects\`. It lists every workspace the person can open. The tools name a workspace a project: \`project_id\` is the workspace ID.
2. Show the person their workspaces: name and role. If the list is empty, send them to ${KORTIX_WEB_ORIGIN}/workspaces to create one, then call \`list_projects\` again.
3. Ask which workspace to use and what the first task is. If they have no task, offer this one: "Read the repo and list its agents, skills and connectors."
4. Call \`start_session\` with the \`project_id\` and the task as \`prompt\`. An agent runs it on its own cloud computer and its own git branch. Keep the \`session_id\` it returns.
5. Call \`read_session\` with the \`session_id\` and \`wait_seconds\`. The first turn needs about 10 to 60 seconds while the sandbox boots. Call it again until the turn ends.
6. Tell the person what the agent did, in a few lines. Give them the \`session_id\`.

## What to do next

- \`list_sessions\`, \`send_message\` and \`read_session\`: follow and continue sessions.
- \`run_command\`, \`read_file\`, \`write_file\` and \`list_files\`: work on a session's cloud computer or in the workspace repo.
- \`search_project\`: search the workspace's files.
- \`list_connectors\`, \`search_connector_actions\` and \`call_connector\`: use the workspace's connectors.
- \`search_api\`, \`describe_api\` and \`call_api\`: reach any Kortix API route the person may use.
- \`kortix\`: run a \`kortix\` CLI command as the person.

Docs: ${KORTIX_WEB_ORIGIN}/docs. Full index for agents: ${KORTIX_WEB_ORIGIN}/llms.txt.
`;
}
