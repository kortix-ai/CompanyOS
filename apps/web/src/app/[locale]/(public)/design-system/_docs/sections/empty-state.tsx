'use client';

import { Button } from '@kortix/ui/button';
import { EmptyArt, type EmptyArtKind } from '@kortix/ui/empty-art';
import { EmptyState } from '@kortix/ui/empty-state';
import { ErrorState } from '@kortix/ui/error-state';
import { TargetIcon } from '@phosphor-icons/react';

import { DocPage, DocSection, Example, TokenLabel } from '../doc';

/**
 * The catalogue (D49). Mirrors .agents/skills/kortix-design-system/references/empty-states.md:
 * keep the two in step when a kind is added.
 */
const CATALOGUE: { kind: EmptyArtKind; when: string; title: string; description: string }[] = [
  { kind: 'fan', when: 'Any other empty list. Pass icon: the noun on the front card.', title: 'No goals yet', description: 'Set a goal and your agents work toward it.' },
  { kind: 'document', when: 'No documents or notes. The default without an icon.', title: 'No documents yet', description: 'Docs you or your agents write show up here.' },
  { kind: 'error', when: 'A load or a request failed. ErrorState draws it.', title: 'Something went wrong', description: "This page didn't load. Try again in a moment." },
  { kind: 'search', when: 'A search or a filter matched nothing.', title: 'No results', description: 'Nothing matches “quarterly”. Try fewer words.' },
  { kind: 'connect', when: 'No connector, integration or channel is set up.', title: 'No connections', description: 'Connect a tool to give your agents context.' },
  { kind: 'folder', when: 'An empty folder in a drive.', title: 'This folder is empty', description: 'Drop files here or ask an agent to make some.' },
  { kind: 'chat', when: 'No sessions, threads or messages.', title: 'No sessions yet', description: 'Start a session and it shows up here.' },
  { kind: 'locked', when: 'The viewer has no permission.', title: "You don't have access", description: 'Ask a project owner to invite you.' },
  { kind: 'list', when: 'No produced items: artifacts, runs, history.', title: 'No artifacts yet', description: 'Files your agents produce are kept here.' },
  { kind: 'image', when: 'No images or media.', title: 'No images', description: 'Images from your sessions appear here.' },
  { kind: 'offline', when: 'No network, or the sandbox is unreachable.', title: "You're offline", description: 'Reconnect to see the latest changes.' },
  { kind: 'key', when: 'No API keys, tokens or secrets.', title: 'No API keys', description: 'Create a key to call Kortix from your code.' },
  { kind: 'agent', when: 'No agents.', title: 'No agents yet', description: 'Create an agent to hand off repeat work.' },
  { kind: 'done', when: 'A list was cleared: everything is finished or read.', title: 'All done', description: 'Every task in this list is finished.' },
];

export default function EmptyStatePage() {
  return (
    <DocPage
      title="Empty State"
      lead="The view of a list, a tab or a folder with nothing in it, a request that failed, or a list that is done. One family of pictures: recessed cards behind one lifted card. Pick the picture that names the situation; then one title, one sentence and at most two actions."
    >
      <DocSection
        title="Catalogue"
        description="Every kind of EmptyArt and when to use it. Pass the kind as art on EmptyState. For a noun not listed, use fan with an icon."
      >
        <div className="border-border grid grid-cols-1 overflow-hidden rounded-md border sm:grid-cols-2">
          {CATALOGUE.map((item, i) => (
            <div
              key={item.kind}
              className={`border-border flex flex-col items-center gap-4 p-6 ${i % 2 === 0 ? 'sm:border-e' : ''} ${i < CATALOGUE.length - 2 ? 'border-b' : i === CATALOGUE.length - 2 ? 'border-b sm:border-b-0' : ''}`}
            >
              <EmptyArt kind={item.kind} icon={item.kind === 'fan' ? TargetIcon : undefined} />
              <div className="flex w-full flex-col gap-2">
                <TokenLabel name={`art="${item.kind}"`} value={item.title} />
                <p className="text-muted-foreground text-xs text-pretty">{item.when}</p>
              </div>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection
        title="Anatomy"
        description="Picture, then the title (14px medium), then one sentence (13px muted, one line), then the actions. A primary action creates the first item; a secondary action recovers (Try again, Clear search). Never more than two."
      >
        <Example
          previewClassName="justify-center py-8"
          code={`<EmptyState
  art="chat"
  title="No sessions yet"
  description="Start a session and it shows up here."
  action={<Button>New session</Button>}
/>`}
        >
          <EmptyState
            art="chat"
            title="No sessions yet"
            description="Start a session and it shows up here."
            action={<Button>New session</Button>}
          />
        </Example>
      </DocSection>

      <DocSection
        title="Fan with an icon"
        description="For an empty list the catalogue does not name, put its noun on the fan. The icon stays muted."
      >
        <Example
          previewClassName="justify-center py-8"
          code={`<EmptyState
  icon={TargetIcon}
  title="No goals yet"
  description="Set a goal and your agents work toward it."
  action={<Button>New goal</Button>}
/>`}
        >
          <EmptyState
            icon={TargetIcon}
            title="No goals yet"
            description="Set a goal and your agents work toward it."
            action={<Button>New goal</Button>}
          />
        </Example>
      </DocSection>

      <DocSection
        title="Recover, do not create"
        description="When nothing matched or something failed, the action undoes the cause. It is secondary: the user did nothing wrong."
      >
        <Example
          previewClassName="justify-center py-8"
          code={`<EmptyState
  art="search"
  title="No results"
  description="Nothing matches “quarterly”. Try fewer words."
  action={<Button variant="secondary">Clear search</Button>}
/>`}
        >
          <EmptyState
            art="search"
            title="No results"
            description="Nothing matches “quarterly”. Try fewer words."
            action={<Button variant="secondary">Clear search</Button>}
          />
        </Example>
      </DocSection>

      <DocSection
        title="Small"
        description="size='sm' narrows the text to 240px, for a panel, a column or a sidebar. The picture is already small (100 × 56) at both sizes."
      >
        <Example
          previewClassName="justify-center py-8"
          code={`<EmptyState
  size="sm"
  art="key"
  title="No API keys"
  description="Create a key to call Kortix from your code."
/>`}
        >
          <EmptyState size="sm" art="key" title="No API keys" description="Create a key to call Kortix from your code." />
        </Example>
      </DocSection>

      <DocSection
        title="Error state"
        description="ErrorState draws the error picture: a list that failed reads like a list that is empty, with a red sign. Give it a Try again action."
      >
        <Example
          previewClassName="justify-center py-8"
          code={`<ErrorState
  title="Something went wrong"
  description="This page didn't load. Try again in a moment."
  action={<Button variant="secondary">Try again</Button>}
/>`}
        >
          <ErrorState
            title="Something went wrong"
            description="This page didn't load. Try again in a moment."
            action={<Button variant="secondary">Try again</Button>}
          />
        </Example>
      </DocSection>

      <DocSection
        title="Done"
        description="A list the user cleared is a success, not an absence: the done picture, no action."
      >
        <Example
          previewClassName="justify-center py-8"
          code={`<EmptyState art="done" title="All done" description="Every task in this list is finished." />`}
        >
          <EmptyState art="done" title="All done" description="Every task in this list is finished." />
        </Example>
      </DocSection>
    </DocPage>
  );
}
