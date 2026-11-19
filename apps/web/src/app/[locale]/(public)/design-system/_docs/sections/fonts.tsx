'use client';

import { useEffect, useState } from 'react';

import { CodeSample, DocPage, DocSection, Example } from '../doc';
import { SPECIMEN_PREVIEW, Specimen, specimenCode } from './specimen';

const PANGRAM = 'The quick brown fox jumps over the lazy dog';
const MONO_SAMPLE = 'const session = kortix.session(projectId, sessionId);';

const SANS = [
  { label: 'Regular', className: 'font-sans text-xl font-normal', text: PANGRAM },
  { label: 'Medium', className: 'font-sans text-xl font-medium', text: PANGRAM },
  { label: 'Semibold', className: 'font-sans text-xl font-semibold', text: PANGRAM },
] as const;

const MONO = [
  { label: 'Regular', className: 'font-mono text-base font-normal', text: MONO_SAMPLE },
  { label: 'Medium', className: 'font-mono text-base font-medium', text: MONO_SAMPLE },
] as const;

/** Reads a property the browser computed on <body>: the family stack, the feature set. */
function useBodyStyle(prop: 'fontFamily' | 'fontFeatureSettings'): string {
  const [value, setValue] = useState('');
  useEffect(() => {
    setValue(getComputedStyle(document.body)[prop]);
  }, [prop]);
  return value;
}

export default function FontsPage() {
  const features = useBodyStyle('fontFeatureSettings');
  const family = useBodyStyle('fontFamily');

  return (
    <DocPage
      title="Font Families"
      lead="Two families are the whole type system. Roobert sets everything. Roobert Mono marks literal text: code, commands, paths, identifiers and keys."
    >
      <DocSection
        title="Roobert"
        description="font-sans, the default on <body>. Product nouns (session, repository, sandbox) stay in Roobert in running text."
      >
        <Example previewClassName={SPECIMEN_PREVIEW} code={specimenCode(SANS.map((s) => ({ tag: 'p', ...s })))}>
          {SANS.map((s) => (
            <Specimen key={s.label} label={s.label} meta={s.className}>
              <p className={s.className}>{s.text}</p>
            </Specimen>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="Roobert Mono"
        description="font-mono. Use it when a reader could paste the string into a terminal or a config file. The identifier of a thing is mono; the thing's name is not."
      >
        <Example previewClassName={SPECIMEN_PREVIEW} code={specimenCode(MONO.map((m) => ({ tag: 'p', ...m })))}>
          {MONO.map((m) => (
            <Specimen key={m.label} label={m.label} meta={m.className}>
              <p className={m.className}>{m.text}</p>
            </Specimen>
          ))}
        </Example>
      </DocSection>

      <DocSection
        title="OpenType features"
        description="The web sets five stylistic sets and palt on html and body. They draw the Kortix letterforms. Inherit them: never write font-feature-settings on a component."
      >
        <CodeSample
          title="computed on <body>"
          language="css"
          code={`font-family: ${family || '…'};\nfont-feature-settings: ${features || '…'};`}
        />
      </DocSection>

      <DocSection
        title="Rules"
        description="Add no third family. Use the token stack, never a lone family name: where Roobert must not load (email, an OG card), use --font-sans-system and --font-mono-system."
      >
        <CodeSample
          language="css"
          code={`font-family: var(--font-sans);
font-family: var(--font-mono);

/* No web fonts: email, OG cards, a strict CSP */
font-family: var(--font-sans-system);
font-family: var(--font-mono-system);`}
        />
      </DocSection>
    </DocPage>
  );
}
