'use client';

import { Button } from '@kortix/ui/button';
import { DefinitionList, DefinitionRow } from '@kortix/ui/definition-list';
import { EntityAvatar } from '@kortix/ui/entity-avatar';
import { InlineMeta, InlineMetaHint, InlineMetaTime } from '@kortix/ui/inline-meta';
import { PageSearchBar } from '@kortix/ui/page-search-bar';
import { Section } from '@kortix/ui/section';
import { DiffStat, StatusBadge, StatusDot } from '@kortix/ui/status';
import { infoToast } from '@kortix/ui/toast';
import { UserAvatar } from '@kortix/ui/user-avatar';
import { GitBranchIcon, PlusIcon, UsersIcon, XIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

/** Primitives that ship in the code base but the brand kit bans (`kortix-design-system`, "Do not use"). */
const BANNED = [
  { name: 'SectionCard', why: 'A second panel system beside Card.', instead: 'Card, or a bg-popover rounded-md border panel' },
  { name: 'List / ListRow', why: 'A divider-separated list is a second row system.', instead: 'a ul with space-y-2 and entity row classes' },
  { name: 'Stagger mount', why: 'The delay is charged to the user on every visit.', instead: 'no delay: every item appears at once' },
] as const;

const CHALK = ['Atlas', 'Beacon', 'Cobalt', 'Drift', 'Ember', 'Forge', 'Glacier'] as const;

const TONES = [
  ['success', 'Idle', false],
  ['success', 'Running', true],
  ['warning', 'Warning', false],
  ['destructive', 'Error', false],
  ['info', 'Info', false],
] as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-2">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export default function PatternsPage() {
  const [search, setSearch] = useState('');

  return (
    <DocPage
      title="Patterns"
      lead="How a list or management page is assembled, and the small composition pieces it is made of: section, avatars, facts, status."
    >
      <DocSection
        title="Page header with search"
        description="The section page title (text-xl medium) over a muted description, then search and the primary action at one height: both lg, 34px. On a phone the search takes the full width."
      >
        <Example
          previewClassName="block"
          code={`<div className="flex flex-wrap items-center justify-between gap-4">
  <div className="flex flex-col gap-1">
    <h3 className="text-xl font-medium">Skills</h3>
    <p className="text-muted-foreground text-sm">Instructions agents load when a task matches.</p>
  </div>
  <div className="flex w-full items-center gap-2 sm:w-auto">
    <PageSearchBar value={search} onChange={setSearch} placeholder="Search skills" className="sm:w-64" />
    <Button variant="secondary" size="lg">
      <PlusIcon />
      New
    </Button>
  </div>
</div>`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h3 className="text-xl font-medium">Skills</h3>
              <p className="text-muted-foreground text-sm">Instructions agents load when a task matches.</p>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <PageSearchBar value={search} onChange={setSearch} placeholder="Search skills" className="sm:w-64" />
              <Button variant="secondary" size="lg" onClick={() => infoToast('Create a skill from Customize → Skills.')}>
                <PlusIcon />
                New
              </Button>
            </div>
          </div>
        </Example>
      </DocSection>

      <DocSection
        title="Section"
        description="Groups related content under one label and an optional action. Sections separate with spacing, not dividers: spacing tight, default or loose."
      >
        <Example
          previewClassName="block"
          code={`<Section label="Instructions" action={<Button variant="secondary" size="sm">Edit</Button>}>
  <p className="text-muted-foreground text-sm">Load the relevant skill before starting a task.</p>
</Section>
<Section label="Availability" spacing="tight">
  <InlineMeta>
    <span>Workspace</span>
    <span>All agents</span>
  </InlineMeta>
</Section>`}
        >
          <Section
            label="Instructions"
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => infoToast('Edit instructions from the skill details page.')}
              >
                Edit
              </Button>
            }
          >
            <p className="text-muted-foreground text-sm">Load the relevant skill before starting a task.</p>
          </Section>
          <Section label="Availability" spacing="tight">
            <InlineMeta>
              <span>Workspace</span>
              <span>All agents</span>
            </InlineMeta>
          </Section>
        </Example>
      </DocSection>

      <DocSection
        title="People and things"
        description="People are round, things are square. UserAvatar is a circle: the profile picture, else neutral monochrome initials, never a colored background. EntityAvatar is a rounded-square tile for workspaces, groups and other non-person entities: an initial, an icon or an emoji. Both share one size scale, so they align on a row."
      >
        <Example
          previewClassName="flex-col items-start gap-5"
          code={`<UserAvatar email="ada@example.com" name="Ada Lovelace" size="sm" />
<UserAvatar email="grace@example.com" name="Grace Hopper" />
<UserAvatar email="alan@example.com" name="Alan Turing" size="lg" />

<EntityAvatar label="Acme" size="sm" />
<EntityAvatar label="Kortix" />
<EntityAvatar icon={GitBranchIcon} />
<EntityAvatar icon={UsersIcon} size="lg" />
<EntityAvatar label="Turtle Shop" emoji="🐢" />`}
        >
          <Row label="People">
            <UserAvatar email="ada@example.com" name="Ada Lovelace" size="sm" />
            <UserAvatar email="grace@example.com" name="Grace Hopper" />
            <UserAvatar email="alan@example.com" name="Alan Turing" size="lg" />
          </Row>
          <Row label="Things">
            <EntityAvatar label="Acme" size="sm" />
            <EntityAvatar label="Kortix" />
            <EntityAvatar icon={GitBranchIcon} />
            <EntityAvatar icon={UsersIcon} size="lg" />
            {/* An emoji beats the icon and the initial, and drops the chalk fill. */}
            <EntityAvatar label="Turtle Shop" emoji="🐢" />
            <EntityAvatar label="Turtle Shop" emoji="🐢" size="lg" />
          </Row>
          <Row label="Chalk: the initial tile is hashed from the name">
            {CHALK.map((label) => (
              <EntityAvatar key={label} label={label} />
            ))}
          </Row>
        </Example>
      </DocSection>

      <DocSection
        title="Definition list"
        description="Key and value pairs. The label column has a fixed width, so the values align vertically. Dividers are optional."
      >
        <Example
          previewClassName="block"
          code={`<DefinitionList dividers>
  <DefinitionRow label="Path">
    <code className="font-mono text-xs">/workspace/notes</code>
  </DefinitionRow>
  <DefinitionRow label="Created">
    <InlineMetaTime date="2026-11-05T10:30:00Z">2 days ago</InlineMetaTime>
  </DefinitionRow>
  <DefinitionRow label="Sessions">8</DefinitionRow>
</DefinitionList>`}
        >
          <DefinitionList dividers>
            <DefinitionRow label="Path">
              <code className="text-foreground font-mono text-xs">/workspace/notes</code>
            </DefinitionRow>
            <DefinitionRow label="Created">
              <InlineMetaTime date="2026-11-05T10:30:00Z">2 days ago</InlineMetaTime>
            </DefinitionRow>
            <DefinitionRow label="Updated">
              <span className="tabular-nums">
                <InlineMetaTime date="2026-11-07T10:27:00Z">3m ago</InlineMetaTime>
              </span>
            </DefinitionRow>
            <DefinitionRow label="Sessions">8</DefinitionRow>
          </DefinitionList>
        </Example>
      </DocSection>

      <DocSection
        title="Inline meta"
        description="Dot-separated facts for page headers, row subtitles and card footers. Pass any number of children; falsy ones are skipped. A count opens its list in a hint; a time shows the exact date on hover."
      >
        <Example
          code={`<InlineMeta>
  <span className="text-foreground">Notetaker</span>
  <InlineMetaHint label="24 issues">…</InlineMetaHint>
  <InlineMetaTime date="2026-11-05T10:30:00Z">Created 2 days ago</InlineMetaTime>
  <InlineMetaHint label="8 sessions">…</InlineMetaHint>
</InlineMeta>`}
        >
          <InlineMeta>
            <span className="text-foreground">Notetaker</span>
            <InlineMetaHint label="24 issues">
              <ul className="flex flex-col gap-2" aria-label="Issues">
                {Array.from({ length: 24 }, (_, i) => (
                  <li key={i}>
                    Issue {i + 1}: Review summary {i + 1}
                  </li>
                ))}
              </ul>
            </InlineMetaHint>
            <InlineMetaTime date="2026-11-05T10:30:00Z">Created 2 days ago</InlineMetaTime>
            <InlineMetaHint label="8 sessions">
              <ul className="flex flex-col gap-2" aria-label="Sessions">
                {Array.from({ length: 8 }, (_, i) => (
                  <li key={i}>Session {i + 1}: Daily notes</li>
                ))}
              </ul>
            </InlineMetaHint>
            <InlineMetaTime date="2026-11-06T16:45:00Z">Completed 1 day ago</InlineMetaTime>
          </InlineMeta>
        </Example>
      </DocSection>

      <DocSection
        title="Status"
        description="The one source for success, warning, error and info color. Chips use Badge and boxes use Alert. For what a component cannot cover (a live activity dot, a diff counter, a lone status icon) use StatusDot, DiffStat or the STATUS_TEXT, STATUS_BG and STATUS_BORDER maps; never inline a palette class. StatusBadge is informational status. A destructive Badge is a solid red pill: keep it for actions, not status."
      >
        <Example
          previewClassName="flex-col items-start gap-4"
          code={`<StatusDot tone="success" /> Idle
<StatusDot tone="success" pulse /> Running
<StatusDot tone="warning" /> Warning

<DiffStat additions={42} deletions={7} />

<StatusBadge tone="success">3 passed</StatusBadge>
<StatusBadge tone="warning">5 warnings</StatusBadge>
<StatusBadge tone="destructive">2 errors</StatusBadge>`}
        >
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {TONES.map(([tone, label, pulse]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <StatusDot tone={tone} pulse={pulse} /> {label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <DiffStat additions={42} deletions={7} />
            <DiffStat additions={12} />
            <DiffStat deletions={3} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="success">3 passed</StatusBadge>
            <StatusBadge tone="warning">5 warnings</StatusBadge>
            <StatusBadge tone="destructive">2 errors</StatusBadge>
            <StatusBadge tone="info">Modified</StatusBadge>
            <StatusBadge tone="neutral">Idle</StatusBadge>
          </div>
        </Example>
      </DocSection>

      <DocSection
        title="Banned patterns"
        description="These ship in the code base, but the brand kit bans them. Do not add a new use."
      >
        <ul className="border-border bg-popover divide-border divide-y overflow-hidden rounded-md border">
          {BANNED.map((b) => (
            <li key={b.name} className="flex items-start gap-3 px-4 py-3">
              <XIcon aria-hidden className="text-kortix-red mt-0.5 size-3 shrink-0" />
              <div className="min-w-0">
                <code className="font-mono text-xs">{b.name}</code>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {b.why} Use {b.instead}.
                </p>
              </div>
            </li>
          ))}
        </ul>
      </DocSection>
    </DocPage>
  );
}
