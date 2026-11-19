'use client';

import { ActionBar } from '@kortix/ui/action-bar';

import { DocPage, DocSection, Example } from '../doc';

const noop = () => {};

export default function ActionBarPage() {
  return (
    <DocPage
      title="Action Bar"
      lead="The floating bar for a temporary mode: a selection, unsaved edits, a pending paste. A title, a muted description, actions with key hints, and a close button. Place it with ActionBarDock, which pins it to the bottom of the list column."
    >
      <DocSection
        title="Selection"
        description="The title counts the selection. One destructive action at most, and the × leaves the mode."
      >
        <Example
          code={`<ActionBar
  title="3 selected"
  actions={[
    { id: 'select-all', label: 'Select all', onSelect },
    { id: 'pause', label: 'Pause', onSelect },
    { id: 'resume', label: 'Resume', disabled: true, onSelect },
    { id: 'delete', label: 'Delete', tone: 'destructive', onSelect },
  ]}
  close={{ label: 'Exit selection', onSelect }}
/>`}
        >
          <div className="w-full max-w-xl">
            <ActionBar
              animateIn={false}
              title="3 selected"
              actions={[
                { id: 'select-all', label: 'Select all', onSelect: noop },
                { id: 'pause', label: 'Pause', onSelect: noop },
                { id: 'resume', label: 'Resume', disabled: true, onSelect: noop },
                { id: 'delete', label: 'Delete', tone: 'destructive', onSelect: noop },
              ]}
              close={{ label: 'Exit selection', onSelect: noop }}
            />
          </div>
        </Example>
      </DocSection>

      <DocSection
        title="Unsaved edits"
        description="The commit verb is the one primary action and shows its key. kbd only draws the key: the page binds it."
      >
        <Example
          code={`<ActionBar
  title="Unsaved changes."
  actions={[
    { id: 'discard', label: 'Discard', onSelect },
    { id: 'save', label: 'Save', emphasis: 'primary', kbd: ['mod', 'S'], onSelect },
  ]}
/>`}
        >
          <div className="w-full max-w-xl">
            <ActionBar
              animateIn={false}
              title="Unsaved changes."
              actions={[
                { id: 'discard', label: 'Discard', onSelect: noop },
                { id: 'save', label: 'Save', emphasis: 'primary', kbd: ['mod', 'S'], onSelect: noop },
              ]}
            />
          </div>
        </Example>
      </DocSection>
    </DocPage>
  );
}
