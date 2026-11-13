'use client';

import { Button } from '@kortix/ui/button';
import { cn } from '@kortix/ui';
import { DownloadSimpleIcon } from '@phosphor-icons/react';

import { DocPage, DocSection, Example } from '../doc';

/**
 * The canonical files in apps/web/public/brandkit (brandmark.md). The page
 * shows each on the ground it is drawn for and links the files as they ship:
 * nothing here is redrawn or recolored.
 */
const KIT = '/brandkit/Logo';

// The brand's own black and white grounds, the same in both themes (brandmark.md).
// audit:allow the logo grounds are the brand colors themselves
const GROUND = { light: 'border-border border bg-white', dark: 'bg-black' } as const; // audit:allow logo ground
// audit:allow ink on the logo grounds
const INK = { light: 'text-black/50', dark: 'text-white/50', darkButton: 'text-white hover:bg-white/10 hover:text-white' } as const; // audit:allow logo ground ink

type Mark = 'Logomark' | 'Brandmark';

function file(mark: Mark, ink: 'Black' | 'White', format: 'SVG' | 'PNG') {
  return `${KIT}/${mark}/${format}/${mark} ${ink}.${format.toLowerCase()}`;
}

function Ground({ mark, ink, height }: { mark: Mark; ink: 'Black' | 'White'; height: string }) {
  const onLight = ink === 'Black';
  return (
    <div
      className={cn(
        'relative flex h-56 items-center justify-center rounded-(--control-xs-radius)',
        onLight ? GROUND.light : GROUND.dark,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a static brand file, shown as shipped */}
      <img src={file(mark, ink, 'SVG')} alt={`Kortix ${mark === 'Logomark' ? 'wordmark' : 'icon'}, ${ink.toLowerCase()}`} className={cn('w-auto', height)} />
      <div className="absolute end-3 bottom-3 flex gap-1.5">
        {(['SVG', 'PNG'] as const).map((format) => (
          <Button
            key={format}
            asChild
            size="sm"
            variant={onLight ? 'secondary' : 'ghost'}
            className={cn(!onLight && INK.darkButton)}
          >
            <a href={file(mark, ink, format)} download>
              <DownloadSimpleIcon aria-hidden />
              {format}
            </a>
          </Button>
        ))}
      </div>
      <span
        className={cn(
          'absolute start-3 bottom-3 font-mono text-xs',
          onLight ? INK.light : INK.dark,
        )}
      >
        {ink}
      </span>
    </div>
  );
}

const usage = (mark: Mark) => `// React: the mark in currentColor, sized by height
import { KortixLogo } from '@kortix/ui/kortix-logo';

<KortixLogo variant="${mark === 'Logomark' ? 'brandmark' : 'icon'}" size={${mark === 'Logomark' ? 24 : 20}} />

// Files (apps/web/public/brandkit)
<img src="${file(mark, 'Black', 'SVG')}" alt="Kortix" />  // on light
<img src="${file(mark, 'White', 'SVG')}" alt="Kortix" />  // on dark
// PNG: ${file(mark, 'Black', 'PNG')}`;

export default function BrandPage() {
  return (
    <DocPage
      title="Brand"
      lead="The wordmark and the icon, black on white and white on black. Download the SVG for anything that scales and the PNG where SVG is not accepted. Use the files as they ship: never redraw, recolor or stretch them."
    >
      <DocSection title="Wordmark" description="The icon plus the name. Use it where Kortix is introduced: a header, a footer, a document cover.">
        <Example bleed code={usage('Logomark')}>
          <Ground mark="Logomark" ink="Black" height="h-10" />
          <Ground mark="Logomark" ink="White" height="h-10" />
        </Example>
      </DocSection>

      <DocSection title="Icon" description="The mark alone. Use it where the name is already present or space is tight: an app icon, a favicon, a sidebar.">
        <Example bleed code={usage('Brandmark')}>
          <Ground mark="Brandmark" ink="Black" height="h-16" />
          <Ground mark="Brandmark" ink="White" height="h-16" />
        </Example>
      </DocSection>
    </DocPage>
  );
}
