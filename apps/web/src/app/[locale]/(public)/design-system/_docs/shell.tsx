'use client';

import { cn } from '@kortix/ui';
import { Button } from '@kortix/ui/button';
import {
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandPalette,
  CommandPaletteHints,
} from '@kortix/ui/command';
import { Kbd, KbdGroup } from '@kortix/ui/kbd';
import { KortixLogo } from '@kortix/ui/kortix-logo';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@kortix/ui/tabs';
import { Github } from '@kortix/ui/internal/icons/github';
import { ListIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useTheme } from 'next-themes';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';

import { DocNavContext } from './doc-nav';
import { DOC_ENTRIES, DOC_GROUPS, entryForSlug, GROUP_ICON, REPO_URL } from './nav';

const DEFAULT_SLUG = 'introduction';

/** The topic named by the URL hash, or the introduction. */
function slugFromHash(): string {
  const hash = window.location.hash.slice(1);
  return DOC_ENTRIES.some((e) => e.slug === hash) ? hash : DEFAULT_SLUG;
}

/**
 * The frame (D48): the page and the sidebar paint `bg-frame`, the recessed
 * frame; the content is a `bg-popover` sheet lifted above it, with the one
 * border. Controls that sit on the frame are lifted the same way: Button
 * `outline` on `bg-popover`.
 *
 * The whole /design-system: one route, one Tabs root. The sidebar holds the
 * topic list as a vertical, transparent TabsList; the content panel holds one
 * TabsContent per topic (only the open one is mounted). The open topic lives
 * in the URL hash (/design-system#button), so a topic can be linked and a
 * reload lands on the same topic. Below lg the same sidebar slides
 * in as a drawer, so there is one TabsList, never two.
 */
