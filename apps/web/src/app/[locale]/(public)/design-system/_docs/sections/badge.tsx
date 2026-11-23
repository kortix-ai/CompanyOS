'use client';

import { Badge } from '@kortix/ui/badge';
import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react';

import { DocPage, DocSection, Example } from '../doc';

const NEUTRAL = ['solid', 'default', 'accent', 'kortix', 'secondary', 'outline', 'muted', 'transparent'] as const;
const STATUS = ['success', 'badgeSuccess', 'warning', 'update', 'destructive', 'info', 'royal'] as const;
const PRIMARY = ['new', 'beta', 'highlight'] as const;

function line(variant: string) {
  return `<Badge variant="${variant}">${variant}</Badge>`;
}

export default function BadgePage() {
  return (
    <DocPage
      title="Badge"
      lead="A tight mono label with an inset ring of its own fill. It is the one sanctioned all-caps label in app chrome. secondary, outline, muted, info, transparent and royal keep sentence case. With no variant a Badge is solid."
    >
      <DocSection title="Neutral" description="Ink at a lower opacity: solid 15%, default and kortix 10%, accent 5%. secondary, outline and muted sit on the surface tokens.">
        <Example code={NEUTRAL.map(line).join('\n')}>
          {NEUTRAL.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Status"
        description="A status tint is the accent at 15% with ink text: the hue is on the fill and on an icon, never on the words. badgeSuccess is an alias of success; update is an alias of warning. royal marks the owner role."
      >
        <Example code={STATUS.map(line).join('\n')}>
          {STATUS.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </Example>
      </DocSection>

      <DocSection title="Primary" description="new, beta and highlight take the primary color at 10% with primary text, for a feature label.">
        <Example code={PRIMARY.map(line).join('\n')}>
          {PRIMARY.map((v) => (
            <Badge key={v} variant={v}>
              {v}
            </Badge>
          ))}
        </Example>
      </DocSection>

      <DocSection title="With icon" description="An icon is 0.875em of the label, one filled circle glyph per badge, so the three read at one size. On success and warning it takes the status hue.">
        <Example
          code={`<Badge variant="success">
  <CheckCircleIcon weight="fill" />
  Verified
</Badge>
<Badge variant="warning">
  <WarningCircleIcon weight="fill" />
  Expiring
</Badge>
<Badge variant="new">
  <InfoIcon weight="fill" />
  New
</Badge>`}
        >
          <Badge variant="success">
            <CheckCircleIcon weight="fill" />
            Verified
          </Badge>
          <Badge variant="warning">
            <WarningCircleIcon weight="fill" />
            Expiring
          </Badge>
          <Badge variant="new">
            <InfoIcon weight="fill" />
            New
          </Badge>
        </Example>
      </DocSection>

      <DocSection
        title="Sizes"
        description="xs is the default. sm and default draw the same box as xs today. tabular is for a number: a 20px minimum width and tabular figures. For a count beside a label, use CountBadge."
      >
        <Example
          code={`<Badge size="xs">xs</Badge>
<Badge size="sm">sm</Badge>
<Badge size="default">default</Badge>
<Badge variant="secondary" size="tabular">3</Badge>
<Badge variant="secondary" size="tabular">128</Badge>`}
        >
          <Badge size="xs">xs</Badge>
          <Badge size="sm">sm</Badge>
          <Badge size="default">default</Badge>
          <Badge variant="secondary" size="tabular">
            3
          </Badge>
          <Badge variant="secondary" size="tabular">
            128
          </Badge>
        </Example>
      </DocSection>
    </DocPage>
  );
}
