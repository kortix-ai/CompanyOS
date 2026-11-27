/**
 * `kortix humanoid` — the workspace as one Humanoid (flag `humanoid`): its
 * identity and its event ledger. Every message, mail, schedule and connector
 * event the Humanoid receives is one row in the ledger, with a state.
 */
import { splitHelp } from '../command-argv.ts';
import {
  emitJson,
  fail,
  missing,
  resolveProjectContext,
  surfaceApiError,
  takeFlagBool,
  takeFlagValue,
} from '../command-helpers.ts';
import { C, formatUtcInstant, help, pad, status } from '../style.ts';

const HELP = help`Usage: kortix humanoid <subcommand> [options]

The workspace as one Humanoid: an AI with its own identity (email, later a
phone, an authenticator and a browser) that works around the clock. Every
input — a message, a mail, a schedule, a connector event, a finished
thread — is one event in its ledger, with a state:
  pending    waiting for the dispatcher
  routed     a session took it
  digested   handed to the Humanoid's own conversation as part of a digest
  recorded   kept for awareness, or the Humanoid's own action
  dead       every attempt failed

Subcommands:
  show                       Its identity and event counts.
  create --name <name>       Make this workspace a Humanoid (a person runs it).
         [--role <role>]
  events                     The ledger, newest first.
         [--source <s>] [--subject <s>] [--limit <n>] [--before <id>]
  post "<summary>"           Post an event. The dispatcher takes it up.
         [--type <a.b.c>]    Default person.message.posted (session.note.posted
                             from inside a session).
         [--subject <s>]     The thread key; events of one subject run in order.
         [--id <external>]   A retry with the same id writes nothing new.

Options:
  --json                      Machine-readable output.
  --workspace <id>            Target workspace (default: linked).
`;

type Humanoid = {
  name: string;
  role: string | null;
  status: string;
  last_error: string | null;
  email: string | null;
  phone: string | null;
  browser_id: string | null;
  mind_session_id: string | null;
  events: Record<string, number>;
};

type HumanoidEvent = {
  event_id: number;
  source: string;
  type: string;
  subject: string | null;
  direction: 'in' | 'out';
  received_at: string;
  summary: string;
  dispatch_status: string;
  routed_session_id: string | null;
  last_error: string | null;
};

function writeHumanoid(h: Humanoid): void {
  const counts = Object.entries(h.events).map(([k, n]) => `${n} ${k}`).join(', ') || 'none yet';
  const line = (label: string, value: string | null) =>
    process.stdout.write(`  ${C.dim}${pad(label, 13)}${C.reset}${value ?? `${C.dim}—${C.reset}`}\n`);
  process.stdout.write('\n');
  line('Name', h.role ? `${h.name} · ${h.role}` : h.name);
  line('Status', h.last_error ? `${h.status} (${h.last_error})` : h.status);
  line('Email', h.email);
  line('Phone', h.phone);
  line('Browser', h.browser_id);
  line('Conversation', h.mind_session_id);
  line('Events', counts);
  process.stdout.write('\n');
}

export async function runHumanoid(argv: string[]): Promise<number> {
  const help = splitHelp(argv, HELP);
  if (help !== null) return help;
  const rest = [...argv];
  let flags: Record<string, string | undefined>;
  let json = false;
  try {
    flags = {
      name: takeFlagValue(rest, ['--name']),
      role: takeFlagValue(rest, ['--role']),
      source: takeFlagValue(rest, ['--source']),
      subject: takeFlagValue(rest, ['--subject']),
      limit: takeFlagValue(rest, ['--limit']),
      before: takeFlagValue(rest, ['--before']),
      type: takeFlagValue(rest, ['--type']),
      id: takeFlagValue(rest, ['--id']),
      project: takeFlagValue(rest, ['--project', '--workspace']),
      host: takeFlagValue(rest, ['--host']),
    };
    json = takeFlagBool(rest, ['--json']);
  } catch (err) {
    return fail((err as Error).message);
  }
  const sub = rest.shift() ?? 'show';
  if (!['show', 'create', 'events', 'ls', 'post'].includes(sub)) {
    return fail(`Unknown subcommand "${sub}". Run \`kortix humanoid --help\`.`);
  }

  const ctx = await resolveProjectContext({ projectArg: flags.project, hostArg: flags.host });
  if (!ctx) return 1;
  const { client, projectId } = ctx;
  const base = `/workspaces/${encodeURIComponent(projectId)}/humanoid`;

  try {
    if (sub === 'show') {
      const { humanoid } = await client.get<{ humanoid: Humanoid }>(base);
      if (json) emitJson(humanoid);
      else writeHumanoid(humanoid);
      return 0;
    }
    if (sub === 'create') {
      if (!flags.name) return missing('--name <name>, e.g. kortix humanoid create --name Otto');
      const { humanoid } = await client.post<{ humanoid: Humanoid }>(base, { name: flags.name, role: flags.role ?? null });
      if (json) emitJson(humanoid);
      else {
        process.stdout.write(`${status.ok(`${humanoid.name} is ready`)}\n`);
        writeHumanoid(humanoid);
      }
      return 0;
    }
    if (sub === 'post') {
      const summary = rest.join(' ').trim();
      if (!summary) return missing('the event text, e.g. kortix humanoid post "Prepare the Monday report"');
      const inSession = Boolean(process.env.KORTIX_SESSION_ID);
      const posted = await client.post<{ event_id: number; inserted: boolean }>(`${base}/events`, {
        type: flags.type ?? (inSession ? 'session.note.posted' : 'person.message.posted'),
        summary,
        subject: flags.subject ?? null,
        ...(flags.id ? { external_id: flags.id } : {}),
      });
      if (json) emitJson(posted);
      else process.stdout.write(`${status.ok(posted.inserted ? `Event ${posted.event_id} posted` : `Event ${posted.event_id} was already in the ledger`)}\n`);
      return 0;
    }
    const query = new URLSearchParams();
    for (const key of ['source', 'subject', 'limit', 'before'] as const) {
      if (flags[key]) query.set(key, flags[key]!);
    }
    const page = await client.get<{ events: HumanoidEvent[]; next_before: number | null }>(
      `${base}/events${query.size ? `?${query}` : ''}`,
    );
    if (json) {
      emitJson(page);
      return 0;
    }
    if (page.events.length === 0) {
      process.stdout.write(`  ${C.dim}No events.${C.reset}\n`);
      return 0;
    }
    process.stdout.write(`\n  ${C.dim}${pad('ID', 7)} ${pad('RECEIVED', 20)}  ${pad('STATE', 9)} ${pad('TYPE', 28)} SUMMARY${C.reset}\n`);
    for (const e of page.events) {
      const arrow = e.direction === 'out' ? '→ ' : '';
      const summary = `${arrow}${e.summary}`.replace(/\s+/g, ' ');
      process.stdout.write(
        `  ${pad(String(e.event_id), 7)} ${pad(formatUtcInstant(e.received_at), 20)}  ${pad(e.dispatch_status, 9)} ${pad(e.type.slice(0, 28), 28)} ${summary.length > 70 ? `${summary.slice(0, 69)}…` : summary}\n`,
      );
      if (e.last_error) process.stdout.write(`  ${' '.repeat(7)} ${C.red}${e.last_error}${C.reset}\n`);
    }
    if (page.next_before) process.stdout.write(`\n  ${C.dim}Older: kortix humanoid events --before ${page.next_before}${C.reset}\n`);
    process.stdout.write('\n');
    return 0;
  } catch (err) {
    return surfaceApiError(err);
  }
}
