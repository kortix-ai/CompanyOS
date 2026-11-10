import { getTemplate, getTemplateFiles, TEMPLATE_IDS } from '@kortix/starter/templates';
import { parse } from 'yaml';

/** One trigger of a template, as the card lists it: what starts it, in words. */
export interface TriggerView {
  name: string;
  signal: string;
}

/** One factory as the home shows it. Name, summary, agents, triggers and skills come from the template files. */
export interface LoopView {
  id: string;
  /** The team, as the reader says it. */
  team: string;
  name: string;
  line: string;
  summary: string;
  observes: string[];
  ships: string[];
  /** The template's folder, as it lands in a repository. */
  folder: string;
  agents: string[];
  triggers: TriggerView[];
  triggerCount: number;
  /** Every trigger the template ships, the switched-off sources included. */
  triggerTotal: number;
  skills: string[];
}

/** The words only the page adds: a team, one line, what it watches and what it ships. */
const PRESENTATION: Record<string, Pick<LoopView, 'team' | 'line' | 'observes' | 'ships'>> = {
  'software-factory': {
    team: 'Engineering',
    line: 'Signals in. Verified pull requests out.',
    observes: ['GitHub issues', 'Failing tests', 'Production errors', 'Database anomalies', 'Slack threads'],
    ships: ['Pull requests with tests', 'Demo videos', 'Ticket updates'],
  },
  marketing: {
    team: 'Marketing',
    line: 'Content, search and paid, on autopilot.',
    observes: ['Merged pull requests', 'AI answers and search', 'Ad platforms', 'Competitors'],
    ships: ['Changelog, posts, videos', 'AEO, SEO and GEO fixes', 'Ad reports'],
  },
  sales: {
    team: 'Sales',
    line: 'Every signup researched before you wake up.',
    observes: ['New signups', 'Inbound forms', 'Your CRM'],
    ships: ['Lead research', 'Qualification', 'Outreach drafts', 'Meeting prep'],
  },
  support: {
    team: 'Support',
    line: 'Every ticket answered or routed.',
    observes: ['Support inbox', 'Help desk', 'In-app feedback'],
    ships: ['Answer drafts', 'Bug tickets for engineering', 'Help-center fixes'],
  },
  recruiting: {
    team: 'Recruiting',
    line: 'Every applicant scored against the role.',
    observes: ['New applicants', 'Referrals', 'Your ATS'],
    ships: ['Scorecards', 'Interview kits', 'Candidate update drafts'],
  },
};

/** The order the stack shows the factories in. */
const ORDER = ['software-factory', 'marketing', 'sales', 'support', 'recruiting'];
/** Triggers one card lists; the rest is a count. */
const SHOWN_TRIGGERS = 5;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: string) => n.padStart(2, '0');

/** A six-field Kortix cron (`sec min hour dom mon dow`) in words; anything unusual stays the expression. */
export function describeCron(expr: string): string {
  const [, min, hour, dom, mon, dow] = expr.trim().split(/\s+/);
  if (!min || !hour || dom !== '*' || mon !== '*' || !dow) return `cron ${expr}`;
  const step = /^\*\/(\d+)$/.exec(min);
  if (step && hour === '*' && dow === '*') return `every ${step[1]} min`;
  if (/^\d+(,\d+)+$/.test(min) && hour === '*' && dow === '*') {
    const marks = min.split(',').map(Number);
    const gaps = new Set(marks.map((m, i) => ((marks[(i + 1) % marks.length]! - m + 60) % 60)));
    return gaps.size === 1 ? `every ${[...gaps][0]} min` : `${marks.length}× an hour`;
  }
  if (/^\d+$/.test(min) && hour === '*' && dow === '*') return 'hourly';
  const days = dow === '*' ? 'daily' : dow === '1-5' ? 'weekdays' : /^\d$/.test(dow) ? WEEKDAYS[Number(dow)] : null;
  if (days && /^\d+$/.test(min) && /^\d+$/.test(hour)) return `${days} ${pad(hour)}:${pad(min)}`;
  const span = /^(\d+)-(\d+)$/.exec(hour);
  if (days && /^\d+$/.test(min) && span) return `hourly ${pad(span[1]!)}–${pad(span[2]!)}${days === 'daily' ? '' : `, ${days}`}`;
  return `cron ${expr}`;
}

