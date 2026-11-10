import { getTemplate, getTemplateFiles, TEMPLATE_IDS } from '@kortix/starter/templates';

/** One loop as the home shows it. Name, summary and YAML come from the template files. */
export interface LoopView {
  id: string;
  /** The department, as the reader says it. */
  label: string;
  name: string;
  line: string;
  summary: string;
  observes: string[];
  ships: string[];
  file: string;
  excerpt: string[];
}

/** The words only the page adds: a department label, one line, what it watches and what it ships. */
const PRESENTATION: Record<string, Pick<LoopView, 'label' | 'line' | 'observes' | 'ships'>> = {
  'software-factory': {
    label: 'Engineering',
    line: 'Signals in. Verified pull requests out.',
    observes: ['GitHub issues', 'Failing tests', 'Production errors', 'Database anomalies', 'Slack threads', 'Customer feedback'],
    ships: ['Pull requests with tests', 'A demo video', 'Ticket updates'],
  },
  marketing: {
    label: 'Marketing',
    line: 'Every merge becomes a story.',
    observes: ['Merged pull requests', 'Search and AI answers', 'Competitors'],
    ships: ['Changelog entries', 'Blog posts', 'On-brand videos', 'Social drafts'],
  },
  sales: {
    label: 'Sales',
    line: 'Every signup researched before you wake up.',
    observes: ['New signups', 'Inbound forms', 'Your CRM'],
    ships: ['Lead research', 'Qualification', 'Outreach drafts', 'Meeting prep'],
  },
  recruiting: {
    label: 'Recruiting',
    line: 'Every applicant scored against the role.',
    observes: ['New applicants', 'Referrals', 'Your ATS'],
    ships: ['Scorecards', 'Interview kits', 'Candidate update drafts'],
  },
  support: {
    label: 'Support',
    line: 'Every ticket answered or routed.',
    observes: ['Support inbox', 'Help desk', 'In-app feedback'],
    ships: ['Answer drafts', 'Bug tickets for engineering', 'Help-center fixes'],
  },
};

/** The first trigger of the template, as its YAML says it (6 lines). */
function firstTrigger(id: (typeof TEMPLATE_IDS)[number]): { file: string; excerpt: string[] } {
  const files = getTemplateFiles(id, { repoFullName: 'your-org/your-repo', defaultBranch: 'main' });
  for (const file of files.filter((f) => /\.ya?ml$/.test(f.path))) {
    const lines = file.content.split('\n');
    // A source trigger shows what the loop watches; else the first trigger.
    const source = lines.findIndex((line) => /^\s*- slug: source-/.test(line));
    const at = source >= 0 ? source : lines.findIndex((line) => /^\s*- slug:/.test(line));
    if (at >= 0) return { file: file.path, excerpt: lines.slice(at, at + 6).filter((line) => !/^\s*name:/.test(line)) };
  }
  return { file: `.kortix/${id}/`, excerpt: [] };
}

/** Every loop of this build, Engineering first. Server-side: it reads the template files. */
export function loopViews(): LoopView[] {
  return [...TEMPLATE_IDS]
    .sort((a, b) => (a === 'software-factory' ? -1 : b === 'software-factory' ? 1 : 0))
    .flatMap((id): LoopView[] => {
      const words = PRESENTATION[id];
      // Featured loops only (founder call 2026-11-10: Engineering and Marketing first).
      if (!words || !FEATURED.has(id)) return [];
      const template = getTemplate(id);
      return [{ id, name: template.name, summary: template.summary, ...words, ...firstTrigger(id) }];
    });
}

/** Every common function, as the home lists it. `template`: the id that ships it, when one does. */
const CATALOG: Array<{ name: string; line: string; template?: string }> = [
  { name: 'Engineering', line: 'Ticket triage, fixes, reviews, tests.', template: 'software-factory' },
  { name: 'Marketing', line: 'Changelog, posts, videos, SEO.', template: 'marketing' },
  { name: 'Support', line: 'Triage, first replies, routing.', template: 'support' },
  { name: 'Sales', line: 'Lead research, CRM updates, follow-ups.', template: 'sales' },
  { name: 'Recruiting', line: 'Sourcing, screening, scheduling.', template: 'recruiting' },
  { name: 'Research', line: 'Briefs, market and competitor tracking.' },
  { name: 'Reporting', line: 'Weekly numbers, board-pack drafts.' },
  { name: 'Operations', line: 'Handoffs, status updates, data entry.' },
  { name: 'Finance', line: 'Invoice matching, reconciliation.' },
  { name: 'Legal ops', line: 'Contract intake, first-pass review.' },
  { name: 'Procurement', line: 'Vendor intake, quote comparison.' },
  { name: 'Back office', line: 'Documents, records, checklists.' },
];

/** Every function Kortix loops (all of them run today); `id` links the ones with a ready-made template. */
export function catalogViews(): Array<{ name: string; line: string; available: boolean; id?: string }> {
  const built = new Set<string>(TEMPLATE_IDS);
  return CATALOG.map((entry) => ({
    name: entry.name,
    line: entry.line,
    available: entry.template !== undefined && built.has(entry.template),
    // Only featured loops have a showcase to link to.
    id: entry.template && built.has(entry.template) && FEATURED.has(entry.template) ? entry.template : undefined,
  }));
}

/** The loops the home features: Engineering and Marketing, when built. */
export const FEATURED = new Set(['software-factory', 'marketing']);
