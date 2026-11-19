'use client';

import { cn } from '@kortix/ui';
import { Button } from '@kortix/ui/button';
import { EmojiPicker, type EmojiSelection } from '@kortix/ui/emoji-picker';
import { type GlyphSelection } from '@kortix/ui/glyph-picker';
import { glyphComponent } from '@kortix/ui/glyph-registry';
import { glyphForeground, glyphStyle, glyphTint, glyphTintHover } from '@kortix/ui/glyph-tint';
import { Popover, PopoverContent, PopoverTrigger } from '@kortix/ui/popover';
import { ProjectIconPicker } from '@kortix/ui/project-icon-picker';
import { SmileyIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { IconsSection } from '../../icons-section';
import { DocPage, DocSection, Example } from '../doc';

/**
 * Both pickers sit behind a trigger, never inline. The emoji grid fetches
 * about 782 KB of self-hosted data the first time it mounts, and this is a
 * public route: inline, every visitor would pay for it without opening it.
 *
 * The popover is exactly as wide as the 9-column grid inside it: 9 cells of
 * size-8 padded px-1.5 (75 steps), plus 1px of border per side. p-0 because
 * the picker owns its own padding.
 */
const PICKER_POPOVER = 'w-[calc(75*var(--spacing)+2px)] overflow-hidden p-0';
const TRIGGER =
  'hit-area-1 duration-normal shrink-0 transition-[color,background-color,box-shadow,scale] motion-safe:active:scale-[0.96]';

function EmojiPickerDemo() {
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<EmojiSelection | null>(null);

  return (
    <div className="flex items-center gap-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-md"
            aria-label={selection ? `Icon: ${selection.label}. Change it` : 'Choose an icon'}
            className={TRIGGER}
          >
            {selection ? (
              <span aria-hidden className="text-lg leading-none">
                {selection.emoji}
              </span>
            ) : (
              <SmileyIcon className="text-muted-foreground size-4" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label="Choose an icon" className={PICKER_POPOVER}>
          <EmojiPicker
            onEmojiSelect={(emoji) => {
              setSelection(emoji);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <span className="text-muted-foreground text-sm">{selection ? selection.label : 'Nothing picked yet'}</span>
    </div>
  );
}

/**
 * Emoji and Icon tabs in one popover. The trigger shows the face picked last;
 * a pick in one tab clears the other, so the trigger never has to choose
 * between two stale picks.
 */
function ProjectIconPickerDemo() {
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState<EmojiSelection | null>(null);
  const [glyph, setGlyph] = useState<GlyphSelection | null>(null);
  const Glyph = glyph ? glyphComponent(glyph.name) : null;
  const picked = emoji?.label ?? glyph?.name;

  return (
    <div className="flex items-center gap-3">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon-md"
            aria-label={picked ? `Icon: ${picked}. Change it` : 'Choose a workspace icon'}
            className={cn(TRIGGER, glyph && [glyphTint(glyph.color), glyphTintHover(glyph.color), 'hover:brightness-110'])}
          >
            {emoji ? (
              <span aria-hidden className="text-lg leading-none">
                {emoji.emoji}
              </span>
            ) : glyph && Glyph ? (
              <Glyph
                aria-hidden
                weight="fill"
                className={cn('size-4', glyphForeground(glyph.color))}
                style={glyphStyle(glyph.color)}
              />
            ) : (
              <SmileyIcon className="text-muted-foreground size-4" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label="Choose a workspace icon" className={PICKER_POPOVER}>
          <ProjectIconPicker
            onEmojiSelect={(next) => {
              setEmoji(next);
              setGlyph(null);
              setOpen(false);
            }}
            onGlyphSelect={(next) => {
              setGlyph(next);
              setEmoji(null);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      <span className="text-muted-foreground text-sm">{picked ?? 'Nothing picked yet'}</span>
    </div>
  );
}

export default function IconsPage() {
  return (
    <DocPage
      title="Icons"
      lead="Phosphor only, one app-wide weight. Compare the shipped weights, then pick a workspace face with the emoji and icon pickers."
    >
      <DocSection title="Weights">
        <IconsSection />
      </DocSection>

      <DocSection
        title="Emoji picker"
        description="An emoji grid for a workspace icon: search, keyboard grid navigation and a skin-tone selector. The dataset is self-hosted from public/emojibase/ and fetched on first open, never from a CDN."
      >
        <Example
          code={`<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" size="icon-md" aria-label="Choose an icon">
      <SmileyIcon className="text-muted-foreground size-4" />
    </Button>
  </PopoverTrigger>
  <PopoverContent align="start" className="${PICKER_POPOVER}">
    <EmojiPicker onEmojiSelect={(emoji) => setSelection(emoji)} />
  </PopoverContent>
</Popover>`}
        >
          <EmojiPickerDemo />
        </Example>
      </DocSection>

      <DocSection
        title="Workspace icon picker"
        description="Emoji and Icon side by side in one popover. Both grids share one height and the 9-column geometry, so switching tabs never resizes the popover. The Icon grid previews in the selected color; the color row sits in the footer, where the Emoji tab puts its skin-tone selector."
      >
        <Example
          code={`<PopoverContent align="start" className="${PICKER_POPOVER}">
  <ProjectIconPicker
    onEmojiSelect={(emoji) => setEmoji(emoji)}
    onGlyphSelect={(glyph) => setGlyph(glyph)}
  />
</PopoverContent>`}
        >
          <ProjectIconPickerDemo />
        </Example>
      </DocSection>
    </DocPage>
  );
}
