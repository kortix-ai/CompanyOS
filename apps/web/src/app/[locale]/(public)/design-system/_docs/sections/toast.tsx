'use client';

import { Button } from '@kortix/ui/button';
import {
  errorToast,
  infoToast,
  loadingToast,
  progressToast,
  successToast,
  undoToast,
  warningToast,
} from '@kortix/ui/toast';
import { ClockIcon, TrashIcon } from '@phosphor-icons/react';

import { DocPage, DocSection, Example } from '../doc';

function wait<T>(ms: number, value: T, fail = false) {
  return new Promise<T>((resolve, reject) => {
    window.setTimeout(() => (fail ? reject(new Error('The network went away')) : resolve(value)), ms);
  });
}

export default function ToastPage() {
  return (
    <DocPage
      title="Toast"
      lead="The one toast surface. A toast confirms a mutation the user started: it says what happened, in a few words, and leaves in 3 seconds. The app root mounts the Toaster once; call a function, never render a toast."
    >
      <DocSection title="Status" description="One function per status. Each draws its glyph and keeps the text in ink.">
        <Example
          code={`<Button variant="secondary" onClick={() => successToast('Secret saved')}>Success</Button>
<Button variant="secondary" onClick={() => errorToast('Could not save the secret')}>Error</Button>
<Button variant="secondary" onClick={() => infoToast('A new version is ready')}>Info</Button>
<Button variant="secondary" onClick={() => warningToast('The key expires in 3 days')}>Warning</Button>`}
        >
          <Button variant="secondary" onClick={() => successToast('Secret saved')}>
            Success
          </Button>
          <Button variant="secondary" onClick={() => errorToast('Could not save the secret')}>
            Error
          </Button>
          <Button variant="secondary" onClick={() => infoToast('A new version is ready')}>
            Info
          </Button>
          <Button variant="secondary" onClick={() => warningToast('The key expires in 3 days')}>
            Warning
          </Button>
        </Example>
      </DocSection>

      <DocSection
        title="Description and actions"
        description="description adds a second line. actions adds text links under it; a click dismisses the toast first. entity names the thing the toast is about, with its icon as the leading tile."
      >
        <Example
          code={`<Button
  variant="secondary"
  onClick={() =>
    successToast('Trigger created', {
      description: 'It runs every weekday at 9:00.',
      entity: { icon: <ClockIcon />, label: 'Daily summary' },
      actions: [{ label: 'Open', onClick: () => {} }],
    })
  }
>
  With entity and action
</Button>
<Button
  variant="secondary"
  onClick={() => successToast('Copied', { compact: true })}
>
  Compact
</Button>`}
        >
          <Button
            variant="secondary"
            onClick={() =>
              successToast('Trigger created', {
                description: 'It runs every weekday at 9:00.',
                entity: { icon: <ClockIcon />, label: 'Daily summary' },
                actions: [{ label: 'Open', onClick: () => {} }],
              })
            }
          >
            With entity and action
          </Button>
          <Button variant="secondary" onClick={() => successToast('Copied', { compact: true })}>
            Compact
          </Button>
        </Example>
      </DocSection>

      <DocSection
        title="Loading"
        description="loadingToast shows a progress toast for a promise, then swaps it for a success toast. Set showErrorToast to swap it for an error toast on failure; the promise still rejects."
      >
        <Example
          code={`<Button
  variant="secondary"
  onClick={() => loadingToast('Deploying', () => wait(2000, 'Deployed'), { success: (v) => v })}
>
  Resolves
</Button>
<Button
  variant="secondary"
  onClick={() =>
    loadingToast('Deploying', () => wait(2000, '', true), { showErrorToast: true }).catch(() => undefined)
  }
>
  Rejects
</Button>`}
        >
          <Button
            variant="secondary"
            onClick={() => loadingToast('Deploying', () => wait(2000, 'Deployed'), { success: (v) => v })}
          >
            Resolves
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              loadingToast('Deploying', () => wait(2000, '', true), { showErrorToast: true }).catch(() => undefined)
            }
          >
            Rejects
          </Button>
        </Example>
      </DocSection>

      <DocSection
        title="Progress"
        description="progressToast stays until it is replaced. Call it again with the same id to update it in place; a status toast with that id ends it."
      >
        <Example
          code={`<Button
  variant="secondary"
  onClick={() => {
    const id = progressToast('Uploading 3 files');
    window.setTimeout(() => progressToast('Uploading 1 file', { id }), 1000);
    window.setTimeout(() => successToast('3 files uploaded', { id }), 2000);
  }}
>
  Upload
</Button>`}
        >
          <Button
            variant="secondary"
            onClick={() => {
              const id = progressToast('Uploading 3 files');
              window.setTimeout(() => progressToast('Uploading 1 file', { id }), 1000);
              window.setTimeout(() => successToast('3 files uploaded', { id }), 2000);
            }}
          >
            Upload
          </Button>
        </Example>
      </DocSection>

      <DocSection
        title="Undo"
        description="One line with an Undo key, for a reversible delete. It stays 5 seconds, and ⌘Z or Ctrl+Z undoes it while it shows. Pass the translated label as undoLabel."
      >
        <Example
          code={`<Button
  variant="secondary"
  onClick={() =>
    undoToast('Session deleted', {
      undoLabel: 'Undo',
      onUndo: () => successToast('Session restored'),
      icon: <TrashIcon />,
    })
  }
>
  Delete
</Button>`}
        >
          <Button
            variant="secondary"
            onClick={() =>
              undoToast('Session deleted', {
                undoLabel: 'Undo',
                onUndo: () => successToast('Session restored'),
                icon: <TrashIcon />,
              })
            }
          >
            Delete
          </Button>
        </Example>
      </DocSection>
    </DocPage>
  );
}