export function DesignSystemShell({ sections }: { sections: Record<string, ComponentType> }) {
  const [active, setActive] = useState(DEFAULT_SLUG);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Read the hash after mount (the server render has none) and follow
  // back/forward. An unknown hash (a section anchor inside a topic) is ignored.
  useEffect(() => {
    const follow = () => {
      const hash = window.location.hash.slice(1);
      if (!hash || DOC_ENTRIES.some((e) => e.slug === hash)) setActive(slugFromHash());
    };
    follow();
    window.addEventListener('hashchange', follow);
    window.addEventListener('popstate', follow);
    return () => {
      window.removeEventListener('hashchange', follow);
      window.removeEventListener('popstate', follow);
    };
  }, []);

  const select = useCallback((slug: string) => {
    const next = entryForSlug(slug).slug;
    setActive(next);
    setDrawerOpen(false);
    const url = next === DEFAULT_SLUG ? window.location.pathname : `#${next}`;
    // replaceState: arrow keys walk the list, and each step must not add a history entry.
    window.history.replaceState(null, '', url);
    mainRef.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nav = useMemo(() => ({ active, select }), [active, select]);

  return (
    <DocNavContext.Provider value={nav}>
      <Tabs
        value={active}
        onValueChange={(v) => select(String(v))}
        orientation="vertical"
        className="bg-frame text-foreground flex min-h-dvh w-full flex-row gap-0 lg:h-dvh lg:overflow-hidden"
      >
        {/* Drawer backdrop, below lg only. */}
        <div
          aria-hidden
          onClick={() => setDrawerOpen(false)}
          className={cn(
            'bg-background/60 fixed inset-0 z-30 transition-opacity duration-moderate ease-out motion-reduce:transition-none lg:hidden',
            drawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        />

        <aside
          aria-label="Design system"
          className={cn(
            'bg-frame fixed inset-y-0 start-0 z-40 flex w-64 shrink-0 flex-col transition-transform duration-moderate ease-out motion-reduce:transition-none',
            // Below lg it floats over the page: hairline + shadow (effects.md).
            'border-border border-e shadow-lg lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:border-e-0 lg:shadow-none',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-14 shrink-0 items-center px-5">
            <button
              type="button"
              aria-label="Kortix design system"
              onClick={() => select(DEFAULT_SLUG)}
              className="cursor-pointer"
            >
              <KortixLogo variant="icon" size={20} />
            </button>
          </div>

          <div className="px-3">
            <Button
              variant="outline"
              size="md"
              onClick={() => setSearchOpen(true)}
              className="bg-popover text-muted-foreground hover:text-foreground w-full justify-start"
            >
              <MagnifyingGlassIcon aria-hidden />
              <span className="flex-1 text-start">Search</span>
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </Button>
          </div>

          <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <TabsList orientation="vertical" aria-label="Topics" className="gap-px">
              {DOC_GROUPS.map((group, i) => (
                <Fragment key={group.title}>
                  {group.title !== 'Overview' && (
                    <p
                      role="presentation"
                      className={cn('text-muted-foreground px-2 pb-1 text-xs', i > 0 && 'pt-4')}
                    >
                      {group.title}
                    </p>
                  )}
                  {group.entries.map((entry) => (
                    <TabsTrigger
                      key={entry.slug}
                      value={entry.slug}
                      className="data-[state=active]:bg-active data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground hover:data-[state=inactive]:bg-hover hover:data-[state=inactive]:text-foreground h-(--control-md-height) flex-none rounded-(--control-md-radius) border-0 px-2 text-sm font-medium"
                    >
                      {entry.title}
                    </TabsTrigger>
                  ))}
                </Fragment>
              ))}
            </TabsList>
          </div>

          <div className="border-border mx-3 flex shrink-0 flex-col gap-2 border-t py-3">
            <ThemeSwitch />
            <Button variant="outline" size="md" className="bg-popover w-full" asChild>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                {/* The GitHub brand mark, not a generic outline glyph. */}
                <span aria-hidden className="contents">
                  <Github className="size-4" />
                </span>
                View on GitHub
              </a>
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col lg:min-h-0 lg:p-2 lg:ps-0">
          <div className="bg-popover/90 border-border sticky top-0 z-20 flex h-14 items-center gap-2 border-b px-4 backdrop-blur lg:hidden">
            <Button variant="ghost" size="md" iconOnly aria-label="Open topics" onClick={() => setDrawerOpen(true)}>
              <ListIcon aria-hidden />
            </Button>
            <KortixLogo variant="icon" size={18} />
            <span className="text-sm font-medium">{entryForSlug(active).title}</span>
            <Button
              variant="ghost"
              size="md"
              iconOnly
              aria-label="Search"
              className="ms-auto"
              onClick={() => setSearchOpen(true)}
            >
              <MagnifyingGlassIcon aria-hidden />
            </Button>
          </div>
          <main
            ref={mainRef}
            id="main"
            // relative: the scroller is the containing block, so an absolute child (an
            // sr-only label) stays inside it instead of growing the document.
            className="bg-popover lg:border-border relative min-h-0 flex-1 lg:overflow-y-auto lg:rounded-md lg:border"
          >
            {DOC_ENTRIES.map((entry) => {
              const Section = sections[entry.slug];
              return (
                <TabsContent key={entry.slug} value={entry.slug}>
                  {Section ? <Section /> : null}
                </TabsContent>
              );
            })}
          </main>
        </div>
      </Tabs>

      <CommandPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Search the design system"
        placeholder="Search topics"
        footer={<CommandPaletteHints navigateLabel="Navigate" selectLabel="Open" />}
        filter={topicFilter}
      >
        <CommandEmpty>No topic matches</CommandEmpty>
        {DOC_GROUPS.map((group) => {
          const GroupIcon = GROUP_ICON[group.title];
          return (
            <CommandGroup key={group.title} heading={group.title}>
              {group.entries.map((entry) => (
                // Rows read like the workspace palette's: the group's icon, then the name.
                // The summary is matched, not shown: a sentence per row made the list a wall.
                <CommandItem
                  key={entry.slug}
                  // "name|summary group": topicFilter ranks the name above the rest.
                  value={`${entry.title}|${entry.summary} ${group.title}`}
                  onSelect={() => {
                    setSearchOpen(false);
                    select(entry.slug);
                  }}
                >
                  {GroupIcon ? <GroupIcon className="text-muted-foreground size-4" /> : null}
                  {entry.title}
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandPalette>
    </DocNavContext.Provider>
  );
}

/**
 * Topic search by words, not scattered letters: cmdk's fuzzy score let
 * "toast" match 21 topics through letters spread across their summaries.
 * The name ranks first (a prefix above a substring), then a word of the
 * summary or the group that starts with the query.
 */
function topicFilter(value: string, search: string): number {
  const q = search.trim().toLowerCase();
  if (!q) return 1;
  const [rawName, rest = ''] = value.toLowerCase().split('|');
  const name = rawName ?? '';
  if (name.startsWith(q)) return 1;
  if (name.split(/\s+/).some((word) => word.startsWith(q))) return 0.9;
  if (name.includes(q)) return 0.8;
  return rest.split(/[^a-z0-9]+/).some((word) => word.startsWith(q)) ? 0.4 : 0;
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const value = mounted ? (theme ?? 'system') : 'system';

  // A Tabs of its own, nested in the page's Tabs: it switches the theme, not a topic.
  return (
    <Tabs value={value} onValueChange={(v) => setTheme(String(v))}>
      <TabsList size="md" className="w-full">
        <TabsTrigger value="system">System</TabsTrigger>
        <TabsTrigger value="light">Light</TabsTrigger>
        <TabsTrigger value="dark">Dark</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
