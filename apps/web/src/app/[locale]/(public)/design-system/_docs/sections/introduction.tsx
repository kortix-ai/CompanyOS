'use client';

import { Button } from '@kortix/ui/button';
import { EmptyArt } from '@kortix/ui/empty-art';
import { Kbd, KbdGroup } from '@kortix/ui/kbd';
import { KortixLogo } from '@kortix/ui/kortix-logo';
import { Switch } from '@kortix/ui/switch';
import { ArrowRightIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { useDocNav } from '../doc-nav';
import { DOC_ENTRIES, DOC_GROUPS, GROUP_ICON } from '../nav';

/**
 * The /design-system landing. Three jobs, in order: say what this is and the
 * one rule behind it, give three ways in (values, components, states), and
 * index every topic by group, names only: the one-line summaries live in the
 * ⌘K search, so the index stays scannable.
 */

/**
 * A way in: a specimen over a title, one line and an arrow. The title is the
 * one real button; its after-element stretches over the card, so the whole
 * card opens the topic and the specimen (real components, inert) never nests
 * a button inside a button.
 */
function StartCard({
  title,
  description,
  onOpen,
  children,
}: {
  title: string;
  description: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div className="group bg-popover border-border hover:bg-hover relative flex flex-col gap-3 rounded-md border p-1 pb-4 transition-colors duration-fast ease-out">
      <div className="bg-frame pointer-events-none flex h-28 items-center justify-center rounded-sm" aria-hidden inert>
        {children}
      </div>
      <div className="flex items-start justify-between gap-2 px-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={onOpen}
            className="cursor-pointer text-start text-sm font-medium outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-[0.6px] focus-visible:after:ring-kortix-base"
          >
            {title}
          </button>
          <span className="text-muted-foreground text-xs text-pretty">{description}</span>
        </div>
        <ArrowRightIcon className="text-muted-foreground group-hover:text-foreground mt-0.5 size-4 shrink-0 transition-colors duration-fast ease-out" />
      </div>
    </div>
  );
}

/** The value ladder in one glance: ink, muted ink, hairline, surfaces, and the one accent. */
function Swatches() {
  const fills = ['bg-foreground', 'bg-muted-foreground', 'bg-border', 'bg-muted', 'bg-popover', 'bg-kortix-blue'];
  return (
    <div className="flex items-center gap-1.5">
      {fills.map((fill) => (
        <span key={fill} className={`${fill} ring-border size-7 rounded-full ring-1`} />
      ))}
    </div>
  );
}

export default function DesignSystemHome() {
  const { select } = useDocNav();
  const groups = DOC_GROUPS.filter((g) => g.title !== 'Overview');

  return (
    <article className="mx-auto w-full max-w-4xl px-5 pt-12 pb-16 sm:px-8 lg:pt-16">
      <header className="border-border flex flex-col gap-5 border-b pb-10">
        <KortixLogo variant="icon" size={24} />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-medium">Kortix Design System</h1>
          <p className="text-muted-foreground max-w-xl text-sm text-pretty">
            The values, components and motion behind every Kortix surface. One rule runs through all of it: calm
            neutral surfaces, one accent that means something, and hierarchy from weight and space, never from
            decoration. Every example here is live, and every code block is the code it renders.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => select('guidelines')}>Read the rules</Button>
          <Button variant="secondary" onClick={() => select('button')}>
            Browse components
          </Button>
          <span className="text-muted-foreground ms-1 flex items-center gap-1.5 text-xs">
            or search
            <KbdGroup>
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </KbdGroup>
          </span>
        </div>
      </header>

      <section aria-labelledby="ds-start" className="flex flex-col gap-3 pt-10">
        <h2 id="ds-start" className="text-base font-medium">
          Start here
        </h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <StartCard
            title="Foundations"
            description="Color, spacing, radius, shadow and motion."
            onOpen={() => select('colors')}
          >
            <Swatches />
          </StartCard>
          <StartCard
            title="Components"
            description="Every primitive, sized on one control ladder."
            onOpen={() => select('button')}
          >
            <div className="flex items-center gap-3">
              <Button size="sm">Save</Button>
              <Switch defaultChecked aria-label="Specimen switch" />
            </div>
          </StartCard>
          <StartCard
            title="States"
            description="Empty, loading, error and done, one picture each."
            onOpen={() => select('empty-state')}
          >
            <EmptyArt kind="search" />
          </StartCard>
        </div>
      </section>

      <section aria-labelledby="ds-index" className="flex flex-col gap-6 pt-12">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="ds-index" className="text-base font-medium">
            All topics
          </h2>
          <span className="text-muted-foreground text-xs tabular-nums">{DOC_ENTRIES.length} topics</span>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((group) => {
            const GroupIcon = GROUP_ICON[group.title];
            return (
              <div key={group.title} className="flex flex-col gap-1">
                <h3 className="text-muted-foreground flex items-center gap-1.5 px-2 pb-1 text-xs">
                  {GroupIcon ? <GroupIcon className="size-3.5" aria-hidden /> : null}
                  {group.title}
                  <span className="tabular-nums">· {group.entries.length}</span>
                </h3>
                <ul className="flex flex-col">
                  {group.entries.map((entry) => (
                    <li key={entry.slug}>
                      <button
                        type="button"
                        onClick={() => select(entry.slug)}
                        title={entry.summary}
                        className="hover:bg-hover flex h-(--control-md-height) w-full cursor-pointer items-center rounded-sm px-2 text-start text-sm transition-colors duration-fast ease-out"
                      >
                        {entry.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </article>
  );
}
