'use client';

import { Label } from '@kortix/ui/label';
import { Textarea } from '@kortix/ui/textarea';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

export default function TextareaPage() {
  const [note, setNote] = useState('');

  return (
    <DocPage
      title="Textarea"
      lead="Multi-line text on the same surface as Input. It grows with its content from minHeight (52px) to maxHeight, then scrolls. There is no resize handle."
    >
      <DocSection title="Default">
        <Example
          code={`<Textarea placeholder="Describe the task" aria-label="Task" className="max-w-md" />`}
        >
          <Textarea placeholder="Describe the task" aria-label="Task" className="max-w-md" />
        </Example>
      </DocSection>

      <DocSection
        title="Autosize"
        description="Type several lines. The field grows to 160px, then scrolls. Pass value and onChange to control it; the height follows the value."
      >
        <Example
          code={`const [note, setNote] = useState('');

<div className="flex w-full max-w-md flex-col gap-2">
  <Label htmlFor="textarea-note">Instructions</Label>
  <Textarea
    id="textarea-note"
    value={note}
    onChange={(e) => setNote(e.target.value)}
    maxHeight={160}
    placeholder="One instruction per line"
  />
  <span className="text-muted-foreground text-xs tabular-nums">{note.length} characters</span>
</div>`}
        >
          <div className="flex w-full max-w-md flex-col gap-2">
            <Label htmlFor="textarea-note">Instructions</Label>
            <Textarea
              id="textarea-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxHeight={160}
              placeholder="One instruction per line"
            />
            <span className="text-muted-foreground text-xs tabular-nums">{note.length} characters</span>
          </div>
        </Example>
      </DocSection>

      <DocSection title="Minimum height" description="minHeight sets the resting height, for a field that expects a paragraph.">
        <Example
          code={`<Textarea minHeight={120} placeholder="Release notes" aria-label="Release notes" className="max-w-md" />`}
        >
          <Textarea minHeight={120} placeholder="Release notes" aria-label="Release notes" className="max-w-md" />
        </Example>
      </DocSection>

      <DocSection title="Invalid" description="aria-invalid turns the border and halo destructive. Name the fix in one sentence under the field.">
        <Example
          code={`<div className="flex w-full max-w-md flex-col gap-2">
  <Label htmlFor="textarea-prompt">Prompt</Label>
  <Textarea id="textarea-prompt" aria-invalid aria-describedby="textarea-prompt-error" />
  <p id="textarea-prompt-error" className="text-destructive text-xs">
    Write a prompt before you start the session.
  </p>
</div>`}
        >
          <div className="flex w-full max-w-md flex-col gap-2">
            <Label htmlFor="textarea-prompt">Prompt</Label>
            <Textarea id="textarea-prompt" aria-invalid aria-describedby="textarea-prompt-error" />
            <p id="textarea-prompt-error" className="text-destructive text-xs">
              Write a prompt before you start the session.
            </p>
          </div>
        </Example>
      </DocSection>

      <DocSection title="Disabled">
        <Example
          code={`<Textarea disabled placeholder="Disabled" aria-label="Disabled" className="max-w-md" />`}
        >
          <Textarea disabled placeholder="Disabled" aria-label="Disabled" className="max-w-md" />
        </Example>
      </DocSection>
    </DocPage>
  );
}
