'use client';

import { Button } from '@kortix/ui/button';
import { Progress } from '@kortix/ui/progress';
import { ProgressRing } from '@kortix/ui/progress-ring';
import { useState } from 'react';

import { DocPage, DocSection, Example } from '../doc';

const VALUES = [0, 25, 60, 100] as const;

export default function ProgressPage() {
  const [value, setValue] = useState(40);

  return (
    <DocPage
      title="Progress"
      lead="A 12px pill track in the primary color at 20%, with a full-width fill that slides in 300ms ease-out. Progress follows the backend: show a value only when the work reports one."
    >
      <DocSection title="Values" description="value runs from 0 to max (100 by default). The root carries data-state: loading, then complete at max.">
        <Example
          previewClassName="flex-col items-stretch gap-4"
          code={VALUES.map((v) => `<Progress value={${v}} />`).join('\n')}
        >
          {VALUES.map((v) => (
            <div key={v} className="flex items-center gap-3">
              <Progress value={v} />
              <span className="text-muted-foreground w-10 shrink-0 text-end font-mono text-xs tabular-nums">{v}%</span>
            </div>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Live value"
        description="Give it a label for screen readers with aria-label, and getValueLabel when the number means something other than a percent."
      >
        <Example
          previewClassName="flex-col items-start gap-4"
          code={`const [value, setValue] = useState(40);

<Progress
  value={value}
  aria-label="Upload"
  getValueLabel={(v, max) => \`\${v} of \${max} files\`}
/>
<Button variant="secondary" size="sm" onClick={() => setValue((v) => (v >= 100 ? 0 : v + 20))}>
  Advance
</Button>`}
        >
          <Progress
            value={value}
            aria-label="Upload"
            getValueLabel={(v, max) => `${v} of ${max} files`}
          />
          <Button variant="secondary" size="sm" onClick={() => setValue((v) => (v >= 100 ? 0 : v + 20))}>
            Advance
          </Button>
        </Example>
      </DocSection>

      <DocSection
        title="Progress ring"
        description="A 16px ring for a row or a toolbar, where a bar does not fit. value is a percent, clamped to 0 to 100. Recolor the arc with progressClassName."
      >
        <Example
          code={`${VALUES.map((v) => `<ProgressRing value={${v}} />`).join('\n')}
<ProgressRing value={60} className="size-6" progressClassName="text-foreground" />`}
        >
          {VALUES.map((v) => (
            <ProgressRing key={v} value={v} />
          ))}
          <ProgressRing value={60} className="size-6" progressClassName="text-foreground" />
        </Example>
      </DocSection>
    </DocPage>
  );
}
