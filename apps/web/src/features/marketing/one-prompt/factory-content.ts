/**
 * The data on the Software Factory home. Every ticket, command and result is
 * from one real run on a demo repository (github.com/markokraemer/kortix-factory-demo,
 * 2026-11-10): the nightly tester filed issues #1–#3, the builder opened pull
 * requests #4–#6, a reviewer agent ran each one. Nothing here is invented.
 */
export const DEMO = {
  repo: 'kortix-factory-demo',
  tickets: [
    { number: 1, title: 'POST /todos with malformed JSON crashes the whole server', state: 'in review' },
    { number: 2, title: 'POST /todos/:id/done returns 200 for a nonexistent todo', state: 'in review' },
    { number: 3, title: 'POST /todos accepts a missing, empty or non-string title', state: 'in review' },
  ],
  /** The reviewer's checks on pull request #6, as it reported them. */
  worker: [
    { kind: 'cmd', text: "curl -X POST /todos -d '{bad'   # on main" },
    { kind: 'out', text: '000 · process exited: SyntaxError at src/server.js:16' },
    { kind: 'cmd', text: "curl -X POST /todos -d '{bad'   # on the fix" },
    { kind: 'ok', text: '400 {"error":"invalid json"} · GET /todos → 200' },
    { kind: 'cmd', text: 'npm test   # 3 consecutive runs' },
    { kind: 'ok', text: '4 pass, 0 fail, each run' },
  ] as Array<{ kind: 'cmd' | 'out' | 'ok'; text: string }>,
  pr: {
    number: 6,
    title: 'fix: return 400 on malformed JSON instead of crashing the server',
    branch: 'kortix/fix-malformed-json-crash',
    additions: 83,
    deletions: 3,
    checks: ['npm run lint · exit 0', 'npm test · 4 pass, 0 fail, 3 runs', 'on main · crash reproduced', 'on the branch · 400, server up'],
  },
};

export const RUNS = [
  { issue: 1, pr: 6, bug: 'POST /todos with malformed JSON crashes the whole server', fix: 'fix: return 400 on malformed JSON instead of crashing the server' },
  { issue: 2, pr: 4, bug: 'POST /todos/:id/done returns 200 for a nonexistent todo', fix: 'fix: return 404 when completing a nonexistent todo' },
  { issue: 3, pr: 5, bug: 'POST /todos accepts a missing, empty or non-string title', fix: 'fix: reject missing, empty or non-string todo titles' },
];

/** The factory's sources as factory.json ships them. */
export const SOURCES = [
  { name: 'GitHub issues', on: true },
  { name: 'Nightly tests', on: true },
  { name: 'Sentry · Better Stack', on: false },
  { name: 'Logs and database anomalies', on: false },
  { name: 'Slack threads', on: false },
  { name: 'Security findings', on: false },
];

/** Names only: the brand kit allows no third-party logos. */
export const TOOLS = ['GitHub', 'Linear', 'Jira', 'Asana', 'Slack', 'Sentry', 'Better Stack', 'Claude Code', 'Codex'];

export const FAQ = [
  { q: 'What is the Software Factory?', a: 'Agents on your repository that turn issues, failing tests and errors into tickets, then each ticket into a verified pull request. It is one folder, .kortix/, in your repository or in a repository of its own.' },
  { q: 'Which coding agents can run the prompt?', a: 'Any agent with a shell on your computer: Claude Code, Codex, Cursor. It follows kortix.com/factory.md with you and asks before every decision.' },
  { q: 'Which models do the agents use?', a: 'The plan you already have: your Claude or ChatGPT subscription, or any API key you add. It is shared with your workspace, so scheduled runs use it too.' },
  { q: 'Does it work with my existing repository?', a: 'Yes. It reads how the repository builds and tests, and writes a dev environment the agents use. Your code stays in your GitHub repository.' },
  { q: 'Where do the agents run?', a: 'In Kortix cloud sandboxes, one per ticket, on your dev environment. They never point at your staging or production systems.' },
  { q: 'Who merges the pull requests?', a: 'You. Every pull request waits for a person until you allow auto-merge. Security fixes always wait.' },
  { q: 'How do I turn it off?', a: 'Pause its triggers with one command, or delete the .kortix/ folder.' },
];
