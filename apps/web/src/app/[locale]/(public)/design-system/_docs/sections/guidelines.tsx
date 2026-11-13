'use client';

import { SolidCheckIcon } from '@kortix/ui/internal/icons/solid-check-icon';
import { XIcon } from '@phosphor-icons/react';

import { CodeSample, DocPage, DocSection } from '../doc';

/**
 * Do and don't, then the anti-patterns with their fix. The banned snippets
 * name banned tokens on purpose, so each of those lines carries an
 * `audit:allow` marker.
 */
const DO = [
  'Use the logo on a solid black or white ground',
  'Keep the minimum clear space on all sides of the logo',
  'Use the provided SVG and PNG files',
  'Black logo on light, white logo on dark',
  'Scale the logo proportionally',
  'Use font-medium (500) for headings',
  'Use semantic color tokens (success, warning, info)',
  'Use the type scale steps',
  'Name the transition property: transition-colors, transition-opacity', // audit:allow prose names the utility
  'Use Button, with iconOnly for an icon-only action',
] as const;

const DONT = [
  'Rotate, skew or stretch the logo',
  'Add drop shadows or effects to the logo',
  'Place the logo on a busy or patterned ground',
  'Use unapproved color combinations',
  'Use bold (700) for headings',
  'Use colored or tinted backgrounds for decoration',
  'Use arbitrary pixel text sizes',
  'Use transition-all or a bare transition', // audit:allow names the banned utility
  'Use a raw <button> for an action',
  'Use hardcoded hex colors in components',
] as const;

const ANTI_PATTERNS = [
  {
    title: 'No inline style for fixed values',
    why: 'It bypasses the utility system, cannot be purged, adds specificity and is invisible to the brand audit.',
    bad: `<div style={{ height: '14px', overflow: 'hidden' }}>Content</div>`,
    good: `<div className="h-3.5 overflow-hidden">Content</div>`,
  },
  {
    title: 'No arbitrary text sizes',
    why: 'A bracket size has no meaning and no relation to the type scale.',
    bad: `<span className="text-[11px]">Label</span>\n<span className="text-[13.5px]">Meta</span>`, // audit:allow banned example
    good: `<span className="text-xs">Label</span>\n<span className="text-sm">Body</span>`,
  },
  {
    title: 'No raw button elements',
    why: 'A raw button skips the variants: its size, padding and radius drift, and it has no focus ring or pending state.',
    bad: `<button className="px-3 py-1.5 rounded-lg bg-neutral-100 hover:bg-neutral-200" onClick={save}>\n  Save\n</button>`, // audit:allow banned example
    good: `<Button variant="secondary" size="sm" onClick={save}>\n  Save\n</Button>`,
  },
  {
    title: 'No unnamed transitions',
    why: 'transition-all animates every property that changes, including width, height and padding. That causes layout work and drops frames in long lists.', // audit:allow names the banned utility
    bad: `<div className="transition-all duration-200 hover:bg-accent">`, // audit:allow banned example
    good: `<div className="transition-colors duration-fast hover:bg-accent">`,
  },
  {
    title: 'No hardcoded hex colors',
    why: 'A hex value skips the theme: it looks wrong in other themes and breaks dark mode.',
    bad: `<div className="text-emerald-500">Success</div>\n<div style={{ color: '#3b82f6' }}>Info</div>`, // audit:allow banned example
    good: `<div className="text-success">Success</div>\n<div className="text-info">Info</div>`,
  },
  {
    title: 'No clickable div elements',
    why: 'A div is not reachable by keyboard, has no focus ring and is not announced as interactive.',
    bad: `<div onClick={open} className="cursor-pointer">Open</div>`,
    good: `<Button variant="ghost" onClick={open}>Open</Button>`,
  },
] as const;

function Rule({ text, ok }: { text: string; ok: boolean }) {
  return (
    <li className="flex items-start gap-2.5 px-4 py-2">
      <span
        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-kortix-green/15' : 'bg-kortix-red/15'}`}
      >
        {ok ? (
          <SolidCheckIcon aria-hidden className="text-kortix-green size-2.5" />
        ) : (
          <XIcon aria-hidden className="text-kortix-red size-2.5" />
        )}
      </span>
      <span className="text-muted-foreground text-sm">{text}</span>
    </li>
  );
}

function RuleList({ title, items, ok }: { title: string; items: readonly string[]; ok: boolean }) {
  return (
    <div className="border-border bg-popover overflow-hidden rounded-md border">
      <p className="border-border border-b px-4 py-2 text-xs font-medium">{title}</p>
      <ul className="divide-border divide-y">
        {items.map((t) => (
          <Rule key={t} text={t} ok={ok} />
        ))}
      </ul>
    </div>
  );
}

export default function GuidelinesPage() {
  return (
    <DocPage
      title="Usage"
      lead="Ten things to do and ten not to, then six patterns that break the system, each with its fix beside it."
    >
      <DocSection title="Do and don't">
        <div className="grid gap-3 md:grid-cols-2">
          <RuleList title="Do" items={DO} ok />
          <RuleList title="Don't" items={DONT} ok={false} />
        </div>
      </DocSection>

      {ANTI_PATTERNS.map((p) => (
        <DocSection key={p.title} title={p.title} description={p.why}>
          <div className="grid gap-3 md:grid-cols-2">
            <CodeSample title="Don't" code={p.bad} />
            <CodeSample title="Do" code={p.good} />
          </div>
        </DocSection>
      ))}
    </DocPage>
  );
}