type RawTrigger = { slug?: string; name?: string; enabled?: boolean; on?: Record<string, unknown> };

/** What starts a trigger, in words: a schedule, a webhook, or an app event. */
function describeSignal(on: Record<string, unknown> | undefined): string {
  if (!on) return 'manual';
  if (typeof on.cron === 'string') return describeCron(on.cron);
  if (on.webhook) {
    const secret = (on.webhook as { secret?: string }).secret ?? '';
    return /GITHUB/.test(secret) ? 'GitHub webhook' : 'webhook';
  }
  if (typeof on.connector === 'string') return `${on.connector} event`;
  return Object.keys(on)[0] ?? 'manual';
}

/** "Sales: a new signup in your product" → "A new signup in your product". */
function triggerName(trigger: RawTrigger): string {
  const name = (trigger.name ?? trigger.slug ?? '').replace(/^[^:]{1,40}:\s*/, '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The agents, triggers and skills of one template, read from its YAML. */
function anatomy(id: string): Pick<LoopView, 'folder' | 'agents' | 'triggers' | 'triggerCount' | 'triggerTotal' | 'skills'> {
  const files = getTemplateFiles(id as (typeof TEMPLATE_IDS)[number], { repoFullName: 'your-org/your-repo', defaultBranch: 'main' });
  const agents: string[] = [];
  const skills: string[] = [];
  const triggers: RawTrigger[] = [];
  for (const file of files.filter((f) => /\.ya?ml$/.test(f.path))) {
    const doc = parse(file.content) as { agents?: Record<string, unknown>; skills?: Record<string, unknown>; triggers?: RawTrigger[] } | null;
    agents.push(...Object.keys(doc?.agents ?? {}));
    skills.push(...Object.keys(doc?.skills ?? {}));
    triggers.push(...(doc?.triggers ?? []));
  }
  const live = triggers.filter((t) => t.enabled !== false);
  return {
    folder: `.kortix/${id}/`,
    agents,
    skills,
    triggers: live.slice(0, SHOWN_TRIGGERS).map((t) => ({ name: triggerName(t), signal: describeSignal(t.on) })),
    triggerCount: live.length,
    triggerTotal: triggers.length,
  };
}

/** Every factory of this build, in stack order. Server-side: it reads the template files. */
export function loopViews(): LoopView[] {
  const built = new Set<string>(TEMPLATE_IDS);
  return ORDER.filter((id) => built.has(id) && PRESENTATION[id]).map((id) => {
    const template = getTemplate(id as (typeof TEMPLATE_IDS)[number]);
    return { id, name: template.name, summary: template.summary, ...PRESENTATION[id]!, ...anatomy(id) };
  });
}

/** The functions with no ready-made template yet: the same prompt builds them from a description. */
const MORE: Array<{ name: string; line: string }> = [
  { name: 'Research', line: 'Briefs, market and competitor tracking.' },
  { name: 'Reporting', line: 'Weekly numbers, board-pack drafts.' },
  { name: 'Operations', line: 'Handoffs, status updates, data entry.' },
  { name: 'Finance', line: 'Invoice matching, reconciliation.' },
  { name: 'Legal ops', line: 'Contract intake, first-pass review.' },
  { name: 'Procurement', line: 'Vendor intake, quote comparison.' },
  { name: 'Back office', line: 'Documents, records, checklists.' },
];

export function catalogViews(): Array<{ name: string; line: string }> {
  return MORE;
}
